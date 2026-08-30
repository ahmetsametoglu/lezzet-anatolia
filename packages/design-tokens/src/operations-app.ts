/*
  OPERASYON MOBİL — operasyon yüzeyinin uygulamaya-özgü token'ları (21.9).
  Kaynak: `design/project/Operasyon Mobil v2.dc.html` (20 ekran: kurye · depo · yönetim · para).

  HANGİ EVREN — ölçüldü, varsayılmadı: web operasyonunun "Veri Masası" seti (`operations.ts`;
  Space Grotesk/mono, soğuk gri skala, karanlık mod) DEĞİL. Tasarımın paleti MÜŞTERİ evrenidir —
  #343b41 `ink` · #5f7a2c `olive` · #4a6121 `olive-dark` · #b05c2e `terracotta` · #f9ede2
  `terracotta-bg` · #8a8270 `muted` · #6d7261 `body` · #cdc4a8 `sand-500` · #b3ab97 `sand-600` ·
  #f5f1e6 `on-image` hepsi TABANDAN birebir çıkıyor. Dahası #a44a3f `error` · #f4e3e0 `error-bg` ·
  #b9b29e `disabled-fill` · #efdfc2 `sand-150` YALNIZ `customer-app.ts`te yaşar: tasarımın bu dört
  değeri kullanması, operasyon mobilin müşteri UYGULAMASININ üstüne kurulu bir ALT EVREN olduğunun
  kanıtıdır. Bu yüzden bu dosya yalnız FARKI taşır, evreni yeniden kurmaz.

  KOMPOZİSYON — üç katman, aynı addaki anahtarda EN SON katman kazanır:
      { ...customerColors, ...customerAppColors, ...operationsAppColors }
      { ...customerText,   ...customerAppText,   ...operationsAppText   }
      { ...customerRadius, ...customerAppRadius, ...operationsAppRadius }
  Birleştirme TÜKETİCİNİN işidir (Unistyles teması, `apps/mobile/src/theme/unistyles.ts`) — kaynak
  paket tema kurmaz. Web'e SIFIR etki: bu dosya `globals.css` ikizinin parçası değildir,
  `render-theme-css.ts` onu basmaz, parite testi hiç görmez (aynı gerekçe: `customer-app.ts`).

  ÖLÇÜM DIŞI (canvas chrome — CLAUDE §3): `body { background:#dedbd3 }` ve 390×820 telefon kutusu
  (28px köşe + `0 8px 40px rgba(58,65,71,.16)` gölge) tasarım tuvalinin çerçevesidir, arayüz değil.
  Envantere girmezler; #dedbd3'ün web operasyonunun `ops-bg`i olması da tesadüf değil, tuvalin
  masaüstü zeminine oturtulmuş olmasıdır.

  ── YENİ DURAK EŞİĞİ (bu dosyanın kuralı) ──────────────────────────────────────────────
  Ölçülen bir değer, birleşimde ZATEN duran bir durağa kanal başına ≤8 yakınsa yeni anahtar
  AÇILMAZ: var olan durak kullanılır, ölçüm buraya gerekçesiyle yazılır. Sebep somut — 4/2/6
  uzaklıktaki iki kenarlık tonu ekranda ayırt EDİLEMEZ ama token setinde iki ayrı ad olarak yaşar
  ve bir gün "hangisi doğru?" sorusunu doğurur. Envanterin TEK MÜREKKEP kararı (altı mürekkep →
  tek `ink`) aynı disiplinin daha büyük ölçekli hâliydi. Eşiğin altında kalan ölçümler ve
  devraldıkları durak:
    · #c9c2ae standart kenarlık (48 kullanım) → `sand-500` (#cdc4a8, Δ4/2/6). Tasarım AYNI rolde
      #cdc4a8'i de kullanıyor (boş durak dairesinin çemberi) — iki ton zaten tek işi yapıyor.
    · #ddd6c4 satır ayracı / ince hat (29)    → `sand-300` (uygulamada #e2d8bd, Δ5/2/7)
    · #cdd8b6 zeytin çip kenarı (2)           → `olive-line` (uygulamada #cddbb0, Δ0/3/6)
    · #e2ddcc ilerleme çubuğu izi (1)         → bu dosyanın `neutral-bg`i (#e7e2d2, Δ5/5/6)
    · #b8b09a koyu CTA gölgesi (2)            → `sand-600` (#b3ab97, Δ5/5/3); `hard-on-ink` içinde
    · rgba(242,240,232,.96) sekme çubuğu      → `cream-glass` (rgba(243,239,226,.96) — taban rengi
      Δ1/1/6) + `customerAppBlur.glass` (8px; tasarımdaki `blur(8px)` ile BİREBİR)
    · .04em harf aralığı (2)                  → `badge--letter-spacing` (.06em) — 11px yazıda fark
      0,22 px'tir; ölçülemeyen bir ayrım için üçüncü bir aralık token'ı açılmaz.
  Eşik YENİ ANAHTAR açmayı yönetir, FARK'ı (override) değil: fark ikinci bir durak yaratmaz, var
  olan rolün değerini ölçülene çeker. Eşiğin altında kalıp yine de kendi anahtarını alan TEK durak
  `neutral-bg`dir; gerekçesi değerde değil ROLDE ve kendi yorumunda yazılıdır — kural sessizce
  esnetilmedi, istisnası burada ilan edildi.

  ── BİREBİR AYNI ÇIKANLAR: KOPYALANMADI ────────────────────────────────────────────────
  Tasarımın kullandığı 27 hex'in 15'i birleşimde zaten AYNI değerle var; hiçbiri bu dosyaya
  yazılmadı (yazılsaydı tek bir tonun iki adı olurdu). Roller aynı olmadığı yerde eşleme şudur:
    · #ffffff → `card`      : girdi ve imza tuvali zemini (tabanın rolü) + DOLU düğme/çip METNİ.
                              İkinci rolün tabanda adı yok; aynı değeri ikinci bir adla yazmak
                              yerine burada belgelenir.
    · #f5f1e6 → `on-image`  : koyu zemin üstünde krem metin (çevrimdışı bandı, koyu CTA etiketi,
                              sıradaki durak rozeti). Tabanda rol "fotoğraf üstü" diye anılır;
                              operasyon mobilde fotoğraf yok, koyu YÜZEY var — değer aynı iş.
    · #efdfc2 → `sand-150`  : koyu CTA içindeki sayaç rozetinin metni.
    · #b9b29e → `disabled-fill` · #a44a3f → `error` · #f4e3e0 → `error-bg` (tümü mobil müşteri seti)
    · #cdc4a8 → `sand-500` · #b3ab97 → `sand-600` (yön oku "›") · #6d7261 → `body` · #8a8270 →
      `muted` · #343b41 → `ink` · #5f7a2c → `olive` · #4a6121 → `olive-dark` · #b05c2e →
      `terracotta` · #f9ede2 → `terracotta-bg`
  MARKA: WhatsApp ikonunun #128c4b'si de yeni değil — `operationsBrand['brand-whatsapp']` TAM
  olarak bu değerdir ve gerekçesi de aynıdır (koyultulmuş ikon yeşili, operasyon bağlamı). Marka
  renkleri palete ait olmadığı için önekleri de yoktur; operasyon mobil teması o tek anahtarlı
  ihracı doğrudan yayar. `customer-app.ts`teki `brand-whatsapp-pure` (#25d366) AYRI bir kayıttır —
  müşteri uygulamasının kanonik marka yeşili; ikisi tek ada indirilmedi, indirilmemeli.

  Değerler tabandaki gibi CSS dizgesi tutulur ("20px", "rgba(…)"); birim/parse dönüşümü tüketicinin
  işidir. Karanlık mod YOK: operasyonun karanlık teması masaüstü yüzeyinindir (`operations.ts`);
  mobil operasyon müşteri ailesinin krem zemininde kurulu ve tek temalıdır.
*/
import { customerSand } from './customer';

