/*
  PARİTE TESTİ — paketin asıl güvencesi (21.3). `apps/web/app/globals.css` DOSYADAN okunur,
  custom property'ler parse edilir ve modülle İKİ YÖNLÜ karşılaştırılır:
    (a) CSS'teki her token modülde AYNI değerle var mı (CSS'e eklenen token modüle işlenmeden geçemez),
    (b) modüldeki her token CSS'te var mı (modüle uydurulan token CSS'siz kalamaz).
  Ayrıca sayılar sabitlenir: kaç token beklendiği açıkça yazılıdır — sessiz büyüme/küçülme de yakalanır.

  DB'siz, saf dosya-okuma: birim projesinde koşar (kök vitest.config.ts unit include listesi).
*/
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { flattenDarkTokens, flattenThemeTokens, renderThemeCss } from './render-theme-css';

/* BİLİNÇLİ İSTİSNALAR — modüle taşınMAyan token'lar. Fontlar next/font'un çalışma zamanında
   ürettiği `var(--font-…)` değişkenlerine bağlıdır; sabit olarak taşınamazlar (customer.ts /
   operations.ts başlık yorumları). Liste AÇIK tutulur ki yeni bir dışarıda-kalan sessizce
   eklenemesin: CSS'e giren her yeni `--font-*` bile burada görünmek zorunda. */
const EXCLUDED_FONT_TOKENS = [
  '--font-sans',
  '--font-serif',
  '--font-ops-display',
  '--font-ops-mono',
  '--font-ops-body',
] as const;

/* Beklenen sayılar — elle sabitlendi (07.08 sayımı). Değişirse bilinçli değişmeli:
   token ekleyen, bu sayıyı da güncelleyip farkın iki tarafta da olduğunu göstermiş olur. */
const EXPECTED_LIGHT_COUNT = 158; // @theme bloğu, fontlar hariç (100 renk + 51 yazı + 7 yarıçap)
const EXPECTED_DARK_COUNT = 60; // operasyon karanlık bloğu (tümü --color-ops-*)

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

/** `@theme { … }` ve karanlık-mod bloklarını ayıklar. Bloklar iç içe seçici içermez → `[^}]` yeter. */
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

  it('istisna listesi gerçek: her font token\'ı CSS\'te var ve modülde yok', () => {
    for (const name of EXCLUDED_FONT_TOKENS) {
      // CSS'ten kalkarsa (ör. yeniden adlandırma) istisna listesi çürümüş demektir — test uyarsın.
      expect(cssLight[name], `${name} globals.css'te bekleniyordu`).toBeDefined();
      expect(moduleLight[name], `${name} bilinçli istisna — modülde olmamalı`).toBeUndefined();
    }
  });

  it('(a) CSS → modül: @theme\'deki her token (fontlar hariç) modülde aynı değerle var', () => {
    const excluded = new Set<string>(EXCLUDED_FONT_TOKENS);
    for (const [name, value] of Object.entries(cssLight)) {
      if (excluded.has(name)) continue;
      expect(moduleLight[name], `${name} CSS'te var, modülde yok`).toBe(value);
    }
  });

  it('(a) CSS → modül: karanlık bloktaki her token modülde aynı değerle var', () => {
    for (const [name, value] of Object.entries(cssDark)) {
      expect(moduleDark[name], `${name} CSS karanlık blokta var, modülde yok`).toBe(value);
    }
  });

  it('(b) modül → CSS: modüldeki her token globals.css\'te var', () => {
    for (const name of Object.keys(moduleLight)) {
      expect(cssLight[name], `${name} modülde var, CSS @theme'de yok`).toBeDefined();
    }
    for (const name of Object.keys(moduleDark)) {
      expect(cssDark[name], `${name} modülde var, CSS karanlık blokta yok`).toBeDefined();
    }
  });

  it('token sayıları beklenenle birebir', () => {
    expect(Object.keys(moduleLight)).toHaveLength(EXPECTED_LIGHT_COUNT);
    expect(Object.keys(moduleDark)).toHaveLength(EXPECTED_DARK_COUNT);
    // CSS tarafı = modül + istisnalar; parser bir bildirimi sessizce yutuyorsa burada patlar.
    expect(Object.keys(cssLight)).toHaveLength(EXPECTED_LIGHT_COUNT + EXCLUDED_FONT_TOKENS.length);
    expect(Object.keys(cssDark)).toHaveLength(EXPECTED_DARK_COUNT);
  });
});

describe('renderThemeCss', () => {
  it('üretilen CSS, aynı parser\'dan geçirilince modülün düz haritasına eşit (kayıpsız geri üretim)', () => {
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
