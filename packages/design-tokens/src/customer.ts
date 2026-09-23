/*
  Müşteri evreninin token'ları: `globals.css` `@theme` bloğunun tek kaynağı; CSS adı, aile öneki atılmış anahtardan kayıpsız geri
  üretilir (`render-theme-css.ts`), fontlar next/font çalışma zamanında doğduğu için dışarıda. Uygulamaya özgü token'lar
  `customer-app.ts`te kompozisyonla birleşir; buraya eklenen ad oradaki katmanlarda boş olmalı, yoksa uygulamanın tonuyla sessizce ezilir.
*/

/* ── §0.1 Yüzey ve mürekkep ──────────────────────────────────────────────────
   Envanterdeki altı yakın koyu ton tek `ink`e indirildi; ayrı bir `slate` token'ı yok. */
export const customerSurface = {
  ink: '#343b41', // başlık, koyu blok zemini, birincil metin
  'ink-hover': '#2b3238', // koyu hapın üzerine gelinmiş hâli (v1 sepet hapı)
  /* Örtü mürekkebinin katı hâli; `ink` açık yeşil zeminde mavimsi durduğu için ayrı ton. */
  'ink-deep': '#15170f', // "TAKİP" çipinin metni
  'ink-raised': '#3f474e', // koyu bant üstündeki kart zemini
  'ink-raised-line': '#565f66', // koyu bant üstündeki kartın çerçevesi
  body: '#6d7261', // gövde açıklaması, kart alt satırı
  muted: '#8a8270', // etiket, yardımcı satır, placeholder
  card: '#ffffff', // kart, dialog, girdi zemini
  cream: '#faf6ec', // sayfa zemini (= sand-25)
  'cream-deep': '#f0e9d6', // vurgulu bölüm bandı (= sand-100)
  'on-image': '#f5f1e6', // fotoğraf üstünde başlık, alıntı
  'on-image-soft': '#dfe3cf', // fotoğraf üstünde imza, altyazı
} as const satisfies Record<string, string>;

/* ── §0.2 Kum skalası — çerçeve, ayraç, pasif ────────────────────────────────
   Skala SICAKtır; tek soğuk ton `neutral-400`, yalnız kapanmış/pasif durumda
   (krem zeminde sararmış görünmesin diye). */
export const customerSand = {
  'sand-25': '#faf6ec', // sayfa zemini
  'sand-50': '#f3efe2', // ara zemin, gömülü panel, hover
  'sand-100': '#f0e9d6', // vurgulu bölüm, iç ayraç
  /* Krem zeminde "seçili" ve "kart" yüzeyleri 100 ile 300 arasında iki ayrı sıcaklık istiyor (Token Kararlari #2). */
  'sand-150': '#efdfc2', // seçili kart, özet paneli, bildirim zili zemini
  'sand-200': '#ece5d2', // standart çerçeve, kart kenarı
  /* Kararın "sand-100" dediği ton; o ad zaten #f0e9d6'nın olduğu için skaladaki boş ad verildi. */
  'sand-250': '#ece3c8', // kart zemini, katalog dairesi
  'sand-275': '#e6dfcd', // başlık ve yer paneli alt çizgisi (v1)
  'sand-300': '#e0d8c2', // girdi kenarı, 2. çerçeve
  'sand-400': '#d8cfb6', // belirgin çerçeve
  'sand-500': '#cdc4a8', // kesikli çerçeve, boş durum
  'sand-600': '#b3ab97', // pasif ikon, pasif metin
  'sand-650': '#9a958a', // bu adrese gitmeyen ürünün fiyat çipi (600 ile muted arasındaki boş durak)
  'neutral-400': '#c9cdc2', // kapanmış/pasif rozet çerçevesi (soğuk)
} as const satisfies Record<string, string>;

/* ── §0.3 Semantik aileler — her biri metin · koyu · zemin · kenarlık ────────
   Zeytin: birincil aksiyon, olumlu, yolunda */