/* ── (1) FARK RENKLERİ — birleşimde tabanın aynı adlı anahtarını EZER ─────────
   İkisi de ROL olarak tabandakiyle birebir aynı işi yapar, yalnız değerleri operasyon mobilde
   ölçülmüştür. Yeni ad açılmadı: aynı rolün iki adı olsaydı çağıran hangisini seçeceğini
   tasarımdan değil tahminden bulurdu. Küçük ayak izi kuralı gereği `customer.ts` DEĞİŞMEDİ —
   web ve müşteri uygulaması kendi değerlerini görmeye devam eder. */
export const operationsAppOverrides = {
  /* Sayfa zemini. Taban #faf6ec (sıcak krem); operasyon mobil bir tık daha soğuk ve koyu bir krem
     kullanıyor. Fark ekranın işinden doğuyor: bu yüzeyde kart (`panel` #fbfaf4) neredeyse beyazdır
     ve taban değeri korunsaydı sayfa ile kart arasında Δ1/4/8 kalırdı — yani KART GÖRÜNMEZDİ.
     Ölçülen değerle aradaki basamak Δ9/10/12'ye çıkıyor ve yüzey hiyerarşisi ayakta duruyor.
     Yapışkan CTA'nın altındaki solma gradyanı da bu değerden türer.
     `sand-25` bilerek ezilmedi (o skalanın durağıdır, bu rolün kendisi); tabandaki `sand-50`
     (#f3efe2) ise bu değere Δ1/1/6 uzaklıktadır — sekme çubuğunun krem camı zaten oradan gelir,
     bu yüzden çubuk ile sayfa gözle aynı krem okunur. */
  cream: '#f2f0e8',
  /* Olumlu/yeşil vurgu zemini: teslim bandı, "TESLİM" sayacı, kanıt çipi, operatör baloncuğu,
     "Borç yok" kutusu, "teklif AÇIK" kararı. Taban #eef2e2'den Δ11/6/16 daha doygun — eşiğin
     ÜSTÜNDE, yani gerçek bir fark: operasyon ekranlarında olumlu blok ilk bakışta bulunmalı,
     müşteri vitrininin usul yeşili burada kayboluyordu. */
  'olive-bg': '#e3ecd2',
} as const satisfies Record<string, string>;

