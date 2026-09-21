/*
  Müşteri evreninin yalnız mobil uygulamaya özgü token'ları; tabanla (`customer.ts`) `{ ...customerColors, ...customerAppColors }`
  biçiminde birleşir ve aynı addaki anahtar bu dosyadan kazanır. Web bu dosyayı görmez: `render-theme-css.ts` buradan CSS üretmez,
  parite testi okumaz, yani buradaki değişiklik masaüstünü değiştirmez.
*/
import { customerShadow, customerShadowOffset, customerText } from './customer';

/* ── FARK RENKLERİ — tabanın aynı adlı anahtarını ezer ───────────────────────
   Token Kararlari #3'te ölçülen uygulama değerleri; web tabandaki değeri görmeye devam eder. */
export const customerAppOverrides = {
  'sand-300': '#e2d8bd', // avatar/stepper zemini, spinner izi (taban: #e0d8c2 girdi kenarı)
  'olive-line': '#cddbb0', // zeytin çerçeveli ikincil düğme, kupon satırı (taban: #d7e3bd)
  star: '#d9a441', // yorum yıldızları (taban: #d99a2b)
  /* Tabanda `sand-100` ile eşitti; uygulamada bir tık gri ki bant zemini ile rozet arkası ayırt edilsin. */
  'closed-bg': '#e9e2cf', // "Teslim edildi" rozet zemini (taban: #f0e9d6)
  'disabled-fill': '#b9b29e', // engelli düğme dolgusu (taban: #c9c3b0)
  /* Fotoğraf üstü altyazı (Token Kararlari #15): tabandaki #dfe3cf krem paletin üstünde yeşile kaçıyor, resmî değer sıcak
     #d5d0c2. Web kullanımları bu değere ayrı bir turda çekilecek. */
  'on-image-soft': '#d5d0c2',
} as const satisfies Record<string, string>;

/* Kum skalasının iki ara kademesi (`sand-150` · `sand-250`) tabanda, `customer.ts`. */

/* ── HATA ailesi — Token Kararlari #3 ────────────────────────────────────────
   Metin ve zemin tabanda (`customerError`); burada yalnız paylaşılan kitin `SecondaryButton` `error` çerçevesi var, çünkü bileşen
   iki yüzeyde yaşıyor ve token yalnız operasyon setinde olsaydı müşteri temasında çözülemezdi. */
export const customerAppError = {
  'error-line': '#e0b9b2', // hata kutusu/düğmesi çerçevesi (kurye "Kabul etmedi")
} as const satisfies Record<string, string>;

/* Örtü (scrim) ailesi tabanda: `customerScrim`, `customer.ts`. */

/* ── KREM CAM (cream-glass) — Token Kararlari #17 ─────────────────────────────
   `sand-50` mürekkebinin saydam hâli: opak kurulan çubuk sayfadan kopuk duruyor ve altından akan liste kayboluyordu. `.90`
   fotoğraf üstündeki yuvarlak düğmenin, `.96` yapışkan ve alt sekme çubuğunun, çünkü altından akan metin okunur kalmalı. */
export const customerAppCreamGlass = {
  'cream-glass-soft': 'rgba(243, 239, 226, 0.90)', // foto üstü yüzen daire
  'cream-glass': 'rgba(243, 239, 226, 0.96)', // yapışkan çubuk, alt sekme çubuğu
} as const satisfies Record<string, string>;

/* ── VURGU YAPRAĞI — Token Kararlari #19 ─────────────────────────────────────
   "TAKİP" çipinin zemini; zeytinden ayrı ton, çünkü zeytin zeminli sayfada zeytin rozet görünmez olurdu. */
export const customerAppAccent = {
  'accent-leaf': '#a9c46b', // "TAKİP" çipi zemini
} as const satisfies Record<string, string>;

/* ── MARKA renkleri — Token Kararlari #5 ─────────────────────────────────────
   Palete ait değil: temayla dönmezler, döndükleri an marka olmaktan çıkarlar. Google ve WhatsApp işaretleri tabanda (`customerBrand`). */