export const customerOlive = {
  olive: '#5f7a2c', // birincil buton, bağlantı, ikon
  'olive-dark': '#4a6121', // kutu başlığı, hover, basılı
  'olive-bg': '#eef2e2', // yeşil bant, olumlu rozet
  'olive-line': '#d7e3bd', // kutu ve seçili kart çerçevesi
  'olive-edge': '#cddbb0', // yer hapının çerçevesi (v1 başlık)
  'olive-light': '#a9c46b', // koyu blok üstünde vurgu, ikon
} as const satisfies Record<string, string>;

/* Terracotta: fırsat/indirim; ayrı koyu katman yok, anlam ton farkıyla kurulur. Masaüstü hata metni bugün `terracotta-bright`i
   kullanıyor, telefon görünümü ise hata için `customerError` ailesini taşır. */
export const customerTerracotta = {
  terracotta: '#b05c2e', // fırsat/indirim vurgusu, eski fiyat üstü
  'terracotta-bg': '#f9ede2', // fırsat kutusu, indirim rozeti
  'terracotta-line': '#e8c9b3', // kutu çerçevesi, hatalı girdi
  'terracotta-bright': '#c25e3a', // hata/iptal metni, geçersiz kod
} as const satisfies Record<string, string>;

/* Bal: bekliyor, iade sürecinde, puan */
export const customerHoney = {
  honey: '#8a6b2a', // bekleyen durum etiketi, ikon
  'honey-bg': '#fdf3e0', // bekleyen rozet, bilgi kutusu
  'honey-line': '#ecd9b4', // kutu çerçevesi
  star: '#d99a2b', // dolu yıldız, puan göstergesi
} as const satisfies Record<string, string>;

/* Nötr: kapanmış, teslim edildi, pasif — kendi tonu yok, skaladan türer */
export const customerClosed = {
  closed: '#6d7261', // kapanmış durum etiketi (= body)
  'closed-bg': '#f0e9d6', // kapanmış rozet arkası (= sand-100)
  'closed-line': '#c9cdc2', // pasif çerçeve (= neutral-400)
} as const satisfies Record<string, string>;

/* Hata ailesi terracotta'ya katılmadı: terracotta fırsat demek ve aynı ailede iki zıt anlam rozet renginin bilgi değerini
   sıfırlar. Çerçeve katmanı (`error-line`) yalnız uygulamada (`customerAppError`). */
export const customerError = {
  error: '#a44a3f', // hata metni, "bu adrese gitmiyor" işareti
  'error-bg': '#f4e3e0', // hata kutusu, işaretin zemini
} as const satisfies Record<string, string>;

/* ── §0.4a Etkileşim durumları ───────────────────────────────────────────────
   Odak halkası ayrı renk taşımaz: 2px zeytin outline, 3px offset. Envanterin §0.4'ü üç sabite bölündü; `a/b/c` eki aynı
   numaralı başlıklar yanlış yazılmış sanılmasın diye. */
export const customerInteraction = {
  'hover-bg': '#f3efe2', // liste/kart hover (= sand-50)
  'disabled-fill': '#c9c3b0', // tükendi/disabled buton zemini
  'disabled-line': '#c9cdc2', // pasif girdi ve çip çerçevesi
  'disabled-text': '#8a8270', // disabled buton ve girdi metni (= muted)

  /* Giriş ekranı kahraman gradyanı — bal → zeytin-kavı → mürekkep. Ara durak
     (#6f7d3f) envanterde bir aile tonu değil, yalnız bu geçişin orta noktası;
     ham hex koda dağılmasın diye tek yerde durur. */
  'hero-mid': '#6f7d3f',
} as const satisfies Record<string, string>;

/* ── Örtü (scrim) — Token Kararlari #5 ────────────────────────────────────────
   Opaklık ham yazılmaz, kademe adı kullanılır ki "biraz daha koyu" kararı tek yerden verilsin. `.72` `.82`ye yuvarlanmaz:
   `.82` fotoğraf üstü yazıyı okunur kılar, `.72` fotoğrafı soldurup "alınamaz" bilgisini taşır. */
