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

  ── GEÇİŞ HÂLİ (07.08, `design/project/Mobil - Token Kararlari.md`) ────────────────────
  Mobil mutabakatının 13 kararı bu modüle işlendi: mobilde ölçülen değerler token'ın RESMÎ
  değeri oldu ve mobilin ihtiyaç duyduğu aileler (error · scrim · shadow · photo-gradient ·
  brand) eklendi. `globals.css` HENÜZ eski değerlerde ve yeni token'ları taşımıyor — sapma
  gizlenmiyor, parite testinde BEYAN ediliyor (`TRANSITION` + `MOBILE_ONLY` listeleri) ve web
  senkronu `docs/talep/musteri-token-senkronu.md` ile isteniyor. Web çekilince o listeler
  boşalır; boşalmayan satır çürümedir.
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
  /* Token Kararlari #2 — mobilde resmileşen ara kademe. Skalanın arasına giriyor çünkü mobilde
     "seçili" durumu krem zeminde 100 ile 200 arasında bir sıcaklık istiyor. */
  'sand-150': '#efdfc2', // seçili kart, özet paneli, puan zemini (mobil)
  'sand-200': '#ece5d2', // standart çerçeve, kart kenarı
  /* AD ÇARPIŞMASI ÇÖZÜMÜ: Token Kararlari #2 bu tonu "sand-100" diye adlandırmıştı, ama
     `sand-100` ZATEN #f0e9d6'nın adı (web vurgulu bölüm bandı). Resmî ad `sand-250` — skalada
     200 ile 300 arasında; KULLANICI ONAYLADI (07.08). Karar dosyasındaki "sand-100" yazımının
     düzeltilmesi Claude Design kanalından. */
  'sand-250': '#ece3c8', // kart zemini (mobil)
  'sand-300': '#e2d8bd', // girdi kenarı, 2. çerçeve (Token Kararlari #3: mobil değer resmî)
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
  'olive-line': '#cddbb0', // kutu ve seçili kart çerçevesi (Token Kararlari #3: mobil değer resmî)
  'olive-light': '#a9c46b', // koyu blok üstünde vurgu, ikon
} as const satisfies Record<string, string>;

/* Terracotta: fırsat/indirim. Ayrı koyu katman yok; anlam ayrımı ton farkıyla kurulur.
   HATA ARTIK BURADA DEĞİL (Token Kararlari #3): hata/iptal kendi ailesine taşındı (aşağıda
   `customerError`). `terracotta-bright` yerinde duruyor çünkü web ekranları bugün onu hata
   metni için kullanıyor ve değeri CSS'te — yeni kodda hata için `error` kullanılır; ikisinin
   tek tona indirilmesi web senkron turunun işi. */
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
  star: '#d9a441', // dolu yıldız, puan göstergesi (Token Kararlari #3: mobil değer resmî)
} as const satisfies Record<string, string>;

/* HATA — kendi ailesi (Token Kararlari #3). Terracotta'ya KATILMADI: terracotta fırsat/indirim
   demek ve aynı ailede iki zıt anlam taşımak (kampanya + hata) rozet renginin bilgi değerini
   sıfırlar. İki katman yeter: metin + zemin; kenarlık hâlâ `terracotta-line` ile çiziliyor,
   üçüncü katman gerçek bir ihtiyaç doğunca eklenir (bugün olmayanı token'lamıyoruz). */
export const customerError = {
  error: '#a44a3f', // hata metni, iptal/başarısız etiketi
  'error-bg': '#f4e3e0', // hata kutusu, başarısız ödeme zemini
} as const satisfies Record<string, string>;

/* Nötr: kapanmış, teslim edildi, pasif — kendi tonu yok, skaladan türer */
export const customerClosed = {
  closed: '#6d7261', // kapanmış durum etiketi (= body)
  /* Token Kararlari #3: mobil değer resmî. `sand-100` ile eşitliği BOZULDU — kapanmış rozet
     artık kendi tonunu taşıyor (bir tık daha gri), bant zemini sand-100'de kaldı. */
  'closed-bg': '#e9e2cf', // kapanmış rozet arkası
  'closed-line': '#c9cdc2', // pasif çerçeve (= neutral-400)
} as const satisfies Record<string, string>;

