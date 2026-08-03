import type { SettingScope } from '@lezzet/types';
import { POINTS_SETTING_KEYS } from '@lezzet/domain-core';
import { FREE_SHIPPING_THRESHOLD_KEY, MIN_BASKET_KEY, POINTS_CENT_VALUE_KEY, POINTS_REDEEM_MIN_KEY, SHIPPING_FEE_KEY } from '@/lib/settings-keys';

/**
 * Ayar SÖZLÜĞÜ (09.16) — anahtarın insan dilindeki karşılığı.
 *
 * ── NEDEN BİR SÖZLÜK GEREKİYOR ───────────────────────────────────────────────
 * `settings` tablosu bir anahtar/değer deposudur: satırda `mlor_percent` yazar, `75` yazar. Ekranın
 * söylemesi gereken cümle ise "mal kabulde asgari kalan raf ömrü — altında uyarır, kabulü
 * engellemez"dir. Tasarım bunu kural olarak koyuyor (`admin-ayarlar.md §6`): **iç anahtar adı
 * arayüzde GÖRÜNMEZ.** O çeviri bir yerde yaşamak zorunda; burası orası.
 *
 * ── SÖZLÜK ANAHTAR ÜRETMEZ, ANAHTARA BAĞLANIR ────────────────────────────────
 * Zaten sabiti olan anahtarlar (`lib/settings-keys.ts`, `domain-core/feedback/points`) buradan
 * İTHAL edilir, yeniden yazılmaz. `settings-keys.ts`'in kendi künyesi "bir sabit dosyası her ayarı
 * toplamasın" diyor ve haklı — bu dosya o değil: burada anahtarın anlamı değil, **operatöre
 * gösterilecek yüzü** durur. Sabiti olmayan anahtarlar (tek yerde okunanlar) dize olarak geçer;
 * ikisi bir gün ayrışırsa aşağıdaki nöbet testi yakalar.
 *
 * ── `fallback` NEDEN BURADA DA VAR ───────────────────────────────────────────
 * Ekran "varsayılan 20,00 €" yazıyor ve "Varsayılana dön" düğmesi sunuyor. Satırdaki değer
 * DEĞİŞTİRİLDİĞİ an fabrika değeri veride kalmaz — migration'daki `insert` bir kez koşar. O yüzden
 * fabrika değeri burada da durur. Bu bilinçli bir kopyadır ve `settings-catalog.test.ts` onu
 * migration dosyasına karşı doğrular: sayı ayrışırsa test düşer, ekran yalan söylemez.
 *
 * ── KAPSAM: 'warehouse' BİLEREK YOK ──────────────────────────────────────────
 * `0016` migration'ının enum'unda `warehouse` var, `packages/types`'ın `SettingScopeEnum`'unda YOK
 * (ve `SettingScopeContext`'te `warehouseId` de yok). Yani depo kapsamlı bir satır bugün yazılsa
 * okuma tarafında Zod'a takılırdı. Ekran bu yüzden depo kapsamı SUNMUYOR — arka uç şeridine
 * bildirildi (`operasyon-ekranlari-arka-uc-talebi.md §7`). Şema açılınca burası da açılır.
 */

/** Ayarın ekranda hangi sekmede durduğu. */
export type SettingGroup = 'order' | 'payment' | 'stock' | 'points' | 'cost' | 'feedback';

export const SETTING_GROUPS: readonly { key: SettingGroup; label: string }[] = [
  { key: 'order', label: 'Sipariş & teslimat' },
  { key: 'payment', label: 'Ödeme' },
  { key: 'stock', label: 'Stok & tazelik' },
  { key: 'points', label: 'Puan' },
  { key: 'cost', label: 'Birim maliyet' },
  { key: 'feedback', label: 'Geri bildirim' },
] as const;

/**
 * Değerin TÜRÜ — hem gösterimi hem düzenleme kontrolünü belirler.
 *
 * `channelFlags` ayrı bir tür çünkü değeri kanal başına bir bayrak taşıyor (`{b2b, b2c}`). Bu ayarın
 * kapsamı yine de `global`: kanal ayrımı değerin İÇİNDE yaşıyor, bir istisna satırı olarak değil.
 * İkisini birden sunmak aynı soruya iki cevap kapısı açmak olurdu.
 */
export type SettingKind = 'money' | 'percent' | 'integer' | 'time' | 'boolean' | 'channelFlags' | 'text';

