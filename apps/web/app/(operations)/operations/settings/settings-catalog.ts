import type { z } from 'zod';
import { SettingScopeEnum } from '@lezzet/types';

/**
 * İstisna açılabilen eksenler; `global` istisna değil, değerin kendisidir. Tip burada durur, çünkü `settings-types` sözlükten tip
 * alıyor ve öteki dosyada kalsaydı iki dosya birbirini import ederdi.
 */
export const ExceptionScopeEnum = SettingScopeEnum.exclude(['global']);
export type ExceptionScope = z.infer<typeof ExceptionScopeEnum>;
import {
  CONVERSATION_DEFAULT_HANDLER_FALLBACK,
  CONVERSATION_DEFAULT_HANDLER_HELP,
  CONVERSATION_DEFAULT_HANDLER_KEY,
  PICKUP_WAIT_DAYS_DEFAULT,
  PICKUP_WAIT_DAYS_KEY,
  POINTS_DAILY_CAP_DEFAULT,
  POINTS_DAILY_CAP_KEY,
  POINTS_REDEEM_MAX_DEFAULT,
  POINTS_REDEEM_MAX_KEY,
  POINTS_SETTING_KEYS,
} from '@lezzet/domain-core';
import { TICKET_HANDLER_LABELS, TicketHandlerEnum } from '@lezzet/types';
import { FREE_SHIPPING_THRESHOLD_KEY, MIN_BASKET_KEY, POINTS_CENT_VALUE_KEY, POINTS_REDEEM_MIN_KEY, SHIPPING_FEE_KEY } from '@/lib/settings-keys';
import { DAY_HOUR_FALLBACK } from '@/lib/settings/day-hours';

/**
 * Ayar sözlüğü: iç anahtar adı arayüzde görünmediği için operatöre gösterilecek yüz burada durur, anahtarlar sabitlerinden ithal
 * edilir. `fallback` bilinçli bir kopyadır, çünkü değiştirilen satırda fabrika değeri kalmaz; nöbet testi onu migration'a karşı doğrular.
 */

/** Ayarın ekranda hangi sekmede durduğu. */
export type SettingGroup = 'order' | 'payment' | 'stock' | 'points' | 'cost' | 'feedback' | 'social';

export const SETTING_GROUPS: readonly { key: SettingGroup; label: string }[] = [
  { key: 'order', label: 'Sipariş & teslimat' },
  { key: 'payment', label: 'Ödeme' },
  { key: 'stock', label: 'Stok & tazelik' },
  { key: 'points', label: 'Puan' },
  { key: 'cost', label: 'Birim maliyet' },
  { key: 'feedback', label: 'Geri bildirim' },
  // Sosyal mesajlaşma: ilk ayarı yeni sohbetin yürütücüsü; ajan ve kanal ayarları buraya gelir.
  { key: 'social', label: 'Sosyal mesajlar' },
] as const;

/**
 * Değerin türü, gösterimi ve düzenleme kontrolünü belirler. `channelFlags`in kanal ayrımı değerin içinde yaşar, istisna satırı
 * olarak değil, yoksa aynı soruya iki cevap kapısı açılırdı.
 */
export type SettingKind = 'money' | 'percent' | 'integer' | 'time' | 'boolean' | 'channelFlags' | 'text' | 'account' | 'choice';

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
  /** `choice` türünün seçenekleri: değer listeden gelir ki ekran bir enum'u ham kimliğiyle göstermesin. */
  choices?: readonly { value: string; label: string }[];
  /** Alt/üst sınır — ham sayı üzerinden (para cent, yüzde tam sayı). */
  min?: number;
  max?: number;
  /** Sınırın SEBEBİ — reddi anlaşılır kılar ("Stripe oturum asgarisi"). Sınır varsa yazılır. */
  limitReason?: string;
  /** Geniş etkili ayar: düzenleme penceresi bu cümleyi uyarı olarak gösterir. */
  impact?: string;
  /** `global` dışında istisna açılabilen eksenler; boşsa yalnız genel değer. Tip ekranın sunabildiği eksenlerden gelir. */
  exceptionScopes: readonly ExceptionScope[];
  /**
   * Fabrika değeri, migration'ın yazdığı satır; kurulumdan kuruluma değişen ayarlarda (hesap kimliği gibi) bilerek boştur. Nöbet
   * testi iki yönlü doğrular: `fallback` verilen anahtar migration'da bulunmalı, verilmeyen bulunmamalı.
   */
  fallback?: SettingValue;
}

