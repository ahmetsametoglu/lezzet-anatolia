import { ProductVariantService, StockService, WarehouseService } from '@lezzet/database';
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
 * Rezervasyon sonrası eşik yoklaması, yalnız dokunulan varyantlar; dedupe kalıcıdır, çünkü haber "ilk kez eşiğin altına indi"dir ve süregelen hâli tedarik ekranı taşır.
 * Depo süzgeci dağıtımdadır: depocu yalnız kendi deposunun düşüşünü görür, yönetim muaftır.
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
 * Sefer kapandı ama durak sonuçlanmadı: sevkiyat masası dürtülür, çünkü askıdaki durak bakan olmazsa kaybolmuş gibi kalır; zil yalnız "bak" der, gün seçmez.
 * Depo süzgeçlidir ve dedupe yoktur: her kapanış ayrıdır.
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

/**
 * Transfer eksik kabul edildi: gönderen deponun personeli ve yönetim duyar, çünkü alan depo beyanı kendisi yaptı ve fark yalnız geçmiş sekmesinde duruyordu.
 * Depo süzgeci kaynak depodur; dedupe transfer başınadır.
 */
export async function notifyTransferShortfall(
  db: SupabaseClient,
  input: {
    transferId: string;
    referenceNo: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    shortQty: number;
    shortfallReferenceNo: string | null;
  },
): Promise<void> {
  try {
    // Alan deponun KODU cümleye girer ("STR kayıp yazdı") — kimlik değil; depo bulunamazsa kod yerine
    // sözlük "alan depo" der, uydurulmaz.
    const [alan] = await new WarehouseService(db).list({ warehouseIds: [input.toWarehouseId] });
    await dispatchStaffNotification(db, {
      kind: 'transfer_shortfall',
      roles: ['admin', 'warehouse'],
      warehouseId: input.fromWarehouseId,
      target: null,
      payload: {
        referenceNo: input.referenceNo,
        transferId: input.transferId,
        shortQty: input.shortQty,
        ...(alan ? { toWarehouseCode: alan.code } : {}),
        ...(input.shortfallReferenceNo ? { shortfallReferenceNo: input.shortfallReferenceNo } : {}),
      },
      dedupeKey: `transfer-shortfall:${input.transferId}`,
    });
  } catch (err) {
    yut(err, 'transfer_shortfall');
  }
}

/**
 * Transfer fazla kabul edildi: eksiğin aynası, aynı alıcılar; gönderen o birimi kendi sayımında bulsun diye.
 * Dedupe transfer başınadır.
 */
export async function notifyTransferExcess(
  db: SupabaseClient,
  input: {
    transferId: string;
    referenceNo: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    excessQty: number;
    excessReferenceNo: string | null;
  },
): Promise<void> {
  try {
    const [alan] = await new WarehouseService(db).list({ warehouseIds: [input.toWarehouseId] });
    await dispatchStaffNotification(db, {
      kind: 'transfer_excess',
      roles: ['admin', 'warehouse'],
      warehouseId: input.fromWarehouseId,
      target: null,
      payload: {
        referenceNo: input.referenceNo,
        transferId: input.transferId,
        excessQty: input.excessQty,
        ...(alan ? { toWarehouseCode: alan.code } : {}),
        ...(input.excessReferenceNo ? { excessReferenceNo: input.excessReferenceNo } : {}),
      },
      dedupeKey: `transfer-excess:${input.transferId}`,
    });
  } catch (err) {
    yut(err, 'transfer_excess');
  }
}
