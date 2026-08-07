/*
  İKON SÖZLÜĞÜ — v3 tasarımının SVG geometrisi, BİREBİR.

  Şablondaki yollar elle çizilmiş 24×24 çizgi ikonlarıdır (`IC` sözlüğü v3:1745 + ekran içi
  `<svg>` blokları). Hazır bir ikon setine (lucide/feather) geçilMEDİ: yollar tasarımda YAZILI ve
  "implement ederken improvise etme" kuralı burada birebir uygulanabiliyor — hazır set, aynı
  kavramın BAŞKA bir çizimini getirirdi (ör. şablonun katalog ikonu dört kare, feather'ınki liste).

  GEOMETRİ AYRI DOSYADA: `icon.tsx` çizim davranışıdır (renk, boy, çizgi ucu), burası VERİDİR.
  Aynı dosyada dursalar, yeni bir ikon eklemek komponenti değiştirmek gibi görünürdü.

  DAİRE NEDEN AYRI ALAN: şablon bazı ikonlarda daireyi `<circle>` öğesiyle çiziyor (büyüteç,
  kamyon tekerleği). Elle bir `d` yayına çevirmek geometriyi YENİDEN YAZMAK olurdu — ölçü aynı
  kalsa bile artık tasarımın söylediği şey değil, bizim türettiğimiz şey olurdu.

  RENK YOK: hiçbir yolun kendi rengi yoktur, çizen taraf temadan verir (`icon.tsx` → `currentColor`
  yerine açık prop). Ham hex bu dosyaya giremez — CLAUDE §3.
*/

/**
 * Bir ikonun çizim künyesi — sözlüğün ŞEKLİ, dışarıya açılmaz: `Icon` sözlüğü doğrudan okuyor ve
 * tipini oradan türetiyor (`(typeof ICON_PATHS)[IconName]`), yani bu ad kimsenin eline geçmiyor.
 * `viewBox` verilmezse `Icon`un varsayılan kutusu (24×24) geçerlidir.
 */
interface IconGeometry {
  /** `<path d="…">` dizeleri — şablondan kopyalanır, sadeleştirilmez. */
  paths: readonly string[];
  /** `<circle cx cy r>` üçlüleri — şablonun daire öğeleri. */
  circles?: readonly (readonly [cx: number, cy: number, r: number])[];
  /** Şablonun kendi `viewBox`u; kare olmayanlarda (süzgeç 19×17) `Icon` genişliği buradan türetir. */
  viewBox?: string;
  /** Şablonun bu ikon için verdiği çizgi kalınlığı, kitin duraklarına çekilmiş hâliyle. */
  large?: true;
}

/**
 * Ad → geometri. Adlar İNGİLİZCE (CLAUDE §2) — şablonun `IC` sözlüğünde hesap sekmesi `hesap`
 * anahtarıyla duruyor, burada `account`.
 */
export const ICON_PATHS = {
  /* ── Sekme çubuğu (v3:1745 `IC`) ─────────────────────────────────────────── */
  home: { paths: ['M3 11.5 12 4l9 7.5M5.5 10V20h13v-10'] },
  catalog: { paths: ['M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'] },
  orders: { paths: ['M6.5 3h11v18l-1.9-1.5L13.7 21l-1.8-1.5L10 21l-1.8-1.5L6.5 21zM9.5 8h5M9.5 12h4'] },
  account: { paths: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c1.5-3.8 5.5-4.8 7.5-4.8s6 1 7.5 4.8'] },

  /* ── Katalog başlığı (v3:179, 183) ───────────────────────────────────────── */
  /** Arama büyüteci — sap bir `path`, mercek bir `circle` (şablonun kendi ayrımı). */
  search: { paths: ['m20.5 20.5-4.2-4.2'], circles: [[11, 11, 7]] },
  /**
   * Süzgeç — üç daralan çizgi. Şablonun `viewBox`u KARE DEĞİL (19×17) ve öyle kalıyor: kareye
   * genişletmek çizgileri kutunun içinde kaydırır, yani ikonu yeniden çizmek olurdu.
   */
  filter: { paths: ['M1 3.5h17M4 8.5h11M7 13.5h5'], viewBox: '0 0 19 17' },

  /* ── Durum blokları (v3:194, 211) ────────────────────────────────────────── */
  /** "Aradığınızı bulamadık" — büyütecin büyük boyu; şablon orada daha ince çizgi kullanıyor. */
  'search-empty': { paths: ['m20.5 20.5-4.2-4.2'], circles: [[11, 11, 7]], large: true },
  /** "Bağlantı kurulamadı" — üstü çizili wifi. */
  'connection-off': { paths: ['M5 12.5a7 7 0 0 1 14 0M8 15.5a4 4 0 0 1 8 0M12 19h.01M2 2l20 20'], large: true },
} as const satisfies Record<string, IconGeometry>;

/** Kitin tanıdığı ikon adları — `Icon` bunun dışına çıkamaz (yanlış ad derlemede yakalanır). */
export type IconName = keyof typeof ICON_PATHS;
