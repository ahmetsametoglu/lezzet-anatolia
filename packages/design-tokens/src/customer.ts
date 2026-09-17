/*
  MÜŞTERİ evreni token'ları — kaynak: design/project/Komponent Envanteri - Musteri.dc.html §0.
  Bu modül `apps/web/app/globals.css` `@theme` bloğunun TEK-KAYNAK karşılığıdır (21.3):
  isimler ve değerler CSS ile birebir — anahtar, custom property adının aile öneki (`--color-` /
  `--text-` / `--radius-` / `--animate-` / `--shadow-`) atılmış hâlidir ve kayıpsız geri üretilir
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

  ── MOBİL AYRIMI YAPISALDIR (kullanıcı kararı 07.08) ──────────────────────────────────
  Bu dosya YALNIZ CSS ikizini taşır. Mobil uygulamanın kendine-özgü token'ları (fark değerleri
  + mutabakatın yeni aileleri: error · scrim · shadow · gradient · brand · uygulama tipografisi)
  `customer-app.ts`te YAŞAR ve oradan kompozisyonla birleşir — `-app` sonekli melez adlar
  İPTAL edildi. Sonuç: mobil mutabakatı bu dosyayı hiç değiştirmez, dolayısıyla web'e görsel
  tur faturası çıkmaz; parite de istisnasız iki yönlü kalır (`parity.test.ts`).
  AD KURALI: buraya eklenen anahtar uygulama katmanlarında (`customer-app.ts`, `operations-app.ts`)
  BOŞ bir ad olmalı — aynı ad kompozisyonda uygulamanın tonuyla sessizce ezilir. 14.09: web v1'in
  `ink-deep` ve `sand-250`i bu yüzden `ink-hover` ve `sand-275` oldu (uygulamada ikisi de başka ton).

  ── TELEFON GÖRÜNÜMÜ TOKEN'I TABANA ÇIKARIR (kullanıcı kararı 14.09) ──────────────────────
  Müşterinin telefon tasarımı native uygulamada ve web'in telefon görünümünde AYNI oldu. Web telefon
  görünümünün kullandığı uygulama token'ı buraya çıkar ve `customer-app.ts`ten silinir; uygulama
  teması kompozisyonla AYNI değeri almaya devam eder — değer değişmez, yalnız evi değişir. Çıkanlar
  künyelerinde "(telefon, 14.09)" diye işaretli. Tabanda aynı adı BAŞKA değerle taşıyan fark
  token'ları (`sand-300` · `olive-line` · `on-image-soft` · `card` · `pill` · `eyebrow` …) bu yoldan
  çıkamaz: çıksalar masaüstü görünür biçimde değişirdi. Onlar masaüstü şeridiyle birlikte ele alınır
  (`docs/build/08-musteri-app.md` 08.58, Faz 0 madde 3).
*/

/* ── §0.1 Yüzey ve mürekkep ──────────────────────────────────────────────────
   TEK MÜREKKEP kararı (envanter §0.5): #3a4147 · #3a3f35 · #333a3e · #4a5257 ·
   #3c4448 · #454d54 → hepsi `ink`. Ayrı bir `slate` token'ı YOK. */
