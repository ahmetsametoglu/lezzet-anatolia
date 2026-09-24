/** Sepet düğmesinin tutar sorusunun girdisi; web ve native sepet görünümü aynı alanları taşır. */
export interface CheckoutButtonInput {
  /** İndirimli sepet toplamı. */
  totalCents: number;
  /** Sepet kapıya ve kargoya iki siparişe bölünmüş mü. */
  split: boolean;
  /** Kapı grubunun indirimsiz kalem toplamı. */
  localItemsCents: number;
  /** Kapı siparişinin yalnız kendi kalemleriyle aldığı indirim. */
  localOrderDiscountCents: number;
}

/**
 * Sepet düğmesinin yazdığı tutar, açtığı siparişin ürün tutarıdır: bölünmüş sepette kapı siparişi indirimini yalnız kendi kalemleriyle
 * alır. Kargo ücreti hiçbir hâlde katılmaz, çünkü taşıyıcı onu ödeme adımında seçilen servise göre fiyatlar.
 */
export function checkoutButtonCents(input: CheckoutButtonInput): number {
  return input.split ? Math.max(0, input.localItemsCents - input.localOrderDiscountCents) : input.totalCents;
}
