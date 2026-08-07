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

/* ═══════════════════════════════════════════════════════════════════════════════════════
   GEÇİŞ LİSTELERİ — mobil token mutabakatı (07.08, `design/project/Mobil - Token Kararlari.md`)

   Karar mobilde ölçülen değerleri token'ın RESMÎ değeri yaptı ve mobilin ihtiyaç duyduğu yeni
   aileleri ekledi; `globals.css` bunları HENÜZ almadı. Modül ile CSS bu yüzden bilerek ayrı —
   ama ayrılık GİZLENMİYOR, iki BEYANLI listeyle kilitleniyor: burada yazmayan her sapma testi
   yine kırmızıya düşürür.

   Web senkronu `docs/talep/musteri-token-senkronu.md` ile isteniyor. Web `globals.css`'i bu
   modüle çekince İKİ LİSTE DE BOŞALIR:
   · `TRANSITION` — CSS yeni değeri alınca `css` alanı yanlışlanır, test satırın silinmesini
     zorlar (eşitlenmiş bir satır sessizce doğru kalmaz).
   · `MOBILE_ONLY` — token CSS'e girince "CSS'te olmamalı" hükmü yanlışlanır, satır silinir.
   BOŞALMAYAN SATIR ÇÜRÜMEDİR: listede kalan her satır "web hâlâ çekmedi" demektir; bir gün
   kimse bakmıyorsa liste envanter değil bahane hâline gelmiş demektir.
   ═══════════════════════════════════════════════════════════════════════════════════════ */

/* DEĞER DEĞİŞİKLİKLERİ (Token Kararlari #3 ve #7) — modül YENİ değeri, CSS hâlâ ESKİSİNİ taşır.
   Testin (a) yönü bu token'larda İKİ tarafı da ayrı ayrı doğrular: CSS'te `css`, modülde
   `module`. Böylece ne modülde yanlış bir değer geçebilir ne de CSS'te sessiz bir kayma. */
const TRANSITION: Readonly<Record<string, { css: string; module: string }>> = {
  '--color-sand-300': { css: '#e0d8c2', module: '#e2d8bd' },
  '--color-olive-line': { css: '#d7e3bd', module: '#cddbb0' },
  '--color-star': { css: '#d99a2b', module: '#d9a441' },
  '--color-closed-bg': { css: '#f0e9d6', module: '#e9e2cf' },
  '--color-disabled-fill': { css: '#c9c3b0', module: '#b9b29e' },
  '--radius-card': { css: '18px', module: '20px' },
  '--radius-pill': { css: '26px', module: '22px' },
};

/* YENİ TOKEN'LAR (Token Kararlari #2, #3, #5, #6, #7) — yalnız modülde var. Modül→CSS yönünden
   MUAF tutulurlar; CSS→modül yönü TAM kalır (CSS'e eklenen hiçbir token modüle işlenmeden
   geçemez). Liste elle yazılır ki yeni bir "yalnız modülde" token sessizce sızamasın. */
const MOBILE_ONLY = [
  // #2 kum skalasının iki yeni kademesi (`sand-250` ad çarpışması nedeniyle bu adı taşıyor)
  '--color-sand-150',
  '--color-sand-250',
  // #3 hata ailesi — terracotta'dan ayrı
  '--color-error',
  '--color-error-bg',
  // #5 örtü · marka · gölge · fotoğraf gradyanları
  '--color-scrim-soft',
  '--color-scrim',
  '--color-scrim-heavy',
  '--color-brand-whatsapp-pure',
  '--color-brand-google',
  '--color-brand-apple',
  '--color-brand-stripe',
  '--color-brand-visa',
  '--color-brand-mastercard',
  '--color-brand-mastercard-alt',
  '--shadow-soft',
  '--shadow-hard',
  '--gradient-photo-top',
  '--gradient-photo-bottom',
  // #6 tipografi kademeleri
  '--text-screen-title',
  '--text-screen-title--font-weight',
  '--text-sheet-title',
  '--text-sheet-title--font-weight',
  '--text-helper',
  '--text-button',
  '--text-button--font-weight',
  '--text-eyebrow-app',
  '--text-eyebrow-app--font-weight',
  '--text-eyebrow-app--letter-spacing',
  // #7 yarıçap setinin iki yeni kademesi
  '--radius-badge',
  '--radius-control',
] as const;

