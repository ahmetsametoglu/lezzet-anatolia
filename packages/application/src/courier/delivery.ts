import { OrderBoxService, OrderService, SettingsService } from '@lezzet/database';
import type { DoorCodeCheck } from '@lezzet/domain-core';
import type {
  DeliveryProofRecord,
  DoorCollectionInputContract,
  DoorMethod,
  FulfillmentAdjustment,
  Order,
  PaymentStatus,
} from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readDoorAccountId } from '../order/door-account';
import type { OrderEffects } from '../order/effects';
import { recordOrderPayment, syncOrderPaymentStatus } from '../order/payment';
import { deliverOrderWithAdjustments } from '../order/refund';
import { kickOrderRegister } from '../register/sync';
import { verifyDoorCode } from './door-code';

/**
 * Kapıda teslim: önce kutu, kapı kodu ve hesap kapısı (hiçbir yazım yapılmadan), sonra mal ve teslim tek yazımda, en sonda para; teslim
 * `stale` dönerse karşılıksız para yazılmaz. Kurye hesap yapmaz: tahsil edilecek tutarı ödeme durumu türetimi tek yerde hesaplar.
 */

export type DoorDeliveryOutcome =
  | {
      status: 'ok';
      /** Fiilen yazılan tahsilat (**cent**); tahsilat yoksa 0. */
      collectedCents: number;
      /** Teslim sonrası kalan borç (**cent**) — kapıda ödenmediyse ya da eksik ödendiyse pozitif. */
      amountDueCents: number;
      paymentStatus: PaymentStatus;
      /** Nakit yasal sınırı aşıldı mı; engel değil bilgi: tahsilat tamamlanır, karar sahadadır (DOMAIN §7). */
      cashLimitExceeded: boolean;
      /** Eksik/reddedilen kalem yazıldı mı — tutar buna göre kendiliğinden düştü. */
      adjustedLines: number;
      /** Tahsilat bu çağrıda yazılmadı, aynı `idempotencyKey` ile zaten yazılmıştı; sonucun geri kalanı gerçektir. */
      collectionDeduped?: true;
    }
  /** Kapı kodu tutmadı; hiçbir yazım yapılmadı. `attemptsLeft` sıfırsa sonraki deneme kilitlenir. */
  | { status: 'door_code_mismatch'; attemptsLeft: number }
  /** Kod hakları doldu; kurye kodsuz teslim edebilir. */
  | { status: 'door_code_locked' }
  /** Kutulu siparişte okutulmamış kutu var — teslim YAZILMADI. */
  | { status: 'boxes_missing'; remainingBoxNos: number[] }
  /** Tahsilatın yönteminin hesabı ayarlı değil — HİÇBİR yazım yapılmadı. */
  | { status: 'collection_unavailable'; method: DoorMethod }
  | { status: 'forbidden'; reason: 'not_assigned' }
  | { status: 'stale'; currentStatus: Order['status'] }
  | { status: 'not_found' };

/**
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), `auth/otp` deseni.
 */
