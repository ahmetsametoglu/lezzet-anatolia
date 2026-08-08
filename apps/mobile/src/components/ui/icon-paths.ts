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

  /* ── OPERASYON kabuğu (Operasyon Mobil v2 · `icons` sözlüğü v2:1080 + zil v2:42) ──────────
     Dört bölüm ikonu şablonda TEK `d` dizgesi olarak yazılı (alt yollar boşlukla ayrılmış);
     ayrı `path`lere bölünMEDİ — bölmek geometriyi yeniden yazmak olurdu (dosyanın kendi kuralı).
     Adlar İngilizce: `kurye/depo/yonetim/muhasebe` → `courier/warehouse/management/money`. */
  courier: {
    paths: ['M1 5h14v11H1z M15 9h4l3 4v3h-7 M5.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  },
  warehouse: { paths: ['M3 21V9l9-5 9 5v12 M3 21h18 M9 21v-6h6v6'] },
  management: { paths: ['M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z'] },
  money: { paths: ['M18 7a6 6 0 1 0 0 10 M4 11h9 M4 15h7'] },
  /** Bildirim zili — bölüm köklerinin sağ üst düğmesi. Şablon burada İKİ ayrı `path` yazıyor. */
  bell: { paths: ['M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'] },
  /** Paylaş — yukarı ok + tepsi (v3:245, ürün detayının kahraman düğmesi). */
  share: {
    paths: ['M12 3v12M8 6.5 12 3l4 3.5M6.5 10H5.8A1.8 1.8 0 0 0 4 11.8v7A1.8 1.8 0 0 0 5.8 20.5h12.4a1.8 1.8 0 0 0 1.8-1.7v-7a1.8 1.8 0 0 0-1.8-1.8h-.7'],
  },
  /** "Tekrar dene" oku — v2'nin üç hata bloğunda da aynı geometri (v2:51, 280, 499). */
  refresh: { paths: ['M23 4v6h-6', 'M20.49 15a9 9 0 1 1-2.12-9.36L23 10'] },

  /* ── KURYE bölümü (Operasyon Mobil v2:111-114 · 121-122 · 99 · 206) ──────────────────
     Altı ikon da v2'den BİREBİR; sadeleştirilmedi, yeniden çizilmedi (dosyanın kendi kuralı).
     Kanıt ikonları (`signature`, `camera`) teslimat ekranının 1. adımında, iletişim üçlüsü
     (`navigate`, `phone`, `whatsapp`) durak künyesinin altındaki eylem sırasında,
     `check-circle` ise "kaydedildi" bandında kullanılır. */
  /** Navigasyon — kâğıt uçak; adres METNİYLE harita uygulamasına köprü (koordinat yok). */
  navigate: { paths: ['M3 11l19-9-9 19-2-8-8-2z'] },
  phone: {
    paths: [
      'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
    ],
  },
  whatsapp: {
    paths: [
      'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
    ],
  },
  /** İmza al — kalem. */
  signature: { paths: ['M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'] },
  /** Fotoğraf — gövde `path`, mercek `circle` (şablonun kendi ayrımı). */
  camera: {
    paths: ['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z'],
    circles: [[12, 13, 4]],
  },
  /** "Kaydedildi" bandının onay halkası. */
  'check-circle': { paths: ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4 12 14.01l-3-3'] },
} as const satisfies Record<string, IconGeometry>;

/** Kitin tanıdığı ikon adları — `Icon` bunun dışına çıkamaz (yanlış ad derlemede yakalanır). */
export type IconName = keyof typeof ICON_PATHS;