/* ── §0.4a Etkileşim durumları ───────────────────────────────────────────────
   Odak halkası ayrı renk taşımaz: 2px zeytin outline, 3px offset.
   NOT — envanterin §0.4'ü ÜÇ konuyu birden taşıyor (etkileşim durumları · tipografi ölçeği ·
   köşe yarıçapları); burada üç ayrı sabite bölündüler. Numara bu yüzden `a/b/c` ekiyle yürüyor:
   aynı numarayı çıplak taşıyan iki başlık "biri yanlış yazılmış" diye okunuyordu (07.08). */
export const customerInteraction = {
  'hover-bg': '#f3efe2', // liste/kart hover (= sand-50)
  'disabled-fill': '#b9b29e', // tükendi/disabled buton zemini (Token Kararlari #3: mobil değer resmî)
  'disabled-line': '#c9cdc2', // pasif girdi ve çip çerçevesi
  'disabled-text': '#8a8270', // disabled buton ve girdi metni (= muted)

  /* Giriş ekranı kahraman gradyanı — bal → zeytin-kavı → mürekkep. Ara durak
     (#6f7d3f) envanterde bir aile tonu değil, yalnız bu geçişin orta noktası;
     ham hex koda dağılmasın diye tek yerde durur. */
  'hero-mid': '#6f7d3f',
} as const satisfies Record<string, string>;

/* ── §0.4a-ek ÖRTÜ (scrim) — Token Kararlari #5 ──────────────────────────────
   Yüzen katmanın ve fotoğraf üstü yazının arkasındaki koyu örtü. Tek renk (rgb 21,23,15 —
   krem paletin altındaki en koyu yeşilimsi siyah), ÜÇ yoğunlukta; opaklığı ham yazmak yerine
   kademe adı kullanılır, böylece "biraz daha koyu olsun" kararı tek yerden verilir.
   Operasyonun `ops-scrim`'inden AYRI: o tema ile döner (koyu modda derinleşir), bu dönmez —
   müşteri vitrini tek temalıdır ve örtü her hâlde fotoğrafın üstündedir. */
export const customerScrim = {
  'scrim-soft': 'rgba(21, 23, 15, 0.28)', // fotoğrafın ÜST kenarı, hafif karartma
  scrim: 'rgba(21, 23, 15, 0.45)', // sayfa örtüsü (sheet/dialog arkası)
  'scrim-heavy': 'rgba(21, 23, 15, 0.82)', // fotoğrafın ALT kenarı, üstünde başlık okunur
} as const satisfies Record<string, string>;

/* ── MARKA renkleri — Token Kararlari #5 ─────────────────────────────────────
   Palete AİT DEĞİL: üçüncü tarafların kendi renkleri. Semantik ailelere karışmazlar (bir
   marka yeşili "olumlu" demek değildir) ve temayla dönmezler — döndükleri an marka olmaktan
   çıkarlar. Token olarak duruyorlar ki ham hex ikon/rozet gövdesine dağılmasın (CLAUDE §3).
   Operasyondaki `brand-whatsapp` ile aynı ad alanını paylaşırlar; çakışma notu aşağıda. */
export const customerBrand = {
  /* AD ÇARPIŞMASI: Token Kararlari #5 bunu "brand-whatsapp" diye yazmıştı, ama o ad ZATEN
     operasyonun koyultulmuş ikon yeşiline (#128c4b) ait — aynı CSS adı iki değer taşıyamaz
     (`render-theme-css.ts` üretimde fırlatır). Geçici resmî ad `brand-whatsapp-pure`:
     WhatsApp'ın kanonik marka yeşili. Tasarım onayı bekleniyor (iki adın tek ada indirilmesi
     ya da operasyon tonunun `brand-whatsapp-ink` gibi ayrılması). */
  'brand-whatsapp-pure': '#25d366',
  'brand-google': '#4285f4', // Google ile giriş düğmesi
  /* Apple Pay / Apple ile giriş — ham siyah. `ink`e ÇEKİLMEZ: marka işareti paletin mürekkebi
     değildir ve Apple'ın kılavuzu tam siyah ister. */
  'brand-apple': '#000000',
  'brand-stripe': '#635bff', // ödeme sağlayıcı künyesi
  'brand-visa': '#1a1f71',
  /* Mastercard tek renk değil, iç içe iki halka: kırmızı + sarı. İkisi de token, çünkü işaret
     ancak ikisiyle birlikte doğru çizilir. */
  'brand-mastercard': '#eb001b',
  'brand-mastercard-alt': '#f79e1b',
} as const satisfies Record<string, string>;