/* ── (2) YÜZEYLER — tabanda karşılığı OLMAYAN üç durak ───────────────────────
   Operasyon mobilde yüzey hiyerarşisi müşteriden bir kademe fazla: sayfa (`cream`) → kart
   (`panel`) → gömülü blok (`neutral-bg`) → girdi (`card`, tabandan #ffffff). Müşteri vitrininde
   kart ile girdi AYNI beyazdır; burada ayrışırlar çünkü ekranın işi veri girmektir — girdi, kartın
   içinde ve ondan daha parlak durmak zorunda. */
export const operationsAppSurface = {
  /* Kart, panel, sohbet baloncuğu, hata/boş durum kutusu, özet paneli (25 kullanım). Tabanın
     `card`ından (#ffffff) Δ4/5/11 sıcak: beyaz kalsaydı girdi alanlarıyla aynı yüzey olurdu. */
  panel: '#fbfaf4',
  /* Nötr vurgu zemini (26 kullanım + ilerleme çubuğunun izi): avatar/geri düğmesi dairesi, depo
     ikon karosu, ipucu kutusu, "BEKLEYEN" sayaç kartı, YZ önerisi baloncuğu, "karar yok" çipi.
     `olive-bg`/`error-bg`/`terracotta-bg` ailesinin NÖTR üyesidir; adı da o aileden okunur.
     Tabandaki `neutral-400` ile ilgisi YOK — o soğuk gri bir ÇERÇEVE tonudur, bu sıcak bir zemin.
     Mobil müşteri setindeki `closed-bg`e (#e9e2cf) Δ2/0/3, yani gözle aynı; yine de o durağa
     bağlanmadı: `closed-bg` bir DURUM rengidir (kapanmış rozet arkası) ve 26 nötr yüzeyi bir
     durumun kaderine bağlamak, o durumun tonu değiştiği gün ekranın yarısını değiştirirdi. */
  'neutral-bg': '#e7e2d2',
  /* Koyu (`ink`) CTA'nın İÇİNDEKİ saydam blok — "3 açık" sayacının arkası. Rengi yok, ışığı var:
     zemin ne olursa olsun onu bir tık açar. Ham `rgba()` kodun içine dağılmasın diye token
     (CLAUDE §3). Web operasyonunun `ops-alarm-inset`i (.10) ile aynı fikir, ayrı bağlam. */
  'ink-inset': 'rgba(255, 255, 255, 0.14)',
} as const satisfies Record<string, string>;

