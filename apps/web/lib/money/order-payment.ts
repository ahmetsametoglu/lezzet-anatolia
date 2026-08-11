import { serviceDb } from '@lezzet/database';
import {
  recordOrderPayment as recordOrderPaymentFor,
  recordOrderRefund as recordOrderRefundFor,
  syncOrderPaymentStatus as syncOrderPaymentStatusFor,
  type OrderMovementInput,
  type PaymentOutcome,
} from '@lezzet/application';

/**
 * Siparişin para bağları (12.2) — **KÖPRÜ**. Kural `@lezzet/application`ın `order/payment`inde.
 *
 * ── KOPYAYDI, ÖLÇÜMLE KÖPRÜYE DÖNDÜ (17.9) ──────────────────────────────────
 * Bu dosya 21.10'daki terfiden sonra da kendi gövdesini taşımaya devam ediyordu: aynı üç adım
 * (hareketi yaz → durumu türet → siparişe yaz) hem burada hem pakette yazılıydı ve paketin künyesi
 * bunu "geçiş köprüsü, benimsemesi ayrı talep dosyasıyla gider" diye kaydetmişti. Yani duplication
 * BİLİNİYORDU ve bedeli bugün ölçüldü:
 *
 * Getirenin ödülü teslimattan ÖDEMEYE taşındı ve kanca paketin `finalize`ına konuldu — web'den
 * yapılan her tahsilat kendi kopyasından geçtiği için ödül HİÇ yazılmadı. Test kırmızı döndü,
 * sebep koddaydı: iki kopya vardı, kural birine yazılmıştı. Aynı arıza yarın kısmi iade ya da
 * ödeme durumu kuralında da olurdu.
 *
 * ── ADOPTE EDİLEN SÜRÜM DAHA GENİŞ ──────────────────────────────────────────
 * Paketin kapısı `idempotencyKey` de taşıyor: tekrar eden istek ikinci bir hareket yazmaz, ilk
 * isteğin sonucunu döner (`deduped: true`). Web kopyasında bu yoktu — Stripe webhook'unun aynı
 * olayı iki kez göndermesi iki tahsilat satırı demekti. Köprüye geçmek o emniyeti de getiriyor.
 *
 * **Köprü NEDEN duruyor:** `serviceDb()` enjeksiyonu. Paket `db`yi çağırandan ister (test edilebilir
 * olsun diye); web'in dört çağıranı (hızlı satış · Stripe webhook · kurye kapanışı · banka
 * eşleştirme) her seferinde onu yazmasın diye tek satırlık kapılar burada duruyor.
 */

/** Tahsilat — kapıda nakit/kart, havale, Stripe onayı, kurye gün kapanışı. */
export function recordOrderPayment(input: OrderMovementInput): Promise<PaymentOutcome> {
  return recordOrderPaymentFor(serviceDb(), input);
}

/** İade — kısmi karşılama farkı (07.8), iptal/iade (07.9). */
export function recordOrderRefund(input: OrderMovementInput): Promise<PaymentOutcome> {
  return recordOrderRefundFor(serviceDb(), input);
}

/**
 * Ödeme durumunu yeniden türetip yazar. Para DIŞINDA bir şey değiştiğinde de çağrılır: kısmi
 * karşılamada `fulfilled_qty` düşünce (07.8) ya da sipariş iptal olunca karşılanan tutar değişir —
 * tahsilat hiç değişmese bile durum değişir.
 */
export function syncOrderPaymentStatus(orderId: string) {
  return syncOrderPaymentStatusFor(serviceDb(), orderId);
}
