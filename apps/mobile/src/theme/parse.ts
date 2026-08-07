/*
  Token çevirisi — TEK YER. `@lezzet/design-tokens` değerleri bilerek CSS dizgesidir ("20px",
  "1.15", "0.18em"); birim/parse dönüşümü tüketicinin işidir (paketin kendi başlık kuralı).
  Buradaki çeviri YORUM KATMAZ: px → sayı (dp), birimsiz sayı dizgesi → sayı, gerisi olduğu
  gibi kalır.

  Çeviri TİP DÜZEYİNDE de yapılır (`Parsed`). Sebebi somut: RN'in `fontWeight` birleşimi
  genişletilmiş `number`ı KABUL ETMEZ, yalnız 100…900 sabitlerini eder — `"700"` token'ı
  `number`a genişlerse tema düğmeye bağlanamaz. `infer N extends number` sabiti korur, böylece
  `theme.text['button--font-weight']` tam olarak `700` olur.
*/

/** `"52px"` → `52` · `"1.15"` → `1.15` · `"700"` → `700` · `"0.18em"` → `"0.18em"` (sabit korunur). */
type Parsed<V extends string> = V extends `${infer N extends number}px`
  ? N
  : V extends `${infer N extends number}`
    ? N
    : V;

type ParsedTokens<T extends Record<string, string>> = { readonly [K in keyof T]: Parsed<T[K]> };

/** `Parsed`in çalışma zamanı ikizi. İkisi birlikte değişir; ayrışırlarsa tema yalan söyler. */
export const parseToken = (value: string): number | string => {
  if (value.endsWith('px')) return Number(value.slice(0, -2));
  const asNumber = Number(value);
  return Number.isNaN(asNumber) ? value : asNumber;
};

export const mapTokens = <T extends Record<string, string>>(tokens: T): ParsedTokens<T> =>
  Object.fromEntries(Object.entries(tokens).map(([key, value]) => [key, parseToken(value)])) as ParsedTokens<T>;

const EM_PATTERN = /^(-?[\d.]+)em$/;

/**
 * `"0.18em"` + 10 dp → 1.8 dp. Harf aralığı token'da `em` (yazı boyuna GÖRELİ) tutulur çünkü
 * kademe değişince aralık da değişmeli; RN `letterSpacing`i mutlak dp ister. Çeviri yazı boyu
 * bağlamı olmadan yapılamaz, o yüzden komponent çağırır — ama hesabı burada, tek yerde durur.
 *
 * Biçimi tanımayan değerde SESSİZ 0 dönmez, fırlatır: 0 "aralık yok" demektir ve bozuk bir
 * token'ı sağlıklı gibi okutur (CLAUDE §1 — ölçülemeyen değer sıfır değildir).
 */
export const emToDp = (em: string, fontSize: number): number => {
  const match = EM_PATTERN.exec(em);
  if (!match) throw new Error(`Harf aralığı token'ı "em" biçiminde değil: ${em}`);
  return Number(match[1]) * fontSize;
};
