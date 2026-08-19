import { formatPrice } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';

/*
  KAMPANYANIN MÜŞTERİYE GÖRÜNEN CÜMLESİ — TEK TÜRETME, ÇOK EKRAN (08.44).

  Aynı kampanya vitrin bandında ve filtrelenmiş katalogda anılıyor; iki yerde ayrı yazılsaydı bir
  gün ayrışırlardı ve müşteri aynı kampanyayı iki farklı sayıyla okurdu (`discount-label` künyesinin
  aynı gerekçesi).

  ── NE SÖYLER ───────────────────────────────────────────────────────────────
  Yüzde ve sabit tutar AYNI kalıba girmez ve girmemeli: *"−%15"* bir orandır, *"−3,00 €"* bir
  tutardır ve tutar sepetin tamamına inen tek bir indirimdir. Eşik varsa cümle onu SÖYLEMEK
  ZORUNDA — *"60 € üzeri −%15"* ile *"−%15"* aynı vaat değildir ve eşiği yutmak, tutulmayan bir söz
  vermektir.

  ── TUTAR VAAT EDİLMEZ, KURAL SÖYLENİR ──────────────────────────────────────
  Burada bir ürün fiyatı hesaplanmaz. Kampanya sepetten bağımsız değildir (motor kazananı tüm sepet
  üzerinden seçer), o yüzden söylenebilecek tek dürüst şey kuralın kendisidir.
*/

/** Sözleşmenin taşıdığı kampanya — sunucu adı çözer, tutarı çözmez. */
export interface CampaignView {
  label: string | null;
  percent: number | null;
  amountCents: number | null;
  minBasketCents: number | null;
}

/** Cümlenin parçaları — çağıran ekran hangisini nereye koyacağına kendi karar verir. */
export interface CampaignCopy {
  /** "−%{n}" */
  percent: string;
  /** "−{amount}" */
  amount: string;
  /** "{minimum} üzeri {value}" */
  withMinimum: string;
}

/**
 * Kampanyanın kısa hâli — rozet ve satır sonu için. `null` = söylenecek bir değer yok
 * (iki alan da boş; motorun kendi korunmasının aynısı — "%0 indirim" diye bir şey yoktur).
 */
export function campaignValueOf(campaign: CampaignView, t: CampaignCopy, locale: Locale): string | null {
  const value =
    campaign.percent != null
      ? t.percent.replace('{n}', String(campaign.percent))
      : campaign.amountCents != null
        ? t.amount.replace('{amount}', formatPrice(campaign.amountCents, locale))
        : null;
  if (value === null) return null;
  if (campaign.minBasketCents === null) return value;
  return t.withMinimum.replace('{minimum}', formatPrice(campaign.minBasketCents, locale)).replace('{value}', value);
}
