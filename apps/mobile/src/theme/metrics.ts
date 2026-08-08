/*
  ÖLÇÜ KATMANI — boşluk · yükseklik · çerçeve kalınlığı · basılı geri bildirim katsayıları.

  NEDEN BURADA, `@lezzet/design-tokens`TA DEĞİL: paket renk · yazı · yarıçap · gölge · gradyan
  taşır; boşluk/ölçü ailesi YOKTUR. Web tarafında bu rolü Tailwind'in kendi ölçeği üstleniyor
  (`px-4`, `h-13`), RN'de karşılığı yok. Değerler `design/project/Mobil - Musteri v3.dc.html`
  içinden ÖLÇÜLDÜ ve TEK yerde durur — komponent dosyalarına ham piksel yazılmaz. Paketin
  ölçü ailesi açıldığı gün bu dosya oraya terfi eder (rapor edildi).

  YUVARLAMA: tasarımın tek-piksel ara değerleri (9 · 11 · 13 · 15) ölçeğin en yakın basamağına
  çekildi (±1 dp). Web'de Tailwind ölçeği zaten aynısını yapıyor. YAPISAL ölçüler (kontrol
  yüksekliği, daire çapı, dokunma hedefi) yuvarlanMAdı — orada bir piksel hizayı bozar.
*/

