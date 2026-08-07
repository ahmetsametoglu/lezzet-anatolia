/*
  MÜŞTERİ evreni token'ları — kaynak: design/project/Komponent Envanteri - Musteri.dc.html §0.
  Bu modül `apps/web/app/globals.css` `@theme` bloğunun TEK-KAYNAK karşılığıdır (21.3):
  isimler ve değerler CSS ile birebir — anahtar, custom property adının aile öneki
  (`--color-` / `--text-` / `--radius-`) atılmış hâlidir ve kayıpsız geri üretilir
  (`render-theme-css.ts`). Değerler bilerek CSS'te yazıldığı gibi STRING tutulur;
  birim/parse dönüşümü tüketicinin (Unistyles teması vb.) işidir, kaynağın değil.

  Her semantik aile DÖRT katman taşır: metin · koyu · zemin · kenarlık (+ grafik/nokta).
  KURAL (envanter §0): ham hex yasak — bir ton burada yoksa kodlanmaz, envantere eklenir.
  Karanlık mod yalnız operasyon yüzeyindedir (`operations.ts`); müşteri vitrini tek temalıdır.

  FONTLAR BİLEREK DIŞARIDA: `--font-sans` / `--font-serif` next/font'un ürettiği
  `var(--font-karla)` / `var(--font-lora)` değişkenlerine bağlanır (layout.tsx) — değerleri
  Next.js çalışma zamanında doğar, bu modülün taşıyabileceği sabitler değildir. Web'deki
  `@theme` üretiminde font satırları web tarafında kalır; RN tarafı fontlarını kendi
  yükleyicisiyle kurar. Parite testindeki açık istisna listesi bu karardır.
*/

/* ── §0.1 Yüzey ve mürekkep ──────────────────────────────────────────────────
   TEK MÜREKKEP kararı (envanter §0.5): #3a4147 · #3a3f35 · #333a3e · #4a5257 ·
   #3c4448 · #454d54 → hepsi `ink`. Ayrı bir `slate` token'ı YOK. */
export const customerSurface = {
  ink: '#343b41', // başlık, koyu blok zemini, birincil metin
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
  'sand-200': '#ece5d2', // standart çerçeve, kart kenarı
  'sand-300': '#e0d8c2', // girdi kenarı, 2. çerçeve
  'sand-400': '#d8cfb6', // belirgin çerçeve
  'sand-500': '#cdc4a8', // kesikli çerçeve, boş durum
  'sand-600': '#b3ab97', // pasif ikon, pasif metin
  'neutral-400': '#c9cdc2', // kapanmış/pasif rozet çerçevesi (soğuk)
} as const satisfies Record<string, string>;

/* ── §0.3 Semantik aileler — her biri metin · koyu · zemin · kenarlık ────────
   Zeytin: birincil aksiyon, olumlu, yolunda */
export const customerOlive = {
  olive: '#5f7a2c', // birincil buton, bağlantı, ikon
  'olive-dark': '#4a6121', // kutu başlığı, hover, basılı
  'olive-bg': '#eef2e2', // yeşil bant, olumlu rozet
  'olive-line': '#d7e3bd', // kutu ve seçili kart çerçevesi
  'olive-light': '#a9c46b', // koyu blok üstünde vurgu, ikon
} as const satisfies Record<string, string>;

/* Terracotta: fırsat/indirim — ve (bugünkü karar) hata/iptal. Ayrı koyu katman
   yok; `bright` hata metni için. Anlam ayrımı ton farkıyla kurulur. */
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

/* ── §0.4 Etkileşim durumları ────────────────────────────────────────────────
   Odak halkası ayrı renk taşımaz: 2px zeytin outline, 3px offset. */
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

/* Müşteri renklerinin tam kümesi — CSS dosya sırasıyla (`--color-` öneki). */
export const customerColors = {
  ...customerSurface,
  ...customerSand,
  ...customerOlive,
  ...customerTerracotta,
  ...customerHoney,
  ...customerClosed,
  ...customerInteraction,
} as const satisfies Record<string, string>;

/* ── §0.4 Tipografi ölçeği (`--text-` öneki) ─────────────────────────────────
   Envanter: Lora "h1 52/600 · h2 28/600 · kart başlığı 24/600"; Karla "gövde 14-18/400 ·
   etiket/buton 13-16/700 · üstbaşlık 13-14/600 harf aralıklı büyük harf".
   KURAL (renk kuralının ölçü karşılığı): ham `text-[NNpx]` YAZILMAZ — bir kademe burada yoksa
   kodlanmaz, envantere eklenir. BAŞLIK kademelerinde ara değerler (26 · 19 · 17 px) bilerek
   yuvarlanır — orada ölçü hiyerarşi kurar, kademe çoğaltmak onu görünmez yapar. KONTROL
   öğelerinde (çip, düğme, rozet) yuvarlama YOK: orada ölçü komşu öğeyle dengeyi belirler,
   yarım piksel bile satırı bozar (yaşandı — 27.07, katalog süzgeç satırı).
   `-sm` sonekli kademeler MOBİL karşılıklardır (cihaz forku: `md:` ile büyütme yok).

   `--line-height` / `--font-weight` / `--letter-spacing` sonekleri Tailwind v4'ün kademe
   alt-özellikleridir; anahtar adında AYNEN korunur ki CSS adı kayıpsız geri üretilsin. */
export const customerText = {
  h1: '52px',
  'h1--line-height': '1.15',
  'h1--font-weight': '600',
  'h1-sm': '30px',
  'h1-sm--line-height': '1.2',
  'h1-sm--font-weight': '600',

  /* Sayfa başlığı ("Katalog") — kahraman h1'i ile bölüm h2'si arasında ayrı bir kademe; liste
     sayfalarının tepesinde durur. Envanter §0.4'te yoktu, Katalog tasarımından geldi (web 38 · mobil 26). */
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
  /* Form alanı etiketi (K34: "üstte etiket 12,5px kalın"). Kendi kademesi olarak durur çünkü gövde
     ölçeğinin hiçbir durağı 12,5 değil ve alanın üstündeki künye ile içindeki değer aynı boyda
     olamaz. Ağırlık 600: 700 etiketi girdinin içeriğinden daha yüksek sesli yapıyordu. */
  'field-label': '12.5px',
  'field-label--font-weight': '600',
  control: '13.5px', // süzgeç ve sıralama düğmesi (K17 küçük · K18)
  'control--font-weight': '700',
  /* Adet seçicinin −/+ imleri. Kendi kademeleri: rakam gövde ölçeğinden (14/13) gelir ama imler bir
     tık büyüktür — dokunma hedefi rakamdan geniş olmalı. Sepet tasarımından geldi (web 16 · mobil 15). */
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
} as const satisfies Record<string, string>;

/* Köşe yarıçapları — §0.4: kart 18 · küçük kart 14-16 · buton/hap tam yuvarlak (`--radius-` öneki). */
export const customerRadius = {
  card: '18px',
  soft: '14px',
  pill: '26px',
} as const satisfies Record<string, string>;