export const customerAppBrand = {
  /* Apple Pay işareti: `ink`e çekilmez, çünkü Apple'ın kılavuzu tam siyah ister. */
  'brand-apple': '#000000',
  'brand-stripe': '#635bff', // ödeme sağlayıcı künyesi
  'brand-visa': '#1a1f71',
  /* Mastercard iç içe iki halkadır; işaret ancak ikisiyle doğru çizildiği için ikisi de token. */
  'brand-mastercard': '#eb001b',
  'brand-mastercard-alt': '#f79e1b',
} as const satisfies Record<string, string>;

/* Uygulamaya özgü renklerin tam kümesi; tabanla birleştirilerek kullanılır. */
export const customerAppColors = {
  ...customerAppOverrides,
  ...customerAppError,
  ...customerAppCreamGlass,
  ...customerAppAccent,
  ...customerAppBrand,
} as const satisfies Record<string, string>;

/* ── TİPOGRAFİ — uygulamaya özgü kademeler (Token Kararlari #6) ──────────────
   Tabandaki ölçek aynen geçerli; burada yalnız uygulamanın kendi durakları var. */
export const customerAppText = {
  /* Yüzen sayfa başlığı: ekran başlığından bir kademe yüksek, çünkü sheet açıkken ekranın kendisi arka plana düşer. */
  'sheet-title': '19px', // yüzen sayfa başlığı (Lora 600)
  'sheet-title--font-weight': '600',

  /* Bu dosyanın tek bilinçli ad çakışması: tabanda `eyebrow` masaüstünün 14px'i, uygulamanın bütün ekranları ise bu adı okuyor.
     Değer tabanın telefon kademesinden gelir ki web telefon görünümüyle iki yazım ayrışmasın. */
  eyebrow: customerText['eyebrow-xs'],
  'eyebrow--font-weight': customerText['eyebrow-xs--font-weight'],
  'eyebrow--letter-spacing': customerText['eyebrow-xs--letter-spacing'],
} as const satisfies Record<string, string>;

/* ── KÖŞE YARIÇAPLARI — Token Kararlari #7'nin resmî seti ────────────────────
   `card` ve `pill` tabanla aynı adı başka değerde taşır; web 18 ve 26'da kalır, kompozisyonda uygulama kazanır. */
export const customerAppRadius = {
  card: '20px', // kart, panel, yüzen sayfa (FARK — taban 18px)
  pill: '22px', // hap düğme, çip, sayaç (FARK — taban 26px)
} as const satisfies Record<string, string>;

/* ── GÖLGELER — Token Kararlari #5 ───────────────────────────────────────────
   Tanımlar tabanda (`customerShadow`); uygulama teması gölge ailesini bu nesneden okuduğu için burada yeniden dışa verilir. */
/** Gölge kutunun dışına taşar; çizen öğe bu kadar yer ayırmazsa kırpan kapsayıcının içinde gölgesini kaybeder. */
export const customerAppShadowOffset = customerShadowOffset;

export const customerAppShadow = {
  soft: customerShadow.soft,
  hard: customerShadow.hard,
  badge: customerShadow.badge,
} as const satisfies Record<string, string>;

/* ── BULANIKLIK — Token Kararlari #17 ─────────────────────────────────────────
   Krem camla tek yüzey tarif eder: saydamlık olmadan bulanıklık görünmez, bulanıklık olmadan altındaki metin çubuğu kirletir. RN'de
   `expo-blur` yarıçap değil yoğunluk ister; çevirinin gerekçesi `packages/mobile-kit/src/theme/metrics.ts`te. */
export const customerAppBlur = {
  glass: '8px',
} as const satisfies Record<string, string>;

/* ── FOTOĞRAF GRADYANLARI — Token Kararlari #5 ───────────────────────────────
   Mürekkep `scrim` ailesiyle aynı, taşıdıkları yeni bilgi durak yeri ve yön. Şeffaf durak `rgba(…, 0)` yazılır, çünkü `transparent`
   bazı motorlarda şeffaf siyahtır ve geçişin ortasını griye kirletir. */
export const customerAppGradient = {
  'photo-top': 'linear-gradient(180deg, rgba(21, 23, 15, 0.28), rgba(21, 23, 15, 0) 32%)',
  'photo-bottom': 'linear-gradient(180deg, rgba(21, 23, 15, 0) 40%, rgba(21, 23, 15, 0.82))',
} as const satisfies Record<string, string>;