export async function confirmDoorDelivery(
  db: SupabaseClient,
  input: {
    orderId: string;
    courierId: string;
    /**
     * Kapıda eksik çıkan / müşterinin kabul etmediği kalemler. `fulfilledQty` **hedef** değerdir
     * (kalan adet), fark değil — ekranda görülen sayı gönderilir.
     */
    adjustments?: readonly FulfillmentAdjustment[];
    /** Müşterinin söylediği kapı kodu; boş = kodsuz teslim. Kod üretilmemiş siparişte yok sayılır. */
    doorCode?: string | null;
    collection?: DoorCollectionInputContract | null;
    /**
     * Kapıda okutulan kutu kodları: kutulu siparişte teslimin ön koşulu; set kutuları kapsamıyorsa hiçbir yazım yapılmadan `boxes_missing` döner.
     */
    scannedBoxCodes?: readonly string[];
    /** Müşteri haberi / puan portları — `order/effects.ts`. */
    effects?: OrderEffects;
  },
): Promise<DoorDeliveryOutcome> {
  const orders = new OrderService(db);
  const order = await orders.getById(input.orderId);
  if (!order) return { status: 'not_found' };
  if (order.courierId !== input.courierId) return { status: 'forbidden', reason: 'not_assigned' };

  /*
    Kutu kapısı yazımdan önce çalışır: bütün kutular okutulmadan teslim tamamlanmaz ve kutusuz sipariş de geçemez, çünkü mal kutusuyla hazırlanır, araca biner ve kapıdan çıkar.
    Kutusuz sipariş buraya düşmemeli (hazırlık onu `ready` yapmıyor); düşerse teslim yazılmaz ve ekran "kutu kaydı yok" der ki arıza görünür olsun.
  */
  const boxes = await new OrderBoxService(db).listByOrder(input.orderId);
  const scanned = new Set((input.scannedBoxCodes ?? []).map((code) => code.trim()));
  const remaining = boxes.filter((box) => !scanned.has(box.code));
  if (boxes.length === 0 || remaining.length > 0) {
    return { status: 'boxes_missing', remainingBoxNos: remaining.map((box) => box.boxNo) };
  }

  // Kod yazımdan önce sınanır, çünkü yanlış kodla yazılmış teslim geri alınamaz.
  const door = await verifyDoorCode(db, input.orderId, input.doorCode ?? null);
  if (door.kind === 'mismatch') return { status: 'door_code_mismatch', attemptsLeft: door.attemptsLeft };
  if (door.kind === 'locked') return { status: 'door_code_locked' };
  const doorCode = doorCodeResult(door);

  // Hesap da yazımdan önce çözülür, çünkü teslim yazılıp para yazılamasaydı mal gitmiş, tahsilat kayıtsız kalırdı.
  const accountId = input.collection ? await readDoorAccountId(db, input.collection.method) : null;
  if (input.collection && accountId === null) return { status: 'collection_unavailable', method: input.collection.method };

  /*
    Düzeltme ve teslim tek yazımdır (`deliverOrderWithAdjustments`), çünkü ardışık iki çağrıda teslim `stale` dönünce düzeltme ve müşteriye giden "eksik" haberi geri alınamıyordu.
    Okutulan kutu kodları ve kapı kodunun sonucu kanıt olarak yazılır.
  */
  const adjustments = input.adjustments ?? [];
  const written = await deliverOrderWithAdjustments(db, input.orderId, adjustments, {
    actorId: input.courierId,
    deliveryProof: boxScanRecord(boxes.map((box) => box.code), input.courierId, doorCode),
    effects: input.effects,
  });
  if (written.status === 'stale') return { status: 'stale', currentStatus: written.currentStatus };
  if (written.status === 'not_found') return { status: 'not_found' };
  /*
    `already_marked` bu yoldan doğamaz: veritabanı koşulu isteğin bir akıbet taşımasını şart koşar ve kurye sözleşmesi akıbeti `omit` ile dışarıda bırakır.
    Dal yine de durur, çünkü paylaşılan kapıda depo yolu bu cevabı üretir; en yakın doğru cevap `stale`dir, kapı hiçbir şey yazmadı.
  */
  if (written.status === 'already_marked') {
    return { status: 'stale', currentStatus: 'out_for_delivery' };
  }

  // ── Para ───────────────────────────────────────────────────────────────────
  const cashLimitExceeded =
    input.collection?.method === 'cash' && input.collection.amountCents > (await cashLegalLimitCents(db));

  if (!input.collection || accountId === null) {
    const synced = await syncOrderPaymentStatus(db, input.orderId);
    if (synced.status !== 'ok') return { status: 'not_found' };
    return {
      status: 'ok',
      collectedCents: 0,
      amountDueCents: synced.derivation.amountToCollectCents,
      paymentStatus: synced.paymentStatus,
      cashLimitExceeded: false,
      adjustedLines: written.adjustedLines,
    };
  }

  // Yöntem siparişe yazılır: gün kapanışı beklenen toplamları yöntem bazında bundan türetir.
  await orders.update({ id: input.orderId, paymentMethod: input.collection.method });

  const paid = await recordOrderPayment(db, {
    orderId: input.orderId,
    accountId,
    amountCents: input.collection.amountCents,
    method: input.collection.method,
    description: 'Kapıda tahsilat',
    idempotencyKey: input.collection.idempotencyKey,
    // Sistemin yazdığı satır: kurye kapıda onaylar, deftere yazan teslim akışıdır.
    source: 'system',
  });
  if (paid.status !== 'ok') return { status: 'not_found' };
  kickOrderRegister(db, input.orderId);

  return {
    status: 'ok',
    collectedCents: input.collection.amountCents,
    amountDueCents: paid.derivation.amountToCollectCents,
    paymentStatus: paid.paymentStatus,
    cashLimitExceeded,
    adjustedLines: written.adjustedLines,
    ...(paid.deduped ? { collectionDeduped: true as const } : {}),
  };
}

/** Kanıta yazılan kod sonucu; kod üretilmemiş siparişte alan hiç yazılmaz. */
function doorCodeResult(check: DoorCodeCheck): DeliveryProofRecord['doorCode'] {
  if (check.kind === 'verified') return 'verified';
  return check.kind === 'skipped' ? 'skipped' : null;
}

/** Nakit yasal sınırı (cent) — ayardan; kodda sabit yok (CLAUDE.md §4). Gel-al tezgâhı da aynı sınırı okur. */
export function cashLegalLimitCents(db: SupabaseClient): Promise<number> {
  return new SettingsService(db).getNumber('cash_legal_limit_cents', 100_000);
}

/**
 * Teslim kanıtı: kapıda okutulan kutu kodları ve kapı kodunun sonucu, "eksik geldi" ihtilafının dayanağı. Gel-al tezgâhı da bu kaydı
 * yazar; `courierId` orada teslim eden depocudur.
 */
export function boxScanRecord(boxCodes: string[], courierId: string, doorCode: DeliveryProofRecord['doorCode'] = null): DeliveryProofRecord {
  return {
    kind: 'box_scan',
    courierId,
    at: new Date().toISOString(),
    boxCodes,
    ...(doorCode ? { doorCode } : {}),
  };
}
