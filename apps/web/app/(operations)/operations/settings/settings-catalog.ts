import { BUSINESS_LABELS, BusinessEnum, SYSTEM_ACCOUNT_IDS } from '@lezzet/types';
import {
  AUTO_PRICE_STEP_DEFAULT,
  AUTO_PRICE_STEP_KEY,
  BANK_FEED_QUIET_DAYS_DEFAULT,
  BANK_FEED_QUIET_DAYS_KEY,
  CONVERSATION_DEFAULT_HANDLER_FALLBACK,
  CONVERSATION_DEFAULT_HANDLER_HELP,
  CONVERSATION_DEFAULT_HANDLER_KEY,
  PENNYLANE_CATEGORY_KEYS,
  PENNYLANE_INVOICE_TEMPLATE_KEYS,
  TICKET_DEFAULT_HANDLER_FALLBACK,
  TICKET_DEFAULT_HANDLER_HELP,
  TICKET_DEFAULT_HANDLER_KEY,
  TRUST_UNCOLLECTED_GRACE_DAYS_DEFAULT,
  TRUST_UNCOLLECTED_GRACE_DAYS_KEY,
  TRUST_WEIGHTS,
  PICKUP_WAIT_DAYS_DEFAULT,
  PICKUP_WAIT_DAYS_KEY,
  POINTS_DAILY_CAP_DEFAULT,
  POINTS_DAILY_CAP_KEY,
  POINTS_REDEEM_MAX_DEFAULT,
  POINTS_REDEEM_MAX_KEY,
  POINTS_SETTING_KEYS,
  REVIEW_MIN_WORDS_DEFAULT,
  REVIEW_MIN_WORDS_KEY,
} from '@lezzet/domain-core';
import { TICKET_HANDLER_LABELS, TRUST_REASON_LABELS, TicketHandlerEnum, TrustReasonEnum } from '@lezzet/types';
import { FREE_SHIPPING_THRESHOLD_KEY, MIN_BASKET_KEY, POINTS_CENT_VALUE_KEY, POINTS_REDEEM_MIN_KEY } from '@/lib/settings-keys';
import { DAY_HOUR_FALLBACK } from '@/lib/settings/day-hours';
import { DISTANCE_SALE_SETTING_DEFS } from './settings-catalog-distance-sales';
import type { ExceptionScope, SettingDef } from './settings-def';

export type { ExceptionScope, SettingDef, SettingValue } from './settings-def';

