/**
 * GTIN SAĞLAMA HANESİ — okutulmadan yazılan kodun tek ucuz doğrulaması.
 *
 * Kod kameradan okutulduğunda cihaz kendi doğrular; klavyeden ya da ambalaj fotoğrafından geldiğinde
 * doğrulayan yoktur: yanlış okunan tek rakam sessizce kaydedilir ve ilk kez depoda, koli okutulup
 * hiçbir şey olmayınca fark edilir. Son hane gövdeden hesaplanabildiği için bu hata yazma anında
 * yakalanır.
 *
 * Biçim KÜME değil ÖLÇÜT: yalnız GTIN ailesi (EAN-8 · UPC-A · EAN-13 · GTIN-14) sınanır, kalan her
 * kod serbest kalır — iç etiketler ve QR'lar da taranıyor (`variant_barcode` künyesi: sistem biçim
 * zorlamaz, zorlamamalı).
 */

/** GTIN ailesinin hane sayıları; bu uzunluktaki kod sağlamasıyla birlikte doğrulanır. */
const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/**
 * Gövdeden (son hane hariç) hesaplanan sağlama hanesi — ağırlıklar SAĞDAN 3,1,3,1…
 *
 * Tek hesap dört uzunluğu birden karşılar: ağırlık soldan değil sağdan sayıldığı için EAN-13'ün
 * "1,3,1,3…" ile GTIN-14'ün "3,1,3,1…" dizisi aynı kuralın iki görünüşüdür.
 */
export function gtinCheckDigit(body: string): number {
  const sum = [...body].reverse().reduce((acc, digit, i) => acc + Number(digit) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
}

/**
 * Kod yazılabilir mi — sorun varsa okunur cümlesi, yoksa `null`.
 *
 * GTIN uzunluğunda OLMAYAN kod sorunsuz sayılır: iç etiket ya da QR olabilir ve sistemin biçim
 * dayatmadığı yerde araç dayatmamalı. Sağlaması tutmayan GTIN ise kabul EDİLMEZ, çünkü o kod bir
 * seçim değil bir yazım hatasıdır.
 */
export function barcodeProblem(code: string): string | null {
  const trimmed = code.trim();
  if (trimmed.length === 0) return 'Kod boş.';
  if (/\s/.test(trimmed)) return 'Kodun içinde boşluk var.';
  if (!/^\d+$/.test(trimmed) || !GTIN_LENGTHS.has(trimmed.length)) return null;

  const body = trimmed.slice(0, -1);
  const expected = gtinCheckDigit(body);
  if (Number(trimmed.at(-1)) === expected) return null;
  return `"${trimmed}" sağlama hanesi tutmuyor — bu uzunluktaki kodun son hanesi ${expected} olmalıydı (${body}${expected}).`;
}
