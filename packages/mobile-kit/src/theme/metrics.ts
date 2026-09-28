/*
  Boşluk, yükseklik, çerçeve ve basılı geri bildirim ölçüleri burada, çünkü `@lezzet/design-tokens`ın ölçü ailesi yok ve RN'de
  Tailwind ölçeğinin karşılığı yok; komponent dosyalarına ham piksel yazılmaz. Tasarımın tek-piksel ara değerleri ölçeğin en yakın
  basamağına çekilir, yapısal ölçüler (kontrol yüksekliği, daire çapı, dokunma hedefi) yuvarlanmaz, çünkü orada bir piksel hizayı bozar.
*/

import { customerAppShadowOffset } from '@lezzet/design-tokens';
import { ICON_STROKE } from '@lezzet/design-tokens/icons';

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
     * Izgara satır arası (tasarım: `gap:20px 14px`). Ölçeğin ortasına girdiği için sonraki adlar bir basamak kaydı; sona eklemek
     * ölçeği artan sırada okunmaz yapardı.
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
    /**
     * İki satırlı blok düğmenin taban yüksekliği — etiket ve altındaki ipucu (tasarım: `min-height:58px`). `controlLg`den ayrı,
     * çünkü tek satırlık düğme sabit, bu ise tabanı olan bir kutu; aynı sayı ipucu iki satıra kırılınca metni kırpardı.
     */
    controlStack: 58,
    /** Form girdisi, hap düğme (tasarım: 50). */
    controlMd: 50,
    /** Arama kutusu, mesaj alanı, küçük hap kontrol (tasarım: 46). */
    controlSm: 46,
    /** Çok satırlı alanın asgari yüksekliği (tasarım: 110). */
    controlMultiline: 110,
    /** Başlık çubuğundaki yuvarlak ikon düğmesi (tasarım: 40). */
    iconButton: 40,
    /**
     * Karar kartının ikon kutusu ve içindeki ikon (tasarım: 42 · 21). `iconButton`dan ayrı, çünkü o basılabilir bir kontrol, bu
     * kartın içinde basılamayan bir işaret; dokunma hedefi büyüyünce kartın ritmi kaymamalı.
     */
    decisionIconBox: 42,
    decisionIcon: 21,
    /**
     * Yüzen okutma düğmesi (tasarım: 66). Ekranın her yerinden erişilen tek eylem olduğu için bakmadan basılacak kadar büyük kalır
     * ve yuvarlanmaz.
     */
    fab: 66,
    /** Yüzen düğmenin ikonu (tasarım: 28); 66'lık dairede `text.icon` (22) kaybolur ve daire boş görünür. */
    fabIcon: 28,
    /**
     * Kutu içeriği satırının ürün karesi (tasarım: 28–30). `thumb`dan ayrı, çünkü kayıt satırında kare ürünü tanıtmaz yalnız
     * hatırlatır; 44'ü ödünç almak kayıt satırlarını iki kademe uzatırdı.
     */
    thumbSm: 30,
    /**
     * Kuryenin kapıdaki "Ara" ve "WhatsApp" kareleri; tasarımın 56 × 52'si yerine tam kare. Asıl eylem navigasyon olduğu için kareler
     * ondan yer çalmamalı.
     */
    contactIcon: 52,
    /** Kapıdaki tahsilat tutarı alanı — büyük rakam + tuş takımı rozeti (tasarım: 56). */
    controlAmount: 56,
    /** Adım numarasının daire rozeti — kuryenin durak ekranında dört adım (tasarım: 22). */
    stepBadge: 22,
    /** Fotoğraf üstündeki geri düğmesi (tasarım: 42). */
    iconButtonOnPhoto: 42,
    /**
     * Ürün dairesinin iki boyu: vitrin 146, benzer ürünler 120. Küçük çap tasarımın 96'sından büyük, çünkü 96'da yemek fotoğrafı
     * ne olduğu anlaşılacak kadar büyük değil; 146'ya çıkmaz ki iki kademe ayrı kalsın.
     */
    circleLg: 146,
    circleSm: 120,
    /** Avatar üç boyutu (tasarım aralığı 34–56; kullanılan üç durak). */
    avatarLg: 56,
    avatarMd: 46,
    avatarSm: 40,
    /* Tarih seçicinin sütun boyu: dördüncü hücre yarım görünür, çünkü tam üç hücre listeyi kaydırılmaz gösteriyor. */
    wheelColumn: 176,
    /** Yükleniyor halkası (tasarım: satır içi 18 · giriş 40 · ödeme 44). */
    spinnerLg: 44,
    spinnerMd: 40,
    spinnerSm: 18,
    /**
     * Boş durumun ikonu; sayfanın tek görseli olduğu için tasarımın 40–46'sı başlıkla aynı ağırlıkta kalıyordu. 120 değil, çünkü o
     * ödül anının kahraman ölçüsü ve boşluk anı onunla aynı sesle konuşmamalı.
     */
    emptyIcon: 80,
    /** Çerçevenin içinde duran süs ikonu; `emptyIcon`den ayrı, çünkü sabit bir dairenin içinde yaşıyor ve büyürse daireyi taşırır. */
    decorIcon: 44,
    /**
     * Toast'un alt kenardan yüksekliği (tasarım: `bottom:104` — tab çubuğu 88 + 16 nefes).
     * Cihaz alt inset'i ÜSTÜNE eklenir: çubuk inset kadar büyüyünce mesaj da onunla kalkar.
     */
    toastBottom: 104,
    /**
     * Hata bloğunun ikonu (tasarım: 34). Boş durumdan ayrı, çünkü hata bloğu kesikli çerçeveli dar bir kutu ve büyük ikon orada
     * başlığın önüne geçer.
     */
    errorIcon: 34,
    /** Sekme çubuğu ikonu, müşteri yüzeyi (tasarım: 23); operasyonunkiyle 3 dp fark olduğu için ayrı durak. */
    tabIcon: 23,
    /**
     * Sekme çubuğu ikonu, operasyon yüzeyi (tasarım: 20). Değeri `headerIcon` ile aynı ama anlamı ayrı; biri kayarsa öteki
     * kaymamalı.
     */
    tabIconOperations: 20,
    /** Başlık satırındaki yuvarlak düğmenin ikonu — operasyon zil düğmesi (tasarım: 20). */
    headerIcon: 20,
    /** Girdi/düğme içinde satıra giren ikon (tasarım: arama büyüteci 17 · süzgeç çizgileri 19×17). */
    inlineIcon: 17,
    /**
     * Rozet içindeki ikon (tasarım: 11). `inlineIcon`dan ayrı, çünkü komşusu rozet yazısı (10) ve 17 dp orada satırı ikiye böler.
     */
    badgeIcon: 11,
    /** Yüzen sayfanın tutamağı (tasarım: 44×5). */
    sheetHandle: 44,
    /**
     * 44 dp'nin altındaki kontroller `touchSlop` payıyla eşiğe tamamlanır ve yapısal oldukları için yuvarlanmaz: bir piksel kayma
     * kalem karesini durak dairesine yaklaştırır.
     */
    /** Mal kaleminin ✓/✕ işaret kutusu (tasarım: 26×26). */
    markBox: 26,
    /** Durak sırası dairesi ve iade adedi ±/− düğmesi (tasarım: 30×30). */
    dotButton: 30,
    /** Çekmecedeki tek seçimli listenin radyo dairesi (tasarım: 28); kare ve durak dairesiyle aynı ölçü "aynı şey" derdi. */
    radioMark: 28,
    /** Tahsilat tutarının ±/− düğmesi (tasarım: 34×34). */
    stepButton: 34,
    /**
     * Sayacın ortasındaki rakam kolonu; rakam çekmeceyi ya da tuş takımını açan bir alan olduğu için ± düğmelerinden geniştir. Dar
     * kalınca ortaya basmak isteyen parmak artıya ya da eksiye değiyor.
     */
    stepValue: 60,
    /* Depo hub'ının ölçüleri yapısaldır: kutucuk yüksekliği ızgaranın iki satırının hizasını tutar, işaretin eni bir piksel oynarsa
       satır kayar. */
    /** Izgara kutucuğunun ikonu (tasarım: 32×32). */
    tileIcon: 32,
    /** Liste satırının solundaki ikon — mal kabul sevkiyatı (tasarım: 25×25). */
    rowIcon: 25,
    /**
     * Transfer kartının solundaki ikon karesi ve içindeki çizim (tasarım: 36 · 18). `thumb`a bağlanamaz: o ürünü gösterir, bu kartın
     * türünü söyler.
     */
    cardTile: 36,
    cardTileIcon: 18,
    /** Alt bantların satır içi ikonu — yazıcı dişlisi (tasarım: 18×18). */
    stripIcon: 18,
    /** Önizleme satırının sol işareti — en (tasarım: 5). */
    previewMark: 5,
    /** Önizleme satırının sol işareti — boy (tasarım: 26). */
    previewMarkHeight: 26,
    /** Izgara kutucuğunun yüksekliği. */
    /* Taban değil sabit, çünkü alt metni iki satıra taşan kutucuk komşusundan uzun kalıp ızgarayı kaydırıyordu; değer en uzun hâle
       göre, alt metin iki satırda kırpılır. */
    tile: 132,
    /**
     * Yönetimin "günün nabzı" kutucuğu (tasarım: `min-height:96`). Depo kutucuğundan ayrı, çünkü bu tek bir sayı taşır ve 132'lik
     * kutuda sayı ile etiketin arası açılıyordu.
     */
    pulseTile: 96,
    /**
     * Liste satırının baş harf karesi — sosyal gelen kutusu (tasarım: 34). Kişi avatarının 40'ı satırı ikinci kademeye zorlar;
     * `stepButton` değeri tutsa da o bir düğme, anlam ayrı durak açtırır.
     */
    listAvatar: 34,
    /**
     * Arama çekmecesindeki kare ürün önizlemesi; aynı ürünün iki boyu alt alta gelince metin ayırt etmeye yetmiyor. 44, satırın iki
     * metniyle dolgusuna en yakın kare, yani satırı büyütmüyor.
     */
    thumb: 44,
  },

  /**
   * Küçük dokunulabilir öğelere her kenardan eklenen dokunma payı; en küçük öğe olan metin eylemini (~20 dp) 44 dp'ye çıkarır. Tek
   * değer, çünkü öğe başına pay eşiğin bir gün birinde unutulması demek.
   */
  touchSlop: 12,

  border: {
    /** İnce iç ayraç (tasarım: 1px). */
    hairline: 1,
    /** Standart çerçeve — girdi, çip, başlık çubuğu altı (tasarım: 1.5px). */
    base: 1.5,
    /** Vurgulu girdi — "şimdi burayı doldur" alanının zeytin çerçevesi (tasarım: 2px). */
    accent: 2,
    /** Yığın avatarının krem halkası (tasarım: 2.5px). */
    ring: 2.5,
    /** Yükleniyor halkasının kalınlığı (tasarım: küçükte 3, büyükte 4). */
    spinner: 4,
    spinnerSm: 3,
    /*
      İkon çizgisi durakları `@lezzet/design-tokens/icons`tan gelir, ki web'in telefon görünümü ile aynı kaynaktan çizilsin. Tema
      adları (`iconStroke*`) çizicilerin sözleşmesidir.
    */
    iconStroke: ICON_STROKE.base,
    iconStrokeLarge: ICON_STROKE.large,
    iconStrokeBold: ICON_STROKE.bold,
    /** Yüzen sayfa tutamağının kalınlığı (tasarım: 5). Yarıçapı bundan TÜREtilir. */
    sheetHandle: 5,
  },

  /**
   * Basılı geri bildirim — web'in `cursor-pointer` + hover kuralının RN karşılığı: sert gölgeli yüzey gölgesiyle birlikte kayar,
   * gölgesiz yüzey küçülür, metin eylemi solar. Küçültme metin bağlantısında titrek durduğu için metinde opaklık kullanılır.
   */
  press: {
    translate: 2,
    scale: 0.97,
    scaleSmall: 0.9,
    opacity: 0.55,
  },

  /**
   * Sert gölge öğenin kutusunun dışına taşar ve RN'de kaydırma alanı çocuklarını kendi sınırında kırptığı için kenardaki gölge
   * sessizce kaybolur. Bu yüzden gölgeli yüzey kendi kutusunda gölgesi kadar yer ayırır (`PressableSurface`); değer token'dan gelir.
   */
  shadowRoom: customerAppShadowOffset,

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
   * Arama gecikmesi (ms) — her tuşta uca gitmemek için; tasarımda karşılığı yok, parametrik varsayılan. Kelimenin bitmesini
   * bekleyecek kadar uzun, yazmayı bırakan parmağa listenin durduğu hissini vermeyecek kadar kısa.
   */
  searchDebounceMs: 350,

  /** Tükendi ürün kartının solması (tasarım: `opacity:.45`). */
  soldOutOpacity: 0.45,

  /**
   * Seçili sekme ikonunun vurgusu (tasarım: `translateY(-2px) scale(1.12)`). Basılı geri bildirimden ayrı, çünkü o dokunma anını,
   * bu seçili kaldığı sürece durumu anlatır.
   */
  tabSelected: {
    lift: -2,
    scale: 1.12,
  },

  /**
   * Krem camın bulanıklığı: token CSS yarıçapı taşır, `expo-blur` ise tanımlı bir px karşılığı olmayan 1–100 yoğunluk ister, bu yüzden
   * değer parametrik bir varsayılan. Cam zaten %96 opak; ağır yoğunluk görünmez ama iOS'ta çizim maliyeti olur.
   */
  glassBlurIntensity: 20,
} as const;
