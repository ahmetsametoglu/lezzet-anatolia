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

  `customer-app.ts` DE BİLEREK YOK: mobil uygulamanın token'ları CSS'in ikizi değildir, web
  tarafında üretilecek bir karşılıkları YOKTUR (kullanıcı kararı 07.08 — ayrım dosyayla).
  Buraya eklenirlerse `globals.css` mobil kararlarla büyümeye başlar; tam da kaçınılan şey.

  TELEFON ÖLÇEĞİ BLOĞU (14.09): müşterinin yazı kademeleri telefon görünümünde bir adım büyük
  (`customerPhoneTextStepPx`). O blok YENİ token açmaz — tabandaki kademelerden TÜRER ve telefon
  çerçevesinin kökünde (`[data-type-scale='phone']`) aynı değişkenleri yeniden tanımlar.
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

/* Token ailesi → CSS custom property öneki. Anahtar + önek = tam CSS adı; adlandırma
   kayıpsız geri üretilir (`--color-` + `ink` → `--color-ink`).
   `--animate-` ve `--shadow-` web v1'le geldi (13.09 — panel, bildirim ve çekmece hareketi,
   yüzen yüzey gölgeleri). Mobil uygulamanın gölge ve fotoğraf gradyanı aileleri AYRI kalır
   (`customer-app.ts`; adlar çakışmaz) ve bu üretim onları basmaz. */
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
 * Yazı kademesinin WEB'deki adı, paketteki adından farklıysa. Tailwind `--color-X` ile `--text-X`in
 * ikisinden de `text-X` sınıfını türetir ve yalnız rengi üretir: `--text-body` boyu hiçbir sınıftan
 * ulaşılamıyordu, boy diye yazılan her `text-body` 16 px çiziliyordu. Native aynı kademeyi `text.body`
 * diye okumaya devam eder — çakışma yalnız web'in sınıf ad alanında.
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
 * TELEFON GÖRÜNÜMÜNÜN YAZI ÖLÇEĞİ (14.09) — müşterinin yazı kademeleri `customerPhoneTextStepPx`
 * kadar büyük. Yalnız BOYUT anahtarları: satır yüksekliği · ağırlık · harf aralığı alt anahtarları
 * (`--` sonekliler) oranlardır ve adımdan etkilenmez — native temanın `customerStops`u da yalnız boyut
 * durağına ekler. Operasyon kademeleri de bu bloğa girmez: büyütme müşteri yüzeyinin kararıdır.
 */
export function flattenPhoneTextTokens(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(customerText)) {
    if (key.includes('--')) continue;
    out[`--text-${webTextKey(key)}`] = `${Number.parseFloat(value) + customerPhoneTextStepPx}px`;
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
