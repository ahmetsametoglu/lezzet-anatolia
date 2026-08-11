import type { z } from 'zod';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { CartDiscountReasonSchema, MeCartView } from '@lezzet/types';

import messages from './discount-label-messages.json';

/*
  İNDİRİMİN MÜŞTERİYE GÖRÜNEN KÜNYESİ — TEK TÜRETME, İKİ EKRAN.

  Aynı indirim sepette ve sipariş özetinde AYNI adla anılmak zorunda: müşteri sepette "Baklava
  haftası −6,15 €" görüp bir adım sonra yalnız "İndirim −6,15 €" görürse, iki ekranın aynı
  indirimden bahsettiğine güvenmesi için sayıyı karşılaştırması gerekir. Türetme iki dosyada
  yazılsaydı bir gün ayrışırdı (CLAUDE §1) — bu yüzden kural burada, ekranlar yalnız çağırıyor.

  ── AD SUNUCUDA ÇÖZÜLÜR, BURADA DEĞİL ───────────────────────────────────────
  Kampanyanın müşteri-yüzü adı çok dilli bir alandır (`discount.public_label`, jsonb) ve dile göre
  çözümü SUNUCUNUN işidir (`cart-view.ts` → `labelOf` → `resolveLocalizedText`). Sözleşme bize
  çözülmüş tek bir dize getirir (`discount.label`); istemci üç dilli nesneyi hiç görmez. Burada
  yapılan tek şey, o ad YOKKEN ne yazılacağına karar vermek.

  ── AD YOKSA SEBEP YAZILIR, BOŞLUK DEĞİL ────────────────────────────────────
  `public_label` doldurulmamış bir kampanya da müşteriye bir şey indiriyor; satırı adsız bırakmak
  "nereden geldiği belirsiz bir eksi" demekti. O hâlde indirimin SEBEBİ yazılır ("Kampanya · %8",
  "Size özel · %5") — kampanyanın İÇ adı (`discount.name`) asla: o operasyonun künyesidir, müşteri
  "Büyük sepet indirimi"ni okumak zorunda değil.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Özet satırının iki parçası; başına gelen "İndirim"/"Remise" öneki ÇAĞIRANIN metnidir. */
interface DiscountSummary {
  /**
   * Müşterinin okuduğu künye: kampanyanın adı, kupon kodu ya da sebebin okunabilir hâli.
   * `null` yalnız TEK hâlde doğar — kupon reddedilmiş ve yerine inen indirimin künyesi hiç yok;
   * o zaman çağıran öneki tek başına yazar.
   */
  name: string | null;
  amountCents: number;
}

type DiscountReason = z.infer<typeof CartDiscountReasonSchema>;

/** Kendiliğinden inen indirimin sebebi — kampanyanın İÇ adı değil, müşterinin okuduğu gerekçe. */
function reasonLabel(reason: DiscountReason, t: Messages): string {
  if (reason.kind === 'customer_rate') return t.customerRate.replace('{percent}', String(reason.percent));
  return reason.percent === null ? t.campaign : t.campaignPercent.replace('{percent}', String(reason.percent));
}

/**
 * Görünümün indirimi → özet satırının künyesi + tutarı. İndirim yoksa `null` (satır hiç çizilmez).
 *
 * Dört hâl, dört farklı doğru:
 * · `applied`  — kupon tuttu: kampanyanın adı varsa o, yoksa müşterinin yazdığı KOD.
 * · `automatic`— kendiliğinden indi: adı varsa o, yoksa sebebi.
 * · `rejected` + yerine inen indirim — kupon tutmadı ama müşteri hak ettiğini KAYBETMEZ
 *   (`appliedInstead`); satır bir kupon denendi diye künyesini yitirmemeli.
 * · geri kalanı — indirim yok.
 */
export function discountSummaryOf(discount: MeCartView['discount'], locale: Locale): DiscountSummary | null {
  const t: Messages = messages[locale];

  if (discount.status === 'applied') {
    return { name: discount.label ?? discount.code, amountCents: discount.amountCents };
  }
  if (discount.status === 'automatic') {
    return { name: discount.label ?? reasonLabel(discount.reason, t), amountCents: discount.amountCents };
  }
  if (discount.status === 'rejected' && discount.appliedInsteadCents > 0) {
    const instead = discount.appliedInstead;
    return {
      name: instead === null ? null : (instead.label ?? reasonLabel(instead.reason, t)),
      amountCents: discount.appliedInsteadCents,
    };
  }
  return null;
}
