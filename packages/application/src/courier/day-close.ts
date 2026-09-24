import { DeliveryRunCloseService, DeliveryRunCollectionService, DeliveryRunService, DeliveryZoneService } from '@lezzet/database';
import { notifyRunCloseMismatch, notifyRunClosePending } from '../notification/staff-events';
import type { CloseDeliveryRunResult, DeliveryRunClose } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listCourierDay, readCourierRun, type CourierRunBriefView, type CourierStop } from './day';
import { vehicleLabelOf } from './vehicle-label';

/**
 * Sefer kapanışı: para kapıda tahsil edilirken yazıldığı için kapanış bir mutabakattır, para hareketi değil; eksen seferdir ki "fark hangi seferde doğdu" cevaplansın.
 * Kurye yalnız kendi seferini görür: `courierId` zorunludur ve sahiplik sefer kaydından doğrulanır.
 */

/** Kapanış öncesi ekranın gördüğü: seferin resmi + beklenen tahsilat. */
export interface DayCloseDraft {
  date: string;
  /** Kapanışın öznesi — `null` = o gün sürülmüş sefer yok, kapanacak bir şey de yok. */
  run: CourierRunBriefView | null;
  /** Zaten kapatılmışsa kayıt döner ve ekran SALT-OKUNUR gösterir (tasarım §6). */
  closed: DeliveryRunClose | null;
  delivered: CourierStop[];
  /** Ulaşılamayanlar — yarının işine devrolur, kapanışta kaybolmaz. */
  pending: CourierStop[];
  /** Reddedilenler — getirilen mal; depoya fiziksel teslim edilir. */
  returned: CourierStop[];
  /** Beklenen tahsilat, yöntem başına (**cent** — 02.9). */
  expected: { cashCents: number; cardCents: number; chequeCents: number };
}

/**
 * Kapanış taslağı; `runId` verilmezse kuryenin o günkü seferi bulunur (kapanmamış olan öncelikli) ve beklenen toplamlar RPC'nin de okuduğu görünümden gelir.
 * Verilen `runId` bu kuryenin değilse sefer yok sayılır, çünkü "yok" ile "senin değil" aynı cevabı vermeli.
 */
export async function openDayClose(
  db: SupabaseClient,
  input: { courierId: string; runId?: string; date?: string },
): Promise<DayCloseDraft> {
  const date = input.date ?? new Date().toISOString().slice(0, 10);

  const run = input.runId
    ? await briefOf(db, input.runId, input.courierId)
    : await readCourierRun(db, { courierId: input.courierId, date });

  if (!run) {
    return { date, run: null, closed: null, delivered: [], pending: [], returned: [], expected: { cashCents: 0, cardCents: 0, chequeCents: 0 } };
  }

  const [stops, collection, closed] = await Promise.all([
    listCourierDay(db, { courierId: input.courierId, runId: run.runId }),
    new DeliveryRunCollectionService(db).getByRun(run.runId),
    new DeliveryRunCloseService(db).getByRun(run.runId),
  ]);

  return {
    date,
    run,
    closed,
    delivered: stops.filter((stop) => stop.outcome === 'delivered'),
    pending: stops.filter((stop) => stop.outcome === 'pending' || stop.outcome === 'unreachable'),
    returned: stops.filter((stop) => stop.outcome === 'refused'),
    expected: {
      cashCents: collection?.expectedCashCents ?? 0,
      cardCents: collection?.expectedCardCents ?? 0,
      chequeCents: collection?.expectedChequeCents ?? 0,
    },
  };
}

/**
 * Seferi kapat; sonuçlanmamış durak varken de kapanır ve kapanış hâlâ yoldaki durakları `ready`ye düşürür, yeni günü sevkiyatçı seçer.
 * Fark türer (sayılan − beklenen) ve işareti korunur, çünkü eksik de fazla da açıklanmayı hak eder.
 */
export async function closeCourierDay(
  db: SupabaseClient,
  input: {
    courierId: string;
    runId: string;
    /** Kuryenin teslim ettiği tutarlar — **cent** (02.9). */
    countedCashCents?: number;
    countedCardCents?: number;
    countedChequeCents?: number;
    /** Fark çıktığında kısa açıklama — fark gizlenmez, açıklanır (tasarım §3). */
    note?: string | null;
  },
): Promise<CloseDeliveryRunResult> {
  // Sahiplik run kaydından: başkasının seferi bu kapıdan kapatılamaz — "yok" ile "senin değil"
  // aynı cevap (`not_found`), sefer kimlikleri haritalanamaz.
  const run = await new DeliveryRunService(db).getById(input.runId);
  if (!run || run.courierId !== input.courierId) return { ok: false, reason: 'not_found' };

  const sonuc = await new DeliveryRunService(db).close({ ...input, actorId: input.courierId });
  // Fark çıkan kapanış para tarafının zilini çalar; kapanış yazıldıktan sonra ve sonucu değiştirmeden, çünkü kapanış geri dönmez.
  if (
    sonuc.ok &&
    ((sonuc.differenceCashCents ?? 0) !== 0 || (sonuc.differenceCardCents ?? 0) !== 0 || (sonuc.differenceChequeCents ?? 0) !== 0)
  ) {
    await notifyRunCloseMismatch(db, {
      runReferenceNo: run.referenceNo,
      differenceCashCents: sonuc.differenceCashCents ?? 0,
      differenceCardCents: sonuc.differenceCardCents ?? 0,
      differenceChequeCents: sonuc.differenceChequeCents ?? 0,
    });
  }
  /* Kapanış fotoğrafında bekleyen durak varsa sevkiyat masası dürtülür; gün burada seçilmez, seferin deposu kimin göreceğini süzer. */
  if (sonuc.ok && (sonuc.pendingCount ?? 0) > 0) {
    await notifyRunClosePending(db, {
      runReferenceNo: run.referenceNo,
      warehouseId: run.warehouseId,
      pendingCount: sonuc.pendingCount ?? 0,
    });
  }
  return sonuc;
}

/** Run künyesi — sahiplik süzgeçli: kayıt bu kuryenin değilse `null`. */
async function briefOf(db: SupabaseClient, runId: string, courierId: string): Promise<CourierRunBriefView | null> {
  const run = await new DeliveryRunService(db).getById(runId);
  if (!run || run.courierId !== courierId) return null;
  // Araç adı künyenin parçasıdır: kapanmış bir seferi ararken "hangi araçla dönüldü" tek ayırt edici olabilir.
  const [zone, close, vehicleLabel] = await Promise.all([
    new DeliveryZoneService(db).getById(run.deliveryZoneId),
    new DeliveryRunCloseService(db).getByRun(run.id),
    vehicleLabelOf(db, run.vehicleId),
  ]);
  return {
    runId: run.id,
    referenceNo: run.referenceNo,
    zoneId: run.deliveryZoneId,
    zoneName: zone?.name ?? null,
    vehicleId: run.vehicleId,
    vehicleLabel,
    deliveryDate: run.deliveryDate,
    departedAt: run.departedAt,
    returnedAt: run.returnedAt,
    closed: close !== null,
  };
}
