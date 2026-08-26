import type { z } from 'zod';
import { SettingScopeEnum } from '@lezzet/types';

/**
 * İstisna açılabilen eksenler — `global` bir istisna değil, değerin kendisidir.
 *
 * **Burada, `settings-types`'ta DEĞİL** ve sebebi yapısal: sözlük bu tipe ihtiyaç duyuyor
 * (`SettingDef.exceptionScopes`), `settings-types` de sözlükten `SettingDef`/`SettingValue`
 * alıyor. Tip öteki dosyada kalınca ikisi birbirini import etti ve `pnpm boundaries` döngü hatası
 * verdi. Eksen tanımı zaten sözlüğün konusu — "bu ayar hangi eksende bölünebilir" sorusunun evi.
 *
 * `warehouse` DAHİL (03.08): arka uç ekseni açtı (`SettingScopeEnum` beş değerli, çözücüde
 * `warehouse > zone > channel > country > global`), bu ekran da kabloladı.
 */
export const ExceptionScopeEnum = SettingScopeEnum.exclude(['global']);
export type ExceptionScope = z.infer<typeof ExceptionScopeEnum>;
import { POINTS_DAILY_CAP_DEFAULT, POINTS_DAILY_CAP_KEY, POINTS_SETTING_KEYS } from '@lezzet/domain-core';
import { FREE_SHIPPING_THRESHOLD_KEY, MIN_BASKET_KEY, POINTS_CENT_VALUE_KEY, POINTS_REDEEM_MIN_KEY, SHIPPING_FEE_KEY } from '@/lib/settings-keys';
import { DAY_HOUR_FALLBACK } from '@/lib/settings/day-hours';

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
 * ── KAPSAM: 'warehouse' ARKA UÇTA AÇILDI, EKRAN HENÜZ KABLOLU DEĞİL (03.08) ──
 * Talep karşılandı: `SettingScopeEnum` artık beş değerli, `SettingScopeContext.warehouseId` var ve
 * çözücü depoyu EN ÖZGÜL eksen olarak arıyor (depo > bölge > kanal > ülke > global). Yani depo
 * kapsamlı bir satır artık hem yazılıyor hem okunuyor.
 *
 * Ekranın eksiği kablolama: `ScopeOptions.warehouse` alanı ve `toScopeOptions`'ın depo listesini
 * alması — veri zaten sayfada (`SettingsData.warehouseOptions`). O inene kadar `ExceptionScopeEnum`
 * `warehouse`'u dışarıda tutuyor, çünkü seçenekleri boş bir eksen operatöre "Depo" yazıp seçecek
 * bir şey vermezdi. Bu sözlüğün tipi de o enum'dan gelir: sözlük, ekranın SUNABİLDİĞİNİ anlatır.
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
export type SettingKind = 'money' | 'percent' | 'integer' | 'time' | 'boolean' | 'channelFlags' | 'text' | 'account';

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
  /**
   * `global` dışında hangi eksenlerde istisna açılabilir. Boş = yalnız genel değer.
   *
   * Tip `ExceptionScope`'tan gelir (`settings-types`), `SettingScope`'tan değil: `warehouse` arka
   * uçta açık ama bu ekranda henüz kablolu değil ve sözlük ekranın sunabildiğini anlatmalı.
   * Gerekçe `ExceptionScopeEnum` künyesinde.
   */
  exceptionScopes: readonly ExceptionScope[];
  /**
   * Fabrika değeri — migration'ın yazdığı satır. `settings-catalog.test.ts` doğrular.
   *
   * **İSTEĞE BAĞLI, ve boş olması bir eksiklik değil karar.** Bazı ayarların fabrika değeri
   * OLAMAZ: `door_cash_account_id` bir hesap kimliğidir ve o kimlik her kurulumda başkadır —
   * migration'a bir uuid gömmek, o satırın hiçbir yerde karşılığı olmayan bir hesabı işaret
   * etmesi demekti. Böyle ayarlarda ekran "Varsayılana dön" SUNMAZ (dönülecek bir yer yok) ve
   * "varsayılandan farklı" işareti de anlamsızdır — kurulumun kendi seçimidir.
   *
   * Nöbet testi bunu İKİ YÖNLÜ doğrular: `fallback` verilen anahtar migration'da BULUNMALI,
   * verilmeyen BULUNMAMALI. Tek yönlü olsaydı, migration'a sonradan eklenen bir fabrika değeri
   * sözlükte görünmeden yaşardı.
   */
  fallback?: SettingValue;
}

