/*
  PARİTE TESTİ — paketin asıl güvencesi (21.3). `apps/web/app/globals.css` DOSYADAN okunur,
  custom property'ler parse edilir ve modülle İKİ YÖNLÜ karşılaştırılır:
    (a) CSS'teki her token modülde AYNI değerle var mı (CSS'e eklenen token modüle işlenmeden geçemez),
    (b) modüldeki her token CSS'te var mı (modüle uydurulan token CSS'siz kalamaz).
  Ayrıca sayılar sabitlenir: kaç token beklendiği açıkça yazılıdır — sessiz büyüme/küçülme de yakalanır.

  KAPSAM: `customer.ts` + `operations.ts`, yani CSS'in İKİZİ olan modüller. Mobil uygulamanın
  token'ları `customer-app.ts`te YAŞAR ve CSS ikizinin parçası DEĞİLDİR — bu test onları hiç
  görmez, çünkü web'de karşılıkları yoktur ve olması da beklenmez. Ayrım YAPISALDIR (dosya),
  eskiden olduğu gibi ad soneki ya da muafiyet listesi değil (kullanıcı kararı 07.08). Sonuç:
  iki yön de TAM ve İSTİSNASIZ; tek açık istisna fontlardır (aşağıda, gerekçesiyle).
  `customer-app.ts`in kendi güvencesi ayrı dosyada: `customer-app.test.ts` (kompozisyon sözleşmesi).

  DB'siz, saf dosya-okuma: birim projesinde koşar (kök vitest.config.ts unit include listesi).
*/
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { customerPhoneTextStepPx, customerText } from './customer';
import { flattenDarkTokens, flattenPhoneTextTokens, flattenThemeTokens, renderThemeCss } from './render-theme-css';

/* BİLİNÇLİ İSTİSNALAR — modüle taşınMAyan token'lar. Fontlar next/font'un çalışma zamanında
   ürettiği `var(--font-…)` değişkenlerine bağlıdır; sabit olarak taşınamazlar (customer.ts /
   operations.ts başlık yorumları). Liste AÇIK tutulur ki yeni bir dışarıda-kalan sessizce
   eklenemesin: CSS'e giren her yeni `--font-*` bile burada görünmek zorunda. */
const EXCLUDED_FONT_TOKENS = ['--font-sans', '--font-serif', '--font-ops-display', '--font-ops-mono', '--font-ops-body'] as const;

/* Beklenen sayılar — elle sabitlendi (07.08 sayımı). Değişirse bilinçli değişmeli:
   token ekleyen, bu sayıyı da güncelleyip farkın iki tarafta da olduğunu göstermiş olur.
   CSS tarafı ayrıca sayılmaz, MODÜLDEN TÜRETİLİR (modül + fontlar) — iki sayıyı elle tutmak,
   birini güncelleyip ötekini unutmayı davet ederdi. */