const CHANNEL_ONLY = ['channel'] as const;
const NONE = [] as const;
/** Yalnız rota ekseni: depo ekseni de açık olsaydı depoya yazılan değer daha özgül olduğu için bölgenin saatini sessizce yutardı. */
const ZONE_ONLY = ['zone'] as const;

/**
 * Depo istisnasının açık olduğu ayarlar; liste `0016`'nın depo bazlı aday listesinden gelir. Bir eşiğin depo başına ayrışması iş
 * kuralıdır, gereksiz açılan her eksen operatöre yanlış bir davet olurdu.
 */
const WITH_WAREHOUSE = (...rest: readonly ExceptionScope[]): readonly ExceptionScope[] => ['warehouse', ...rest];

export const SETTING_CATALOG: readonly SettingDef[] = [
  // ── Sosyal mesajlar ───────────────────────────────────────────────────────
  {
    key: CONVERSATION_DEFAULT_HANDLER_KEY,
    label: 'Yeni sohbetin yürütücüsü',
    help: CONVERSATION_DEFAULT_HANDLER_HELP,
    group: 'social',
    kind: 'choice',
    // Seçenekler şemadan (`TicketHandlerEnum` + ortak etiketler): yeni bir mod eklendiğinde burası
    // kendiliğinden genişler, ikinci bir liste yazılmaz.
    choices: TicketHandlerEnum.options.map((mode) => ({ value: mode, label: TICKET_HANDLER_LABELS[mode] })),
    impact: 'Geniş etkili: AI seçiliyse her yeni müşteriye ilk cevap onaysız, ajandan gider. Açık sohbetler etkilenmez; her sohbette anahtar ayrıca çevrilebilir.',
    exceptionScopes: NONE,
    fallback: CONVERSATION_DEFAULT_HANDLER_FALLBACK,
  },
  // ── Sipariş & teslimat ────────────────────────────────────────────────────
  {
    key: MIN_BASKET_KEY,
    label: 'Minimum sepet tutarı (kapıya teslim)',
    help: 'Kendi aracımızla kapıya götürdüğümüz siparişlerin alt sınırı — aracın o tura çıkması anlamlı olsun diye. KARGO siparişine UYGULANMAZ: orada araç çıkmaz, müşteri kargo ücretini zaten öder. 0 = alt sınır yok.',
    group: 'order',
    kind: 'money',
    min: 0,
    impact: 'Geniş etkili: yükseltmek küçük sepetli müşterilerin KAPIYA TESLİM siparişini engeller; kargo siparişleri etkilenmez. Tek istisna kanal satırıdır — toptan (b2b) alt sınırı bir ticari şarttır ve kargoda da geçerlidir. Değişiklik geleceğe uygulanır, verilmiş siparişleri etkilemez.',
    exceptionScopes: WITH_WAREHOUSE('channel', 'zone', 'country'),
    fallback: 4000,
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
    fallback: 10_000,
  },
  {
    key: SHIPPING_FEE_KEY,
    label: 'Kargo ücreti',
    help: 'Ücretsiz kargo eşiğinin altında kesilen tutar. KDV’ye tabidir.',
    group: 'order',
    kind: 'money',
    min: 0,
    exceptionScopes: ['channel', 'country'],
    fallback: 1_190,
  },
  {
    key: 'order_cutoff_time',
    label: 'Sipariş kesim saati',
    help: 'Bu saatten sonra gelen sipariş bir SONRAKİ rota gününe yazılır.',
    group: 'order',
    kind: 'time',
    impact: 'Geniş etkili: kesim saatini öne çekmek, bugüne yetişeceğini sanan siparişleri yarına atar.',
    // Depo ekseni yok: depo bölgeden daha özgül olduğu için depoya yazılan saat bölgenin saatini hata vermeden öldürürdü; her rota
    // kendi saatini taşır.
    exceptionScopes: ZONE_ONLY,
    // Fabrika değeri `lib/settings/day-hours`ten: bu dört saati panelin gün akışı ve rota kurulumu da okur. Nöbet testi zinciri
    // migration ↔ day-hours ↔ sözlük olarak doğrular.
    fallback: DAY_HOUR_FALLBACK.order_cutoff_time,
  },
  // ── GÜNÜN EŞİK SAATLERİ ─────────────────────────────────────────────────────
  // Üçü de YALNIZ rota ekseninde: kesim rotanın gerçeğidir, deponun değil. Çok günlü tur geldiğinde
  // (`docs/feature/cok-gunluk-sefer.md`) kesimin turun ÇIKIŞ gününe bağlanması ancak bu eksenle
  // ifade edilebilir — depo ekseninde imkânsızdı.
  {
    key: 'prep_cutoff_time',
    label: 'Depo hazırlık kapanışı',
    help: 'Bu saate kadar hazırlanmayan sipariş rotaya yetişmez. Panelin gün akışı ve depo nabzı bu saati okur.',
    group: 'order',
    kind: 'time',
    impact: 'Panelin kesim uyarısı buna göre çalışır; öne çekmek "kesim kaçtı" uyarılarını erkene alır.',
    exceptionScopes: ZONE_ONLY,
    fallback: DAY_HOUR_FALLBACK.prep_cutoff_time,
  },
  {
    key: PICKUP_WAIT_DAYS_KEY,
    label: 'Gel-al bekleme süresi',
    help: 'Hazır gel-al siparişi bu kadar gün alınmazsa panoda ve sipariş listesinde "süresi doldu" görünür. Randevu telefonla; karar (arama, iptal) ofisin — ödenmiş sipariş iptalinde tutar tamamen iade edilir.',
    group: 'order',
    kind: 'integer',
    unit: 'gün',
    min: 1,
    max: 60,
    exceptionScopes: WITH_WAREHOUSE(),
    fallback: PICKUP_WAIT_DAYS_DEFAULT,
  },
  {
    key: 'route_departure_time',
    label: 'Rota çıkış saati',
    help: 'Kuryenin yola çıkması beklenen an. Panelin gün akışında eşik olarak görünür.',
    group: 'order',
    kind: 'time',
    exceptionScopes: ZONE_ONLY,
    fallback: DAY_HOUR_FALLBACK.route_departure_time,
  },
  {
    key: 'courier_close_time',
    label: 'Kurye kapanışı',
    help: 'Kasanın teslim alınması beklenen an. Panelin gün akışında eşik olarak görünür.',
    group: 'order',
    kind: 'time',
    exceptionScopes: ZONE_ONLY,
    fallback: DAY_HOUR_FALLBACK.courier_close_time,
  },
  {
    key: 'delivery_proof_required',
    label: 'Teslim onayı kapsamı',
    /* Kurye ekranında imza adımı yok, yerine kutu okutması var; ayar durur ki kapsam gerekirse açılabilsin, yardım metni de açıldığında
       alınacak kanıt olmadığını söyler. */
    help: 'Kanıt hangi kanalda zorunlu olsun. Bugün ikisi de kapalı: kanıt kutu okutmasının kendisidir (imza adımı kaldırıldı).',
    group: 'order',
    kind: 'channelFlags',
    exceptionScopes: NONE,
    fallback: { b2b: false, b2c: false },
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
  {
    key: 'door_cash_account_id',
    label: 'Kapı önü satış kasası',
    help: 'Kapıda/dükkânda alınan paranın hangi hesaba yazılacağı. Satış anında hesap seçilmezse bu kullanılır.',
    group: 'payment',
    kind: 'account',
    // Fabrika değeri YOK ve olamaz: değer bir hesap kimliği, her kurulumda başka. Migration'a uuid
    // gömmek, hiçbir yerde karşılığı olmayan bir hesabı işaret eden bir satır bırakırdı.
    impact:
      'Bu hesap kapı önü satışın parasının indiği yerdir (`quick-sale`). Yanlış hesap seçilirse para kaydı yanlış kasada birikir ve gün sonu mutabakatı tutmaz — hareket silinmez, düzeltilmesi elle iş çıkarır.',
    // İstisna ekseni YOK: hangi kasaya yazılacağı kanala ya da bölgeye göre değişmez; değişmesi
    // gerekiyorsa o, ikinci bir depo/tesis demektir ve cevabı depo ekseninde aranır.
    exceptionScopes: [],
  },
  {
    key: 'stripe_payout_account_id',
    label: 'Stripe payout hesabı',
    help: 'Stripe havuzundaki paranın aktarıldığı banka hesabı. Payout geldiğinde Stripe → bu hesap transferi kendiliğinden yazılır (12.14).',
    group: 'payment',
    kind: 'account',
    // Fabrika değeri YOK (kapı önü kasasıyla aynı gerekçe): değer bir hesap kimliği, her kurulumda başka.
    impact:
      'Ayar boşken payout olayı İŞLENMEZ ve sağlayıcı yeniden dener; ayar girilince işlenir. Yanlış hesap seçilirse banka ekstresinin satırı transferin karşısını bulamaz ve para iki hesapta birden görünür.',
    exceptionScopes: [],
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
    key: 'transfer_transit_days',
    label: 'Transfer ulaşım süresi',
    help: 'Depolar arası sevkiyatın gün cinsinden yol süresi. Sevk önerisi yolda ömrü yanacak partiyi uyarır; bu süreyi belirgin aşan sevkiyat "gecikmiş" görünür.',
    group: 'stock',
    kind: 'integer',
    min: 0,
    max: 30,
    exceptionScopes: NONE,
    fallback: 1,
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
  // Sipariş puanı girdisi bilerek yok: sipariş puanı yazılmıyor ve ayar satırı operatöre yanlış bilgi verirdi.
  {
    key: POINTS_SETTING_KEYS.referral,
    label: 'Getiren müşteri puanı',
    help: 'Hesabı OLMAYAN yeni bir müşteriyi getiren kişiye verilen puan. Ödül, getirilen kişinin ilk siparişinin parası alındığında yazılır.',
    group: 'points',
    kind: 'integer',
    unit: 'puan',
    min: 0,
    impact: 'Çevirme eşiğiyle birlikte okunur: 500 puan tam bir kupon eder ve hesap ekranı bunu söz olarak yazıyor. Düşürmek o sözü boşa çıkarır.',
    exceptionScopes: NONE,
    fallback: 500,
  },
  {
    key: POINTS_SETTING_KEYS.neighbor,
    label: 'Komşu daveti puanı',
    help: 'Komşusunu AYNI teslimat gününe çağıran kişiye verilen puan. Ödül, komşunun siparişinin parası alındığında yazılır.',
    group: 'points',
    kind: 'integer',
    unit: 'puan',
    min: 0,
    impact: 'Getiren ödülünden bilinçli olarak düşüktür: komşu daveti bir seferi doldurur, getiren bir müşteri kazandırır.',
    exceptionScopes: NONE,
    fallback: 100,
  },
  {
    key: POINTS_DAILY_CAP_KEY,
    label: 'Günlük puan tavanı',
    help: 'Bir günde kazanılabilecek azami puan. YALNIZ para ödemeden yapılabilen eylemleri kapsar (siteye gelmek, keşifte oy vermek); yorum ve davet ödülleri bu tavanı görmez.',
    group: 'points',
    kind: 'integer',
    unit: 'puan',
    min: 0,
    impact: 'Tavan kırpmaz, ödülün TAMAMINI reddeder. Kapsamı dışındaki ödüller etkilenmez.',
    exceptionScopes: NONE,
    // Yedek MOTORDAN: burada `100` yazılıydı ve tavan 270'e çıkınca ekran motorun uygulamayacağı
    // bir sayı gösterir olmuştu. `fallback` operatörün gördüğü değerdir — ayrışması, ayarın kendisi
    // silinmiş bir kurulumda yanlış bilgiyle karar verdirir.
    fallback: POINTS_DAILY_CAP_DEFAULT,
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
    key: POINTS_REDEEM_MAX_KEY,
    label: 'Tek kuponun azami puanı',
    help: 'Müşteri bir basışta en fazla bu kadar puanı kupona çevirir; fazlası bakiyede kalır.',
    group: 'points',
    kind: 'integer',
    unit: 'puan',
    min: 0,
    impact: 'Tek siparişe inebilecek puan indirimini sınırlar. Düşürmek, büyük bakiyeyi daha çok parçaya böler.',
    exceptionScopes: NONE,
    fallback: POINTS_REDEEM_MAX_DEFAULT,
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
    // `0016` bu ayarı gerekçesiyle sayıyor: "kâr hesabına girer — global kalırsa kâr sessizce
    // yanlışlaşır". İki depo iki ayrı kurye anlaşması demek; tek sayı ikisini de yanlış anlatır.
    exceptionScopes: WITH_WAREHOUSE('zone'),
    fallback: 250,
  },
  {
    key: 'packaging_unit_cost_cents',
    label: 'Paketleme (soğuk zincir) maliyeti',
    help: 'Soğuk zincir paketi olan sipariş başına maliyet — kâr hesabına girer.',
    group: 'cost',
    kind: 'money',
    min: 0,
    // `0016`'nın dördüncü adayı. Paket malzemesi depoda alınır ve fiyatı tesise göre değişir.
    exceptionScopes: WITH_WAREHOUSE(),
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
