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
import { customerOlive, customerSand, customerSurface } from './customer';

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
  /* TONLU KARTIN HATA ZEMİNİ — uyuşmazlık kartı, iade satırı, "liste yüklenemedi" kutusu (18
     kullanım). Taban #f4e3e0 (mobil müşteri seti) bu yüzeyde FAZLA koyu: v3'ün kalıbı "çok açık
     zemin + renkli kenar", dolu bir pembe kutuyu uyarı bandına çevirirdi. Rol birebir aynı
     olduğu için yeni ad açılmadı, değer ezildi (§1'in kuralı).

     ── NİÇİN EŞİĞİN ALTINDA OLMASINA RAĞMEN AÇILDI (kullanıcı bulgusu 30.08) ──
     §4 künyesi bu zemini iki kez `panel`e bağlamış ve gerekçesini *"Δ2/4/0, ekranda ayırt
     edilemez"* diye yazmıştı. **Cihazda ayırt edildi** — varsayım ölçümle çürüdü ve sebebi
     eşiğin ÖLÇMEDİĞİ eksende: Öklid mesafesi değil KANAL DENGESİ.
         `panel` #fbfaf4 → R−G = +1   (nötr krem)
         hata    #fdf6f4 → R−G = +7   (pembeye kayık)
     Açık tonlarda göz mutlak parlaklığı değil kanalların SIRASINI okur; `panel`de R ile G
     neredeyse eşitken burada ayrışıyorlar ve ayrışmanın yönü rengin kimliğidir. Eşik kuralı
     yürürlükte kalıyor ama artık bir istisnası var ve istisna burada ilan edildi. */
  'error-bg': '#fdf6f4',
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
  /* Sekme çubuğunun SEÇİLİ OLMAYAN ikonu/etiketi VE dipnot yazısı — palette ÜÇÜNCÜ gri.
     Kendi durağı çünkü iki komşusu da yanlış: `sand-600` (#b3ab97, Δ11/10/6) bu palette yön
     okunun tonudur — kalıcı gezinme etiketi süs okuyla aynı sesle konuşamaz; `muted` (#8a8270,
     Δ30/17/33) ise seçili sekmeyle yarışacak kadar koyu. Tasarım ikisinin arasına bilerek bir
     durak koymuş.

     ── DEĞER v3'TE ÖLÇÜLDÜ: #a49b85 → #a8a191 (30.08) ──────────────────────
     v2 bu tonu TEK bir yerde kullanıyordu (seçilmeyen sekme, 1 kullanım) ve değeri #a49b85'ti.
     v3'te #a49b85 ŞABLONDAN TAMAMEN KALKTI (grep: 0 kullanım); yerini alan #a8a191 ise 91 kez
     geçiyor — hem seçilmeyen sekme (`c.tabDepo` vd.) hem de bloğun ALTINDAKİ dipnot satırı
     ("Yalnız senin rollerine düşen olaylar listelenir…", "Cihaz klavyesi açılmaz…") ve iskelet
     altındaki "yükleniyor…" künyesi. Yani v3 tonu korumadı, ROLÜ genişletti: bu artık "pasif
     gezinme rengi" değil, `muted`in bir kademe altındaki DİPNOT grisidir — ekranın söylediği
     şeyi değil, o şeyin kuralını yazan satır.

     Ad DARALDI ama değişMEDİ: `tab-inactive` üç şeridin okuduğu bir anahtar ve yeniden
     adlandırma tek şeridin kararı değildir (02-mimari §3.6 — küçük ayak izi). Rolün adıyla
     örtüşmesi için önerilen ad `muted-soft`; kararı yönetici verir.

     İKİNCİ AD AÇILMADI: `on-ink-muted` (#a49f8f) bu değere Δ4/2/2 uzaklıkta, yani eşiğin
     ALTINDA — ama o durak KOYU zeminin grisidir (özet kartının içi) ve rolü bu satırınkiyle
     karışmaz; ikisini tek ada indirmek, koyu kart tonu kaydığı gün bütün dipnotları da
     kaydırırdı. Birleştirme adayı olarak rapor edildi, kendiliğinden yapılmadı. */
  'tab-inactive': '#a8a191',

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

/* ── (4) ÇERÇEVE — renkli kartın KENARI (v3, 30.08) ──────────────────────────
   v3'ün baskın kalıbı "tonlu kart": çok açık bir zemin + 1,5 px renkli kenarlık + aynı ailenin
   koyu metni (ölçüldü: nötr #fbfaf4/#ddd6c4 63 kez, hata #fdf6f4/#e0b9b2 15, uyarı
   #fdf8f3/#d9a97f 9, olumlu #f2f7e8/#c3d3a4 8). Kartı ailesine bağlayan şey ZEMİN DEĞİL
   KENARLIKTIR: dört zeminin de üçü `panel`e (#fbfaf4) kanal başına ≤4 uzaklıkta, yani ekranda
   ayırt edilemez — hata kutusunu hata yapan, kenarı ve metnidir.

   Bu yüzden buraya yalnız KENAR tonu giriyor, zemin girmiyor: zeminler eşiğin altında kalıp
   var olan duraklara bağlandı (#fdf6f4 → `panel` Δ2/4/0 · #fdf8f3 → `panel` Δ2/2/1 · #f6f4ec →
   `cream` Δ4/4/4 · #f0ede3 iskelet dolgusu → `sand-50` Δ3/2/1 · #e2ddcc sessiz kenar →
   `neutral-bg` Δ5/5/6). */