export const customerSurface = {
  ink: '#343b41', // başlık, koyu blok zemini, birincil metin
  'ink-hover': '#2b3238', // koyu hapın üzerine gelinmiş hâli (v1 sepet hapı)
  /* (telefon, 14.09) Örtü mürekkebinin KATI hâli (rgb 21,23,15) — Token Kararlari #19. `ink` yerine
     seçildi çünkü açık yeşil zeminde #343b41 mavimsi duruyor. */
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
  /* (telefon, 14.09) Token Kararlari #2'nin iki ara kademesi: krem zeminde "seçili" ve "kart"
     yüzeyleri 100 ile 300 arasında iki ayrı sıcaklık istiyor. */
  'sand-150': '#efdfc2', // seçili kart, özet paneli, bildirim zili zemini
  'sand-200': '#ece5d2', // standart çerçeve, kart kenarı
  /* Kararın "sand-100" diye adlandırdığı ton — o ad zaten #f0e9d6'nındı; resmî ad `sand-250`
     (skalada 200 ile 300 arasında boş bir ad, kullanıcı onayı 07.08). */
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

/* Terracotta: fırsat/indirim. Ayrı koyu katman yok; anlam ayrımı ton farkıyla kurulur.
   `terracotta-bright` bugün web masaüstü ekranlarında hata metni için de kullanılıyor; mobil uygulama
   ve web'in telefon görünümü hata için kendi ailesini taşır (`customerError` aşağıda — metin ve zemin;
   çerçevesi `customerAppError`, `customer-app.ts`). Masaüstünün hatada o aileyi alıp almayacağı web
   şeridinin görsel kararıdır — buradan zorlanmaz. */
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

/* Hata — (telefon, 14.09) Token Kararlari #3'ün metin ve zemin katmanı. Terracotta'ya katılmadı: terracotta
   fırsat/indirim demek; aynı ailede iki zıt anlam rozet renginin bilgi değerini sıfırlar. Telefon görünümü
   native'in "bu adrese gitmiyor" işaretini çiziyor (`StockMark` `blocked`). Üçüncü katman (`error-line`)
   yalnız uygulamanın — paylaşılan kitin kurye düğmesi (`customerAppError`). */
export const customerError = {
  error: '#a44a3f', // hata metni, "bu adrese gitmiyor" işareti
  'error-bg': '#f4e3e0', // hata kutusu, işaretin zemini
} as const satisfies Record<string, string>;

/* ── §0.4a Etkileşim durumları ───────────────────────────────────────────────
   Odak halkası ayrı renk taşımaz: 2px zeytin outline, 3px offset.
   NOT — envanterin §0.4'ü ÜÇ konuyu birden taşıyor (etkileşim durumları · tipografi ölçeği ·
   köşe yarıçapları); burada üç ayrı sabite bölündüler. Numara bu yüzden `a/b/c` ekiyle yürüyor:
   aynı numarayı çıplak taşıyan iki başlık "biri yanlış yazılmış" diye okunuyordu (07.08). */
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

/* ── Örtü (scrim) — Token Kararlari #5 · (telefon, 14.09) ────────────────────
   Yüzen katmanın ve fotoğraf üstü yazının arkasındaki koyu örtü: tek mürekkep (`ink-deep`in
   kendisi), dört yoğunluk. Opaklık ham yazılmaz, kademe adı kullanılır — "biraz daha koyu olsun"
   kararı tek yerden verilir. Operasyonun `ops-scrim`'inden AYRI: o temayla döner, bu dönmez.
   `.72` `.82`ye YUVARLANMAZ (Token Kararlari #18): `.82` metin koruma gradyanının ucudur ve işi
   fotoğrafı OKUNUR kılmak, `.72`nin işi fotoğrafı SOLDURMAK; aynı değere çekilseler "bu ürün
   alınamaz" bilgisi görsel olarak kaybolurdu. */
export const customerScrim = {
  'scrim-soft': 'rgba(21, 23, 15, 0.28)', // fotoğrafın üst kenarı, fotoğrafsız bant dairesi
  scrim: 'rgba(21, 23, 15, 0.45)', // sayfa örtüsü, yer işaretinin filigranı
  'scrim-72': 'rgba(21, 23, 15, 0.72)', // tükendi/pasif rozetinin zemini
  'scrim-heavy': 'rgba(21, 23, 15, 0.82)', // fotoğrafın alt kenarı, üstünde başlık okunur
} as const satisfies Record<string, string>;

/* ── Marka işaretleri — Token Kararlari #5 · (telefon, 15.09) ─────────────────
   Palete AİT DEĞİL: üçüncü tarafların kendi renkleri, temayla dönmez. Giriş ekranının iki sağlayıcı işareti
   telefon görünümüyle tabana çıktı (web telefon girişi, `Musteri Mobil.dc.html` "Hızlı Doğrulama"): Google
   düğmesinin "G"si ve WhatsApp'ın kanonik yeşili. AD ÇARPIŞMASI: `brand-whatsapp` adı operasyonun koyultulmuş
   ikon yeşiline (#128c4b, `operations.ts`) ait — aynı CSS adı iki değer taşıyamaz; kanonik yeşil Token Kararlari
   #21 ile `brand-whatsapp-pure` adını aldı, ikisi aynı markanın iki bağlamdaki tonu. */
export const customerBrand = {
  'brand-whatsapp-pure': '#25d366', // giriş: WhatsApp düğmesinin ikonu
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
  /* (telefon, 14.09) DÜĞME ETİKETİ — native birincil düğmenin kademesi (hap ve blok). `chip` (14) ve
     `control` (13,5) ile birleştirilMEdi: dokunma hedefinin etiketi çipten kalın durmalı ve kontrol
     kademelerinde yuvarlama yok. Telefon görünümü native düğmeyi çizdiği için uygulamadan tabana çıktı. */
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
  /* (telefon, 14.09) NATIVE'İN ÜSTBAŞLIĞI — 10px · 700 · .18em: telefonda üstbaşlık başlıkla aynı
     sütunda durur ve ondan ancak harf aralığıyla ayrışır. Adı `eyebrow` olmalıydı ama o ad tabanda
     masaüstünün 14px'i; telefon görünümü bu kademeyi okur ve uygulamanın `eyebrow` farkı değerlerini
     BURADAN alır (iki yazım bir gün ayrışırdı).
     BEKLEYEN(08.58): masaüstü `eyebrow` kullanımları yeni ada geçince taban `eyebrow` bu değerleri alır ve bu ara kademe kalkar. */
  'eyebrow-xs': '10px',
  'eyebrow-xs--font-weight': '700',
  'eyebrow-xs--letter-spacing': '0.18em',
  /* Fotoğraf üstündeki kart etiketi ("KOLEKSİYON") — kontrol öğesi, yuvarlanmaz. */
  'photo-tag': '12px',
  'photo-tag--font-weight': '600',
  'photo-tag--letter-spacing': '0.12em',

  /* ROZET kademesi — Token Kararlari #16 · (telefon, 14.09). Native v3'ün en çok yinelenen öğesinin
     (fiyat çipi · TÜKENDİ · İNDİRİM · TOPTAN · TAKİP) kendi kademesi; önce üç ayrı kademeden
     devşiriliyordu ve biri değiştiği gün rozet sessizce bozulurdu. Aralık `.06em`: rozet tek
     kelimedir, üstbaşlığın geniş aralığında harfler dağılıyordu. Küçük rozet yalnız ÖLÇÜ farkıdır —
     ağırlık ve aralık `badge`inkinden okunur, ikinci kez yazılmaz. */
  badge: '12.5px',
  'badge--font-weight': '700',
  'badge--letter-spacing': '0.06em',
  'badge-sm': '10px',
  /* (telefon, 14.09) Yardımcı satır — sayaç, "KDV dahil" gibi ikinci sesli bilgi. `note` (13) ile
     `micro` (11,5) arasında kendi durağı: dar ekranda 13'te gövdeyle karışıyor, 11,5'te okunmuyor. */
  helper: '12px',
  /* (telefon, 14.09) Uygulama ekran başlığı ve paket fiyat çipi (Lora 600). Yukarıdaki "başlık
     kademelerinde ara değerler yuvarlanır" kuralının BİLİNÇLİ istisnası: Token Kararlari #6'nın açık
     hükmü "17 resmîdir, 18'e yuvarlama yok" — telefon başlık çubuğu 17'de tek satıra sığıyor. */
  'screen-title': '17px',
  'screen-title--font-weight': '600',
} as const satisfies Record<string, string>;

/**
 * TELEFON GÖRÜNÜMÜNÜN YAZI ADIMI (px) — müşterinin telefon ekranları her yazı kademesini bu kadar
 * büyük okur. Native'de 18.08'den beri böyle (kullanıcı kararı: müşteri yüzeyi bir kademe büyük okur);
 * web'in telefon görünümü native tasarımı alınca aynı adım ona da verildi (kullanıcı kararı 14.09).
 *
 * SABİT EKLEME, çarpan değil: kademeler arasındaki yarım piksel farklar karar taşıyor (kontrol 13,5 ↔
 * gövde 14) ve sabit ekleme onları birebir korur. Web'de `globals.css`in telefon ölçeği bloğu bundan
 * türer (`flattenPhoneTextTokens`, parite testi kilitler); native temanın adımı (`CUSTOMER_TEXT_STEP_UP`)
 * bu sayıyla eşit tutulur (mobile-kit tema testi).
 */
export const customerPhoneTextStepPx = 1;

/* ── §0.4c Köşe yarıçapları (`--radius-` öneki · aynı envanter bölümü) ───────
   Envanter: kart 18 · küçük kart 14-16 · buton/hap tam yuvarlak (radius ≥ 22px).
   Mobil mutabakatının RESMÎ SETİ (Token Kararlari #7: rozet 12 · buton/girdi 16 · kart 20 ·
   hap 22): tabanda BOŞ olan iki kademesi (rozet · kontrol) telefon görünümüyle buraya çıktı
   (14.09); aynı adı başka değerle taşıyan ikisi (kart · hap) `customer-app.ts`te kalır — onlar
   masaüstünü de değiştirir. `soft: 14` kararın "mevcut kademeler bu sete yuvarlanacak" hükmünün
   bekleyen tarafıdır (ayrı görsel tur; toplu değişim regresyon riski taşıdığı için o turda yapılacak). */
export const customerRadius = {
  card: '18px', // kart, panel, yüzen sayfa
  soft: '14px', // BEKLEYEN(BACKLOG §5): resmî sette yok; görsel turda 12 ya da 16'ya yuvarlanacak
  pill: '26px', // hap düğme, çip, sayaç
  badge: '12px', // (telefon, 14.09) rozet, küçük etiket
  control: '16px', // (telefon, 14.09) buton, girdi, fırsat kartı
} as const satisfies Record<string, string>;

/* ── v1 hareketleri (`--animate-` öneki · 13.09) ─────────────────────────────
   Web v1'in `fadeIn` / `pop` / `sheetIn` kareleri. Değer CSS `animation` kısaltmasıdır; kare
   adları globals.css'teki üst düzey `@keyframes` bloklarına bağlı (bloklar `@theme`in dışında). */
export const customerMotion = {
  'fade-in': 'fade-in 0.2s ease', // yer paneli açılışı
  pop: 'pop 0.24s ease', // bildirim hapı
  'sheet-in': 'sheet-in 0.22s ease', // mobil çekmecenin alttan girişi (Mobil v1 `sheetIn`)
} as const satisfies Record<string, string>;

/* ── Yüzen yüzey gölgeleri (`--shadow-` öneki · 13.09) ───────────────────────
   Web v1'in bildirim hapı, açılır menüsü, ortalanmış penceresi ve mobil çekmecesi. Mobil
   uygulamanın gölge ailesi ayrı (`customerAppShadow`: soft · hard · badge); `hard` ile `badge` İKİ
   yüzeyin ortak gölgesi (14.09) — tanım burada, uygulama ailesi onları buradan okur. */
/**
 * Sert gölgenin KAYMA MİKTARI (px) — gölge dizgesi bundan türer, sayı ikinci kez yazılmaz.
 * Uygulama tarafı aynı ölçüyü `customerAppShadowOffset` adıyla dışarı verir (basılı durumun
 * kayması ve gölgenin taşma payı onu okur).
 */
export const customerShadowOffset = 3;

export const customerShadow = {
  toast: '0 10px 30px rgb(47 53 58 / 0.3)', // bildirim hapının gölgesi
  menu: '0 14px 34px rgb(58 65 71 / 0.2)', // açılır menü (v1 hesap menüsü)
  dialog: '0 24px 64px rgb(47 53 58 / 0.36)', // ortalanmış pencere (v1 masaüstü adres penceresi)
  sheet: '0 -12px 40px rgb(47 53 58 / 0.28)', // mobil çekmecenin gölgesi (Mobil v1)
  /** Native v3'ün imzası: kaydırılmış, bulanıklığı olmayan mürekkep gölge. Telefon görünümü native
      tasarımı aldığı için (kullanıcı kararı 14.09) web'e de gerekti — yüzen sepet düğmesi. */
  hard: `${customerShadowOffset}px ${customerShadowOffset}px 0 ${customerSurface.ink}`,
  /** (telefon, 14.09) Rozetin KENDİ gölgesi — Token Kararlari #16'nın tek durağı. Rozet fotoğrafın
      ya da kartın üstünde yüzer; mürekkebi örtününki, çünkü `ink` fotoğrafın üstünde mavimsi gri
      kirli duruyordu. */
  badge: '0 3px 8px rgba(21, 23, 15, 0.22)',
  /** (telefon, 14.09) Klasik yükseklik gölgesi (Token Kararlari #5, Mobil v2 ölçümü) — anahtar düğmesinin
      topuzu. Mürekkebi ESKİ #3a4147: karar metnindeki değer aynen, `ink`e çekilmesi ayrı görsel tur. */
  soft: '0 1px 3px rgba(58, 65, 71, 0.08)',
  /** (telefon, 14.09) Ürün detayının SARKAN fiyat rozeti — native kahramanın `priceBadge` gölgesi (mürekkep %28,
      20 bulanıklık, 8 aşağı). Native bileşende ham yazıyor; web ikizi token ister, değer oradan aynen alındı. */
  price: '0 8px 20px rgba(52, 59, 65, 0.28)',
} as const satisfies Record<string, string>;
