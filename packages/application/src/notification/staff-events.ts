import { OrderService, ProductVariantService, StockService, WarehouseService } from '@lezzet/database';
import { captureError, SOURCES } from '@lezzet/observability';
import type { TicketType } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShippingDataGap } from '../shipping/quote';
import { dispatchStaffNotification } from './dispatch';

/*
  Personel olay üreticileri: kuyruğun kendisi ekranlarda yaşar, buradaki satırlar kuyruğa düşme anının haberidir ki operatör "az önce ne oldu"yu zilden okusun.
  Hepsi sessiz künyelidir: zil düşerse iş durmaz, iz `captureError` ile düşer ve üreticiler fırlatmaz.
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
  input: { runReferenceNo?: string | null; differenceCashCents: number; differenceCardCents: number },
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
      },
      dedupeKey: null,
    });
  } catch (err) {
    yut(err, 'run_close_mismatch');
  }
}

/**
 * Sertifikalı kasanın günü kapanmadı — yönetime ve muhasebeye. Dedupe mağaza ve gün başına: aynı gece ikinci kez haber olmaz, ertesi
 * gece gün hâlâ açıksa yeni günle yeniden hatırlatılır.
 */
export async function notifyRegisterDayUnclosed(
  db: SupabaseClient,
  input: { warehouseId: string; date: string; differences: number; waiting: number; olderUnclosed: boolean },
): Promise<void> {
  try {
    await dispatchStaffNotification(db, {
      kind: 'register_day_unclosed',
      roles: ['admin', 'accounting'],
      warehouseId: input.warehouseId,
      target: null,
      payload: { date: input.date, differences: input.differences, waiting: input.waiting, olderUnclosed: input.olderUnclosed },
      dedupeKey: `register-day:${input.warehouseId}:${input.date}`,
    });
  } catch (err) {
    yut(err, 'register_day_unclosed');
  }
}

/**
 * Bir kayıt sertifikalı kasaya yazılamıyor — yönetime ve muhasebeye, gece kapanışını beklemeden mesaide düzeltilsin diye. Tekrar
 * çağıranın anahtarıyla önlenir: siparişe özgü sebep kayıt başına, kurulum eksikliği depo ve gün başına bir kez haber verir.
 */
export async function notifyRegisterWriteStuck(
  db: SupabaseClient,
  input: {
    warehouseId: string | null;
    orderId: string | null;
    movementId: string | null;
    referenceNo: string | null;
    reason: string;
    dedupeKey: string;
  },
): Promise<void> {
  try {
    await dispatchStaffNotification(db, {
      kind: 'register_write_stuck',
      roles: ['admin', 'accounting'],
      warehouseId: input.warehouseId,
      target: input.orderId ? { type: 'order', id: input.orderId } : null,
      payload: { reason: input.reason, referenceNo: input.referenceNo, movementId: input.movementId },
      dedupeKey: input.dedupeKey,
    });
  } catch (err) {
    yut(err, 'register_write_stuck');
  }
}

/**
 * İzahlı banka satırının Pennylane'deki parası değişti ya da hareket silindi — muhasebeye ve yönetime; satıra dokunulmadığı için karar
 * elle verilir. Pennylane'deki hâl başına bir kez haber olur, akış aynı olayı yeniden getirse de.
 */
export async function notifyBankFeedChanged(
  db: SupabaseClient,
  input: { accountId: string; movementId: string; valueDate: string; change: 'changed' | 'removed'; dedupeKey: string },
): Promise<void> {
  try {
    await dispatchStaffNotification(db, {
      kind: 'bank_feed_changed',
      roles: ['admin', 'accounting'],
      warehouseId: null,
      target: null,
      payload: { accountId: input.accountId, movementId: input.movementId, valueDate: input.valueDate, change: input.change },
      dedupeKey: input.dedupeKey,
    });
  } catch (err) {
    yut(err, 'bank_feed_changed');
  }
}

/**
 * Bir alış belgesi Pennylane'e yazılamıyor — muhasebeye ve yönetime; belge düzeltilince kendiliğinden yazılır. Belge ve sebep başına bir
 * kez haber olur, aynı sebeple yeniden denendikçe tekrar etmez.
 */
export async function notifyPennylaneDocumentStuck(
  db: SupabaseClient,
  input: { documentId: string; number: string | null; issuedOn: string; reason: string; dedupeKey: string },
): Promise<void> {
  try {
    await dispatchStaffNotification(db, {
      kind: 'pennylane_document_stuck',
      roles: ['admin', 'accounting'],
      warehouseId: null,
      target: null,
      payload: { documentId: input.documentId, number: input.number, issuedOn: input.issuedOn, reason: input.reason },
      dedupeKey: input.dedupeKey,
    });
  } catch (err) {
    yut(err, 'pennylane_document_stuck');
  }
}