export const customerScrim = {
  'scrim-soft': 'rgba(21, 23, 15, 0.28)', // fotoğrafın üst kenarı, fotoğrafsız bant dairesi
  scrim: 'rgba(21, 23, 15, 0.45)', // sayfa örtüsü, yer işaretinin filigranı
  'scrim-72': 'rgba(21, 23, 15, 0.72)', // tükendi/pasif rozetinin zemini
  'scrim-heavy': 'rgba(21, 23, 15, 0.82)', // fotoğrafın alt kenarı, üstünde başlık okunur
} as const satisfies Record<string, string>;

/* ── Marka işaretleri — Token Kararlari #5 ────────────────────────────────────
   Palete ait değil: üçüncü tarafların kendi renkleri, temayla dönmez. `brand-whatsapp` adı operasyonun koyultulmuş ikon
   yeşilinde (`operations.ts`) olduğu için kanonik yeşil `brand-whatsapp-pure` adını aldı. */
export const customerBrand = {
  'brand-whatsapp-pure': '#25d366', // WhatsApp'ın kanonik yeşili
  'brand-google': '#4285f4', // giriş: Google düğmesinin "G"si
} as const satisfies Record<string, string>;

/* Müşteri renklerinin tam kümesi — CSS dosya sırasıyla (`--color-` öneki). */
export const customerColors = {
  ...customerSurface,
  ...customerSand,
  ...customerOlive,
  ...customerTerracotta,
  ...customerHoney,
  ...customerClosed,
  ...customerError,
  ...customerInteraction,
  ...customerScrim,
  ...customerBrand,
} as const satisfies Record<string, string>;

/* ── §0.4b Tipografi ölçeği (`--text-` öneki) ────────────────────────────────
   Başlık ara değerleri hiyerarşi için yuvarlanır, kontrol öğelerinde (çip, düğme, rozet) yuvarlanmaz, çünkü orada yarım piksel
   komşu öğeyle hizayı bozar. `--line-height` / `--font-weight` / `--letter-spacing` sonekleri CSS adı kayıpsız geri üretilsin
   diye anahtarda aynen durur. */