// 15.08: +2 (`ops-skeleton`, `ops-skeleton-soft`) — iskelet çubuğu kendi takma adını aldı.
// 15.08 (2): +1 `ops-surface-sunken` — 10+ kullanımı olan token tanımsızdı, envantere alındı.
// 18.08: +4 açık / +2 karanlık (`ops-band*`) — panel şeridi kendi ailesini aldı; koyu blokta
//        yalnız zemin ve çizgi var, mürekkep/ikincil metin açık temadaki değerini koruyor.
// 14.09: +10 — web v1 (13.09): 3 renk (`ink-hover`, `sand-275`, `olive-edge`), 3 hareket
//        (`animate-*`), 5 gölge (`shadow-*`). İki renk adı native'in `ink-deep`/`sand-250`inden
//        bilerek ayrı: aynı ad kompozisyonda uygulamanın başka tonuyla ezilirdi (`customer-app.ts`).
// 14.09 (2): +17 — telefon görünümünün kullandığı uygulama token'ları tabana çıktı (`customer.ts`
//        künyesi): 7 renk (`ink-deep`, `sand-150`, `sand-250`, dört örtü) · 7 yazı (rozet kademesi,
//        `badge-sm`, `helper`, `screen-title`) · 2 yarıçap (`badge`, `control`) · 1 gölge (`badge`).
// 14.09 (3): +3 — native'in üstbaşlığı (`eyebrow-xs`: boyut · ağırlık · aralık); taban `eyebrow`
//        masaüstünün 14px'i olduğu için telefon görünümü ara kademeden okur (`customer.ts` künyesi).
// 14.09 (4): +3 — native'in düğme etiketi (`button`: boyut · ağırlık) ve yükseklik gölgesi (`soft`);
//        telefon kataloğunun hap düğmesi ve anahtar topuzu (`customer.ts` künyesi).
// 14.09 (5): +1 — ürün detayının sarkan fiyat rozetinin gölgesi (`price`).
// 14.09 (6): +2 — hata ailesinin metni ve zemini (`error`, `error-bg`): paket detayının "bu adrese gitmiyor" işareti.
const EXPECTED_LIGHT_COUNT = 204; // @theme bloğu, fontlar hariç (121 renk + 63 yazı + 9 yarıçap + 3 hareket + 8 gölge) — +2: messenger/instagram marka (15.15) · +1: sert gölge (14.09)
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
 * `@theme { … }` ve karanlık-mod bloklarını ayıklar. Bloklar iç içe seçici içermez → `[^}]` yeter.
 * Bu yüzden `@keyframes` `@theme`in içine YAZILMAZ (globals.css'te kareler üst düzeyde): içeride
 * iken okuma ilk `}`de bitiyor, ardındaki bütün token'lar "yok" görünüyordu (13.09).
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
  TELEFON GÖRÜNÜMÜNÜN YAZI ÖLÇEĞİ (kullanıcı kararı 14.09) — `globals.css`in `[data-type-scale='phone']`
  bloğu yeni token açmaz, tabanın yazı kademelerinden TÜRER (her boyut + `customerPhoneTextStepPx`).
  Kilit iki yönlü: blokta modülün türetmediği bir değer duramaz, modülün türettiği bir kademe blokta
  eksik kalamaz — yeni bir yazı kademesi tabana girdiği gün telefon bloğuna da girmek zorunda.
*/
describe('telefon görünümünün yazı ölçeği', () => {
  /** `customerText`in BOYUT anahtarları (alt anahtarlar hariç) — 14.09 sayımı (+1 `button`, katalog turu). */
  const EXPECTED_PHONE_COUNT = 28;

  it("globals.css'teki blok modülün türettiği haritaya birebir eşit", () => {
    const css = stripComments(readFileSync(cssPath, 'utf8'));
    const block = css.match(/\[data-type-scale='phone'\]\s*\{([^}]*)\}/)?.[1];
    expect(block, "globals.css içinde [data-type-scale='phone'] bloğu bulunamadı").toBeDefined();
    expect(parseCustomProperties(block ?? '')).toEqual(flattenPhoneTextTokens());
  });

  it('her boyut durağı tabanın bir adım üstü; alt anahtarlar (satır · ağırlık · aralık) bloğa girmez', () => {
    const phone = flattenPhoneTextTokens();
    expect(Object.keys(phone)).toHaveLength(EXPECTED_PHONE_COUNT);
    expect(phone['--text-body-sm']).toBe(`${Number.parseFloat(customerText['body-sm']) + customerPhoneTextStepPx}px`);
    // Yarım piksel kademeler korunur — sabit ekleme aralıkları bozmaz (11,5 → 12,5).
    expect(phone['--text-micro']).toBe(`${Number.parseFloat(customerText.micro) + customerPhoneTextStepPx}px`);
    expect(Object.keys(phone).filter((name) => name.slice('--text-'.length).includes('--'))).toEqual([]);
  });

  it('üretilen CSS de bloğu taşır — aynı parser, aynı harita', () => {
    const block = renderThemeCss().match(/\[data-type-scale='phone'\]\s*\{([^}]*)\}/)?.[1];
    expect(parseCustomProperties(block ?? '')).toEqual(flattenPhoneTextTokens());
  });
});