/* Müşteri renklerinin tam kümesi — CSS dosya sırasıyla (`--color-` öneki). */
export const customerColors = {
  ...customerSurface,
  ...customerSand,
  ...customerOlive,
  ...customerTerracotta,
  ...customerHoney,
  ...customerError,
  ...customerClosed,
  ...customerInteraction,
  ...customerScrim,
  ...customerBrand,
} as const satisfies Record<string, string>;

/* ── §0.4b Tipografi ölçeği (`--text-` öneki · aynı envanter bölümü) ─────────
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

  /* Uygulama başlık kademeleri (Token Kararlari #6) — Lora 600. Web'in `card-title-sm`i (18px)
     ile yuvarlanMAdılar: kararın açık hükmü "17 resmîdir, 18'e yuvarlama yok". Gerekçe cihazda
     görünür — telefon başlık çubuğu 17'de tek satıra sığıyor, 18'de kırılıyor.
     `sheet-title` yüzen sayfanın (bottom sheet) başlığı; ekran başlığından bir kademe yüksek
     çünkü sheet açıkken ekranın kendisi arka plana düşer. */
  'screen-title': '17px', // uygulama ekran başlığı (Lora 600)
  'screen-title--font-weight': '600',
  'sheet-title': '19px', // yüzen sayfa başlığı (Lora 600)
  'sheet-title--font-weight': '600',

  /* Gövde kademeleri: kahraman paragrafı → kart metni → yardımcı satır → mobil alt satır. */
  lead: '18px',
  'lead--line-height': '1.6',
  body: '15px',
  /* Envanterin "gövde 14-18" aralığının tabanı — sonuç sayısı gibi yardımcı bilgi satırları. */
  'body-sm': '14px',
  note: '13px',
  /* Yardımcı satır (Token Kararlari #6) — alan altı açıklaması, sayaç, "KDV dahil" gibi ikinci
     sesli bilgi. `note` (13) ile `micro` (11.5) arasında kendi durağı var çünkü uygulamada bu
     rol dar ekranda 13'te gövdeyle karışıyor, 11.5'te okunmuyor. */
  helper: '12px',
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
  /* Uygulama düğme etiketi (Token Kararlari #6) — `chip` (14) ve `control` (13.5) ile
     birleştirilMEdi: dokunma hedefinin etiketi çipten kalın durmalı, yarım piksel burada da
     komşu öğeyle hizayı belirliyor (kontrol kademelerinde yuvarlama yok kuralı). */
  button: '14.5px',
  'button--font-weight': '700',
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
  /* UYGULAMA üstbaşlığı (Token Kararlari #6) — 10px/700/.18em. Mevcut kademelere KATILMADI:
     `eyebrow-sm` web'in mobil forkudur (11px/600/.1em) ve ona dokunmak yaşayan web ekranlarını
     değiştirirdi. Uygulamadaki rol farklı — daha küçük, daha kalın, daha aralıklı: telefonda
     üstbaşlık başlıkla aynı sütunda durur ve ondan ancak harf aralığıyla ayrışır.
     `-app` soneki bu modülde ÜÇÜNCÜ bağlamı işaretler: sonek yok = web masaüstü, `-sm` = web'in
     mobil forku, `-app` = RN uygulaması. */
  'eyebrow-app': '10px',
  'eyebrow-app--font-weight': '700',
  'eyebrow-app--letter-spacing': '0.18em',
} as const satisfies Record<string, string>;