export const customerText = {
  h1: '52px',
  'h1--line-height': '1.15',
  'h1--font-weight': '600',
  'h1-sm': '30px',
  'h1-sm--line-height': '1.2',
  'h1-sm--font-weight': '600',
  /* B2B kahramanının başlığı: ana sayfanın 52'sinden küçük, sayfa başlığının 38'inden büyük ayrı bir
     kademe (tasarım `Musteri - Professionnels.dc.html`). Yuvarlanmadı, çünkü aradaki iki durak da
     kahramanın dengesini bozuyor — 38'de blok kısalıyor, 52'de başlık üç satıra iniyor. */
  'h1-md': '44px',
  'h1-md--line-height': '1.2',
  'h1-md--font-weight': '600',

  /* Sayfa başlığı ("Katalog"): kahraman h1'i ile bölüm h2'si arasında ayrı kademe, liste sayfalarının tepesinde durur. */
  'page-title': '38px',
  'page-title--font-weight': '600',
  'page-title-sm': '26px',
  'page-title-sm--font-weight': '600',

  h2: '28px',
  'h2--font-weight': '600',
  'h2-sm': '20px',
  'h2-sm--font-weight': '600',

  /* Kart ve bant başlığı — koyu blok başlığı, CTA/B2B bandı başlığı da bu kademededir. */
  'card-title': '24px',
  'card-title--font-weight': '600',
  'card-title-sm': '18px',
  'card-title-sm--font-weight': '600',

  /* Gövde kademeleri: kahraman paragrafı → kart metni → yardımcı satır → mobil alt satır. */
  lead: '18px',
  'lead--line-height': '1.6',
  body: '15px',
  /* Envanterin "gövde 14-18" aralığının tabanı — sonuç sayısı gibi yardımcı bilgi satırları. */
  'body-sm': '14px',
  note: '13px',
  micro: '11.5px',

  /* Kontrol kademeleri — envanter §0.4 "etiket/buton 13-16/700" ARALIĞININ tasarımda kullanılan iki
     durağı. Başlık kademelerinden farklı olarak bunlar YUVARLANMAZ: bir çipin 13 mü 14 mü olduğu
     hiyerarşi değil, görsel denge sorusudur — komşu öğeyle aynı hizada durup durmadığını belirler. */
  chip: '14px', // filtre çipi (K17)
  'chip--font-weight': '700',
  /* Form alanı etiketi: gövde ölçeğinin hiçbir durağı 12,5 değil ve alanın üstündeki künye içindeki değerle aynı boyda
     olamaz. Ağırlık 600, çünkü 700 etiketi girdinin içeriğinden yüksek sesli yapıyordu. */
  'field-label': '12.5px',
  'field-label--font-weight': '600',
  control: '13.5px', // süzgeç ve sıralama düğmesi (K17 küçük · K18)
  'control--font-weight': '700',
  /* Native birincil düğmenin etiketi; `chip` ve `control` ile birleşmedi, çünkü dokunma hedefinin etiketi çipten kalın
     durmalı ve kontrol kademeleri yuvarlanmaz. */
  button: '14.5px',
  'button--font-weight': '700',
  /* Adet seçicinin −/+ imleri: rakamdan bir tık büyük, çünkü dokunma hedefi rakamdan geniş olmalı. */
  step: '16px',
  'step--font-weight': '700',
  'step-sm': '15px',
  'step-sm--font-weight': '700',

  /* İkon/emoji ölçüleri — metin hiyerarşisinin parçası DEĞİL (başlık kurmazlar), ama ham yazılırsa
     başlıkta sepet 22, mobilde 20 gibi değerler koda dağılır. Kendi kademesi olarak durur. */
  icon: '22px',
  'icon-sm': '20px',

  /* Üstbaşlık (eyebrow): büyük harf + harf aralığı; aralık token'a gömülüdür, elle yazılmaz. */
  eyebrow: '14px',
  'eyebrow--font-weight': '600',
  'eyebrow--letter-spacing': '0.12em',
  'eyebrow-sm': '11px',
  'eyebrow-sm--font-weight': '600',
  'eyebrow-sm--letter-spacing': '0.1em',
  /* Native'in üstbaşlığı: telefonda üstbaşlık başlıkla aynı sütunda durur ve ondan yalnız harf aralığıyla ayrışır. `eyebrow`
     adı tabanda masaüstünün 14px'inde olduğu için ara ad; uygulamanın `eyebrow` farkı değerlerini buradan okur.
     BEKLEYEN(08.58): masaüstü `eyebrow` kullanımları yeni ada geçince taban `eyebrow` bu değerleri alır ve bu ara kademe kalkar. */
  'eyebrow-xs': '10px',
  'eyebrow-xs--font-weight': '700',
  'eyebrow-xs--letter-spacing': '0.18em',
  /* Büyük harfli küçük etiket — fotoğraf üstü kart etiketi, bölüm rozeti; kontrol öğesi, yuvarlanmaz. */
  'caps-label': '12px',
  'caps-label--font-weight': '600',
  'caps-label--letter-spacing': '0.12em',

  /* Rozet kademesi (fiyat çipi · TÜKENDİ · İNDİRİM · TOPTAN · TAKİP): üç ayrı kademeden devşirilse biri değiştiği gün rozet
     sessizce bozulurdu. Aralık `.06em`, çünkü rozet tek kelimedir ve üstbaşlığın geniş aralığında harfler dağılır. */
  badge: '12.5px',
  'badge--font-weight': '700',
  'badge--letter-spacing': '0.06em',
  'badge-sm': '10px',
  /* Yardımcı satır (sayaç, "KDV dahil"): 13'te dar ekranda gövdeyle karışıyor, 11,5'te okunmuyor. */
  helper: '12px',
  /* Uygulama ekran başlığı ve paket fiyat çipi: başlık yuvarlama kuralının bilinçli istisnası, çünkü telefon başlık çubuğu
     17'de tek satıra sığıyor (Token Kararlari #6). */
  'screen-title': '17px',
  'screen-title--font-weight': '600',
} as const satisfies Record<string, string>;

