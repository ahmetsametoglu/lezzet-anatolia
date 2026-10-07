/*
  Parite testi: `globals.css` dosyadan okunur ve `customer.ts` + `operations.ts` ile iki yönlü karşılaştırılır, token sayıları da
  sabitlenir ki sessiz büyüme yakalansın. `customer-app.ts` kapsam dışıdır, çünkü web'de karşılığı yoktur; tek istisna fontlardır.
*/
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { customerPhoneTextStepPx, customerText } from './customer';
import { flattenDarkTokens, flattenPhoneTextTokens, flattenThemeTokens, renderThemeCss } from './render-theme-css';

/* Fontlar next/font'un çalışma zamanı değişkenlerine bağlı olduğu için modüle taşınmaz; liste açık tutulur ki yeni bir `--font-*`
   sessizce dışarıda kalamasın. */
const EXCLUDED_FONT_TOKENS = ['--font-sans', '--font-serif', '--font-ops-display', '--font-ops-mono', '--font-ops-body'] as const;

/* Beklenen sayılar elle sabitlenir: token ekleyen bu sayıyı da güncelleyip farkın iki tarafta olduğunu gösterir. CSS tarafı ayrıca
   sayılmaz, modülden türetilir. */
const EXPECTED_LIGHT_COUNT = 216; // @theme bloğu, fontlar hariç (127 renk + 69 yazı + 9 yarıçap + 3 hareket + 8 gölge)
const EXPECTED_DARK_COUNT = 65; // operasyon karanlık bloğu (tümü --color-ops-*)

const cssPath = fileURLToPath(new URL('../../../apps/web/app/globals.css', import.meta.url));

/** Yorumlar atılır — yorum metnindeki `--ad: değer` örnekleri ve süslü parantezler parser'ı şaşırtmasın. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Bir blok gövdesindeki custom property bildirimlerini toplar (`--ad: değer;`). */
function parseCustomProperties(blockBody: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of blockBody.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name === undefined || value === undefined) continue;
    // Değer birebir korunur; yalnız satır sonu/çoklu boşluk tek boşluğa iner.
    out[name] = value.trim().replace(/\s+/g, ' ');
  }
  return out;
}

/**
 * `@theme { … }` ve karanlık-mod bloklarını ayıklar; bloklar iç içe seçici içermediği için `[^}]` yeter, bu yüzden `@keyframes`
 * `@theme`in içine yazılmaz (okuma ilk `}`de biterdi).
 */
function readGlobalsCss(): { light: Record<string, string>; dark: Record<string, string> } {
  const css = stripComments(readFileSync(cssPath, 'utf8'));

  const themeMatch = css.match(/@theme\s*\{([^}]*)\}/);
  const darkMatch = css.match(/\[data-surface='operations'\]\[data-theme='dark'\]\s*\{([^}]*)\}/);
  if (!themeMatch?.[1]) throw new Error(`globals.css içinde @theme bloğu bulunamadı: ${cssPath}`);
  if (!darkMatch?.[1]) throw new Error(`globals.css içinde karanlık-mod bloğu bulunamadı: ${cssPath}`);

  return { light: parseCustomProperties(themeMatch[1]), dark: parseCustomProperties(darkMatch[1]) };
}

