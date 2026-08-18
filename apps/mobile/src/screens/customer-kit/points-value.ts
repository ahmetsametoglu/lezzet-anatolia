import { formatPrice } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';

/*
  PUANIN PARA KARŞILIĞI — TEK TÜRETME (kullanıcı kararı 18.08).

  ── NEDEN AYRI BİR YAZIM ─────────────────────────────────────────────────────
  `formatPrice` her tutarı iki haneli kuruşla yazar ve FİYAT için doğrusu budur: 1,84 € ile 1,80 €
  farklı şeylerdir, kuruş yutulursa müşteri yanlış tutarı okur. Ama puan karşılığı bir fiyat değil,
  bir EŞLEŞTİRMEDİR: "500 puan = 5 € kupon". Orada `5,00 €` yazmak, olmayan bir hassasiyet iddia
  ediyor ve cümleyi ağırlaştırıyor — kupon zaten tam eurodur.

  Kural bu yüzden koşullu: **tam euro ise kuruş yazılmaz, kesirli ise yazılır.** Kesirliyi
  kuruşsuz yazmak veri kaybı olurdu (2,50 €'yu "2 €" diye okutmak), tamı kuruşlu yazmak ise
  gereksiz gürültü. İkisinin arasındaki sınır aritmetiktir, zevk değil: `cents % 100`.

  ── KURUŞ EKİ YEREL ─────────────────────────────────────────────────────────
  Tam eurolarda bile sayı `Intl` üzerinden geçer (`formatPrice`, sonra ondalık kısmı atılır) —
  binlik ayracı ve € işaretinin yeri dile göre değişir (fr `5 €` · de `5 €` · tr `5 €`, ama
  binlikte `1 500` ↔ `1.500` ayrışır). Elle `${cents/100} €` yazsaydık o ayrım kaybolurdu.
*/

/**
 * Puanın para karşılığı: tam euroda kuruşsuz (`5 €`), kesirlide kuruşlu (`2,50 €`).
 * Yalnız PUAN ↔ PARA eşleştirmesinde kullanılır; ürün ve sipariş tutarları `formatPrice` ile yazılır.
 */
export function formatPointsValue(cents: number, locale: Locale): string {
  const full = formatPrice(cents, locale);
  if (cents % 100 !== 0) return full;
  /* Kuruş kısmını ATIYORUZ, yeniden kurmuyoruz: `formatPrice`in ürettiği dizgede ayraç ve €
     yerleşimi zaten doğru; tek yapılacak "<ayraç>00" parçasını silmek. Ayraç dile göre `,` ya da
     `.` olabildiği için desen ikisini de kabul eder. */
  return full.replace(/[.,]00(?=\D*$)/, '');
}
