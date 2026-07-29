import type { CartDiscount } from './cart-types';

/**
 * İndirim satırının ETİKETİ — "neden bu para düştü" sorusunun cevabı (tasarım: "İndirim — HOSGELDIN10").
 *
 * Ekranın kendi karar vermemesi için burada: aynı satır sepette ve ödemede birden görünüyor ve
 * ikisi aynı şeyi söylemek zorunda. İki yerde ayrı yazılsaydı biri kuponu, öbürü yalnız "İndirim"i
 * gösterirdi — bugün olan da buydu.
 *
 * **Karar değil, cümle kurar.** Hangi indirimin indiği motorun, sebebinin ne olduğu sunucunun
 * işidir (`CartDiscount.reason`); burada yalnız o sebep sayfanın sözlüğüyle buluşur.
 */

/**
 * Sayfanın sözlüğünden gereken parçalar — her sayfa kendi `messages.json`'undan geçirir.
 *
 * Dışa AÇILMAZ: çağıranlar kendi `Messages` tipini veriyor, yapısal uyum yeter. Export edilseydi
 * kullanılmayan bir dışa açık tip olurdu (`knip`).
 */
interface DiscountLabelCopy {
  /** Satırın adı: "İndirim". */
  discount: string;
  /** Oranı bütün sepete inmeyen kampanya: "kampanya". */
  discountCampaign: string;
  /** Oranı bütün sepete inen kampanya: "kampanya %{percent}". */
  discountCampaignPercent: string;
  /** Müşterinin genel oranı: "size özel %{percent}". */
  discountCustomerRate: string;
}

export function discountLabel(discount: CartDiscount, t: DiscountLabelCopy): string {
  // Kupon: sebep kodun kendisidir ve tasarımda birebir böyle yazılı.
  if (discount.status === 'applied') return `${t.discount} — ${discount.code}`;
  if (discount.status !== 'automatic') return t.discount;

  const { reason } = discount;
  if (reason.kind === 'customer_rate') return `${t.discount} — ${percent(t.discountCustomerRate, reason.percent)}`;
  // Oran bilinmiyorsa sebep söylenir, sayı UYDURULMAZ (bkz. `DiscountReason`).
  return `${t.discount} — ${reason.percent == null ? t.discountCampaign : percent(t.discountCampaignPercent, reason.percent)}`;
}

/**
 * Yüzde metni sözlükten gelir, burada kurulmaz: Türkçe "%15" yazar, Fransızca "15 %" — işareti
 * koda gömmek dillerden birini yanlış yazmak olurdu.
 */
function percent(template: string, value: number): string {
  return template.replace('{percent}', String(value));
}
