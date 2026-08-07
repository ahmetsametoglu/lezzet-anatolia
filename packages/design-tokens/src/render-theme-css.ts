/*
  `globals.css` token bölümünün ÜRETİLMİŞ karşılığı (21.3). Web şeridi ileride `@theme`
  bloğunu bu modülden türetecek (küçük bir üretim adımı; talep dosyasını yönetici açar) —
  o güne kadar parite testi (`parity.test.ts`) iki kaynağın birebir aynı kaldığını zorlar.

  Üretim DETERMİNİSTİKTİR: grup sırası aşağıdaki listede sabit (globals.css dosya sırası),
  grup içi sıra nesnenin tanım sırasıdır; girinti/noktalama sabittir. Aynı modül her
  çağrıda bayt-bayt aynı CSS'i verir.

  FONT SATIRLARI BİLEREK YOK: `--font-*` token'ları next/font değişkenlerine bağlı
  (bkz. customer.ts / operations.ts başlık yorumları) — web'deki üretim adımı o satırları
  kendi tarafında tutar.
*/
import {
  customerColors,
  customerGradient,
  customerRadius,
  customerShadow,
  customerText,
} from './customer';
import {
  operationsColors,
  operationsDarkColors,
  operationsRadius,
  operationsText,
} from './operations';

/* Token ailesi → CSS custom property öneki. Anahtar + önek = tam CSS adı; adlandırma
   kayıpsız geri üretilir (`--color-` + `ink` → `--color-ink`). */
type TokenGroup = readonly [
  prefix: '--color-' | '--text-' | '--radius-' | '--shadow-' | '--gradient-',
  tokens: Record<string, string>,
];

/* AÇIK tema (`@theme`) grupları — globals.css dosya sırasıyla: müşteri renkleri → müşteri
   tipografi → müşteri yarıçap → operasyon tipografi → operasyon renkleri → operasyon yarıçap.
   (CSS'te operasyon YAZI ölçeği renklerden ÖNCE gelir; sıra korunur ki üretilen çıktı
   gerçek dosyayla satır satır karşılaştırılabilsin.) */
const lightGroups: readonly TokenGroup[] = [
  ['--color-', customerColors],
  ['--text-', customerText],
  ['--radius-', customerRadius],
  /* `--shadow-` ve `--gradient-` Token Kararlari #5 ile geldi ve BUGÜN yalnız modülde var
     (parite testinin `MOBILE_ONLY` listesi). Üretim adımı onları da basıyor ki web senkronu
     gelince tek kaynak hazır olsun; müşteri bloğunun sonunda duruyorlar — üretilen çıktı hâlâ
     "önce müşteri, sonra operasyon" sırasında okunur. */
  ['--shadow-', customerShadow],
  ['--gradient-', customerGradient],
  ['--text-', operationsText],
  ['--color-', operationsColors],
  ['--radius-', operationsRadius],
];

/* Bir grup listesini `--ad: değer` çiftlerine düzler. Çakışan tam ad üretimde sessizce
   kaybolmasın diye fırlatır — iki grup aynı CSS adını üretiyorsa bu bir veri hatasıdır. */
function flatten(groups: readonly TokenGroup[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [prefix, tokens] of groups) {
    for (const [key, value] of Object.entries(tokens)) {
      const name = `${prefix}${key}`;
      if (name in out) {
        throw new Error(`Yinelenen token adı: ${name}`);
      }
      out[name] = value;
    }
  }
  return out;
}

/** AÇIK temanın (`@theme`) tam düz haritası: `--color-ink` → `#343b41`. Parite testi de bunu okur. */
export function flattenThemeTokens(): Record<string, string> {
  return flatten(lightGroups);
}

/** Operasyon KARANLIK bloğunun düz haritası (yalnız override edilen `--color-ops-*` token'ları). */
export function flattenDarkTokens(): Record<string, string> {
  return flatten([['--color-', operationsDarkColors]]);
}

function renderBlock(tokens: Record<string, string>): string {
  return Object.entries(tokens)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
}

/**
 * globals.css'in token bölümünün üretilmiş karşılığını döndürür: `@theme` bloğu (fontlar hariç)
 * + operasyon karanlık-mod bloğu. Saf ve deterministik — girdisi yalnız modül sabitleri.
 */
export function renderThemeCss(): string {
  return [
    '@theme {',
    renderBlock(flattenThemeTokens()),
    '}',
    '',
    "[data-surface='operations'][data-theme='dark'] {",
    '  color-scheme: dark;',
    '',
    renderBlock(flattenDarkTokens()),
    '}',
    '',
  ].join('\n');
}
