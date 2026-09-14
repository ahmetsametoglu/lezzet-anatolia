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

/*
  BOYUT DURAĞI MI, ALT-ÖZELLİK Mİ — kural TEK YERDE (18.08).

  `theme.text` iki tür anahtar taşıyor: boyut durakları (`note`, `body-sm`, `h1-sm`…) ve
  kademelerin alt-özellikleri (`--font-weight`, `--line-height`, `--letter-spacing`). Ölçeğe
  dokunan her işlem YALNIZ ilkini değiştirmeli — ağırlık da sayı tutulduğu için (yukarıdaki
  `Parsed` künyesi) gelişigüzel bir "tüm sayıları çarp" 700'ü 805 yapar ve düğme yazısı bozulur.

  Kural iki yerde birden gerekiyor: yazı boyutu ayarı ölçeği ÇARPIYOR (`lib/settings/font-scale`),
  müşteri teması ise kuruluşta bir kademe EKLİYOR (`unistyles.ts`). İkisi ayrı ayrı yazılsaydı
  yeni bir alt-özellik soneki doğduğu gün biri onu tanır, öteki tanımazdı (CLAUDE §1).
*/
const SUB_PROPERTY = '--';

/** Yalnız BOYUT duraklarına `transform` uygular; alt-özellikler (`--…`) olduğu gibi geçer. */
export const mapTextStops = <T extends Record<string, number | string>>(
  text: T,
  transform: (size: number) => number,
): T =>
  Object.fromEntries(
    Object.entries(text).map(([key, value]) =>
      typeof value === 'number' && !key.includes(SUB_PROPERTY) ? [key, transform(value)] : [key, value],
    ),
  ) as T;

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

const HEX_PATTERN = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i;

/**
 * `#5f7a2c` + 0,42 → `"rgba(95, 122, 44, 0.42)"`. Gölge dizgesi rengin SAYDAM hâlini ister;
 * token ise katı hex tutar. Çeviri burada, tek yerde durur — gerekçesi paketin kendi deseni:
 * `customerAppShadow.hard` da gölgesini `customerSurface.ink`ten TÜRETİYOR, ikinci kez ham
 * değer yazmıyor. Aynı disiplin RN tarafında da geçerli: gölge rengi bir token'ın türevidir,
 * yeni bir renk değil.
 *
 * Hex OLMAYAN değerde SESSİZ düşmez, fırlatır (`emToDp` ile aynı gerekçe): rgba token'ı
 * (örtü ailesi) buraya girerse çıktı geçersiz bir dizge olurdu ve gölge sessizce kaybolurdu.
 */
export const withAlpha = (hex: string, alpha: number): string => {
  const match = HEX_PATTERN.exec(hex);
  if (!match) throw new Error(`Renk token'ı 6 haneli hex değil: ${hex}`);
  const [red, green, blue] = match.slice(1).map((part) => Number.parseInt(part, 16));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};