/* Beklenen sayılar — elle sabitlendi (07.08 sayımı). Değişirse bilinçli değişmeli:
   token ekleyen, bu sayıyı da güncelleyip farkın iki tarafta da olduğunu göstermiş olur.
   MODÜL tarafı: 158 (web ile ortak) + 30 mobil token. CSS tarafı ayrıca sayılmaz, MODÜLDEN
   TÜRETİLİR (modül − mobil-özel + fontlar) — iki sayıyı elle tutmak, birini güncelleyip
   ötekini unutmayı davet ederdi. */
const EXPECTED_LIGHT_COUNT = 188; // 114 renk + 61 yazı + 9 yarıçap + 2 gölge + 2 gradyan
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
      const transition = TRANSITION[name];
      if (transition) {
        // Beyanlı sapma: iki taraf da AYRI AYRI kilitli — sapmanın büyüklüğü de sabit.
        expect(value, `${name} CSS'te beyan edilen ESKİ değerde değil`).toBe(transition.css);
        expect(moduleLight[name], `${name} modülde beyan edilen YENİ değerde değil`).toBe(
          transition.module,
        );
        continue;
      }
      expect(moduleLight[name], `${name} CSS'te var, modülde yok`).toBe(value);
    }
  });

  it('(a) CSS → modül: karanlık bloktaki her token modülde aynı değerle var', () => {
    for (const [name, value] of Object.entries(cssDark)) {
      expect(moduleDark[name], `${name} CSS karanlık blokta var, modülde yok`).toBe(value);
    }
  });

  it('(b) modül → CSS: modüldeki her token globals.css\'te var (mobil-özel olanlar hariç)', () => {
    const mobileOnly = new Set<string>(MOBILE_ONLY);
    for (const name of Object.keys(moduleLight)) {
      if (mobileOnly.has(name)) continue;
      expect(cssLight[name], `${name} modülde var, CSS @theme'de yok`).toBeDefined();
    }
    for (const name of Object.keys(moduleDark)) {
      expect(cssDark[name], `${name} modülde var, CSS karanlık blokta yok`).toBeDefined();
    }
  });

  /* Geçiş listelerinin kendisi de denetlenir — muafiyet listesi denetlenmezse muafiyet değil
     kör nokta olur. İkisi de "hâlâ geçerli mi?" sorusuna makineyle cevap verir. */
  it('TRANSITION listesi gerçek: her satır iki tarafta da var ve sapma hâlâ duruyor', () => {
    for (const [name, { css, module }] of Object.entries(TRANSITION)) {
      expect(css, `${name}: eski ve yeni değer aynı — satır çürümüş, listeden silinmeli`).not.toBe(
        module,
      );
      expect(cssLight[name], `${name} TRANSITION'da ama globals.css'te yok`).toBeDefined();
      expect(moduleLight[name], `${name} TRANSITION'da ama modülde yok`).toBeDefined();
    }
  });

  it('MOBILE_ONLY listesi gerçek: her token modülde var ve CSS\'te yok', () => {
    for (const name of MOBILE_ONLY) {
      expect(moduleLight[name], `${name} MOBILE_ONLY'de ama modülde yok`).toBeDefined();
      // CSS'e girdiği an satır çürür: web senkronu tamamlanmış demektir, listeden silinmeli.
      expect(
        cssLight[name],
        `${name} artık globals.css'te — web senkronu tamam, MOBILE_ONLY'den silinmeli`,
      ).toBeUndefined();
    }
  });

  it('token sayıları beklenenle birebir', () => {
    expect(Object.keys(moduleLight)).toHaveLength(EXPECTED_LIGHT_COUNT);
    expect(Object.keys(moduleDark)).toHaveLength(EXPECTED_DARK_COUNT);
    // CSS tarafı = modül − mobil-özel + fontlar; parser bir bildirimi sessizce yutuyorsa burada patlar.
    expect(Object.keys(cssLight)).toHaveLength(
      EXPECTED_LIGHT_COUNT - MOBILE_ONLY.length + EXCLUDED_FONT_TOKENS.length,
    );
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
