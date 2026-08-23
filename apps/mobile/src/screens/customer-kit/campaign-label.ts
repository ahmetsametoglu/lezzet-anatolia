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

/** Rozetin kendi sözlüğü — cümlenin biçiminden AYRI (aşağıdaki künye). */
export interface CampaignBadgeCopy {
  /** "%{n} indirim" */
  percent: string;
  /** "{amount} indirim" */
  amount: string;
}

/**
 * KARTIN İNDİRİM ROZETİ — üç ekranın tek kararı (kullanıcı kararı 23.08).
 *
 * ── NEDEN KİTTE, ÜÇ EKRANDA DEĞİL ───────────────────────────────────────────
 * Aynı rozet katalog ızgarasında, vitrin seçkisinde ve ürün detayının öneri şeridinde çiziliyor.
 * Karar üçe yazılsaydı dördüncü ekran geldiği gün biri unutulurdu — `price-label` kitinin aynı
 * gerekçesi.
 *
 * ── FIRSAT KAMPANYAYI YENER ─────────────────────────────────────────────────
 * "Fırsat" birim fiyatta GERÇEKTEN düşen, üstü çizili eski fiyatı olan kesin bir indirimdir;
 * kapsam kampanyası sepete bağlıdır ve tutarı ancak sepet varken bilinir. Kesin olan, koşullu
 * olanın önüne geçer. Sunucu bunu zaten uyguluyor (`toProduct`: teklif kazanmışsa `campaign`
 * gelmez), buradaki sıra o güvencenin ekrandaki karşılığıdır — ikinci bir kural değil.
 *
 * ── EŞİKLİ KAMPANYA ROZETE GİRMEZ ───────────────────────────────────────────
 * *"60 € üzeri −%15"* rozete sığmaz; eşiği yutup yalnız *"−%15"* yazmak ise tutulmayan bir söz
 * vermektir — müşteri koşulu ancak sepete gelince öğrenir ve bu, düzeltmeye çalıştığımız
 * sessizliğin ta kendisidir. Eşikli kampanyanın yeri, tam cümlesinin sığdığı kesit başlığıdır.
 *
 * ── ROZETİN SÖZLÜĞÜ CÜMLENİNKİNDEN AYRI ─────────────────────────────────────
 * Ekranların cümle biçimi bugün ayrışık (vitrin *"−%15"*, katalog *"%15"*); rozet ikisinden
 * birini ödünç alsaydı aynı rozet iki ekranda farklı görünürdü. Kendi anahtarı var ve NE OLDUĞUNU
 * söylüyor (*"%15 indirim"*) — çıplak bir sayı, kullanıcının şikâyet ettiği "metnin arasında
 * kaybolma" hâlinin rozet hâli olurdu.
 *
 * `undefined` döner (null değil): kartın `discountLabel` alanı isteğe bağlı ve "rozet çizme"nin
 * yazılışı odur.
 */
export function cardBadgeOf(
  product: { wasCents?: number; campaign?: CampaignView },
  t: { offer: string; campaign: CampaignBadgeCopy },
  locale: Locale,
): string | undefined {
  if (product.wasCents !== undefined) return t.offer;
  const campaign = product.campaign;
  if (campaign === undefined || campaign.minBasketCents !== null) return undefined;
  if (campaign.percent != null) return t.campaign.percent.replace('{n}', String(campaign.percent));
  if (campaign.amountCents != null) return t.campaign.amount.replace('{amount}', formatPrice(campaign.amountCents, locale));
  return undefined;
}
