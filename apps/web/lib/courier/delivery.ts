import { OrderService, SettingsService, serviceDb } from '@lezzet/database';
import type { DeliveryProofRecord, FulfillmentAdjustment, Order, PaymentStatus } from '@lezzet/types';
import { deliverOrder } from '../order/fulfillment';
import { adjustFulfillment } from '../order/refund';
import { recordOrderPayment, syncOrderPaymentStatus } from '../money/order-payment';

/**
 * Kapıda teslim: onay, eksik kalem ve tahsilat (11.2/11.3) — **uygulama katmanı orkestrasyonu**.
 * `design/pages/kurye-teslimat.md` + DOMAIN §6 (teslim onayı), §7 (nakit sınırı), §8 (kısmi).
 *
 * **Sıra kuralın kendisidir:** önce kanıt kapısı (hiçbir yazım yapılmadan), sonra MAL, sonra teslim,
 * en sonda PARA.
 * - Kanıt kontrolü başta: B2B teslimatı imzasız kapanmamalı — yarısı yazılmış bir teslimat üstüne
 *   "olmadı" demek, malı düşmüş ama teslim görünmeyen sipariş bırakırdı.
 * - Eksik kalem teslimden ÖNCE düşülür: teslimden sonra düşseydi mal önce fiili stoktan çıkar,
 *   sonra geri alınırdı — kayıt aynı malı iki kez oynatırdı (0026'nın "tam bir kez say" kuralı).
 * - Tahsilat en sonda: teslim `stale` dönerse karşılığı olmayan para yazılmış olmaz.
 *
 * **Kurye hesap yapmaz.** Eksik işaretlendiğinde tahsil edilecek tutarı düşüren şey bu dosyadaki bir
 * çarpma değil, ödeme durumu türetimidir (`domain-core/payment`) — tutar tek yerde hesaplanır.
 */

/** Teslim onayı: müşteri ekranda imzalar ya da kurye fotoğraf çeker (DOMAIN §6). */
export interface DeliveryProofInput {
  kind: 'signature' | 'photo';
  /** Depolanan görselin anahtarı (imza çizimi de görsel olarak saklanır). */
  imageKey: string;
  /** Kapıda teslim alan kişi — B2B'de "kim imzaladı" ihtilafın cevabıdır. */
  receivedBy?: string | null;
}

/** Kapıda tahsilat. Yöntem üçle sınırlıdır: online ve havale kuryenin eline hiç girmez. */
export interface DoorCollectionInput {
  method: 'cash' | 'card' | 'cheque';
  /** **Cent** (02.9 · STACK §8). */
  amountCents: number;
  /** Paranın gireceği hesap (kurye kasası / kapı tahsilatı). */
  accountId: string;
}

type DoorDeliveryOutcome =
  | {
      status: 'ok';
      /** Fiilen yazılan tahsilat (**cent**); tahsilat yoksa 0. */
      collectedCents: number;
      /** Teslim sonrası kalan borç (**cent**) — kapıda ödenmediyse ya da eksik ödendiyse pozitif. */
      amountDueCents: number;
      paymentStatus: PaymentStatus;
      /**
       * Nakit yasal sınırı aşıldı mı (FR ~1.000 €). **Engel DEĞİL, bilgi:** tahsilat tamamlanır,
       * karar sahadadır (DOMAIN §7).
       */
      cashLimitExceeded: boolean;
      /** Eksik/reddedilen kalem yazıldı mı — tutar buna göre kendiliğinden düştü. */
      adjustedLines: number;
    }
  /** Kanıt zorunlu ama gelmedi — HİÇBİR yazım yapılmadı. */
  | { status: 'proof_required'; channel: Order['channel'] }
  | { status: 'forbidden'; reason: 'not_assigned' }
  | { status: 'stale'; currentStatus: Order['status'] }
  | { status: 'not_found' };