/**
 * Ayar sözlüğü: iç anahtar adı arayüzde görünmediği için operatöre gösterilecek yüz burada durur, anahtarlar sabitlerinden ithal
 * edilir. `fallback` bilinçli bir kopyadır, çünkü değiştirilen satırda fabrika değeri kalmaz; nöbet testi onu migration'a karşı doğrular.
 */

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
    section: 'handlers',
    kind: 'choice',
    // Seçenekler şemadan (`TicketHandlerEnum` + ortak etiketler): yeni bir mod eklendiğinde burası
    // kendiliğinden genişler, ikinci bir liste yazılmaz.
    choices: TicketHandlerEnum.options.map((mode) => ({ value: mode, label: TICKET_HANDLER_LABELS[mode] })),
    impact: 'Geniş etkili: AI seçiliyse her yeni müşteriye ilk cevap onaysız, ajandan gider. Açık sohbetler etkilenmez; her sohbette anahtar ayrıca çevrilebilir.',
    exceptionScopes: NONE,
    fallback: CONVERSATION_DEFAULT_HANDLER_FALLBACK,
  },
  // ── Talepler ──────────────────────────────────────────────────────────────
  {
    key: TICKET_DEFAULT_HANDLER_KEY,
    label: 'Yeni talebin yürütücüsü',
    help: TICKET_DEFAULT_HANDLER_HELP,
    section: 'handlers',
    kind: 'choice',
    choices: TicketHandlerEnum.options.map((mode) => ({ value: mode, label: TICKET_HANDLER_LABELS[mode] })),
    impact: 'Geniş etkili: AI seçiliyse her yeni talebe ilk cevap onaysız, ajandan gider; Hibrit her müşteri mesajında bir AI taslağı üretir. Açık talepler etkilenmez; her talepte anahtar ayrıca çevrilebilir.',
    exceptionScopes: NONE,
    fallback: TICKET_DEFAULT_HANDLER_FALLBACK,
  },
  // ── Güven puanı ───────────────────────────────────────────────────────────
  // Ağırlıklar sebep listesinden üretilir, ki yeni bir sebep ayarsız kalmasın; işaret sınırı cezayı ödüle çevirmeyi engeller.
  ...TrustReasonEnum.options.map(
    (reason): SettingDef => ({
      key: TRUST_WEIGHTS[reason].key,
      label: TRUST_REASON_LABELS[reason],
      help: TRUST_WEIGHTS[reason].penalty
        ? 'Bu olay müşterinin güven puanından düşülür; 0 yazılırsa sayılmaz.'
        : 'Bu olay müşterinin güven puanına eklenir; 0 yazılırsa sayılmaz.',
      section: 'trust',
      polarity: TRUST_WEIGHTS[reason].penalty ? 'penalty' : 'reward',
      kind: 'integer',
      unit: 'puan',
      ...(TRUST_WEIGHTS[reason].penalty ? { max: 0 } : { min: 0 }),
      limitReason: TRUST_WEIGHTS[reason].penalty
        ? 'Ceza eksi ya da sıfır olur; artı yazmak cezayı ödüle çevirirdi.'
        : 'Ödül artı ya da sıfır olur; eksi yazmak ödülü cezaya çevirirdi.',
      impact: 'Yalnız bundan sonra yazılan hareketleri etkiler; geçmiş hareketler yazıldıkları ağırlıkla kalır.',
      exceptionScopes: NONE,
      fallback: TRUST_WEIGHTS[reason].fallback,
    }),
  ),
  {
    key: TRUST_UNCOLLECTED_GRACE_DAYS_KEY,
    label: 'Tahsil bekleme süresi',
    help: 'Teslim edilen peşin siparişin parası bu kadar günde kapanmazsa "kapıda tahsil edilemedi" sayılır.',
    section: 'trust',
    kind: 'integer',
    unit: 'gün',
    min: 0,
    exceptionScopes: NONE,
    fallback: TRUST_UNCOLLECTED_GRACE_DAYS_DEFAULT,
  },
  // ── Sipariş & teslimat ────────────────────────────────────────────────────
  {
    key: MIN_BASKET_KEY,
    label: 'Minimum sepet tutarı (kapıya teslim)',
    help: 'Kendi aracımızla kapıya götürdüğümüz siparişlerin alt sınırı — aracın o tura çıkması anlamlı olsun diye. KARGO siparişine UYGULANMAZ: orada araç çıkmaz, müşteri kargo ücretini zaten öder. 0 = alt sınır yok.',
    section: 'basket',
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
    section: 'basket',
    kind: 'money',
    min: 0,
    impact: 'Sepette müşteriye söz olarak yazılır ("şu kadar daha ekleyin"). Düşürmek kargo ücretini üstlenmek demektir.',
    exceptionScopes: CHANNEL_ONLY,
    fallback: 10_000,
  },
  {
    key: 'order_cutoff_time',
    label: 'Sipariş kesim saati',
    help: 'Bu saatten sonra gelen sipariş bir SONRAKİ rota gününe yazılır.',
    section: 'dayHours',
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
  // Üçü de YALNIZ rota ekseninde: kesim rotanın gerçeğidir, deponun değil.
  {
    key: 'prep_cutoff_time',
    label: 'Depo hazırlık kapanışı',
    help: 'Bu saate kadar hazırlanmayan sipariş rotaya yetişmez. Panelin gün akışı ve depo nabzı bu saati okur.',
    section: 'dayHours',
    kind: 'time',
    impact: 'Panelin kesim uyarısı buna göre çalışır; öne çekmek "kesim kaçtı" uyarılarını erkene alır.',
    exceptionScopes: ZONE_ONLY,
    fallback: DAY_HOUR_FALLBACK.prep_cutoff_time,
  },
  {
    key: PICKUP_WAIT_DAYS_KEY,
    label: 'Gel-al bekleme süresi',
    help: 'Hazır gel-al siparişi bu kadar gün alınmazsa panoda ve sipariş listesinde "süresi doldu" görünür. Randevu telefonla; karar (arama, iptal) ofisin — ödenmiş sipariş iptalinde tutar tamamen iade edilir.',
    section: 'delivery',
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
    section: 'dayHours',
    kind: 'time',
    exceptionScopes: ZONE_ONLY,
    fallback: DAY_HOUR_FALLBACK.route_departure_time,
  },
  {
    key: 'courier_close_time',
    label: 'Kurye kapanışı',
    help: 'Kasanın teslim alınması beklenen an. Panelin gün akışında eşik olarak görünür.',
    section: 'dayHours',
    kind: 'time',
    exceptionScopes: ZONE_ONLY,
    fallback: DAY_HOUR_FALLBACK.courier_close_time,
  },
  {
    key: 'delivery_code_channels',
    label: 'Teslim kodu kapsamı',
    help: 'Kendi aracımızla teslimde kapı kodu hangi kanalda üretilsin. Kod müşteriye WhatsApp\'tan, numarası yoksa e-postayla gider; kurye kodu alamazsa kodsuz teslim eder.',
    section: 'delivery',
    kind: 'channelFlags',
    exceptionScopes: NONE,
    fallback: { b2b: true, b2c: false },
  },
  {
    key: 'delivery_code_max_attempts',
    label: 'Teslim kodu deneme hakkı',
    help: 'Kapıda yanlış kod hakkı. Dolunca kod kilitlenir ve kurye kodsuz teslim eder.',
    section: 'delivery',
    kind: 'integer',
    unit: 'deneme',
    min: 1,
    max: 10,
    exceptionScopes: NONE,
    fallback: 5,
  },
  {
    key: 'delivery_summary_email',
    label: 'Teslimat özeti e-postası',
    help: 'Teslim tamamlanınca müşteriye özet e-postası otomatik gitsin mi.',
    section: 'delivery',
    kind: 'boolean',
    exceptionScopes: CHANNEL_ONLY,
    fallback: true,
  },

  // ── Ödeme ─────────────────────────────────────────────────────────────────
  {
    key: 'reservation_ttl_minutes',
    label: 'Online ödeme stok bekletme',
    help: 'Ödeme tamamlanmazsa ayrılan stok bu süre sonunda serbest kalır.',
    section: 'paymentLimits',
    kind: 'integer',
    unit: 'dk',
    min: 1,
    impact: 'Geniş etkili: kısaltmak, ödemesini yavaş tamamlayan müşterinin sepetindeki malı başkasına açar.',
    exceptionScopes: NONE,
    fallback: 30,
  },
  {
    key: 'cod_max_cents',
    label: 'Kapıda ödeme tavanı',
    help: 'Kapıda ödemeyle alınabilecek azami sipariş tutarı — kötüye kullanım freni.',
    section: 'paymentLimits',
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
    section: 'paymentLimits',
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
    section: 'paymentLimits',
    kind: 'integer',
    unit: 'gün',
    min: 0,
    max: 365,
    exceptionScopes: CHANNEL_ONLY,
    fallback: 30,
  },
  {
    key: 'door_cash_account_id',
    label: 'Kapıda nakit kasası',
    help: 'Kapıda, gel-al tezgâhında ve kapı önü satışta nakit alınan paranın yazılacağı hesap (çekmece). Boşsa nakit tahsilat yazılmaz.',
    section: 'accounts',
    kind: 'account',
    accountType: 'cash',
    // Fabrika değeri migration'ın açtığı sabit Kasa hesabıdır.
    fallback: SYSTEM_ACCOUNT_IDS.cash_drawer,
    impact:
      'Bu hesap kapıda alınan nakdin çekmecesidir; kartla alınan para buraya değil kapıda kart hesabına yazılır. Yanlış hesap seçilirse nakit yanlış kasada birikir ve gün sonu mutabakatı tutmaz — hareket silinmez, düzeltilmesi elle iş çıkarır.',
    // İstisna ekseni YOK: hangi kasaya yazılacağı kanala ya da bölgeye göre değişmez; değişmesi
    // gerekiyorsa o, ikinci bir depo/tesis demektir ve cevabı depo ekseninde aranır.
    exceptionScopes: [],
  },
  {
    key: 'door_card_account_id',
    label: 'Kapıda kart hesabı',
    help: 'Kapıda, gel-al tezgâhında ve kapı önü satışta kartla alınan paranın yazılacağı hesap (kart cihazının hesabı). Boşsa kartla tahsilat yazılmaz.',
    section: 'accounts',
    kind: 'account',
    accountType: 'provider',
    impact:
      'Kart parası nakit çekmeceden ayrı tutulur, çünkü çekmece sayımı yalnız nakdi sayar ve kart parası cihazın hesabından bankaya geçer. Yanlış hesap seçilirse kart tahsilatı yanlış hesapta birikir ve banka mutabakatı tutmaz.',
    // Fabrika değeri sabit Revolut Merchant hesabıdır; istisna ekseni nakit kasasıyla aynı sebeple yok.
    fallback: SYSTEM_ACCOUNT_IDS.merchant,
    exceptionScopes: [],
  },
  {
    key: 'card_payout_account_id',
    label: 'Kart ödemeleri aktarım hesabı',
    help: "Revolut Merchant hesabındaki kart ödemelerinin aktarıldığı banka hesabı. Aktarım tamamlanınca havuz → bu hesap transferi kendiliğinden yazılır, Pennylane'den gelen banka satırı ona kendiliğinden bağlanır.",
    section: 'accounts',
    kind: 'account',
    accountType: 'bank',
    // Fabrika değeri YOK: aktarımın gittiği banka sabit hesap değildir, banka eşlemesiyle gelir.
    impact:
      'Ayar boşken aktarım olayı İŞLENMEZ ve sağlayıcı yeniden dener; ayar girilince işlenir. Yanlış hesap seçilirse banka ekstresinin satırı transferin karşısını bulamaz ve para iki hesapta birden görünür.',
    unsetNote: 'Banka hesabı seçilmedikçe aktarım olayı işlenmez; sağlayıcı yeniden dener.',
    exceptionScopes: [],
  },

  // ── Pennylane ─────────────────────────────────────────────────────────────
  {
    key: BANK_FEED_QUIET_DAYS_KEY,
    label: 'Hareket gelmiyor uyarısı',
    help: "Eşlenen banka hesabına Pennylane'den bu kadar gün hareket gelmezse muhasebe ve yönetim uyarılır; çoğu zaman bankanın Pennylane bağlantısı düşmüştür.",
    section: 'bankFeed',
    kind: 'integer',
    unit: 'gün',
    min: 1,
    max: 30,
    exceptionScopes: NONE,
    fallback: BANK_FEED_QUIET_DAYS_DEFAULT,
  },
  ...BusinessEnum.options.map((business) => ({
    key: PENNYLANE_CATEGORY_KEYS[business],
    label: `Pennylane kategorisi — ${BUSINESS_LABELS[business]}`,
    help: `${BUSINESS_LABELS[business]} belgelerinin Pennylane'de taşıdığı analitik kategori; iki işin gideri bununla ayrılır. Pennylane'de yoksa "Activité" grubunda açılır. Boşsa kategori konmaz.`,
    section: 'bankFeed' as const,
    kind: 'text' as const,
    exceptionScopes: NONE,
    fallback: BUSINESS_LABELS[business],
  })),
  ...BusinessEnum.options.map((business) => ({
    key: PENNYLANE_INVOICE_TEMPLATE_KEYS[business],
    label: `Fatura şablonu — ${BUSINESS_LABELS[business]}`,
    help: `${BUSINESS_LABELS[business]} satış faturalarını basan Pennylane şablonu (logo, ticari ad, IBAN); liste Pennylane'den okunur.`,
    section: 'bankFeed' as const,
    kind: 'invoiceTemplate' as const,
    unsetNote: "Fatura Pennylane'in varsayılan şablonuyla kesilir.",
    exceptionScopes: NONE,
  })),

  // ── Stok & tazelik ────────────────────────────────────────────────────────
  {
    key: 'near_expiry_percent',
    label: 'Yaklaşan son tarih eşiği',
    help: 'Kalan raf ömrü bu yüzdenin altına düşen parti "yaklaşan" sayılır.',
    section: 'stock',
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
    section: 'stock',
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
    section: 'stock',
    kind: 'percent',
    min: 0,
    max: 100,
    exceptionScopes: NONE,
    fallback: 75,
  },
  {
    key: 'transfer_transit_days',
    label: 'Transfer ulaşım süresi',
    help: 'Depolar arası sevkiyatın gün cinsinden yol süresi. Sevk önerisi yolda ömrü yanacak partiyi uyarır; bu süreyi belirgin aşan sevkiyat "gecikmiş" görünür.',
    section: 'stock',
    kind: 'integer',
    unit: 'gün',
    min: 0,
    max: 30,
    exceptionScopes: NONE,
    fallback: 1,
  },

  // ── Puan ──────────────────────────────────────────────────────────────────
  {
    key: POINTS_SETTING_KEYS.review,
    label: 'Yazılı yorum puanı',
    help: 'Onaylanan yorum/yıldız başına verilen puan — en değerli beyan.',
    section: 'pointsEarn',
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
    section: 'pointsEarn',
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
    section: 'pointsEarn',
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
    section: 'pointsEarn',
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
    section: 'pointsEarn',
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
    section: 'pointsEarn',
    kind: 'integer',
    unit: 'puan',
    min: 0,
    impact: 'Tavan kırpmaz, ödülün TAMAMINI reddeder. Kapsamı dışındaki ödüller etkilenmez.',
    exceptionScopes: NONE,
    // Yedek motordan gelir: `fallback` operatörün gördüğü değerdir ve motorunkinden ayrışırsa ayarı silinmiş kurulumda yanlış
    // bilgiyle karar verdirir.
    fallback: POINTS_DAILY_CAP_DEFAULT,
  },
  {
    key: POINTS_REDEEM_MIN_KEY,
    label: 'Kupona çevirme eşiği',
    help: 'Bu bakiyeye ulaşmadan puan kupona çevrilemez.',
    section: 'pointsRedeem',
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
    section: 'pointsRedeem',
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
    section: 'pointsRedeem',
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
    section: 'cost',
    kind: 'money',
    min: 0,
    impact: 'Geçmiş siparişlerin sabitlenmiş rakamlarını DEĞİŞTİRMEZ; yalnız bundan sonraki hesaplara girer.',
    // İki depo iki ayrı kurye anlaşması demektir; tek sayı kârı ikisinde de sessizce yanlış anlatır.
    exceptionScopes: WITH_WAREHOUSE('zone'),
    fallback: 250,
  },
  {
    key: 'packaging_unit_cost_cents',
    label: 'Paketleme (soğuk zincir) maliyeti',
    help: 'Soğuk zincir paketi olan sipariş başına maliyet — kâr hesabına girer.',
    section: 'cost',
    kind: 'money',
    min: 0,
    // Paket malzemesi depoda alınır ve fiyatı tesise göre değişir.
    exceptionScopes: WITH_WAREHOUSE(),
    fallback: 120,
  },
  {
    key: 'door_packaging_unit_cost_cents',
    label: 'Kapı önü satış paketleme maliyeti',
    help: 'Kapıdan elden satışta paketleme maliyeti. Varsayılan 0: mal elden gidiyor, soğuk zincir paketi yok.',
    section: 'cost',
    kind: 'money',
    min: 0,
    exceptionScopes: NONE,
    fallback: 0,
  },
  {
    key: AUTO_PRICE_STEP_KEY,
    label: 'Otomatik fiyat yuvarlama adımı',
    help: 'Otomatik fiyatlı ürünün fiyatı bu adıma yukarı yuvarlanır; 0,50 € ya da 1,00 € nakit ödemede küsuratı önler.',
    section: 'cost',
    kind: 'money',
    min: 1,
    limitReason: 'Adım en az bir sent olmalı; sıfır adımla fiyat yuvarlanamaz.',
    impact: 'Otomatik fiyatlar bir sonraki hizalamada (mal kabul, fiyat penceresi ya da toplu hizalama) bu adımla yeniden yazılır.',
    exceptionScopes: NONE,
    fallback: AUTO_PRICE_STEP_DEFAULT,
  },

  ...DISTANCE_SALE_SETTING_DEFS,
  // ── Geri bildirim ─────────────────────────────────────────────────────────
  {
    key: 'feedback_delay_days',
    label: 'Geri bildirim daveti gecikmesi',
    help: 'Teslimden kaç gün sonra davet gider. Erken sormak "daha açmadım", geç sormak unutulmuş bir deneyim getirir.',
    section: 'feedback',
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
    section: 'feedback',
    kind: 'text',
    exceptionScopes: ['country'],
    fallback: '',
  },
  {
    key: 'review_platform_name',
    label: 'Değerlendirme platformu adı',
    help: 'Müşteriye gösterilen ad — davet metnindeki "… üzerinde değerlendir".',
    section: 'feedback',
    kind: 'text',
    exceptionScopes: ['country'],
    fallback: 'Google',
  },
  {
    key: REVIEW_MIN_WORDS_KEY,
    label: 'Yorumun en az kelime sayısı',
    help: 'Puan getiren yorumun alt sınırı. En az iki harfli sözcük kelime sayılır; noktalama ve "aaa" gibi tekrar sayılmaz.',
    section: 'feedback',
    kind: 'integer',
    unit: 'kelime',
    min: 1,
    max: 20,
    exceptionScopes: NONE,
    fallback: REVIEW_MIN_WORDS_DEFAULT,
  },
] as const;

/** Anahtardan tanıma — okuma tarafı satırları buradan tanır. */
export const SETTING_BY_KEY: ReadonlyMap<string, SettingDef> = new Map(SETTING_CATALOG.map((d) => [d.key, d]));
