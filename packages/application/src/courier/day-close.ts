import { DeliveryRunCloseService, DeliveryRunCollectionService, DeliveryRunService, DeliveryZoneService } from '@lezzet/database';
import type { CloseDeliveryRunResult, DeliveryRunClose } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listCourierDay, readCourierRun, type CourierRunBriefView, type CourierStop } from './day';

/**
 * SEFER kapanışı (11.7 · 18.08 — kurye×gün kapanışının halefi, `docs/feature/sefer.md` K1 kararı).
 * `design/pages/kurye-kapanis.md` + DOMAIN §7. Web kopyası geçiş köprüsüdür.
 *
 * Kapanış bir **mutabakattır**, para hareketi değil: para kapıda tahsil edilirken yazıldı (11.3).
 * Eksen kurye×gün'den SEFERE indi: "fark hangi seferde doğdu" artık cevaplı — iki sefer sürmüş
 * kurye ikisini AYRI kapatır (akış sıralı: kapat → yeni sefer; ekran "hangi seferi kapatıyorum"
 * diye sormaz). Kurye kasaya yine günde bir gider; ekran günün toplamını ayrıca gösterebilir.
 *
 * **Kurye yalnız kendi seferini görür** — `courierId` her iki fonksiyonda da zorunludur ve sefer
 * sahipliği run kaydından doğrulanır; işletme kasası, diğer hesaplar ve marj bu okumaya hiç girmez.
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
 * Kapanış taslağı. `runId` verilmezse kuryenin o günkü seferi bulunur (kapanmamış olan öncelikli).
 * Beklenen toplamlar **görünümden** okunur (`delivery_run_collection`) — kapanış RPC'si de aynı
 * görünümü okur, toplama iki kez yazılmaz.
 *
 * Sahiplik: verilen `runId` bu kuryenin değilse sefer YOK sayılır (`run: null`) — "yok" ile "senin
 * değil" aynı cevabı verir (proof kapısının haritalama savunmasıyla aynı gerekçe).
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), `auth/otp` deseni.
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
 * **Seferi kapat.** Sonuçlanmamış durak varken de kapatılabilir (tasarım §4) — üstelik kapanış
 * onları ÇÖZER (K4, 18.08): hâlâ `out_for_delivery` görünen duraklar motorun "ulaşılamadı"
 * kenarıyla `ready`ye düşer, hangi güne yeniden yazılacağı sevkiyatçının kararı kalır. Dönen
 * `pendingCount`/`releasedCount` uyarı içindir — engel değil.
 *
 * Fark hesaplanmaz, **türer**: sayılan − beklenen. İşaret anlamlıdır (eksi eksik, artı fazla) ve
 * mutlak değere indirilmez — ikisi de açıklanmayı hak eder.
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

  return new DeliveryRunService(db).close({ ...input, actorId: input.courierId });
}

/** Run künyesi — sahiplik süzgeçli: kayıt bu kuryenin değilse `null`. */
async function briefOf(db: SupabaseClient, runId: string, courierId: string): Promise<CourierRunBriefView | null> {
  const run = await new DeliveryRunService(db).getById(runId);
  if (!run || run.courierId !== courierId) return null;
  const [zone, close] = await Promise.all([
    new DeliveryZoneService(db).getById(run.deliveryZoneId),
    new DeliveryRunCloseService(db).getByRun(run.id),
  ]);
  return {
    runId: run.id,
    referenceNo: run.referenceNo,
    zoneId: run.deliveryZoneId,
    zoneName: zone?.name ?? null,
    vehicleId: run.vehicleId,
    departedAt: run.departedAt,
    returnedAt: run.returnedAt,
    closed: close !== null,
  };
}
