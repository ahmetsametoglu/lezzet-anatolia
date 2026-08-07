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
    '5xl': 22,
    '6xl': 26,
    '7xl': 30,
    /** Boş durumun dikey nefesi (tasarım: `padding:70px 30px`). */
    '8xl': 70,
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
    /** Ürün dairesi üç boyutu (tasarım: vitrin 146 · ızgara 138 · benzerler 96). */
    circleLg: 146,
    circleMd: 138,
    circleSm: 96,
    /** Avatar üç boyutu (tasarım aralığı 34–56; kullanılan üç durak). */
    avatarLg: 56,
    avatarMd: 46,
    avatarSm: 40,
    /** Yükleniyor halkası (tasarım: satır içi 18 · giriş 40 · ödeme 44). */
    spinnerLg: 44,
    spinnerMd: 40,
    spinnerSm: 18,
    /** Boş durum ikonu (tasarım: 44–46). */
    emptyIcon: 44,
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

  /** Tükendi ürün kartının solması (tasarım: `opacity:.45`). */
  soldOutOpacity: 0.45,
} as const;