/* ── (3) MÜREKKEP/İŞARET — iki yeni ön plan rengi ───────────────────────────── */
export const operationsAppInk = {
  /* DEPO bölümünün kimlik rengi: "DEPO · STRASBOURG" üstbaşlığı, depo iş karosu, "başka depoda
     var" notu, bildirim listesindeki depo noktası.
     Tabanın `honey`sine (#8a6b2a) Δ0/2/16 — eşiğin hemen üstünde, ama ASIL gerekçe değer değil
     ROL: `honey` bu palette "bekliyor / iade sürecinde" demektir. Bildirim listesinde noktalar
     yan yana durur (kurye zeytin · yönetim terracotta · hata kırmızı); depo noktası `honey` olsaydı
     bölüm adı değil DURUM okunurdu. Kimlik rengi ile durum rengi aynı ada bağlanmaz. */
  warehouse: '#8a6d3a',
  /* Sekme çubuğunun SEÇİLİ OLMAYAN ikonu ve etiketi (aktif olan `ink`).
     Kendi durağı çünkü iki komşusu da yanlış: `sand-600` (#b3ab97, Δ15/16/18) bu palette yön
     okunun tonudur — kalıcı gezinme etiketi süs okuyla aynı sesle konuşamaz; `muted` (#8a8270,
     Δ26/25/21) ise seçili sekmeyle yarışacak kadar koyu. Tasarım ikisinin arasına bilerek bir
     durak koymuş. */
  'tab-inactive': '#a49b85',

  /* ── KOYU ÖZET KARTININ ÜSTÜ (v3, 30.08) ───────────────────────────────────
     v3 hub'ın tepesine `ink` zeminli bir özet kartı koydu ("BUGÜN DEPODA" + üç sayı). Kartın
     ÜSTÜNDEKİ dört ton krem zeminin hiçbir tonuyla karşılanamıyor: `muted`/`body`/`sand-*` açık
     zemin için ölçülmüş değerlerdir, koyu zeminde ya kaybolur ya bağırır. Dördü de tasarımdan
     ölçüldü ve rolüyle adlandırıldı — "koyu üstü" ailesi. */
  /* Kartın üstbaşlığı ("BUGÜN DEPODA"). Zeytinin koyu zemin için açılmış hâli: krem üstündeki
     `olive` (#5f7a2c) burada okunmaz. `olive-line` (#cddbb0) ise fazla açık — üstbaşlık sayıların
     önüne geçerdi; tasarım ikisinin arasına bilerek bir durak koymuş. */
  'on-ink-label': '#a8b08f',
  /* Sayının ALTINDAKİ açıklama ("sipariş bekliyor"). `muted` (#8a8270) koyu zeminde yeterince
     ayrışmıyor, `sand-600` (#b3ab97) ise sayıyla aynı ağırlıkta okunuyor. */
  'on-ink-muted': '#a49f8f',
  /* Üç sayıyı ayıran dikey hat. Kartın kendi zemininden bir tık açık — ayraç olduğunu söyleyip
     susan bir çizgi; `sand-*` ailesinin hiçbiri bu koyulukta değil. */
  'on-ink-line': '#4a5157',
  /* DİKKAT çeken sayı: "yarım kutu". Öteki iki sayı krem (`on-image`), bu amber — yarım kalmış
     kutu bir DURUMDUR, bir sayı değil. `error` (#a44a3f) yanlış olurdu: yarım kutu bir hata değil,
     bitirilmesi gereken bir iş. Krem ile kırmızı arasındaki bu ton tam olarak onu söylüyor. */
  'on-ink-warn': '#e0b487',
} as const satisfies Record<string, string>;

