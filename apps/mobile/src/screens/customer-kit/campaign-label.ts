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

/**
 * KARTIN İNDİRİM ROZETİ — yalnız FIRSAT (kullanıcı kararı 27.08, 23.08'in düzeltmesi).
 *
 * ── NEDEN KİTTE, ÜÇ EKRANDA DEĞİL ───────────────────────────────────────────
 * Aynı rozet katalog ızgarasında, vitrin seçkisinde ve ürün detayının öneri şeridinde çiziliyor.
 * Karar üçe yazılsaydı dördüncü ekran geldiği gün biri unutulurdu — `price-label` kitinin aynı
 * gerekçesi.
 *
 * ── KAMPANYA ROZETİ ÜRÜN KARTINDAN KALKTI ───────────────────────────────────
 * 23.08'de rozet kapsam kampanyasını da söylüyordu (*"3,00 € indirim"*) ve bu YANILTICIYDI —
 * kullanıcı bildirdi (27.08), motor ölçümü doğruladı:
 * · `applyBestDiscount` sabit tutarı `Math.min(amountCents, scopeBase)` ile **sepetin kapsam
 *   toplamına BİR KEZ** indiriyor. Rozeti gören müşteri üç ürün alırsa 9 € değil 3 € indirim alır.
 * · Dahası motor **tek kazanan** seçiyor: iki farklı kampanyalı ürün sepete girse yalnız biri
 *   uygulanır, öbürünün rozeti tutulmayan bir söz olur.
 * Kampanya bir ÜRÜNÜN değil bir KESİTİN özelliğidir (`matchesScope`: `category` | `collection`),
 * o yüzden yeri de kesitin kartıdır — vitrin bandı (`CollectionBand`). Kullanıcının 23.08'de
 * istediği yer de zaten orasıydı; rozet bir katman aşağıya, ürünlerin üstüne konmuştu.
 *
 * "Fırsat" ise KALIR: birim fiyatta gerçekten düşen, üstü çizili eski fiyatı olan kesin bir
 * indirimdir — sepete bağlı değildir, ürünün kendi fiyatıdır.
 *
 * `undefined` döner (null değil): kartın `discountLabel` alanı isteğe bağlı ve "rozet çizme"nin
 * yazılışı odur.
 */
export function cardBadgeOf(product: { wasCents?: number }, t: { offer: string }): string | undefined {
  return product.wasCents === undefined ? undefined : t.offer;
}

/**
 * KESİT KARTININ İNDİRİM ROZETİ — kampanyanın doğru katmanı (kullanıcı kararı 27.08).
 *
 * Kampanya bir kesite aittir (kategori ya da koleksiyon), o yüzden rozeti de kesitin kartında
 * durur: vitrin bandı. Orada bir vaat değil bir DAVETtir — *"bu kesitte indirim var"* — ve
 * müşteri karta basınca kesitin tamamını görür.
 *
 * ── EŞİKLİ KAMPANYA ROZETE GİRMEZ ───────────────────────────────────────────
 * *"60 € üzeri −%15"* bir rozete sığmaz; eşiği yutup yalnız *"−%15"* yazmak ise tutulmayan bir
 * söz vermektir. Eşikli kampanya bandın SAYAÇ SATIRINDA tam cümlesiyle kalır (`countWithCampaign`)
 * — orada yer var ve koşul söylenebiliyor. Kural burada, tek yerde: iki türetme de aynı ölçütü
 * okur, biri rozeti çizer öteki cümleyi kurar.
 */
export function scopeBadgeOf(campaign: CampaignView | null, t: CampaignCopy, locale: Locale): string | undefined {
  if (campaign === null || campaign.minBasketCents !== null) return undefined;
  return campaignValueOf(campaign, t, locale) ?? undefined;
}