/* ── §0.4c Köşe yarıçapları (`--radius-` öneki · aynı envanter bölümü) ───────
   Envanter: kart 18 · küçük kart 14-16 · buton/hap tam yuvarlak (radius ≥ 22px).
   RESMÎ SET (Token Kararlari #7) dört kademedir: rozet 12 · buton/girdi 16 · kart 20 · hap 22.
   `card` 18→20 ve `pill` 26→22 DEĞER DEĞİŞİKLİĞİDİR; web henüz eski değerlerde (parite
   testindeki `TRANSITION` listesi).
   `soft: 14` sette YOK ama şimdilik duruyor: karar "mevcut 9 kademenin kalanları bu sete
   yuvarlanacak — ayrı görsel tur olarak, toplu değişim regresyon riski taşıdığından bu turda
   yalnız kural ilan edildi" diyor. Yani `soft` bilinçli bir artık; o tur gelince ya 12'ye ya
   16'ya çekilip silinecek. */
export const customerRadius = {
  badge: '12px', // rozet, küçük etiket
  soft: '14px', // BEKLEYEN(BACKLOG §5): resmî sette yok; görsel turda 12 ya da 16'ya yuvarlanacak
  control: '16px', // buton, girdi, seçim kutusu
  card: '20px', // kart, panel, yüzen sayfa
  pill: '22px', // hap düğme, çip, sayaç
} as const satisfies Record<string, string>;

/* ── GÖLGELER (`--shadow-` öneki) — Token Kararlari #5 ───────────────────────
   İki gölge var, ikisi de tasarımda ölçülmüş değerler:
   · `soft` — klasik yükseklik gölgesi (kaynak: Mobil - Musteri v2, 18 kullanım).
     NOT: rgb(58,65,71) ESKİ mürekkeptir (#3a4147); karar #1 o rengi `ink`e (#343b41) çekti ama
     gölge değerini AYNEN yazdı. %8 opaklıkta iki mürekkep ayırt edilemediği için karar metnine
     sadık kalındı — `ink`e çekilmesi ayrı görsel turun işi, sessizce değiştirilmedi.
   · `hard` — v3'ün imzası: kaydırılmış, bulanıklığı olmayan mürekkep gölge (26 kullanım).
     Değeri `ink`ten TÜRETİLİR, ikinci kez yazılmaz: mürekkep değişirse gölge de değişir.
     Basılı durumda öğe `translate(2px,2px)` ile bu gölgeyi yutar (karar #8). */
export const customerShadow = {
  soft: '0 1px 3px rgba(58, 65, 71, 0.08)',
  hard: `3px 3px 0 ${customerSurface.ink}`,
} as const satisfies Record<string, string>;

/* ── FOTOĞRAF GRADYANLARI (`--gradient-` öneki) — Token Kararlari #5 ──────────
   Fotoğrafın üstündeki yazının okunmasını sağlayan iki skrim; kaynak Mobil - Musteri v3'teki
   ölçülmüş değerler (üstte .28 → şeffaf %32, altta şeffaf %40 → .82). Renk durakları `scrim`
   ailesiyle AYNI mürekkeptir ama token olarak ayrı durmaları gerekiyor: taşıdıkları yeni bilgi
   renk değil, DURAK YERİ (yüzde) ve yön.
   Şeffaf durak `rgba(…, 0)` yazılır, `transparent` değil — `transparent` bazı motorlarda
   "şeffaf SİYAH" demektir ve geçişin ortasını griye kirletir.
   RN tarafı bu dizgeleri doğrudan kullanamaz (expo-linear-gradient renk + durak DİZİSİ ister);
   çeviri tüketicinin işidir — bkz. modül başlığındaki "birim/parse dönüşümü" kuralı. */
export const customerGradient = {
  'photo-top': 'linear-gradient(180deg, rgba(21, 23, 15, 0.28), rgba(21, 23, 15, 0) 32%)',
  'photo-bottom': 'linear-gradient(180deg, rgba(21, 23, 15, 0) 40%, rgba(21, 23, 15, 0.82))',
} as const satisfies Record<string, string>;