/**
 * Belgenin açık kalanı Pennylane'dekinden ayrıldı — muhasebeye ve yönetime; iki kalanın çifti başına bir kez haber olur, kalan
 * değişip yine ayrılırsa yeniden.
 */
export async function notifyPennylaneDocumentDifferent(
  db: SupabaseClient,
  input: { documentId: string; number: string | null; issuedOn: string; dedupeKey: string },
): Promise<void> {
  try {
    await dispatchStaffNotification(db, {
      kind: 'pennylane_document_different',
      roles: ['admin', 'accounting'],
      warehouseId: null,
      target: null,
      payload: { documentId: input.documentId, number: input.number, issuedOn: input.issuedOn },
      dedupeKey: input.dedupeKey,
    });
  } catch (err) {
    yut(err, 'pennylane_document_different');
  }
}

/**
 * Banka satırının eşleşmesi Pennylane'e yazılamıyor — muhasebeye ve yönetime; satır ve sebep başına bir kez haber olur.
 */
export async function notifyPennylaneMatchStuck(
  db: SupabaseClient,
  input: { movementId: string; accountId: string; valueDate: string; reason: string; dedupeKey: string },
): Promise<void> {
  try {
    await dispatchStaffNotification(db, {
      kind: 'pennylane_match_stuck',
      roles: ['admin', 'accounting'],
      warehouseId: null,
      target: null,
      payload: { movementId: input.movementId, accountId: input.accountId, valueDate: input.valueDate, reason: input.reason },
      dedupeKey: input.dedupeKey,
    });
  } catch (err) {
    yut(err, 'pennylane_match_stuck');
  }
}

/**
 * Bizde duran bir bağ Pennylane'de çözüldü — muhasebeye ve yönetime; bağ bizde silinmez, yeniden de yazılmaz. Bağ başına bir kez
 * haber olur.
 */
export async function notifyPennylaneMatchRemoved(
  db: SupabaseClient,
  input: { movementId: string; documentId: string; accountId: string; valueDate: string; dedupeKey: string },
): Promise<void> {
  try {
    await dispatchStaffNotification(db, {
      kind: 'pennylane_match_removed',
      roles: ['admin', 'accounting'],
      warehouseId: null,
      target: null,
      payload: { movementId: input.movementId, documentId: input.documentId, accountId: input.accountId, valueDate: input.valueDate },
      dedupeKey: input.dedupeKey,
    });
  } catch (err) {
    yut(err, 'pennylane_match_removed');
  }
}

/**
 * Eşlenen banka hesabına Pennylane'den hareket gelmiyor — muhasebeye ve yönetime; bankanın Pennylane bağlantısı yenilenene kadar banka
 * satırı gelmez. Hesap ve gün başına bir kez haber olur, sessizlik sürerse ertesi gün yeniden hatırlatılır.
 */
export async function notifyBankFeedQuiet(
  db: SupabaseClient,
  input: { accountId: string; lastDate: string | null; quietDays: number; dedupeKey: string },
): Promise<void> {
  try {
    await dispatchStaffNotification(db, {
      kind: 'bank_feed_quiet',
      roles: ['admin', 'accounting'],
      warehouseId: null,
      target: null,
      payload: { accountId: input.accountId, lastDate: input.lastDate, quietDays: input.quietDays },
      dedupeKey: input.dedupeKey,
    });
  } catch (err) {
    yut(err, 'bank_feed_quiet');
  }
}

/**
 * Uzaktan satış eşiğinin uyarı seviyesi — yönetime ve muhasebeye; anahtar yıl ve seviye başınadır, seviye yılda bir kez haber olur.
 * Tutarlar KDV hariç cent; geçen yıl aşıldıysa vergilendirme yılbaşından beri sürer.
 */
