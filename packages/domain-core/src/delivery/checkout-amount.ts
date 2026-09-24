/** Sepet tutarı sorularının girdisi; web ve native sepet görünümü aynı alanları taşır. */
export interface CartAmountInput {
  /** İndirimli sepet toplamı, kargo hariç. */
  totalCents: number;
  /** Sepetin tamamı kargo grubunda mı. */
  shippingOnly: boolean;
  /** Kargo grubunun çözülmüş ücreti; eşik aşıldıysa 0. */
  shippingFeeCents: number;
  /** Sepet kapıya ve kargoya iki siparişe bölünmüş mü. */
  split: boolean;
  /** Kapı grubunun indirimsiz kalem toplamı. */
  localItemsCents: number;
  /** Kapı siparişinin yalnız kendi kalemleriyle aldığı indirim. */
  localOrderDiscountCents: number;
}

/**
 * Sepetin ödenecek tutarı: sepetin tamamı kargodaysa tek sipariş doğar ve kargo ücreti bellidir, o yüzden toplama girer. Karışık
 * sepette ücret yalnız kargo grubunun kendi kutusunda yazılır.
 */
export function payableTotalCents(input: Pick<CartAmountInput, 'totalCents' | 'shippingOnly' | 'shippingFeeCents'>): number {
  return input.totalCents + (input.shippingOnly ? input.shippingFeeCents : 0);
}

/**
 * Sepet düğmesinin yazdığı tutar, açtığı siparişin tutarıdır. Bölünmüş sepette düğme kapı siparişini açar; o sipariş indirimini
 * yalnız kendi kalemleriyle alır ve kapı teslimatı ücretsizdir.
 */
export function checkoutButtonCents(input: CartAmountInput): number {
  return input.split ? Math.max(0, input.localItemsCents - input.localOrderDiscountCents) : payableTotalCents(input);
}