/* Operasyon mobile özgü renklerin tam kümesi (11): 2 fark + 9 yeni. */
export const operationsAppColors = {
  ...operationsAppOverrides,
  ...operationsAppSurface,
  ...operationsAppInk,
} as const satisfies Record<string, string>;

/* ── TİPOGRAFİ — ölçek ZATEN VAR, iki durak eksikti ──────────────────────────
   Ölçüm: tasarım 17 Karla + 3 Lora boyu kullanıyor. Lora'nın üçü de birleşimde birebir var
   (24/600 `card-title` · 20/600 `h2-sm` · 17/600 `screen-title`), Karla'nın 15'i de öyle. Yani
   operasyon mobil KENDİ ölçeğini kurmuyor, mobil müşteri merdivenini olduğu gibi kullanıyor —
   web operasyonunun 18 boyu yedi role indirgeyen ayrı merdiveni (`operationsText`) buraya
   girmiyor. Eşleme (kullanım → devralınan durak):
     üstbaşlık 10/700/.18em → `eyebrow` · rozet-etiketi 10 → `badge-sm` · yardımcı 12 → `helper` ·
     ikincil düğme 12,5 → `field-label` · gövde/düğme 13 → `note` · satır başlığı 13,5 →
     `control` · liste başlığı 14 → `body-sm` (çipte `chip`) · birincil CTA 14,5/700 → `button` ·
     bölüm/sayı 15 → `body` · sayaç 16 → `step` · panel başlığı 18 → `card-title-sm` ·
     ± imi 19 → `sheet-title` · ok "›" 20 → `icon-sm` · ok "‹" 22 → `icon` · ince yazı 11,5 →
     `micro`.
   AĞIRLIK 800 için basamak AÇILMADI: tasarım sayıları 13'ten 22'ye kadar SEKİZ ayrı boyda 800 ile
   yazıyor — yani 800 bir kademe değil, kademelerin üstüne binen bir ağırlık (`font-extrabold`).
   Ona basamak açmak ölçeği ikiye katlar ve hiçbir yeni bilgi taşımaz. Satır yüksekliği de bilerek
   gömülmedi (yoğun listelerde `leading` yerel karardır — `operations.ts` §0'ın aynı hükmü).

   Eklenen İKİ durak, ikisi de ölçülmüş boşluk: */
export const operationsAppText = {
  /* Ekran başlığının ALTINDAKİ künye satırı (referans · müşteri · durum), sohbet baloncuğunun
     konuşan satırı ve sekme çubuğunun etiketi — 24 kullanım.
     Birleşimde 10,5 diye bir değer YOK; en yakınları 10 ve 11. Yuvarlanmadı çünkü kural bu:
     kontrol/künye ölçülerinde yarım piksel komşu öğeyle hizayı belirler (`customer.ts` §0.4b).
     Ağırlık gömülmedi: aynı satır 700 (künye) ve 400 (ince yazı) olarak da kullanılıyor. */
  meta: '10.5px',
  /* Durum rozeti ve satır içi etiket (23 kullanım): "SKT gir *", "lot: GAZ-7120", "hasar bildir",
     "teklif AÇIK", "top bizde", "KAPIDA · 42,00 € NAKİT".
     Değer olarak 11px birleşimde VAR — ama yalnız `eyebrow-sm` içinde ve o durak ÜÇ anahtarlıdır
     (11px + 600 + .1em). Rozet 700 ve aralıksız yazılıyor; `eyebrow-sm` bir demet olarak
     uygulandığında rozet YANLIŞ çizilir, üstelik `customer-app.ts` o durağı açıkça "web'in mobil
     forku, uygulamada kullanılmaz" diye işaretliyor. Bu yüzden ölçüyü kendi rolüyle taşıyan ayrı
     bir durak — alt anahtarsız, ki ağırlık çağıranın kararı kalsın. */
  tag: '11px',
} as const satisfies Record<string, string>;

