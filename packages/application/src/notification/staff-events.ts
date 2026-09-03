import { ProductVariantService, StockService } from '@lezzet/database';
import { captureError, SOURCES } from '@lezzet/observability';
import type { TicketType } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dispatchStaffNotification } from './dispatch';

/*
  PERSONEL OLAY ÜRETİCİLERİ (kullanıcı kararı 26.08) — dört kapı zili.

  "Bildirim ≠ kuyruk" ilkesi BOZULMADI: kuyruğun kendisi (şikâyet listesi, eşik-altı listesi,
  mutabakat ekranı, onay kuyruğu) ekranlarda yaşamaya devam eder; buradaki satırlar kuyruğa
  DÜŞME ÂNININ haberidir — operatör ekranı açık tutmadan "az önce ne oldu"yu zilden okur.

  ── HEPSİ SESSİZ-KÜNYELİDİR ─────────────────────────────────────────────────
  Bildirim, taşıdığı işin kaydından asla daha önemli değildir (`ringBell` kuralının aynısı):
  talep kaydedildi, kapanış yazıldı, rezervasyon kesinleşti — zil düşerse iş DURMAZ; iz
  `captureError` ile düşer, akış devam eder. Bu yüzden dört üretici de fırlatmaz.
*/

const yut = (err: unknown, kind: string): void => {
  void captureError(err, { source: SOURCES.applicationNotification, context: { job: `staff-event:${kind}` } });
};

/** Müşteri şikâyet/talep açtı — yönetime. Dedupe talep başına: aynı açılış iki kez haber olmaz. */
export async function notifyTicketOpened(
  db: SupabaseClient,
  input: { ticketId: string; type: TicketType; referenceNo?: string | null },
): Promise<void> {
  try {
    await dispatchStaffNotification(db, {
      kind: 'ticket_opened',
      roles: ['admin'],
      target: { type: 'ticket', id: input.ticketId },
      payload: { ticketType: input.type, ...(input.referenceNo ? { referenceNo: input.referenceNo } : {}) },
      dedupeKey: `ticket-opened:${input.ticketId}`,
    });
  } catch (err) {
    yut(err, 'ticket_opened');
  }
}

/**
 * Rezervasyon SONRASI eşik yoklaması — yalnız dokunulan varyantlar (servis daraltması).
 *
 * Dedupe `stock-low:<depo>:<varyant>` KALICIDIR: haber "İLK KEZ eşiğin altına indi" dir; eşik
 * üstüne çıkıp yeniden inen varyant ikinci kez zile düşmez — süregelen hâli bildirim değil
 * tedarik ekranının eşik listesi taşır (bildirim kapı zilidir, liste değil). Depo süzgeci
 * fan-out'ta: depocu yalnız kendi deposunun düşüşünü görür, yönetim muaf.
 */
export async function notifyStockLowAfterReserve(
  db: SupabaseClient,
  input: { warehouseId: string; variantIds: readonly string[] },
): Promise<void> {
  try {
    const dusenler = await new StockService(db).listBelowMinStock(input.warehouseId, input.variantIds);
    if (dusenler.length === 0) return;
    const skular = new Map(
      (await new ProductVariantService(db).listByIds(dusenler.map((d) => d.variantId))).map((v) => [v.id, v.sku]),
    );
    for (const dusen of dusenler) {
      await dispatchStaffNotification(db, {
        kind: 'stock_low',
        roles: ['admin', 'warehouse'],
        warehouseId: input.warehouseId,
        target: { type: 'variant', id: dusen.variantId },
        payload: {
          ...(skular.get(dusen.variantId) ? { sku: skular.get(dusen.variantId) } : {}),
          availableQty: dusen.availableQty,
          minStockQty: dusen.minStockQty,
        },
        dedupeKey: `stock-low:${input.warehouseId}:${dusen.variantId}`,
      });
    }
  } catch (err) {
    yut(err, 'stock_low');
  }
}

/** Gün kapanışında sayım farkı — para tarafına. İstisna gibi DEDUPESİZ: her kapanış ayrı gerçek. */
export async function notifyRunCloseMismatch(
  db: SupabaseClient,
  input: { runReferenceNo?: string | null; differenceCashCents: number; differenceCardCents: number; differenceChequeCents: number },
): Promise<void> {
  try {
    await dispatchStaffNotification(db, {
      kind: 'run_close_mismatch',
      roles: ['admin', 'accounting'],
      target: null,
      payload: {
        ...(input.runReferenceNo ? { referenceNo: input.runReferenceNo } : {}),
        differenceCashCents: input.differenceCashCents,
        differenceCardCents: input.differenceCardCents,
        differenceChequeCents: input.differenceChequeCents,
      },
      dedupeKey: null,
    });
  } catch (err) {
    yut(err, 'run_close_mismatch');
  }
}

/**
 * Sefer kapandı, durak(lar) sonuçlanmadı — sevkiyat masasına (03.09 · kurye denetimi bulgu 7).
 *
 * Kapanış askıda kalanı `ready`ye düşürüp "yeniden planlanacak" diyor; planlayan sevkiyatçı (16.08
 * kararı). Ama o güne dek kimse dürtülmüyordu: askıda şeridi web'de duruyor, bakan yoksa durak
 * kaybolmuş gibi kalıyor — kutusu araçta, müşterisi beklemede. Zil yalnız "bak" der, gün SEÇMEZ.
 * Depo süzgeçli: kapsamı o tesisi içeren personel + depo-üstü roller. Dedupesiz — her kapanış ayrı.
 */
export async function notifyRunClosePending(
  db: SupabaseClient,
  input: { runReferenceNo: string; warehouseId: string; pendingCount: number },
): Promise<void> {
  try {
    await dispatchStaffNotification(db, {
      kind: 'run_close_pending',
      roles: ['admin', 'warehouse'],
      warehouseId: input.warehouseId,
      target: null,
      payload: { referenceNo: input.runReferenceNo, pendingCount: input.pendingCount },
      dedupeKey: null,
    });
  } catch (err) {
    yut(err, 'run_close_pending');
  }
}

/** Yeni kurumsal başvuru — yönetime. Dedupesiz: ret sonrası ikinci başvuru da ayrı haberdir. */
export async function notifyB2bApplicationReceived(db: SupabaseClient, customerId: string): Promise<void> {
  try {
    await dispatchStaffNotification(db, {
      kind: 'b2b_application_received',
      roles: ['admin'],
      target: { type: 'customer', id: customerId },
      payload: {},
      dedupeKey: null,
    });
  } catch (err) {
    yut(err, 'b2b_application_received');
  }
}