/** Ayarın değeri — `jsonb` sütununun ekranda karşılık gelen dar hâli. */
export type SettingValue = string | number | boolean | Record<string, boolean>;

export interface SettingDef {
  key: string;
  /** İnsan dilinde ad — arayüzde görünen tek isim. */
  label: string;
  /** "Bu neyi etkiler" — bir cümle. */
  help: string;
  group: SettingGroup;
  kind: SettingKind;
  /** Sayısal değerin birimi (`dk`, `gün`, `puan`, `cent`). Para ve yüzde kendi biçimini taşır. */
  unit?: string;
  /** Alt/üst sınır — ham sayı üzerinden (para cent, yüzde tam sayı). */
  min?: number;
  max?: number;
  /** Sınırın SEBEBİ — reddi anlaşılır kılar ("Stripe oturum asgarisi"). Sınır varsa yazılır. */
  limitReason?: string;
  /** Geniş etkili ayar: düzenleme penceresi bu cümleyi uyarı olarak gösterir. */
  impact?: string;
  /** `global` dışında hangi eksenlerde istisna açılabilir. Boş = yalnız genel değer. */
  exceptionScopes: readonly Exclude<SettingScope, 'global'>[];
  /** Fabrika değeri — migration'ın yazdığı satır. `settings-catalog.test.ts` doğrular. */
  fallback: SettingValue;
}

const CHANNEL_ONLY = ['channel'] as const;
const NONE = [] as const;

