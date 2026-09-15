/*
  Telefon yüzeylerinin ikon geometrisi: native uygulama ile web'in telefon görünümü aynı tasarımı çizer, bu yüzden veri tek yerde
  ve platformdan bağımsız durur, çizim davranışı her yüzeyin kendi çizicisindedir (native kit, web `mobile-icon.tsx`). Sözlük
  kitte değil burada, çünkü kit react-native'e bağlı ve web onu okuyamaz; masaüstü web kendi setini taşır.
*/

/*
  Geometri tasarımdan birebir alınır ve sadeleştirilmez: hazır bir set (lucide, feather) aynı kavramın başka bir çizimini
  getirirdi. Daire ve dikdörtgen `d` yayına çevrilmez, çünkü ölçü aynı kalsa bile bu geometriyi yeniden yazmak olurdu; renk
  yok, çizen taraf temadan verir.
*/

/**
 * Sözlüğün şekli; dışarı açılmaz, çünkü çiziciler tipi sözlüğün kendisinden türetir. `viewBox` verilmezse kutu 24×24'tür.
 */
interface IconGeometry {
  /** `<path d="…">` dizeleri — şablondan kopyalanır, sadeleştirilmez. */
  paths: readonly string[];
  /** `<circle cx cy r>` üçlüleri — şablonun daire öğeleri. */
  circles?: readonly (readonly [cx: number, cy: number, r: number])[];
  /** `<rect x y width height rx>` beşlileri; dairenin gerekçesiyle ayrı alan. */
  rects?: readonly (readonly [x: number, y: number, width: number, height: number, rx: number])[];
  /** Şablonun kendi `viewBox`u; kare olmayanlarda (süzgeç 19×17) `Icon` genişliği buradan türetir. */
  viewBox?: string;
  /** Büyük boyda çizilen ikon: çizgi incelir (`ICON_STROKE.large`). */
  large?: true;
}