const CHANNEL_ONLY = ['channel'] as const;
const NONE = [] as const;
/**
 * **YALNIZ rota ekseni** — günün eşik saatleri (kullanıcı kararı 17.08).
 *
 * Depo ekseni bilerek dışarıda: `SCOPE_PRIORITY`de `warehouse` `zone`dan daha özgül olduğu için iki
 * eksen birden açık olsaydı depoya yazılan bir değer bölgenin saatini **sessizce** yutardı. Tek
 * eksen = tuzak yok. Gerekçe `docs/feature/cok-gunluk-sefer.md §5`.
 */
const ZONE_ONLY = ['zone'] as const;

/**
 * Depo istisnası HANGİ ayarlarda açık — ve bu liste uydurulmadı, `0016`'nın kendi künyesinden
 * geldi: *"Depo bazlı olmaya aday değerler: kesim saati, rota teslimat birim maliyeti (kâr
 * hesabına girer — global kalırsa kâr sessizce yanlışlaşır), paketleme maliyeti, minimum sepet.
 * TTL ve raf ömrü eşikleri global kalır."*
 *
 * Ekseni AÇMAK ile her ayara AÇMAK ayrı iki karar. İkincisini yapmadım: bir eşiğin depo başına
 * ayrışabilir olması iş kuralıdır, ekranın tercihi değil — ve gereksiz açılan her eksen, operatöre
 * "burası da bölünebilir" diye yanlış bir davet olur.
 */
const WITH_WAREHOUSE = (...rest: readonly ExceptionScope[]): readonly ExceptionScope[] => ['warehouse', ...rest];

export const SETTING_CATALOG: readonly SettingDef[] = [
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
    // **DEPO EKSENİ KALDIRILDI (kullanıcı kararı 17.08).** `0016`'nın aday listesinde bu ayar adıyla
    // geçiyordu ("depolar farklı şehirlerde, kesim saatleri ayrışır") ve iki eksen birden açıktı.
    // Sorun ölçüldü: `SCOPE_PRIORITY`de `warehouse` `zone`dan DAHA ÖZGÜL — depoya 11:00, bölgeye
    // 09:00 yazılırsa depo kazanır ve bölgenin saati hiçbir hata vermeden ölü kalır. Kullanıcının
    // cümlesi: *"depo saatini komple kaldıralım, her rota saatini barındırsın; böylelikle sessiz
    // kapsam tuzağına düşmeyiz."* Gerekçe zinciri: `docs/feature/cok-gunluk-sefer.md §5`.
    exceptionScopes: ZONE_ONLY,
    // Fabrika değeri `lib/settings/day-hours`ten geliyor — bu dört saati panelin gün akışı ve rota
    // kurulumu da okuyor, değer üç yerde ayrı yazılıydı. Nöbet testi migration'a karşı doğrulamaya
    // devam ediyor; zincir artık migration ↔ day-hours ↔ sözlük.
    fallback: DAY_HOUR_FALLBACK.order_cutoff_time,
  },
  // ── GÜNÜN EŞİK SAATLERİ (09.3 paneli) ──────────────────────────────────────
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
  // "Sipariş puanı" girdisi bilerek YOK (kullanıcı kararı 26.08): sipariş puanı 11.08'de
  // kaldırıldı, kodda okuyan kalmadı ve ayar satırı yalnız yanlış bilgi veriyordu — Ayarlar'a
  // bakan operatör "siparişten 10 puan veriliyor" sonucuna varıyordu. `points_order` migration'dan
  // da söküldü; defterdeki eski `order` satırları kazanılmış puan olarak durur (DOMAIN §14).
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
