import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type homeMessages from '@lezzet/i18n/customer/home';
import { campaignValueOf, type CampaignView } from './campaign-label';

/*
  VİTRİNİN CÜMLELERİ — native vitrin ile web telefon görünümünün ORTAK kurucuları (14.09).

  Üçü de native vitrinde (`apps/mobile-customer/src/screens/home/home-screen.tsx`) doğdu. Müşterinin telefon
  tasarımı iki yüzeyde aynı olunca (kullanıcı kararı 14.09) web'in telefon görünümü ikinci çağıran
  oldu ve buraya taşındılar: iki kopya bir gün ayrışır, aynı fırsat kartı iki yüzeyde iki ayrı cümle
  söylerdi (CLAUDE §1). Metin `@lezzet/i18n/customer/home`da; bu dosya yalnız hangi cümlenin hangi
  veriyle kurulacağını bilir.
*/

/** Vitrinin metin sözlüğü (bir dilin hâli) — ortak JSON'dan türer, elle interface yazılmaz. */
export type HomeCopy = LocalizedCopy<typeof homeMessages>;

/**
 * Selamlama — native şablonun eşikleri: 11'den önce sabah, 18'den önce gündüz, sonrası akşam.
 *
 * SAAT ÇAĞIRANDAN gelir: native cihazın saatini verir, web Paris saatini (sunucu ile tarayıcı aynı
 * cümleyi kursun diye — `home-header.tsx` künyesi). Ad yoksa hitap yoktur, "hoş geldiniz" denir;
 * boş adla "İyi akşamlar, " diye yarım cümle kurulmaz — çağıran boş adı `null`a çevirir.
 */
export function greetingOf(t: HomeCopy['greeting'], hour: number, firstName: string | null): string {
  if (firstName === null) return t.guest;
  const part = hour < 11 ? t.morning : hour < 18 ? t.afternoon : t.evening;
  return t.withName.replace('{greeting}', part).replace('{name}', firstName);
}

/**
 * "Son birkaç adet" eşiği — **parametrik**, iş kuralı değil bir SUNUM kararı (CLAUDE §4: eşik
 * sorulmaz, makul varsayılan konur ve parametrik yapılır). 5'in altında sayıyı söylemek müşteriye
 * gerçek bir bilgi verir; üstünde "3 kaldı" demek de olmadığı için ölçüt burada duruyor.
 * Değiştirmek isteyen tek satırı değiştirir; iki kademe de aynı yerden okunur.
 */
export const LAST_FEW_THRESHOLD = 5;

/**
 * **KAÇ TANE KALDIYSA O KADAR ACELE** — fırsat kartının sınır satırı (kullanıcı kararı 19.08).
 *
 * ── ÖNCEKİ HÂL BİR YALANDI ──────────────────────────────────────────────────
 * Satır sabitti ve her karta koşulsuz basılıyordu: *"STOKLA SINIRLI · YALNIZ BUGÜN"*. İkinci
 * yarısının arkasında hiçbir veri YOKTU — fırsat bir kampanya değil, **SKT'si yaklaşan bir
 * partiden doğuyor**; kimse seçmiyor ve `design/BACKLOG.md`nin kendi cümlesiyle *"süresi yoktur"*.
 * Sözleşmede bitiş anı diye bir alan da yok, yani ekran bilse bile yazamazdı. Kullanıcı cihazda
 * gördü ve sordu: *"Gerçekten sadece bugüne özel bir indirim mi yoksa bugün son günü mü?"* — ikisi
 * de değildi.
 *
 * ── GERÇEK SINIR GÜN DEĞİL, ADET ────────────────────────────────────────────
 * Teklif fiyatı PARTİYE bağlı: o partide kalandan fazlası normal fiyata taşar (DOMAIN §5). Sayı
 * zaten sözleşmede (`limitLabel`) ve ürün detayı onu doğru kullanıyordu; artık kart da aynı gerçeği
 * söylüyor.
 *
 * ── İKİ KADEME (kullanıcı kararı) ───────────────────────────────────────────
 * *"Belirli bir adetten fazla ise stoklarla sınırlı diyelim. Fakat belli bir adetin altındaysa
 * son üç adet de sinirli bir ifade kullanabiliriz."* — çok kalanda aciliyet uydurmak yanlış
 * olurdu, az kalanda ise sayıyı saklamak müşteriden bilgi gizlemek olur.
 *
 * **Sınır YOKSA satır HİÇ çizilmez:** `limitLabel === null` "adet sınırı yok" demektir ve o hâlde
 * söylenecek doğru bir cümle yoktur — sıfır değil, YOK (CLAUDE §1).
 */
export function offerLimitOf(limitLabel: string | null, t: HomeCopy['offers']): string | null {
  if (limitLabel === null) return null;
  const left = Number(limitLabel);
  /* Sayıya çevrilemeyen değer beklenmiyor (`map.ts` `String(quantityCap)` yazıyor) ama sessizce
     `NaN` ile eşik karşılaştırmasına girmesin: bilinmeyen sayıda "son N adet" yazmak uydurma olur,
     "stokla sınırlı" ise her hâlde doğru. */
  if (!Number.isFinite(left)) return t.limited;
  return left <= LAST_FEW_THRESHOLD ? t.lastFew.replace('{n}', String(left)) : t.limited;
}

/**
 * Fırsat kartının indirim rozeti ("−%23") — oran kartın KENDİ iki fiyatından türer: teklif fiyatı ve
 * üstü çizili normal fiyat; tam sayıya yuvarlanır. İki yüzeyin rozeti aynı sayıyı söylesin diye burada.
 * Fiyatsız ürün fırsat rayına giremez (uç süzer); çağıranın `?? 0`ı tip daraltmasıdır.
 */
export function offerDiscountLabel(priceCents: number, wasCents: number, t: HomeCopy['offers']): string {
  return t.discount.replace('{n}', String(Math.round((1 - priceCents / wasCents) * 100)));
}

/**
 * Koleksiyon bandının sayaç satırı — kampanya varsa aynı satıra girer (08.44).
 *
 * **Neden yeni bir satır değil:** bandın yüksekliği bir ölçü değil bir SÖZLEŞMEdir (MB-25) —
 * dairelerin konumu bant boyuna bağlı, boy değişirse daireler kayar. Bütçe iki satırlık başlıkla
 * dolu; üçüncü bir satır ilk taşan olurdu. Sayaç satırı ise TEK satır ve kampanya oraya sığıyor.
 *
 * **EŞİKSİZ KAMPANYA ROZETTE** (27.08 · `scopeBadgeOf`) — satırda tekrar edilmez, yoksa aynı indirim
 * aynı kartta iki kez yazardı. Satıra yalnız EŞİKLİ kampanya kalır, çünkü koşulunu ("60 € üzeri")
 * ancak tam cümle söyleyebilir ve rozete sığmaz.
 */
export function bandCountLabel(
  band: { productCount: number; campaign: CampaignView | null },
  t: Pick<HomeCopy, 'collections' | 'campaign'>,
  locale: Locale,
): string {
  const count = String(band.productCount);
  const campaign =
    band.campaign === null || band.campaign.minBasketCents === null
      ? null
      : campaignValueOf(band.campaign, t.campaign, locale);
  if (campaign === null) return t.collections.count.replace('{n}', count);
  return t.collections.countWithCampaign.replace('{n}', count).replace('{campaign}', campaign);
}