/** Ad → geometri; adlar İngilizce, şablondaki Türkçe anahtarlar çevrilir (`hesap` → `account`). */
export const ICON_PATHS = {
  /* ── Sekme çubuğu ──────────────────────────────────────────────────────────── */
  home: { paths: ['M3 11.5 12 4l9 7.5M5.5 10V20h13v-10'] },
  catalog: { paths: ['M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'] },
  orders: { paths: ['M6.5 3h11v18l-1.9-1.5L13.7 21l-1.8-1.5L10 21l-1.8-1.5L6.5 21zM9.5 8h5M9.5 12h4'] },
  /** Hazır paketler sekmesi: açılı kutu. */
  packages: { paths: ['M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5 12 12l9-4.5M12 12v9'] },
  account: { paths: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c1.5-3.8 5.5-4.8 7.5-4.8s6 1 7.5 4.8'] },

  /* ── Katalog başlığı ────────────────────────────────────────────────────────── */
  /** Arama büyüteci — sap bir `path`, mercek bir `circle` (şablonun kendi ayrımı). */
  search: { paths: ['m20.5 20.5-4.2-4.2'], circles: [[11, 11, 7]] },
  /** Süzgeç; kutu kare değil (19×17), çünkü kareye genişletmek çizgileri kaydırıp ikonu yeniden çizmek olurdu. */
  filter: { paths: ['M1 3.5h17M4 8.5h11M7 13.5h5'], viewBox: '0 0 19 17' },

  /* ── Durum blokları ─────────────────────────────────────────────────────────── */
  /** "Aradığınızı bulamadık" — büyütecin büyük boyu; şablon orada daha ince çizgi kullanıyor. */
  'search-empty': { paths: ['m20.5 20.5-4.2-4.2'], circles: [[11, 11, 7]], large: true },
  /** "Bağlantı kurulamadı" — üstü çizili wifi. */
  'connection-off': { paths: ['M5 12.5a7 7 0 0 1 14 0M8 15.5a4 4 0 0 1 8 0M12 19h.01M2 2l20 20'], large: true },

  /* ── Operasyon kabuğu ─────────────────────────────────────────────────────────
     Dört bölüm ikonu şablondaki gibi tek `d` dizgesidir; alt yollara bölmek geometriyi yeniden yazmak olurdu. */
  courier: {
    paths: ['M1 5h14v11H1z M15 9h4l3 4v3h-7 M5.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  },
  warehouse: { paths: ['M3 21V9l9-5 9 5v12 M3 21h18 M9 21v-6h6v6'] },
  management: { paths: ['M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z'] },
  money: { paths: ['M18 7a6 6 0 1 0 0 10 M4 11h9 M4 15h7'] },
  /** Bildirim zili: bölüm köklerinin sağ üst düğmesi. */
  bell: { paths: ['M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'] },
  /** Paylaş: yukarı ok ve tepsi, ürün detayının düğmesi. */
  share: {
    paths: ['M12 3v12M8 6.5 12 3l4 3.5M6.5 10H5.8A1.8 1.8 0 0 0 4 11.8v7A1.8 1.8 0 0 0 5.8 20.5h12.4a1.8 1.8 0 0 0 1.8-1.7v-7a1.8 1.8 0 0 0-1.8-1.8h-.7'],
  },
  /** "Tekrar dene" oku. */
  refresh: { paths: ['M23 4v6h-6', 'M20.49 15a9 9 0 1 1-2.12-9.36L23 10'] },

  /* ── Keşif turu ───────────────────────────────────────────────────────────────
     `undo` `refresh`in aynası değil: şablon ikisini ayrı çiziyor ve birini ötekine bağlamak geometriyi yeniden yazmak olurdu. */
  /** Geri al — açık daire + sol üstte geri dönüş oku (başlık çubuğunun sağ yuvası). */
  undo: { paths: ['M4 12a8 8 0 1 0 2.5-5.8M4 3.5V7.5h4'] },
  /** Sola kaydırma ipucunun oku. */
  'arrow-left': { paths: ['M19 12H5M11 6l-6 6 6 6'] },
  /** Sağa kaydırma ipucunun oku. */
  'arrow-right': { paths: ['M5 12h14M13 6l6 6-6 6'] },
  /** Çarpı — "başka sefer" oy düğmesi. */
  close: { paths: ['M6 6l12 12M18 6 6 18'] },
  /** Artı: bölüme satır ekleyen eylem; adet düğmesinin `+` glifinden ayrı, çünkü ikisi aynı ekranda yan yana durur. */
  plus: { paths: ['M12 5v14M5 12h14'] },
  /* Fişin onay imi; metin "✓" daire içinde yazı tipinin çizgi yüksekliğine yaslanıp merkezden kayardı. */
  check: { paths: ['M5 12.5l4.5 4.5L19 7'] },
  /** Harita iğnesi: adres çekmecesinin öneri satırı; web masaüstü çiziminin aynısı. */
  pin: { paths: ['M12 21.5s7-6.6 7-11.4A7 7 0 1 0 5 10.1c0 4.8 7 11.4 7 11.4z'], circles: [[12, 10, 2.4]] },
  /* Okutucu: gövde ve mercek, ürün ve parti barkodu okutan düğmelerin ikonu; `camera` müşterinin fotoğraf düğmesidir. Emoji
     yerine çizgi ikon, çünkü emoji cihazdan cihaza başka çizilir ve renk almaz. */
  scan: { paths: [], rects: [[3, 5, 18, 14, 3]], circles: [[12, 12, 3.2]] },
  /* Kâğıt okutma: köşe ayraçları ve orta çizgi, toplama kuyruğunda hazırlık kâğıdının karekodu için; `scan`dan ayrı, çünkü
     depocu kutuya değil kâğıda nişan alır. */
  'scan-paper': {
    paths: ['M4 7V5a1 1 0 0 1 1-1h2M20 7V5a1 1 0 0 0-1-1h-2M4 17v2a1 1 0 0 0 1 1h2M20 17v2a1 1 0 0 1-1 1h-2M4 12h16'],
  },
  /* Tuş takımının silme tuşu. */
  backspace: { paths: ['M21 5H9l-6 7 6 7h12z', 'M14 9l-4 6M10 9l4 6'] },

  /* ── Kurye bölümü ─────────────────────────────────────────────────────────────
     Kanıt (`signature`, `camera`), iletişim (`navigate`, `phone`, `whatsapp`) ve "kaydedildi" bandı (`check-circle`). */
  /**
   * Dikey üç nokta, eylem çekmecesini açar; noktalar sıfır uzunlukta çizgidir, çünkü yuvarlak uç onları dolgu gerektirmeden
   * daireye çevirir.
   */
  more: { paths: ['M12 5v.01', 'M12 12v.01', 'M12 19v.01'] },
  /** Kâğıt uçak: hem harita köprüsü hem yazışmanın gönder düğmesi; ikinci bir `send` girdisi aynı yolu iki kez yazmak olurdu. */
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
  /** Sesli mesaj: sohbetteki ses baloncuğunun işareti. */
  mic: { paths: ['M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z', 'M19 11a7 7 0 0 1-14 0', 'M12 18v3'] },
  /* Ses çaların iki hâli de çizgidir, dolu değil: dolgu desteği tek bir düğme için çizim sözleşmesini değiştirmek olurdu. */
  /** Çal — üçgen. */
  play: { paths: ['M8 5.5v13l11-6.5z'] },
  /** Duraklat — iki dik çizgi. */
  pause: { paths: ['M10 5v14M14 5v14'] },
  /** "Kaydedildi" bandının onay halkası. */
  'check-circle': { paths: ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4 12 14.01l-3-3'] },

  /* ── Depo hub ızgarası ────────────────────────────────────────────────────────
     Adlar çizimi değil işi söyler: `intake` bir kutudur ama adı `box` olsaydı ikinci kutu ikonu geldiğinde ad çakışırdı. */
  /** D2 mal kabul — açılı kutu (gelen mal). */
  intake: { paths: ['M3 8l9-5 9 5v8l-9 5-9-5z', 'M3 8l9 5 9-5', 'M12 13v8'] },
  /** D3 yakın-SKT — saat; kadran `circle`, akrep `path` (şablonun kendi ayrımı). */
  'near-expiry': { paths: ['M12 7v5l3 2'], circles: [[12, 12, 9]] },
  /** D4 sayım / düzeltme — daralan üç satır (liste). */
  'stock-count': { paths: ['M4 6h16M4 12h16M4 18h10'] },
  /** D4b stok düşümü: raf çizgisinden aşağı inen ok; sayımın liste ikonundan ayrı, çünkü iki iş hub'da bakışta ayrılmalı. */
  'stock-write-off': { paths: ['M5 4h14', 'M12 20V8', 'M7 15l5 5 5-5'] },
  /** D5 transfer — SAĞA giden ok, dikey çizgi hedef depodur. */
  transfer: { paths: ['M3 12h13', 'M12 7l5 5-5 5', 'M21 5v14'] },
  /** D6 kurye dönüşü — SOLA gelen ok; D5'in aynası, çünkü mal geri geliyor. */
  'courier-return': { paths: ['M21 12H8', 'M12 17l-5-5 5-5', 'M3 5v14'] },
  /** D7 yerinde satış — alışveriş çantası (kapıya gelen müşteri). */
  sale: { paths: ['M6 2l1.5 4h9L18 2', 'M4 6h16l-1.5 14H5.5z'] },
  /** D8 kargo devri — kutu gövdesi `rect`, mühür `circle`. */
  handover: { paths: [], rects: [[3, 5, 18, 14, 3]], circles: [[12, 12, 3.2]] },
  /** "Bu cihaz · yazıcılar" satırı: dişli (kurulum, günlük iş değil). */
  settings: {
    paths: ['M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2'],
    circles: [[12, 12, 3]],
  },

  /* ── Yazıcı kurulumu ──────────────────────────────────────────────────────────
     Geometri ekranda değil burada durur: ekrana çizilen ikinci bir yazıcı ikonu bir gün bununla ayrışırdı. */
  /** Yazıcı — kâğıt çıkışı (üst), gövde (`rect`), basılan sayfa (alt). */
  printer: { paths: ['M6 9V3h12v6', 'M6 16h12v5H6z'], rects: [[3, 9, 18, 7, 2]] },
  /** SKT alanının takvimi: `near-expiry` saati "az kaldı" der, bu "bir tarih seçilecek". */
  calendar: { paths: ['M8 3v4M16 3v4M3 11h18'], rects: [[3, 5, 18, 16, 3]] },
  /** Uyarı: daire içinde ünlem; `near-expiry` saatinden ayrı. */
  'alert-circle': { paths: ['M12 8v5M12 16.5v.5'], circles: [[12, 12, 9]] },
  /**
   * Fiyat etiketi (indirim, teklif, kampanya); `sale` bir satış eylemidir ve kampanya kartını onunla çizmek "burada satış
   * yapılıyor" derdi.
   */
  tag: { paths: ['M20 13l-8 8-9-9V4h8z'], circles: [[7.5, 7.5, 1.3]] },
  /** Kurumsal bina: başvuran işletme; `account` bir kişidir ve kartı bir müşteri gibi okuturdu. */
  business: {
    paths: ['M3 21h18', 'M5 21V7l7-4 7 4v14', 'M9 21v-5h6v5', 'M9 10h.01M15 10h.01M9 13h.01M15 13h.01'],
  },

  /* ── Müşteri ekranları ─────────────────────────────────────────────────────── */
  /** Sepet: yüzen sepet düğmesi, boş sepet bloğu. */
  cart: { paths: ['M4 9h16l-1.5 11h-13zM8 9c0-4.5 8-4.5 8 0'] },
  /** Kupon etiketi: sepetin kupon satırı, hesabın kupon listesi. */
  coupon: { paths: ['M3 9V6h18v3a2 2 0 0 0 0 6v3H3v-3a2 2 0 0 0 0-6z'] },
  /** Zarf: "E-posta ile devam et", "Bize yazın". */
  mail: { paths: ['m4 7.5 8 6 8-6'], rects: [[3, 5.5, 18, 13, 2]] },
  /** Kamyon: canlı sipariş bandı, teslimat satırı, zaman çizgisi. */
  truck: {
    paths: ['M1 1h13v12H1zM14 5h5l4 4v4h-9'],
    circles: [
      [6, 16, 2.2],
      [18, 16, 2.2],
    ],
    viewBox: '0 0 24 19',
  },
  /** Kilit: ödemenin "GÜVENLİ" künyesi. */
  lock: { paths: ['M8 10V7a4 4 0 0 1 8 0v3'], rects: [[4, 10, 16, 10, 2]] },
  /** Banka kartı: "Kartla öde". */
  card: { paths: ['M2 10h20'], rects: [[2, 5, 20, 14, 2.5]] },
  /** Geniş onay imi (sipariş zaman çizgisi, seçili ve tamamlanmış satırlar); `check` fişin daire içindeki dar imidir. */
  'check-wide': { paths: ['M20 6 9 17l-5-5'] },
  /** Koli: zaman çizgisinin "Hazırlanıyor" durağı. */
  box: { paths: ['M21 8 12 3 3 8l9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8'] },
  /** Yıldız: bildirim listesi ve "Ürünleri değerlendir". */
  star: { paths: ['M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2-5.6-3.2-5.6 3.2 1.3-6.2L3 9.5l6.3-.7z'] },
} as const satisfies Record<string, IconGeometry>;

/** Çizicilerin tanıdığı ikon adları; yanlış ad derlemede yakalanır. */
export type IconName = keyof typeof ICON_PATHS;

/*
  Çizgi kalınlığı durakları; native kitin `theme.border.iconStroke*` durakları buradan türer, web telefon görünümü doğrudan okur.
  Kalınlık boyla ters oynar (`large` büyük ikonu inceltir ki optik ağırlık sabit kalsın), `bold` ise boyu değil rolü söyler: ikon
  bir eylemin kendisidir.
*/
export const ICON_STROKE = { base: 1.8, large: 1.6, bold: 2.2 } as const;
