import { cartAddedVat, vatTotalOf, type CartTotalLine, type CartVatBasis } from './cart-totals';

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
  /** Sepetin satırları ve fiyat tabanı: KDV hariç sepette düğme KDV dahil tutarı yazar. */
  lines: readonly (CartTotalLine & { vatRate: number })[];
  basis: CartVatBasis;
}

/**
 * Sepet düğmesinin yazdığı tutar, açtığı siparişin KDV dahil ürün tutarıdır: bölünmüş sepette kapı siparişi indirimini yalnız kendi kalemleriyle
 * alır. Kargo ücreti hiçbir hâlde katılmaz, çünkü taşıyıcı onu ödeme adımında seçilen servise göre fiyatlar.
 */
export function checkoutButtonCents(input: CheckoutButtonInput): number {
  const goods = input.split ? Math.max(0, input.localItemsCents - input.localOrderDiscountCents) : input.totalCents;
  const vat = cartAddedVat(input.lines, input.basis, input.split ? (line) => line.group === 'local' : undefined);
  return goods + vatTotalOf(vat);
}