export async function notifyDistanceSaleThreshold(
  db: SupabaseClient,
  input: {
    year: number;
    warning: 'first' | 'second' | 'exceeded';
    yearTotalCents: number;
    thresholdCents: number;
    sincePreviousYear: boolean;
  },
): Promise<void> {
  try {
    await dispatchStaffNotification(db, {
      kind: 'distance_sale_threshold',
      roles: ['admin', 'accounting'],
      warehouseId: null,
      target: null,
      payload: input,
      dedupeKey: `distance-sale-threshold:${input.year}:${input.warning}`,
    });
  } catch (err) {
    yut(err, 'distance_sale_threshold');
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

/**
 * Müşteri kargo fiyatı alamadı, çünkü verimiz eksik: haber ürün başına ya da depo başına birdir ve dedupe kalıcıdır, çünkü eksiği ürün
 * kartı ya da depo ekranı taşır. Ürün kimliği payload'da, çünkü ölçü ürün kartında düzeltilir ve web oraya açar.
 */
export async function notifyShippingDataMissing(db: SupabaseClient, input: ShippingDataGap & { warehouseId: string }): Promise<void> {
  try {
    const ortak = {
      kind: 'shipping_data_missing' as const,
      roles: ['admin' as const, 'warehouse' as const],
      warehouseId: input.warehouseId,
    };
    if (input.variantIds.length === 0) {
      await dispatchStaffNotification(db, {
        ...ortak,
        payload: { reason: input.reason },
        dedupeKey: `shipping-data:${input.reason}:${input.warehouseId}`,
      });
      return;
    }
    for (const variant of await new ProductVariantService(db).listByIds([...input.variantIds])) {
      await dispatchStaffNotification(db, {
        ...ortak,
        target: { type: 'variant', id: variant.id },
        payload: { reason: input.reason, productId: variant.productId, ...(variant.sku ? { sku: variant.sku } : {}) },
        dedupeKey: `shipping-data:${input.reason}:${variant.id}`,
      });
    }
  } catch (err) {
    yut(err, 'shipping_data_missing');
  }
}

/**
 * İade düştü ya da yazılamadı: para müşteriye dönmedi ve kendiliğinden yapılan iadede bunu gören kimse yok. Sipariş başına tek zil;
 * yeniden deneme de düşerse aynı satır kalır, operatör sipariş sayfasından yeniden dener.
 */
export async function notifyRefundBlocked(
  db: SupabaseClient,
  input: { orderId: string; amountCents: number; reason: string },
): Promise<void> {
  try {
    const order = await new OrderService(db).getById(input.orderId);
    if (!order) return;
    await dispatchStaffNotification(db, {
      kind: 'refund_blocked',
      roles: ['admin', 'accounting'],
      warehouseId: order.warehouseId,
      target: { type: 'order', id: order.id },
      payload: { referenceNo: order.referenceNo, amountCents: input.amountCents, reason: input.reason },
      dedupeKey: `refund-blocked:${order.id}`,
    });
  } catch (err) {
    yut(err, 'refund_blocked');
  }
}

/**
 * Kart aktarımının raporunda defterin açıklayamadığı işlem var: aktarım tutarı defterdeki tahsilat, iade ve komisyonla tutmaz. Aktarım
 * başına tek zil, çünkü rapor yeniden okunsa da aynı fark aynı aktarımındır.
 */
export async function notifyPayoutUnexplained(
  db: SupabaseClient,
  input: { payoutId: string; rowCount: number; amountCents: number },
): Promise<void> {
  try {
    await dispatchStaffNotification(db, {
      kind: 'payout_unexplained',
      roles: ['admin', 'accounting'],
      warehouseId: null,
      target: null,
      payload: { payoutId: input.payoutId, rowCount: input.rowCount, amountCents: input.amountCents },
      dedupeKey: `payout-unexplained:${input.payoutId}`,
    });
  } catch (err) {
    yut(err, 'payout_unexplained');
  }
}

/**
 * Revolut'ta yüz yüze bir kart ödemesi var ama bizde onu karşılayan kapıda kart tahsilatı bulunamadı; personel kartı yazmamış ya da
 * eşleşme belirsiz. Ödeme başına tek zil.
 */
export async function notifyDoorCardUnmatched(
  db: SupabaseClient,
  input: { paymentRef: string; amountCents: number; at: string },
): Promise<void> {
  try {
    await dispatchStaffNotification(db, {
      kind: 'door_card_unmatched',
      roles: ['admin', 'accounting'],
      warehouseId: null,
      target: null,
      payload: { paymentRef: input.paymentRef, amountCents: input.amountCents, at: input.at },
      dedupeKey: `door-card-unmatched:${input.paymentRef}`,
    });
  } catch (err) {
    yut(err, 'door_card_unmatched');
  }
}

/** Bizde kapıda kart diye yazılmış tahsilatın Revolut'ta ödemesi bulunamadı; zil siparişe açılır, tahsilat başına bir kez. */
export async function notifyDoorCardMissing(
  db: SupabaseClient,
  input: { movementId: string; orderId: string; amountCents: number },
): Promise<void> {
  try {
    const order = await new OrderService(db).getById(input.orderId);
    if (!order) return;
    await dispatchStaffNotification(db, {
      kind: 'door_card_missing',
      roles: ['admin', 'accounting'],
      warehouseId: order.warehouseId,
      target: { type: 'order', id: order.id },
      payload: { referenceNo: order.referenceNo, amountCents: input.amountCents },
      dedupeKey: `door-card-missing:${input.movementId}`,
    });
  } catch (err) {
    yut(err, 'door_card_missing');
  }
}