export async function confirmDoorDelivery(input: {
  orderId: string;
  courierId: string;
  /**
   * Kapıda eksik çıkan / müşterinin kabul etmediği kalemler. `fulfilledQty` **hedef** değerdir
   * (kalan adet), fark değil — ekranda görülen sayı gönderilir (07.8).
   */
  adjustments?: readonly FulfillmentAdjustment[];
  proof?: DeliveryProofInput | null;
  collection?: DoorCollectionInput | null;
}): Promise<DoorDeliveryOutcome> {
  const db = serviceDb();
  const orders = new OrderService(db);
  const order = await orders.getById(input.orderId);
  if (!order) return { status: 'not_found' };
  if (order.courierId !== input.courierId) return { status: 'forbidden', reason: 'not_assigned' };

  // ── Kanıt kapısı: yazımdan önce ────────────────────────────────────────────
  if (!input.proof && (await proofRequired(db, order.channel))) {
    return { status: 'proof_required', channel: order.channel };
  }

  // ── Mal ────────────────────────────────────────────────────────────────────
  // Kapıda reddedilen mal fiili stoktan HİÇ düşmemiştir (sipariş henüz `delivered` değil): kalem–parti
  // kaydı ve rezervasyon azalır, mal araçta kalır ve depoya döner (0026).
  const adjustments = input.adjustments ?? [];
  if (adjustments.length > 0) {
    const adjusted = await adjustFulfillment(input.orderId, adjustments, { actorId: input.courierId });
    if (adjusted.status === 'stale') return { status: 'stale', currentStatus: adjusted.currentStatus };
    if (adjusted.status === 'not_found') return { status: 'not_found' };
  }

  // ── Teslim ─────────────────────────────────────────────────────────────────
  const delivered = await deliverOrder(input.orderId, {
    actorId: input.courierId,
    deliveryProof: input.proof ? proofRecord(input.proof, input.courierId) : null,
  });
  if (!delivered.ok) return { status: 'stale', currentStatus: delivered.currentStatus };

  // ── Para ───────────────────────────────────────────────────────────────────
  const cashLimitExceeded =
    input.collection?.method === 'cash' && input.collection.amountCents > (await cashLegalLimitCents(db));

  if (!input.collection) {
    const synced = await syncOrderPaymentStatus(input.orderId);
    if (synced.status !== 'ok') return { status: 'not_found' };
    return {
      status: 'ok',
      collectedCents: 0,
      amountDueCents: synced.derivation.amountToCollectCents,
      paymentStatus: synced.paymentStatus,
      cashLimitExceeded: false,
      adjustedLines: adjustments.length,
    };
  }

  // Yöntem siparişe yazılır: gün kapanışı beklenen toplamları yöntem bazında bundan türetir (11.6).
  await orders.update({ id: input.orderId, paymentMethod: input.collection.method });

  const paid = await recordOrderPayment({
    orderId: input.orderId,
    accountId: input.collection.accountId,
    amountCents: input.collection.amountCents,
    description: 'Kapıda tahsilat',
  });
  if (paid.status !== 'ok') return { status: 'not_found' };

  return {
    status: 'ok',
    collectedCents: input.collection.amountCents,
    amountDueCents: paid.derivation.amountToCollectCents,
    paymentStatus: paid.paymentStatus,
    cashLimitExceeded,
    adjustedLines: adjustments.length,
  };
}

/**
 * Kanıt bu kanalda zorunlu mu. Kapsam parametriktir (B2B zorunlu, B2C kapalı — varsayılan); ayar
 * okunamazsa **zorunlu değil** kabul edilir: eksik ayar yüzünden kuryenin kapıda kilitlenmesi,
 * kanıtsız bir teslimattan daha pahalıdır.
 */
async function proofRequired(db: ReturnType<typeof serviceDb>, channel: Order['channel']): Promise<boolean> {
  const scope = await new SettingsService(db).get<Record<string, boolean>>('delivery_proof_required', {
    b2b: true,
    b2c: false,
  });
  return scope?.[channel] === true;
}

/** Nakit yasal sınırı (cent) — ayardan; kodda sabit yok (CLAUDE.md §4). */
function cashLegalLimitCents(db: ReturnType<typeof serviceDb>): Promise<number> {
  return new SettingsService(db).getNumber('cash_legal_limit_cents', 100_000);
}

/**
 * Siparişe yazılan kanıt: ne, kim, ne zaman — "eksik geldi" ihtilafının tek sigortası (DOMAIN §6).
 *
 * **Şekil `packages/types`'tan geliyor** (`DeliveryProofRecord`), burada elle yazılmıyor. Eskiden
 * yazılıyordu ve okuyan ekran BAŞKA alan adları arıyordu (`photos[]`, `by`, `note`) — ortak tek
 * alan `at` idi. İki taraf da kendi içinde tutarlı olduğu için hiçbir yerde hata vermiyordu; ekran
 * kanıtı "var" gösteriyor, ama neyin var olduğunu söyleyemiyordu. Tipe bağlanınca yanlış alan adı
 * derleme hatasına döndü.
 */
function proofRecord(proof: DeliveryProofInput, courierId: string): DeliveryProofRecord {
  return {
    kind: proof.kind,
    imageKey: proof.imageKey,
    receivedBy: proof.receivedBy ?? null,
    courierId,
    at: new Date().toISOString(),
  };
}