export const SETTING_CATALOG: readonly SettingDef[] = [
  // ── Sipariş & teslimat ────────────────────────────────────────────────────
  {
    key: MIN_BASKET_KEY,
    label: 'Minimum sepet tutarı',
    help: 'Bu tutarın altında sipariş tamamlanamaz. 0 = alt sınır yok.',
    group: 'order',
    kind: 'money',
    min: 0,
    impact: 'Geniş etkili: yükseltmek küçük sepetli müşterilerin siparişini engeller. Değişiklik geleceğe uygulanır, verilmiş siparişleri etkilemez.',
    exceptionScopes: ['channel', 'zone', 'country'],
    fallback: 0,
  },
  {
    key: FREE_SHIPPING_THRESHOLD_KEY,
    label: 'Ücretsiz kargo eşiği',
    help: 'Bu tutarın üstündeki kargo siparişlerinden ücret alınmaz.',
    group: 'order',
    kind: 'money',
    min: 0,
    impact: 'Sepette müşteriye söz olarak yazılır ("şu kadar daha ekleyin"). Düşürmek kargo ücretini üstlenmek demektir.',
    exceptionScopes: CHANNEL_ONLY,
    fallback: 6_000,
  },
  {
    key: SHIPPING_FEE_KEY,
    label: 'Kargo ücreti',
    help: 'Ücretsiz kargo eşiğinin altında kesilen tutar. KDV’ye tabidir.',
    group: 'order',
    kind: 'money',
    min: 0,
    exceptionScopes: ['channel', 'country'],
    fallback: 790,
  },
  {
    key: 'order_cutoff_time',
    label: 'Sipariş kesim saati',
    help: 'Bu saatten sonra gelen sipariş bir SONRAKİ rota gününe yazılır.',
    group: 'order',
    kind: 'time',
    impact: 'Geniş etkili: kesim saatini öne çekmek, bugüne yetişeceğini sanan siparişleri yarına atar.',
    exceptionScopes: ['zone'],
    fallback: '16:00',
  },
  {
    key: 'delivery_proof_required',
    label: 'Teslim onayı kapsamı',
    help: 'İmza/fotoğraf hangi kanaldan istenir. Kurye teslimde bu kanallarda onay almadan kapatamaz.',
    group: 'order',
    kind: 'channelFlags',
    exceptionScopes: NONE,
    fallback: { b2b: true, b2c: false },
  },
  {
    key: 'delivery_summary_email',
    label: 'Teslimat özeti e-postası',
    help: 'Teslim tamamlanınca müşteriye özet e-postası otomatik gitsin mi.',
    group: 'order',
    kind: 'boolean',
    exceptionScopes: CHANNEL_ONLY,
    fallback: true,
  },

  // ── Ödeme ─────────────────────────────────────────────────────────────────
  {
    key: 'reservation_ttl_minutes',
    label: 'Online ödeme stok bekletme',
    help: 'Ödeme tamamlanmazsa ayrılan stok bu süre sonunda serbest kalır.',
    group: 'payment',
    kind: 'integer',
    unit: 'dk',
    min: 30,
    limitReason: 'Ödeme sağlayıcısının oturum asgarisi 30 dakika — altına inilirse stok, ödeme penceresi kapanmadan serbest kalır.',
    impact: 'Geniş etkili: kısaltmak, ödemesini yavaş tamamlayan müşterinin sepetindeki malı başkasına açar.',
    exceptionScopes: NONE,
    fallback: 30,
  },
  {
    key: 'cod_max_cents',
    label: 'Kapıda ödeme tavanı',
    help: 'Kapıda ödemeyle alınabilecek azami sipariş tutarı — kötüye kullanım freni.',
    group: 'payment',
    kind: 'money',
    min: 0,
    impact: 'Geniş etkili: düşürmek, üstündeki sepetlerde kapıda ödeme seçeneğini kapatır.',
    exceptionScopes: ['channel', 'country'],
    fallback: 30_000,
  },
  {
    key: 'cash_legal_limit_cents',
    label: 'Nakit yasal uyarı eşiği',
    help: 'Bu tutarın üstündeki nakit tahsilatta uyarı verilir — engellenmez.',
    group: 'payment',
    kind: 'money',
    min: 0,
    limitReason: 'Yasal sınır ülkeye göre değişir (FR ~1.000 €); ülke istisnası bu yüzden açık.',
    exceptionScopes: ['country'],
    fallback: 100_000,
  },
  {
    key: 'payment_term_days',
    label: 'Vade süresi varsayılanı',
    help: 'Vadeli müşteride kartında ayrı bir süre yazmıyorsa bu geçerli olur.',
    group: 'payment',
    kind: 'integer',
    unit: 'gün',
    min: 0,
    max: 365,
    exceptionScopes: CHANNEL_ONLY,
    fallback: 30,
  },

  // ── Stok & tazelik ────────────────────────────────────────────────────────
  {
    key: 'near_expiry_percent',
    label: 'Yaklaşan son tarih eşiği',
    help: 'Kalan raf ömrü bu yüzdenin altına düşen parti "yaklaşan" sayılır.',
    group: 'stock',
    kind: 'percent',
    min: 0,
    max: 100,
    exceptionScopes: NONE,
    fallback: 25,
  },
  {
    key: 'near_expiry_discount_percent',
    label: 'Önerilen indirim oranı',
    help: 'Yaklaşan son tarihli parti için önerilen indirim. Öneridir — karar insanın.',
    group: 'stock',
    kind: 'percent',
    min: 0,
    max: 100,
    exceptionScopes: NONE,
    fallback: 30,
  },
  {
    key: 'mlor_percent',
    label: 'Girişte tazelik kabul eşiği',
    help: 'Mal kabulde asgari kalan raf ömrü. Altında uyarır, kabulü engellemez.',
    group: 'stock',
    kind: 'percent',
    min: 0,
    max: 100,
    exceptionScopes: NONE,
    fallback: 75,
  },

  // ── Puan ──────────────────────────────────────────────────────────────────
  {
    key: POINTS_SETTING_KEYS.review,
    label: 'Yazılı yorum puanı',
    help: 'Onaylanan yorum/yıldız başına verilen puan — en değerli beyan.',
    group: 'points',
    kind: 'integer',
    unit: 'puan',
    min: 0,
    exceptionScopes: NONE,
    fallback: 20,
  },
  {
    key: POINTS_SETTING_KEYS.feedback_purchase,
    label: 'Alım sonrası beğeni puanı',
    help: 'Müşteri aldığı ürünü değerlendirdiğinde verilen puan.',
    group: 'points',
    kind: 'integer',
    unit: 'puan',
    min: 0,
    exceptionScopes: NONE,
    fallback: 5,
  },
  {
    key: POINTS_SETTING_KEYS.feedback_candidate,
    label: 'Keşif beğenisi puanı',
    help: 'Henüz almadığı bir ürünü keşifte değerlendirme — en ucuz aksiyon.',
    group: 'points',
    kind: 'integer',
    unit: 'puan',
    min: 0,
    exceptionScopes: NONE,
    fallback: 2,
  },
  {
    key: POINTS_SETTING_KEYS.order,
    label: 'Sipariş puanı',
    help: 'Tamamlanan sipariş başına verilen puan.',
    group: 'points',
    kind: 'integer',
    unit: 'puan',
    min: 0,
    exceptionScopes: NONE,
    fallback: 10,
  },
  {
    key: POINTS_SETTING_KEYS.referral,
    label: 'Getiren müşteri puanı',
    help: 'Yeni müşteriyi getiren kişiye verilen puan.',
    group: 'points',
    kind: 'integer',
    unit: 'puan',
    min: 0,
    exceptionScopes: NONE,
    fallback: 50,
  },
  {
    key: 'points_daily_cap',
    label: 'Günlük puan tavanı',
    help: 'Bir müşterinin bir günde kazanabileceği azami puan — istismar freni.',
    group: 'points',
    kind: 'integer',
    unit: 'puan',
    min: 0,
    exceptionScopes: NONE,
    fallback: 100,
  },
  {
    key: POINTS_REDEEM_MIN_KEY,
    label: 'Kupona çevirme eşiği',
    help: 'Bu bakiyeye ulaşmadan puan kupona çevrilemez.',
    group: 'points',
    kind: 'integer',
    unit: 'puan',
    min: 0,
    impact: 'Müşteri hesabında söz olarak yazılır. Yükseltmek, eşiğe yaklaşmış müşterinin beklediği kuponu uzaklaştırır.',
    exceptionScopes: NONE,
    fallback: 500,
  },
  {
    key: POINTS_CENT_VALUE_KEY,
    label: 'Puanın değeri',
    help: 'Bir puanın kuruş karşılığı. 1 = 100 puan 1,00 € eder.',
    group: 'points',
    kind: 'integer',
    unit: 'cent',
    min: 0,
    exceptionScopes: NONE,
    fallback: 1,
  },

  // ── Birim maliyet (kâr hesabının girdileri) ────────────────────────────────
  {
    key: 'route_delivery_unit_cost_cents',
    label: 'Rota teslimat birim maliyeti',
    help: 'Kendi rotamızla giden sipariş başına maliyet — kâr hesabına girer.',
    group: 'cost',
    kind: 'money',
    min: 0,
    impact: 'Geçmiş siparişlerin sabitlenmiş rakamlarını DEĞİŞTİRMEZ; yalnız bundan sonraki hesaplara girer.',
    exceptionScopes: ['zone'],
    fallback: 250,
  },
  {
    key: 'packaging_unit_cost_cents',
    label: 'Paketleme (soğuk zincir) maliyeti',
    help: 'Soğuk zincir paketi olan sipariş başına maliyet — kâr hesabına girer.',
    group: 'cost',
    kind: 'money',
    min: 0,
    exceptionScopes: NONE,
    fallback: 120,
  },
  {
    key: 'door_packaging_unit_cost_cents',
    label: 'Kapı önü satış paketleme maliyeti',
    help: 'Kapıdan elden satışta paketleme maliyeti. Varsayılan 0: mal elden gidiyor, soğuk zincir paketi yok.',
    group: 'cost',
    kind: 'money',
    min: 0,
    exceptionScopes: NONE,
    fallback: 0,
  },

  // ── Geri bildirim ─────────────────────────────────────────────────────────
  {
    key: 'feedback_delay_days',
    label: 'Geri bildirim daveti gecikmesi',
    help: 'Teslimden kaç gün sonra davet gider. Erken sormak "daha açmadım", geç sormak unutulmuş bir deneyim getirir.',
    group: 'feedback',
    kind: 'integer',
    unit: 'gün',
    min: 0,
    max: 90,
    exceptionScopes: NONE,
    fallback: 10,
  },
  {
    key: 'review_platform_url',
    label: 'Dış değerlendirme bağlantısı',
    help: 'Google İşletme Profili / Trustpilot adresi. BOŞSA akış sonunda davet hiç gösterilmez.',
    group: 'feedback',
    kind: 'text',
    exceptionScopes: ['country'],
    fallback: '',
  },
  {
    key: 'review_platform_name',
    label: 'Değerlendirme platformu adı',
    help: 'Müşteriye gösterilen ad — davet metnindeki "… üzerinde değerlendir".',
    group: 'feedback',
    kind: 'text',
    exceptionScopes: ['country'],
    fallback: 'Google',
  },
] as const;

/** Anahtardan tanıma — okuma tarafı satırları buradan tanır. */
export const SETTING_BY_KEY: ReadonlyMap<string, SettingDef> = new Map(SETTING_CATALOG.map((d) => [d.key, d]));
