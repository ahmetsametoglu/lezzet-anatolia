import type { PaymentStatus } from '@lezzet/types';

/**
 * Ödeme durumu türetimi (03.6) — DOMAIN §7/§8. `payment_status` **elle set edilmez**, iki
 * sayıdan hesaplanır: net tahsilat (tahsil − iade) ile **karşılanan tutar**.
 *
 * Karşılanan tutar = Σ `fulfilled_qty` × (indirimli birim fiyat) [+ kargo ücreti].
 * Kalem KDV'si ve kısmi iade zaten indirimli birimden hesaplanır (DOMAIN §5) — bu yüzden pay
 * dağıtımı (`line_discount_amount`) burada girdi olarak alınır, yeniden hesaplanmaz.
 *
 * Kararlar (27.07):
 * - **`partial` para eksenidir**: net, karşılanandan AZ. "Sipariş eksik karşılandı" ayrı bir
 *   eksendir (`fulfilled_qty`), bu alana karıştırılmaz.
 * - **Fazla tahsilat yeni durum açmaz**: `paid` kalır, fark `refundDueCents` olarak türetilir
 *   (panelde "iade bekliyor"). Enum dört değerde kalır.
 * - **İptal edilen siparişte karşılanan = 0** (ORDER_LIFECYCLE): tahsil edilmişse tamamı iade.
 * - **Bütün iade `returned`** kalem bazından türer: iade edilen kalemlerin `fulfilled_qty`'si
 *   düşer → karşılanan kendiliğinden 0'a iner. Ayrı kural yok. **İstisna `goodwill` iadesi:**
 *   mal müşteride kaldığı için miktar DÜŞMEZ; net 0'a indiği için durum yine `refunded` olur.
 * - **Kargo ücreti:** hiçbir kalem karşılanmadıysa (Σ fulfilled = 0) kargo da iade edilir —
 *   karşılanan tutara girmez. En az bir kalem gittiyse kargo hizmeti verilmiştir, iade edilmez.
 */

export interface FulfilledLine {
  /** Fiziksel olarak müşteriye giden miktar. */
  fulfilledQty: number;
  /** Sabitlenmiş birim fiyat (kanal tabanında, cent). */
  unitPriceCents: number;
  /** Sepet indiriminin bu kaleme düşen payı (cent, kalemin TAMAMI için). */
  lineDiscountCents?: number;
  /** Sipariş edilen miktar — indirim payını karşılanan orana bölmek için. */
  orderedQty: number;
}

export interface PaymentDerivationInput {
  lines: readonly FulfilledLine[];
  collectedCents: number;
  refundedCents: number;
  shippingFeeCents?: number;
  /** Sipariş iptal edildiyse karşılanan tutar 0 sayılır (ORDER_LIFECYCLE). */
  cancelled?: boolean;
}

export interface PaymentDerivation {
  status: PaymentStatus;
  /** Müşterinin ödemesi gereken tutar — kısmi karşılamada düşürülmüş hâli. */
  fulfilledAmountCents: number;
  /** Peşin ödenmişse iade edilecek fark (0 ise borç yok). */
  refundDueCents: number;
  /** Kapıda ödenecekse tahsil edilecek kalan (0 ise tahsilat yok). */
  amountToCollectCents: number;
}

export function derivePaymentStatus(input: PaymentDerivationInput): PaymentDerivation {
  const fulfilledAmountCents = input.cancelled ? 0 : fulfilledAmount(input);
  const net = input.collectedCents - input.refundedCents;

  const refundDueCents = Math.max(0, net - fulfilledAmountCents);
  const amountToCollectCents = Math.max(0, fulfilledAmountCents - net);

  return {
    status: statusOf(net, fulfilledAmountCents, input.refundedCents),
    fulfilledAmountCents,
    refundDueCents,
    amountToCollectCents,
  };
}

function statusOf(net: number, fulfilled: number, refunded: number): PaymentStatus {
  // Para geri gitmiş ve elde bir şey kalmamışsa iade edilmiştir — karşılanan tutara bakılmaz
  // (jest iadesinde mal müşteride kalır ama para tamamen geri döner).
  if (net <= 0) return refunded > 0 ? 'refunded' : 'pending';
  if (net >= fulfilled) return 'paid'; // fazlalık refundDueCents'te görünür
  return 'partial';
}

/**
 * Karşılanan tutar: kalemlerin gerçekten giden kısmı + (koşullu) kargo.
 * İndirim payı kalemin TAMAMI için verildiğinden, karşılanan orana bölünür — yarısı gittiyse
 * indirimin yarısı düşülür. Aksi halde kısmi iade fazla/eksik hesaplanır.
 */
function fulfilledAmount({ lines, shippingFeeCents = 0 }: PaymentDerivationInput): number {
  let total = 0;
  let anyFulfilled = false;

  for (const line of lines) {
    if (line.fulfilledQty <= 0) continue;
    anyFulfilled = true;
    const gross = line.unitPriceCents * line.fulfilledQty;
    const discountShare = line.lineDiscountCents
      ? Math.round((line.lineDiscountCents * line.fulfilledQty) / Math.max(1, line.orderedQty))
      : 0;
    total += gross - discountShare;
  }

  // Hiçbir kalem gitmediyse kargo hizmeti de değersizdir → karşılanan tutara girmez, iade edilir.
  return anyFulfilled ? total + shippingFeeCents : total;
}