export const operationsAppLine = {
  /* `error-line` BURADAN KALKTI (30.08) ve TABANA taşındı (`customerAppError`). Sebep paylaşılan
     kit: `SecondaryButton`ın `error` tonu iki yüzeyde birden yaşıyor ve yalnız operasyonda var olan
     bir durak stil fabrikasında çözülemiyordu (cihazda ölçüldü). Değer değişmedi (#e0b9b2), yalnız
     katmanı değişti — ikinci kez tanımlamak "aynı değerin ikinci adı" olurdu ve anti-kopya testi
     bunu haklı olarak reddediyor. */
  /* UYARI kartının kenarı: "yazıcı tanımlı değil", "kapsamında iki depo var", "yarım kutu".
     §4 künyesi bu aileyi zaten ölçmüştü (#fdf8f3/#d9a97f, 9 kullanım) ama yalnız `error-line`
     açılmıştı; yazıcı ekranı yazılırken açık görüldü ve uyarı kutusu geçici olarak
     `terracotta-line` ile çizildi — o ton HONEY ailesinin değil turuncunun kenarı ve kutu
     tasarımdan açık duruyordu. Tabanda karşılığı YOK: en yakını `terracotta-line` (#e8c9b3,
     Δ13/32/4) ve ikinci kanalda eşiğin çok üstünde. Aile adlandırması tabandan devralındı:
     `warning` · `warning-bg` · `warning-line`; zemin yine açılmadı (ölçülen #fdf8f3 `panel`e
     Δ2/2/1, ekranda ayırt edilemez — kutuyu uyarı yapan KENARI ve metnidir). */
  'warning-line': '#d9a97f',
  /* OLUMLU kartın kenarı: "kâğıttaki her kalem kutulara girdi", "araçtaki seferlerin tüm kutuları
     yüklendi". §4 künyesi bu aileyi de ölçmüştü (#f2f7e8/#c3d3a4, 8 kullanım) ama `warning` gibi
     o gün açılmadı — tüketicisi yoktu. D1'in kutu kartı (31.08) ilk tüketici oldu.
     Tabanda karşılığı YOK: en yakını `olive-line` (#cddbb0, Δ11/4/12) ve o ZEYTİN ÇERÇEVELİ
     DÜĞMENİN kenarıdır — bu ise tonlu kartın kenarı; ikisi aynı ailede değil. */
  'success-line': '#c3d3a4',
} as const satisfies Record<string, string>;

/* ── (5) TONLU KARTIN UYARI ZEMİNİ (kullanıcı bulgusu 30.08) ─────────────────
   Kenarı §4'te açılmıştı, zemini değil — aynı gerekçeyle ("eşiğin altında"). Kenar tek başına
   yetmedi: kuryenin üstündeki para kartı cihazda NÖTR okunuyordu, oysa o para henüz kasada değil.
   `error-bg`in yorumundaki kanal-dengesi ölçümü burada da geçerli (#fdf8f3 → R−G = +5, `panel`
   +1). Tabanda karşılığı YOK — `terracotta-bg` (#f9ede2) bu değere Δ4/11/16, ikinci ve üçüncü
   kanalda eşiğin üstünde ve rolü de başka (turuncu DOLGU, tonlu kartın zemini değil). */
export const operationsAppWarnSurface = {
  'warning-bg': '#fdf8f3',
  /* OLUMLU kartın zemini — `warning-bg`in kardeşi ve aynı gerekçe. `panel`e (#fbfaf4) uzaklığı
     Δ9/4/12, yani İKİ kanalda eşiğin üstünde: bağlanamıyor. `olive-bg`den (#e3ecd2) de ayrı ve
     rolü başka — o DOLU bir zeytin yüzeydir (rozet, ürün karesi), bu ise tonlu kartın çok açık
     zemini. Ailenin metni ayrı bir durak istemiyor: `olive-dark` (#4a6121) tasarımın kendi
     kullandığı renk. */
  'success-bg': '#f2f7e8',
} as const satisfies Record<string, string>;