/**
 * Telefon görünümünün yazı adımı (px): müşteri yüzeyi her kademeyi bir adım büyük okur. Çarpan değil sabit ekleme, çünkü
 * kademeler arasındaki yarım piksel farklar karar taşıyor; `globals.css`in telefon ölçeği ve native `CUSTOMER_TEXT_STEP_UP` buna eşit tutulur.
 */
export const customerPhoneTextStepPx = 1;

/* ── §0.4c Köşe yarıçapları (`--radius-` öneki) ──────────────────────────────
   Mobilin resmî setinden (Token Kararlari #7) tabanda boş olan rozet ve kontrol kademeleri burada; aynı adı başka değerle
   taşıyan kart ve hap `customer-app.ts`te kalır, çünkü masaüstünü de değiştirirdi. */
export const customerRadius = {
  card: '18px', // kart, panel, yüzen sayfa
  soft: '14px', // BEKLEYEN(BACKLOG §5): resmî sette yok; görsel turda 12 ya da 16'ya yuvarlanacak
  pill: '26px', // hap düğme, çip, sayaç
  badge: '12px', // rozet, küçük etiket
  control: '16px', // buton, girdi, fırsat kartı
} as const satisfies Record<string, string>;

/* ── Hareketler (`--animate-` öneki) ─────────────────────────────────────────
   Değer CSS `animation` kısaltması; kare adları `globals.css`teki üst düzey `@keyframes` bloklarına bağlı. */
export const customerMotion = {
  'fade-in': 'fade-in 0.2s ease', // yer paneli açılışı
  pop: 'pop 0.24s ease', // bildirim hapı
  'sheet-in': 'sheet-in 0.22s ease', // mobil çekmecenin alttan girişi (Mobil v1 `sheetIn`)
} as const satisfies Record<string, string>;

/* ── Yüzen yüzey gölgeleri (`--shadow-` öneki) ───────────────────────────────
   `hard` ile `badge` iki yüzeyin ortak gölgesi: tanım burada, uygulama ailesi (`customerAppShadow`) buradan okur. */
/** Sert gölgenin kayması (px); gölge dizgesi bundan türer ki sayı ikinci kez yazılmasın. */
export const customerShadowOffset = 3;

export const customerShadow = {
  toast: '0 10px 30px rgb(47 53 58 / 0.3)', // bildirim hapının gölgesi
  menu: '0 14px 34px rgb(58 65 71 / 0.2)', // açılır menü (v1 hesap menüsü)
  dialog: '0 24px 64px rgb(47 53 58 / 0.36)', // ortalanmış pencere (v1 masaüstü adres penceresi)
  sheet: '0 -12px 40px rgb(47 53 58 / 0.28)', // mobil çekmecenin gölgesi (Mobil v1)
  /** Kaydırılmış, bulanıklığı olmayan mürekkep gölge: native'in imzası, web'de yüzen sepet düğmesi kullanır. */
  hard: `${customerShadowOffset}px ${customerShadowOffset}px 0 ${customerSurface.ink}`,
  /** Rozetin gölgesi; mürekkebi örtününki, çünkü `ink` fotoğrafın üstünde mavimsi gri kirli duruyordu. */
  badge: '0 3px 8px rgba(21, 23, 15, 0.22)',
  /** Anahtar düğmesinin topuzu; mürekkep karardaki eski #3a4147, `ink`e çekilmesi ayrı görsel karar. */
  soft: '0 1px 3px rgba(58, 65, 71, 0.08)',
  /** Ürün detayının sarkan fiyat rozeti; native `priceBadge` gölgesinin web ikizi, değer oradan aynen alındı. */
  price: '0 8px 20px rgba(52, 59, 65, 0.28)',
} as const satisfies Record<string, string>;