export const appMetrics = {
  /** Boşluk ölçeği — dolgu, aralık, kenar boşluğu. */
  space: {
    '2xs': 2,
    xs: 4,
    sm: 6,
    md: 8,
    lg: 10,
    xl: 12,
    '2xl': 14,
    '3xl': 16,
    '4xl': 18,
    /**
     * IZGARA SATIR ARASI — Token Kararlari #22 ile açıldı ve ölçeğin ORTASINA girdi.
     * Katalog ızgarası `gap:20px 14px` diyor; 20 daha önce ölçekte yoktu ve 22'ye yukarı
     * yuvarlanmıştı. Karar "boşluklar gerçek listeyle aynı (20/14)" diyerek 20'yi resmîleştirdi,
     * yani yuvarlamanın kapanmasını değil DURAĞIN AÇILMASINI istedi.
     * Ölçeğe ortadan girdiği için sonraki adların hepsi bir basamak kaydı (22→6xl · 26→7xl ·
     * 30→8xl · 70→9xl); ad kaydırmak, ölçeği artan sırada tutmanın bedelidir — 20'yi sona
     * eklemek ölçeği okunmaz yapardı.
     */
    '5xl': 20,
    '6xl': 22,
    '7xl': 26,
    '8xl': 30,
    /** Boş durumun dikey nefesi (tasarım: `padding:70px 30px`). */
    '9xl': 70,
  },

  size: {
    /**
     * Dokunma hedefi asgarisi. Apple HIG 44pt · Material 48dp; ikisinin kesişimi olarak 44
     * alındı ve daha küçük görsel öğelere `hitSlop` ile bu ölçüye tamamlanır.
     */
    touchTarget: 44,
    /** Blok düğme ve tek satırlı girdi (tasarım: 52). */
    controlLg: 52,
    /** Form girdisi, hap düğme (tasarım: 50). */
    controlMd: 50,
    /** Arama kutusu, mesaj alanı, küçük hap kontrol (tasarım: 46). */
    controlSm: 46,
    /** Çok satırlı alanın asgari yüksekliği (tasarım: 110). */
    controlMultiline: 110,
    /** Başlık çubuğundaki yuvarlak ikon düğmesi (tasarım: 40). */
    iconButton: 40,
    /** Fotoğraf üstündeki geri düğmesi (tasarım: 42). */
    iconButtonOnPhoto: 42,
    /**
     * Ürün dairesi İKİ boyutu (tasarım: vitrin 146 · benzerler 96).
     * Izgaranın 138'lik dairesi EMEKLİ (kullanıcı kararı 07.08): katalog kare karta geçti
     * (`ProductPhotoCard`), dolayısıyla o çapın tek tüketicisi kalmadı. Şablonun iskeleti de
     * Token Kararlari #22 ile kareye çekildi — 138 artık tasarımda da yok.
     */
    circleLg: 146,
    circleSm: 96,
    /** Avatar üç boyutu (tasarım aralığı 34–56; kullanılan üç durak). */
    avatarLg: 56,
    avatarMd: 46,
    avatarSm: 40,
    /** Yükleniyor halkası (tasarım: satır içi 18 · giriş 40 · ödeme 44). */
    spinnerLg: 44,
    spinnerMd: 40,
    spinnerSm: 18,
    /** Boş durum ikonu (tasarım: 40–46). */
    emptyIcon: 44,
    /**
     * Hata bloğunun ikonu (tasarım: 34). Boş durumdan AYRI bir durak çünkü tasarım onu bilerek
     * küçük çiziyor: hata bloğu kesikli çerçevenin içinde dar bir kutudur ve 44'lük bir ikon
     * orada başlığın önüne geçiyor. Boş durumdaki ikon ise sayfanın tek öğesi.
     */
    errorIcon: 34,
    /**
     * Sekme çubuğu ikonu (müşteri v3: 23 · operasyon v2: 22 — ±1 kuralıyla aynı durak).
     * İki yüzey için ikinci bir durak açılmadı: 1 dp fark ekranda ölçülemez, ama iki ad bir gün
     * "hangisi doğru?" sorusunu doğurur (aynı disiplin: `operations-app.ts` yeni durak eşiği).
     */
    tabIcon: 23,
    /** Başlık satırındaki yuvarlak düğmenin ikonu — operasyon zil düğmesi (v2: 20). */
    headerIcon: 20,
    /** Girdi/düğme içinde satıra giren ikon (tasarım: arama büyüteci 17 · süzgeç çizgileri 19×17). */
    inlineIcon: 17,
    /** Yüzen sayfanın tutamağı (tasarım: 44×5). */
    sheetHandle: 44,
    /**
     * KÜÇÜK KONTROLLER — 44 dp'nin altında kalan dokunulabilir kare/daireler; hepsi `compact`
     * işaretiyle `touchSlop` payını alır ve eşiğe böyle tamamlanır (21.10, Operasyon Mobil v2'den
     * ölçüldü). Boşluk ölçeğinden ALINMADILAR: `space` dolgu/aralık ailesidir, bunlar ise öğenin
     * KENDİ ölçüsüdür ve yuvarlanamaz — bir piksel kayması işaret kutusu ile durak dairesini
     * birbirine yaklaştırır ve o ikisi bu ekranda farklı ŞEY demektir (kare = kalem, daire = durak).
     */
    /** Mal kaleminin ✓/✕ işaret kutusu (v2:151 — 26×26). */
    markBox: 26,
    /** Durak sırası dairesi ve iade adedi ±/− düğmesi (v2:78, 158 — 30×30). */
    dotButton: 30,
    /** Tahsilat tutarının ±/− düğmesi (v2:174 — 34×34). */
    stepButton: 34,
  },

  /**
   * Küçük dokunulabilir öğelere her kenardan eklenen dokunma payı. Kitin en KÜÇÜK görsel
   * yüksekliği metin eylemidir (~20 dp); 12 dp pay onu 44 dp'ye çıkarır, dolayısıyla daha
   * büyük olan rozet · çip · yuvarlak ikon düğmesi de eşiği kendiliğinden aşar. Tek değer
   * bilerek: öğe başına pay hesaplamak, eşiğin bir gün birinde unutulması demekti.
   */
  touchSlop: 12,

  border: {
    /** İnce iç ayraç (tasarım: 1px). */
    hairline: 1,
    /** Standart çerçeve — girdi, çip, başlık çubuğu altı (tasarım: 1.5px). */
    base: 1.5,
    /** Yığın avatarının krem halkası (tasarım: 2.5px). */
    ring: 2.5,
    /** Yükleniyor halkasının kalınlığı (tasarım: küçükte 3, büyükte 4). */
    spinner: 4,
    spinnerSm: 3,
    /**
     * İKON ÇİZGİSİ — tasarımın BASKIN değeri (1,8 · 19 kullanım). Şablon 1,5–2,2 arasında
     * geziniyor ama sistemli değil: kalınlık ikon BOYUYLA ters oynuyor (küçük ikon kalın, büyük
     * ikon ince) — optik ağırlığı sabit tutmanın elle yapılmış hâli. İki durak o davranışı
     * kurala çeviriyor; aradaki tek-onda farklar (1,7 · 1,9 · 2,0 · 2,2) en yakın durağa çekildi.
     */
    iconStroke: 1.8,
    /** 34 dp ve üstü ikonun ince çizgisi (tasarım: 1,5–1,7). */
    iconStrokeLarge: 1.6,
    /** Yüzen sayfa tutamağının kalınlığı (tasarım: 5). Yarıçapı bundan TÜREtilir. */
    sheetHandle: 5,
  },

  /**
   * BASILI GERİ BİLDİRİM — Token Kararlari #8. Web'in `cursor-pointer` + hover kuralının RN
   * karşılığı budur: etkileşimli her öğe basıldığında görünür biçimde cevap verir.
   * · sert gölgeli yüzey → `translate(2,2)` (gölge öğenin kutusuna ait olduğu için birlikte
   *   kayar; tasarımın kendi davranışı da bu)
   * · gölgesiz yüzey → `scale(.97)`, küçük öğede `.9`
   * · metin eylemi → opaklık (tasarımda `.55`); küçültme metin bağlantısında titrek durur
   */
  press: {
    translate: 2,
    scale: 0.97,
    scaleSmall: 0.9,
    opacity: 0.55,
  },

  /** İskelet (skeleton) nabzı — tasarımdaki `@keyframes skel` (opaklık .45 ⟷ .9, 1,1 sn). */
  skeleton: {
    minOpacity: 0.45,
    maxOpacity: 0.9,
    durationMs: 1100,
  },

  /** Yükleniyor halkasının tam turu (tasarım: `animation:spin .8s linear infinite`). */
  spinDurationMs: 800,

  /** Yüzen sayfanın ekrandan alabileceği en yüksek pay (tasarım: `max-height:82%`). */
  sheetMaxHeightRatio: 0.82,

  /**
   * ARAMA GECİKMESİ (ms) — her tuşa basışta uca gitmemek için. Tasarımda karşılığı YOK (şablon
   * yerel bir dizide süzüyor, ağ yok); değer PARAMETRİK bir varsayılan (CLAUDE §4): 350 ms,
   * ortalama bir yazma temposunda kelimenin bitmesini bekleyecek kadar uzun, yazmayı bırakan
   * parmağın altında listenin durduğu hissini vermeyecek kadar kısa.
   */
  searchDebounceMs: 350,

  /** Tükendi ürün kartının solması (tasarım: `opacity:.45`). */
  soldOutOpacity: 0.45,

  /**
   * SEÇİLİ SEKME ikonunun vurgusu (tasarım: `transform:translateY(-2px) scale(1.12)`).
   * Basılı geri bildirimden AYRI: o dokunma ANINI anlatır ve bırakınca geçer, bu ise DURUMU
   * anlatır ve seçili kaldığı sürece durur. Aynı sözlüğe koymak ikisini karıştırırdı.
   */
  tabSelected: {
    lift: -2,
    scale: 1.12,
  },

  /**
   * KREM CAMIN BULANIKLIĞI — `customerAppBlur.glass` token'ının RN karşılığı.
   *
   * Token CSS yarıçapı taşır (`blur(8px)`); `expo-blur` ise 1–100 arası bir YOĞUNLUK ister ve
   * ikisi arasında TANIMLI BİR DÖNÜŞÜM YOK — iOS'ta değer sistem materyalinin ilerleme yüzdesi,
   * Android'de kütüphanenin kendi ölçeği; belgelerin hiçbirinde px karşılığı verilmiyor
   * (ölçülemedi, bkz. docs.expo.dev/versions/v57.0.0/sdk/blur-view). Uydurma bir çarpan yazmak
   * ("8 × 3 = 24") ölçülmemiş bir şeyi ölçülmüş gibi gösterirdi.
   *
   * O yüzden PARAMETRİK bir varsayılan (CLAUDE §4): 20 = hafif buğu. Gerekçesi yüzeyin kendisi —
   * krem cam zaten %96 opak, yani bulanıklığın görebildiği alan yüzeyin %4'ü; ağır bir yoğunluk
   * orada görünmez ama iOS'ta gereksiz bir çizim maliyeti olurdu. Tek yerde durur; tasarımla
   * cihaz üstünde karşılaştırıldığında buradan ayarlanır.
   */
  glassBlurIntensity: 20,
} as const;
