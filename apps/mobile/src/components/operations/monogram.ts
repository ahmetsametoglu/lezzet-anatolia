/*
  ÜRÜN MONOGRAMI — fotoğraf yokken satırda duran iki harf (v3:03 `MONO`).

  ── NİÇİN AYRI DOSYA ────────────────────────────────────────────────────────
  Tek satırlık bir kural gibi görünüyor ama içinde TÜRKÇEYE ÖZGÜ bir tuzak var ve tuzak
  sınanabilir olmalı: `toUpperCase()` "istanbul"u "ISTANBUL" yapar, doğrusu "İSTANBUL"dur.
  Katalogda "İzmir Kurabiyesi" · "Şöbiyet" · "İçli Köfte" gibi adlar var; noktasız I, ekranda
  yanlış harf demektir. Kural bu yüzden `toLocaleUpperCase('tr')` ile yazıldı ve testi var.

  Fotoğraf gelene kadar DURUR, fotoğrafın yerine geçmez: `OperationsProductThumb` fotoğraf varsa
  onu çizer, yoksa buraya düşer.
*/

/**
 * Ürün adından **en fazla iki harflik** monogram — "Fıstıklı Baklava" → "FB", "Şöbiyet" → "Ş".
 *
 * Boşluklara göre bölünür ve İLK İKİ kelimenin baş harfi alınır; tasarımın kendi kuralı bu
 * (`ad.split(' ').slice(0, 2)`). Adı olmayan/boş satırda boş dize döner — uydurma bir harf,
 * olmayan bir ürünü varmış gibi gösterirdi.
 */
export function monogramOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toLocaleUpperCase('tr');
}
