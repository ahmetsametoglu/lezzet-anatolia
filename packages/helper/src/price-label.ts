import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import messages from '@lezzet/i18n/customer/price-label';
import { formatPrice } from './format';

/*
  KARTIN FİYAT ETİKETİ — TEK TÜRETME, İKİ YÜZEY.

  Aynı ürün kartı vitrinde, katalogda, ürün detayının "benzer ürünler" şeridinde ve ailenin çeşit
  kartlarında çizilir. Etiketin iki kararı var ve ikisi de her yerde AYNI olmak zorunda; ayrı ayrı
  yazılsalardı bir gün ayrışırlardı (CLAUDE §1) — o gün müşteri aynı ürünü iki ekranda iki farklı
  fiyat cümlesiyle görürdü.

  ── İKİ YÜZEYİN ORTAK MALI (14.09) ──────────────────────────────────────────
  Native `screens/customer-kit/price-label.ts`te doğdu; web'in telefon görünümü native tasarımı
  alınca (kullanıcı kararı 14.09) buraya taşındı, native dosya yalnız yönlendiriyor. Ekin metni
  `@lezzet/i18n/customer/price-label`da.

  ── KARAR 1: ÇOK BOYLU ÜRÜNDE "…'dan" ───────────────────────────────────────
  Kartta yazan sayı, ürünün EN UCUZ fiyatlı boyunundur (`primaryVariantOf`, `08.10`). Tek boylu
  üründe o sayı ürünün fiyatıdır ve düz yazılır. Çok boylu üründe ise **başlangıç fiyatıdır** —
  ekini yazmamak, müşteriye tutamayacağımız bir söz vermektir: 4,11 € gördüğü üründe 35,95 €'luk
  bir boy da vardır. Ailenin çeşit kartları bu eki zaten kullanıyordu (`{price}'dan`); kural
  buraya taşındı ki bütün yüzeyler aynı cümleyi kursun.

  Ölçüt BOY SAYISIDIR, fiyat aralığı değil: iki boyu aynı fiyata satılan üründe de "…'dan" doğru
  kalır (müşteri ikinci boyu seçtiğinde sayı değişmez, yani söz tutulur), oysa "fiyatlar farklıysa
  yaz" kuralı sunucudan boy fiyatlarının tamamını istemeyi gerektirirdi.

  ── KARAR 2: FİYAT YOKSA ETİKET DE YOK ──────────────────────────────────────
  `priceCents: null` = ürünün hiçbir aktif boyunun fiyatı yok (`08.10`: `nulls last`, hiçbiri
  yoksa ilk boya düşülür ve fiyat `null` kalır). Dönen değer `undefined`, yani kart fiyat çipini
  HİÇ çizmez. **Sıfır yazmak yasak** (CLAUDE §1: *"ölçülemeyen değer SIFIR değildir"*) — `?? 0`
  yazan bir çağıran müşteriye "0,00 €" gösterir, yani satılmayan bir ürünü bedava sanmasına yol
  açar. Ölçüldü 15.08: bugün fiyatsız dört ürünün dördü de `candidate`, yani yol henüz ekrana
  çıkmıyor — kural yaşayan bir arızayı değil, sessiz duran bir tuzağı kapatıyor.
*/

type Messages = LocalizedCopy<typeof messages>;

/**
 * Kartın fiyat çipine yazılacak metin. **`undefined` = çip hiç çizilmez** (fiyat bilinmiyor).
 *
 * @param variantCount ürünün AKTİF boy sayısı; 1'den büyükse "…'dan" eki gelir.
 */
export function productPriceLabel(priceCents: number | null, variantCount: number, locale: Locale): string | undefined {
  if (priceCents === null) return undefined;

  return variantCount <= 1 ? formatPrice(priceCents, locale) : withFrom(priceCents, locale);
}

/**
 * "…'dan" ekli hâli KOŞULSUZ kurar — ailenin çeşit kartları için.
 *
 * Neden koşulsuz: aile kartındaki sayı (`fromPriceCents`) BAŞKA bir ürünün en ucuz boyudur ve o
 * ürünün kaç boyu olduğu sözleşmede taşınmıyor. Boy sayısını oraya da taşımak, üç kartlık bir
 * şerit için ürün başına ek bir okuma demekti; ek zaten o kartların bugünkü davranışı.
 * **`null` = fiyat yok** → çağıran satırı hiç çizmez (sıfır yazılmaz, `CLAUDE §1`).
 */
export function fromPriceLabel(priceCents: number | null, locale: Locale): string | null {
  return priceCents === null ? null : withFrom(priceCents, locale);
}

/** Ekin TEK yazıldığı yer — iki dışa verilen de buradan geçer. */
function withFrom(priceCents: number, locale: Locale): string {
  const t: Messages = messages[locale];
  return t.from.replace('{price}', formatPrice(priceCents, locale));
}