describe('design-tokens ↔ globals.css paritesi', () => {
  const { light: cssLight, dark: cssDark } = readGlobalsCss();
  const moduleLight = flattenThemeTokens();
  const moduleDark = flattenDarkTokens();

  it("istisna listesi gerçek: her font token'ı CSS'te var ve modülde yok", () => {
    for (const name of EXCLUDED_FONT_TOKENS) {
      // CSS'ten kalkarsa (ör. yeniden adlandırma) istisna listesi çürümüş demektir — test uyarsın.
      expect(cssLight[name], `${name} globals.css'te bekleniyordu`).toBeDefined();
      expect(moduleLight[name], `${name} bilinçli istisna — modülde olmamalı`).toBeUndefined();
    }
  });

  it("(a) CSS → modül: @theme'deki her token (fontlar hariç) modülde aynı değerle var", () => {
    const excluded = new Set<string>(EXCLUDED_FONT_TOKENS);
    for (const [name, value] of Object.entries(cssLight)) {
      if (excluded.has(name)) continue;
      expect(moduleLight[name], `${name} CSS'te var, modülde yok ya da farklı`).toBe(value);
    }
  });

  it('(a) CSS → modül: karanlık bloktaki her token modülde aynı değerle var', () => {
    for (const [name, value] of Object.entries(cssDark)) {
      expect(moduleDark[name], `${name} CSS karanlık blokta var, modülde yok`).toBe(value);
    }
  });

  it("(b) modül → CSS: modüldeki her token globals.css'te var", () => {
    for (const name of Object.keys(moduleLight)) {
      expect(cssLight[name], `${name} modülde var, CSS @theme'de yok`).toBeDefined();
    }
    for (const name of Object.keys(moduleDark)) {
      expect(cssDark[name], `${name} modülde var, CSS karanlık blokta yok`).toBeDefined();
    }
  });

  it('renk ve yazı kademesi aynı adı taşımaz — Tailwind ikisinden de `text-<ad>` türetir, yalnız rengi üretir', () => {
    const tail = (prefix: string) =>
      new Set(Object.keys(moduleLight).filter((n) => n.startsWith(prefix) && !n.slice(prefix.length).includes('--')).map((n) => n.slice(prefix.length)));
    const colors = tail('--color-');
    const clashes = [...tail('--text-')].filter((name) => colors.has(name));
    expect(clashes, 'aynı adlı renk ve yazı kademesi: boy sınıftan ulaşılamaz (bkz. WEB_TEXT_NAMES)').toEqual([]);
  });

  it('token sayıları beklenenle birebir', () => {
    expect(Object.keys(moduleLight)).toHaveLength(EXPECTED_LIGHT_COUNT);
    expect(Object.keys(moduleDark)).toHaveLength(EXPECTED_DARK_COUNT);
    // CSS tarafı = modül + fontlar; parser bir bildirimi sessizce yutuyorsa burada patlar.
    expect(Object.keys(cssLight)).toHaveLength(EXPECTED_LIGHT_COUNT + EXCLUDED_FONT_TOKENS.length);
    expect(Object.keys(cssDark)).toHaveLength(EXPECTED_DARK_COUNT);
  });
});

describe('renderThemeCss', () => {
  it("üretilen CSS, aynı parser'dan geçirilince modülün düz haritasına eşit (kayıpsız geri üretim)", () => {
    const rendered = renderThemeCss();
    const themeMatch = rendered.match(/@theme\s*\{([^}]*)\}/);
    const darkMatch = rendered.match(/\[data-surface='operations'\]\[data-theme='dark'\]\s*\{([^}]*)\}/);
    expect(themeMatch?.[1]).toBeDefined();
    expect(darkMatch?.[1]).toBeDefined();
    expect(parseCustomProperties(themeMatch?.[1] ?? '')).toEqual(flattenThemeTokens());
    expect(parseCustomProperties(darkMatch?.[1] ?? '')).toEqual(flattenDarkTokens());
  });

  it('deterministik: iki çağrı bayt-bayt aynı', () => {
    expect(renderThemeCss()).toBe(renderThemeCss());
  });
});

/*
  Telefon görünümünün yazı ölçeği: `[data-type-scale='phone']` bloğu yeni token açmaz, tabanın kademelerinden türer. Kilit iki
  yönlü, yeni bir yazı kademesi tabana girdiği gün telefon bloğuna da girmek zorunda.
*/
describe('telefon görünümünün yazı ölçeği', () => {
  /** `customerText`in boyut anahtarları (alt anahtarlar hariç). */
  const EXPECTED_PHONE_COUNT = 30;

  it("globals.css'teki blok modülün türettiği haritaya birebir eşit", () => {
    const css = stripComments(readFileSync(cssPath, 'utf8'));
    const block = css.match(/\[data-type-scale='phone'\]\s*\{([^}]*)\}/)?.[1];
    expect(block, "globals.css içinde [data-type-scale='phone'] bloğu bulunamadı").toBeDefined();
    expect(parseCustomProperties(block ?? '')).toEqual(flattenPhoneTextTokens());
  });

  it('her boyut durağı tabanın bir adım üstü; alt anahtarlar (satır · ağırlık · aralık) bloğa girmez', () => {
    const phone = flattenPhoneTextTokens();
    expect(Object.keys(phone)).toHaveLength(EXPECTED_PHONE_COUNT);
    expect(phone['--text-body-sm']).toBe(
      `calc(${Number.parseFloat(customerText['body-sm']) + customerPhoneTextStepPx}px * var(--font-scale, 1))`,
    );
    // Yarım piksel kademeler korunur — sabit ekleme aralıkları bozmaz (11,5 → 12,5).
    expect(phone['--text-micro']).toBe(`calc(${Number.parseFloat(customerText.micro) + customerPhoneTextStepPx}px * var(--font-scale, 1))`);
    expect(Object.keys(phone).filter((name) => name.slice('--text-'.length).includes('--'))).toEqual([]);
  });

  it('üretilen CSS de bloğu taşır — aynı parser, aynı harita', () => {
    const block = renderThemeCss().match(/\[data-type-scale='phone'\]\s*\{([^}]*)\}/)?.[1];
    expect(parseCustomProperties(block ?? '')).toEqual(flattenPhoneTextTokens());
  });
});