/* ── KÖŞE YARIÇAPI — resmî 4'lü set yetiyor, altına bir durak eklendi ────────
   Ölçüm: 16px (55 kullanım) = `control` · 12px (40) = `badge` · 20px (13) = `card` — üçü de mobil
   müşteri setiyle BİREBİR. Daireler (26 kullanım: avatar, geri düğmesi, durum noktası) ve
   "hap" görünümlü küçük rozetler (9px ve 4px ölçüldü) için de yeni durak GEREKMEZ: hem CSS hem RN
   yarıçapı kutunun yarısında kırpar, yani `pill` (22px) 44px'e kadar her kareyi tam daire, her
   ince çubuğu tam hap yapar. */
export const operationsAppRadius = {
  /* Küçük KARE kontrol: mal kaleminin ✓/✕ işaret kutusu (26×26) ve iade adedi −/+ düğmesi (30×30,
     tasarımda 10px — aynı durağa yuvarlandı, 2px'lik fark 4px büyüklük farkının izidir).
     `badge`e (12px) bağlanamaz: 26px'lik bir kutuda 12px yarıçap neredeyse daire demektir ve o an
     işaret kutusu ile durak dairesi birbirine karışır — bu ekranda daire "durak", kare "kalem"
     anlamına gelir. */
  tight: '8px',
} as const satisfies Record<string, string>;

/* ── GÖLGE — v3 imzası aynen, bir varyantla ─────────────────────────────────
   Tasarımın `3px 3px 0 #343b41` gölgesi (15 kullanım) `customerAppShadow.hard`ın ta kendisidir;
   buraya kopyalanmadı, oradan gelir. */
export const operationsAppShadow = {
  /* KOYU (`ink`) CTA'nın gölgesi. `hard` burada işe yaramaz: mürekkep gölge mürekkep düğmenin
     altında görünmez, düğme de basıldığında gölgeyi "yutma" hissini kaybeder. Tasarım ölçümü
     #b8b09a; `sand-600`e (#b3ab97, Δ5/5/3) bağlandı ve ikinci kez YAZILMADI — kum skalası
     kayarsa gölge de kaymalı. */
  'hard-on-ink': `3px 3px 0 ${customerSand['sand-600']}`,
} as const satisfies Record<string, string>;

/* ── GRADYAN — yapışkan CTA'nın altındaki solma ──────────────────────────────
   Liste, alttaki birincil düğmenin arkasından akar; düğme yüzmüyor gibi görünsün diye sayfa zemini
   şeffaftan kendine doğru %40'ta kapanır. Fotoğraf gradyanlarının (`customerAppGradient`) kardeşi
   değil, tamamlayıcısı: orada iş metni okunur kılmak, burada listeyi kesmeden bitirmek.
   Şeffaf durak `rgba(…, 0)` yazılır, `transparent` DEĞİL — bazı motorlarda `transparent` "şeffaf
   SİYAH"tır ve geçişin ortasını griye kirletir (aynı kural: `customer-app.ts`).
   Kanal üçlüsü `cream`in ondalık karşılığıdır; opak durak ise doğrudan ondan türetilir, böylece
   sayfa zemini değişince gradyanın ucu da değişir. */
export const operationsAppGradient = {
  'sticky-fade': `linear-gradient(180deg, rgba(242, 240, 232, 0), ${operationsAppOverrides.cream} 40%)`,
} as const satisfies Record<string, string>;
