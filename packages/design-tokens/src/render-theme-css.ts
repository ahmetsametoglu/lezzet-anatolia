/*
  `globals.css` token bölümünün üretilmiş karşılığı; parite testi iki kaynağın birebir aynı kaldığını zorlar ve üretim
  deterministiktir. Fontlar (next/font değişkenleri) ve `customer-app.ts` (mobil uygulamanın, web ikizi olmayan token'ları) bilerek
  yoktur.
*/
import {
  customerColors,
  customerMotion,
  customerPhoneTextStepPx,
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
import { FONT_SCALE_VAR } from './font-scale';

/* Token ailesi → CSS custom property öneki; anahtar + önek tam CSS adıdır. Mobil uygulamanın gölge ve gradyan aileleri
   `customer-app.ts`te ayrı kalır ve bu üretim onları basmaz. */
type TokenGroup = readonly [
  prefix: '--color-' | '--text-' | '--radius-' | '--animate-' | '--shadow-',
  tokens: Record<string, string>,
];

/* AÇIK tema (`@theme`) grupları — globals.css dosya sırasıyla: müşteri renkleri → müşteri
   tipografi → müşteri yarıçap → müşteri hareket → müşteri gölge → operasyon tipografi →
   operasyon renkleri → operasyon yarıçap.
   (CSS'te operasyon YAZI ölçeği renklerden ÖNCE gelir; sıra korunur ki üretilen çıktı
   gerçek dosyayla satır satır karşılaştırılabilsin.) */
const lightGroups: readonly TokenGroup[] = [
  ['--color-', customerColors],
  ['--text-', customerText],
  ['--radius-', customerRadius],
  ['--animate-', customerMotion],
  ['--shadow-', customerShadow],
  ['--text-', operationsText],
  ['--color-', operationsColors],
  ['--radius-', operationsRadius],
];

/**
 * Yazı kademesinin web'deki adı, paketteki adından farklıysa: Tailwind `--color-body` ile `--text-body`den aynı `text-body` sınıfını
 * türetir ve yalnız rengi üretirdi. Native aynı kademeyi `text.body` diye okumaya devam eder.
 */
export const WEB_TEXT_NAMES: Readonly<Record<string, string>> = { body: 'copy' };

/** `body` → `copy`, `body--line-height` → `copy--line-height`; `body-sm` gibi ayrı kademeler olduğu gibi kalır. */
function webTextKey(key: string): string {
  const [base, ...suffix] = key.split('--');
  const renamed = WEB_TEXT_NAMES[base!];
  return renamed ? [renamed, ...suffix].join('--') : key;
}

/* Bir grup listesini `--ad: değer` çiftlerine düzler. Çakışan tam ad üretimde sessizce
   kaybolmasın diye fırlatır — iki grup aynı CSS adını üretiyorsa bu bir veri hatasıdır. */
function flatten(groups: readonly TokenGroup[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [prefix, tokens] of groups) {
    for (const [key, value] of Object.entries(tokens)) {
      const name = `${prefix}${prefix === '--text-' ? webTextKey(key) : key}`;
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

/**
 * Telefon görünümünün yazı ölçeği: müşteri kademeleri `customerPhoneTextStepPx` kadar büyük. Yalnız boyut anahtarları girer; alt
 * anahtarlar oran olduğu için adımdan etkilenmez, operasyon kademeleri de girmez.
 */
export function flattenPhoneTextTokens(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(customerText)) {
    if (key.includes('--')) continue;
    out[`--text-${webTextKey(key)}`] = `calc(${Number.parseFloat(value) + customerPhoneTextStepPx}px * var(${FONT_SCALE_VAR}, 1))`;
  }
  return out;
}

function renderBlock(tokens: Record<string, string>): string {
  return Object.entries(tokens)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
}

/**
 * globals.css'in token bölümünün üretilmiş karşılığını döndürür: `@theme` bloğu (fontlar hariç)
 * + operasyon karanlık-mod bloğu + telefon görünümünün yazı ölçeği bloğu. Saf ve deterministik —
 * girdisi yalnız modül sabitleri.
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
    "[data-type-scale='phone'] {",
    renderBlock(flattenPhoneTextTokens()),
    '}',
    '',
  ].join('\n');
}