/* Operasyon mobile özgü renklerin tam kümesi (12): 2 fark + 10 yeni. */
export const operationsAppColors = {
  ...operationsAppOverrides,
  ...operationsAppSurface,
  ...operationsAppInk,
  ...operationsAppLine,
  ...operationsAppWarnSurface,
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
  /* OPERASYONUN DÜĞME ETİKETİ — tabanın 14,5'inden KÜÇÜK (kullanıcı bulgusu 30.08, cihazda
     ölçüldü). Müşteri yüzeyinde düğme sayfanın tek çağrısıdır ve 14,5 orada doğru; operasyon
     ekranında bir kartın içinde üç dört düğme yan yana duruyor ve o punto onları iri gösteriyor.
     v3'ün kendi ölçüleri role göre 12,5 (ikincil: "Ulaşılamadı" · "Kabul etmedi") · 13
     (navigasyon) · 13,5 (okutma) · 15 (birincil CTA) — ortası 13,5 ve dördünün de en yakın tek
     kademesi o. Rol başına dört durak açmak kitin sözlüğünü, kazandırdığı yarım pikseller kadar
     büyütmezdi (CLAUDE §1). */
  button: '13.5px',
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

/* ── GÖLGE — v3 SERT GÖLGEYİ BIRAKTI (ölçüldü 30.08) ────────────────────────
   Yukarıdaki iki durak v1/v2 ölçümüdür ve v3 onları KULLANMIYOR. Tasarım dosyalarında
   `box-shadow` sayıldı:

     · Mobil - Musteri v3      → `3px 3px 0` **26** kez (müşteri evreninin imzası, yerinde duruyor)
     · Operasyon Mobil **v2**  → `3px 3px 0` **3** kez
     · Operasyon Mobil **v3**  → **0** kez; yerine 4 kez yumuşak zeytin ışıma

   Sert gölgenin rengi olarak ölçülen #b8b09a de v1/v2/"Tasarım Yönleri"nde geçiyor, **v3'te hiç
   geçmiyor.** Yani operasyon mobil yüzeyi düz (gölgesiz) bir yüzeye geçti — operasyon WEB
   envanterinin kendi kuralıyla da aynı yere geldi: *"Gölge yok, ince çizgi + boşluk ayırır."* */
export const operationsAppShadow = {
  /**
   * **YAPIŞKAN OKUTMA CTA'sının ışıması** — v3'ün gölge diye kullandığı TEK şey.
   *
   * Ölçüm: `0 4px 14px rgba(95,122,44,.24)`, dört kullanımın dördü de yapışkan çubuktaki okutma
   * düğmesinde (`tg.scanner`, `yukOkut`). Rol nettir: düğme sayfanın üstünde YÜZER, listenin
   * akışından ayrılır — ışıma o ayrımın kendisidir, süs değil. Sıradan CTA (mürekkep dolgulu
   * "Tekrar dene", "Para bölümüne geç") gölgesizdir; ışıma ona verilirse "yüzen düğme" işareti
   * anlamını kaybeder.
   *
   * Renk zeytinin kendisidir (95,122,44 = #5f7a2c): ışıma düğmenin dolgusundan doğar, bağımsız bir
   * gri değildir. Rengin ikinci kez yazılmaması için `customerOlive`den okunur; opaklık (%24)
   * ölçümün kendisidir ve sekizlik onaltılıkla (`3d`) yazılır — RN'in `boxShadow` ayrıştırıcısı
   * CSS söz dizimini olduğu gibi alır.
   */
  glow: `0 4px 14px ${customerOlive.olive}3d`,
  /**
   * **YÜZEN OKUTMA DÜĞMESİNİN (FAB) GÖLGESİ** — v3'ün 31.08 turunda gelen ikinci yükselti.
   *
   * Ölçüm: `0 8px 22px rgba(47,53,58,.26)` (D1 toplama detayı, `topFab`). `glow`dan AYRI bir
   * durak ve ayrım rolde: ışıma sayfanın AKIŞINDAKİ zeytin düğmenin imzasıdır, bu ise sayfanın
   * ÜSTÜNDE duran dairenin — akıştan koptuğunu söyleyen şey gölgenin kendisi. İkisini tek
   * anahtara indirmek, iki farklı "yüzüyor" ifadesini tek renge bağlamak olurdu (FAB koyu da
   * olabiliyor, zeytin de).
   *
   * Renk `ink`ten okunur: tasarımın #2f353a'sı paletin ayrı bir durağı DEĞİL — dosyanın kendi
   * kuralı zaten "#3c4448 · #454d54 → hepsi `ink`" diyor, bu da o ailenin bir tonu. Opaklık %26
   * ölçümün kendisidir (`42` = 66/255).
   */
  fab: `0 8px 22px ${customerSurface.ink}42`,
  /**
   * @deprecated v2 kalıntısı — v3'te karşılığı YOK (yukarıdaki ölçüm).
   *
   * Bugün 6 operasyon ekranı hâlâ okuyor; durak, son tüketici kite geçince silinecek.
   * BEKLEYEN(21.161): kit geçişi bitince bu anahtar ve `hard`ın operasyon kullanımları kaldırılır.
   */
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
