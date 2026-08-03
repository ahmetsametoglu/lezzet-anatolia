import { z } from 'zod';

// Proje-geneli enum'lar — DATA_MODEL "Enum'lar (özet)" listesinin karşılığı (01-types görevi 01.2).
// Ölçüt: birden çok varlık kullanıyorsa BURAYA; tek varlığa özgüyse o varlığın şemasında kalır
// (ör. ProductAllergen yalnız üründe → product.schema.ts).
//
// Liste artımlı büyür: bir enum, onu kullanan ilk varlık yazılırken eklenir.

/** Kanal — *kim* alıyor. `Price`, `Order`, `Customer` türetimi ve `Discount` kapsamı kullanır. */
export const ChannelEnum = z.enum(['b2b', 'b2c']);
export type Channel = z.infer<typeof ChannelEnum>;

/** Para birimi. Tek pazar (FR/DE) → tek değer; çoklu döviz Faz 1'de yok. */
export const CurrencyEnum = z.enum(['EUR']);
export type Currency = z.infer<typeof CurrencyEnum>;

/** Sipariş durumu — geçiş kuralları `ORDER_LIFECYCLE.md`, motor: domain-core/order. */
export const OrderStatusEnum = z.enum([
  'draft',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'completed',
  'cancelled',
  'returned',
]);
export type OrderStatus = z.infer<typeof OrderStatusEnum>;

/**
 * Sipariş durumunun OPERASYON yüzeyindeki adı — personel ekranları yalnız Türkçedir (CLAUDE.md §2),
 * bu yüzden düz metin (çok dilli değil). Enum'la aynı dosyada durur ki yeni bir durum eklenince
 * karşılığının da yazılması unutulmasın: `Record` eksik anahtarda derlemeyi durdurur.
 *
 * Müşteri yüzeyi bu haritayı KULLANMAZ — orada durum adı i18n mesaj dosyasından gelir ve zaten daha
 * az ayrıntılıdır (müşteri "hazırlanıyor" ile "hazır" arasındaki iç ayrımı görmez).
 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Taslak',
  confirmed: 'Onaylandı',
  preparing: 'Hazırlanıyor',
  ready: 'Hazır',
  out_for_delivery: 'Yolda',
  delivered: 'Teslim edildi',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
  returned: 'İade',
};

/**
 * Ödeme durumunun OPERASYON yüzeyindeki adı — `ORDER_STATUS_LABELS` ile aynı gerekçe: enum'la aynı
 * yerde durur ki yeni bir durum eklendiğinde karşılığı unutulmasın.
 *
 * Proje geneli olmasının sebebi somut: sipariş ekranı, müşteri ekranı ve sipariş özeti diyaloğu aynı
 * dört kelimeyi yazıyor. Sayfa klasöründe durduğu sürece ikinci ekran onu kopyalıyordu ve kopyalar
 * AYRIŞIYORDU ("İade" ↔ "İade edildi").
 */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Bekliyor',
  partial: 'Kısmi',
  paid: 'Ödendi',
  refunded: 'İade',
};

/**
 * Sipariş durumunun MÜŞTERİ yüzeyindeki hâli — **kapalı ve dar bir küme** (tasarım: "iç durum
 * adları asla sızmaz"). Dokuz iç durum altıya iner: müşteri `preparing` ile `ready` arasındaki
 * operasyon ayrımını da, `delivered` ile `completed` arasındaki muhasebe ayrımını da görmez.
 *
 * Burası yalnız KATEGORİdir, metin değil: adı üç dilde sayfanın `messages.json`'undan gelir
 * (operasyon haritası düz Türkçe metin tutar, çünkü o yüzey tek dillidir). Kategori ile metni
 * ayırmasaydık, çeviri dosyası iç durum adlarını taşımak zorunda kalırdı.
 *
 * Eşleme `domain-core/order/customer-status` — saf karar, DB'siz ve testli.
 */
export const CustomerOrderStatusEnum = z.enum([
  'received',
  'preparing',
  'on_the_way',
  'delivered',
  'cancelled',
  'returning',
]);
export type CustomerOrderStatus = z.infer<typeof CustomerOrderStatusEnum>;

/** Sipariş kaynağı — *nereden kapandı*. Kanaldan BAĞIMSIZ eksen (DOMAIN §3, CHANNELS §2). */
export const OrderSourceEnum = z.enum(['web', 'whatsapp', 'door', 'manual']);
export type OrderSource = z.infer<typeof OrderSourceEnum>;

/** KDV işleme tipi — siparişe yazılır, muhasebe export'u bunu okur (DOMAIN §5). */
export const VatTreatmentEnum = z.enum(['domestic', 'intra_eu_b2b_reverse_charge']);
export type VatTreatment = z.infer<typeof VatTreatmentEnum>;

/** Teslimat ülkesi — DE B2C için OSS eşiği izlemi (DOMAIN §5). */
export const CountryEnum = z.enum(['FR', 'DE']);
export type Country = z.infer<typeof CountryEnum>;

/**
 * Ülkenin OPERASYON yüzeyindeki adı — `ORDER_STATUS_LABELS` ile aynı gerekçe: sözlük enum'un
 * YANINDA durur, çünkü `Record<Country, …>` eksik anahtarda derlemeyi durdurur. Üçüncü bir ülke
 * eklendiği gün karşılığını yazmak unutulamaz; sözlük ayrı bir pakete konsaydı derleyici susardı.
 */
export const COUNTRY_LABELS: Record<Country, string> = {
  FR: 'Fransa',
  DE: 'Almanya',
};

/** Teslimat tipi — rota içi kapı teslimi / kargo (DOMAIN §6). */
export const DeliveryTypeEnum = z.enum(['route', 'shipping']);
export type DeliveryType = z.infer<typeof DeliveryTypeEnum>;

/**
 * Kargo taşıyıcısı (07.12) — **tanımlı küme, serbest metin değil.**
 *
 * Takip bağlantısı taşıyıcının URL kalıbından üretilir ve serbest metinden çıkmaz; o zaman
 * tasarımın "Kargoyu takip et ↗" düğmesinin karşılığı olmazdı. `other` kümeyi kapatmamak için
 * var — yeni bir taşıyıcıyla çalışmaya başlamak bir migration beklememeli; o seçilince bağlantı
 * gösterilmez, numara düz metin durur.
 */
export const CarrierEnum = z.enum(['colissimo', 'chronopost', 'dhl', 'ups', 'other']);
export type Carrier = z.infer<typeof CarrierEnum>;

/**
 * Ödeme yöntemi. **`on_account` (vadeli) BU LİSTEDE DEĞİLDİR** — vade bir yöntem değil, siparişin
 * bir özelliğidir (`Order.on_account`); tahsilat sonradan havaleyle yapılır (DOMAIN §7).
 */
export const PaymentMethodEnum = z.enum(['online', 'cash', 'card', 'cheque', 'bank_transfer']);
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

/**
 * İçerik dili. `packages/i18n` aynı üçlüyü ARAYÜZ tarafı için `LOCALES` olarak tutar — bilerek
 * ayrı: `types` hiçbir iç pakete bağlanmaz (STACK §4), bu yüzden ikisi birbirinden import edemez.
 * Değerler değişirse İKİSİ birden güncellenir.
 */
export const PreferredLanguageEnum = z.enum(['tr', 'fr', 'de']);
export type PreferredLanguage = z.infer<typeof PreferredLanguageEnum>;

/** Müşteri tipi — kanal türetiminin kaynağı (DOMAIN §3). */
export const CustomerTypeEnum = z.enum(['individual', 'company']);
export type CustomerType = z.infer<typeof CustomerTypeEnum>;

/** İndirim tetikleyicisi: kupon (kod girilir) / otomatik kampanya (DOMAIN §5). */
export const DiscountTriggerEnum = z.enum(['coupon', 'automatic']);
export type DiscountTrigger = z.infer<typeof DiscountTriggerEnum>;

/** İndirim biçimi: yüzde / sabit tutar. */
export const DiscountTypeEnum = z.enum(['percent', 'fixed']);
export type DiscountType = z.infer<typeof DiscountTypeEnum>;

/** İndirim kapsamı — kupon daima `cart` düzeyindedir (DOMAIN §5). */
export const DiscountScopeEnum = z.enum(['cart', 'category', 'collection']);
export type DiscountScope = z.infer<typeof DiscountScopeEnum>;

/**
 * Ödeme durumu — **türetilir, elle set edilmez** (DOMAIN §7): net tahsilat (tahsil − iade) ile
 * karşılanan tutar karşılaştırılır. `partial` PARA eksenidir ("net, karşılanandan az"); siparişin
 * eksik karşılanması ayrı eksendir (`fulfilled_qty`). Fazla tahsilat yeni değer açmaz — durum
 * `paid` kalır, fark iade borcu olarak türetilir.
 */
export const PaymentStatusEnum = z.enum(['pending', 'paid', 'partial', 'refunded']);
export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

/**
 * İade edilen kalemin MALA ne olduğu (DOMAIN §8). Para tarafı üçünde de aynıdır (iade hareketi);
 * ayrışan stok ve maliyet tarafıdır:
 * - `restock`  — mal depoya girdi, tekrar satılabilir → ayrılmıştan serbest
 * - `discard`  — mal döndü ama satılamaz (soğuk zincir belgelenemez) → imha kaydı; donuk üründe VARSAYILAN
 * - `goodwill` — **mal müşteride kaldı** ("paranızı iade ettik, ürün sizde kalsın") → stok ve
 *   `fulfilled_qty` DEĞİŞMEZ; maliyet kayıtlarda kalır, kâr raporunda jest gideri olarak görünür
 */
export const ReturnDispositionEnum = z.enum(['restock', 'discard', 'goodwill']);
export type ReturnDisposition = z.infer<typeof ReturnDispositionEnum>;

/**
 * Talebin türü (DOMAIN §15). Müşteri kendi dilinde seçer; ikisi iade kararına gider
 * (`damaged`/`missing`), `question` çoğu zaman tek cevapla kapanır.
 */
export const TicketTypeEnum = z.enum(['damaged', 'missing', 'question', 'other']);
export type TicketType = z.infer<typeof TicketTypeEnum>;

/**
 * Talebin durumu — üç hâl, karmaşık ticket mekaniği YOK (atama/öncelik/SLA yok). Çözülen talep
 * müşteri dönerse yeniden açılır (`resolved → open`).
 *
 * Bu adlar **iç dildir**: müşteri "Aldık, sıradayız / İlgileniyoruz / Çözüldü" okur. Çeviri yüzeyin
 * işidir — iki ayrı durum alanı, aynı gerçeği iki kez yazmak olurdu.
 */
export const TicketStatusEnum = z.enum(['open', 'in_progress', 'resolved']);
export type TicketStatus = z.infer<typeof TicketStatusEnum>;

/**
 * Talep tür/durumunun OPERASYON yüzeyindeki adı — `ORDER_STATUS_LABELS` ile aynı gerekçe: enum'la
 * aynı dosyada durur ki yeni bir değer eklenince karşılığı da yazılsın. Müşteriye giden metin
 * BURADAN gelmez (yukarıdaki not: iç dil ≠ müşteri dili).
 */
export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  damaged: 'Hasarlı geldi',
  missing: 'Eksik geldi',
  question: 'Soru',
  other: 'Diğer',
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Açık',
  in_progress: 'İlgileniliyor',
  resolved: 'Çözüldü',
};

/**
 * Talebin geliş yolu. `conversationId`'den TÜRETİLEMEZ: konuşma bağı yalnız WhatsApp'ı ayırır —
 * "sipariş detayından geldi" ile "genel formdan gelip sipariş seçti" ikisi de `orderId` dolu
 * bırakır ama admin için farklı şeylerdir.
 */
export const TicketSourceEnum = z.enum(['order', 'form', 'whatsapp', 'admin']);
export type TicketSource = z.infer<typeof TicketSourceEnum>;

/**
 * Talebi kim yürütüyor (16.5). Faz 1'de hep `human`; devralmada `ai → human` döner ve AI o talepte
 * susar. Alan baştan var — sonradan eklenseydi o güne kadarki taleplerin geçmişi belirsiz kalırdı.
 */
export const TicketHandlerEnum = z.enum(['human', 'ai']);
export type TicketHandler = z.infer<typeof TicketHandlerEnum>;

/**
 * Yazışmada kim konuştu. `ai` ÜÇÜNCÜ bir göndericidir: "AI yazdı" bilgisini `admin` içine gömmek,
 * sonradan "bunu kim söyledi" sorusunu cevapsız bırakırdı. Müşteriye giden metin aynıdır; ayrım
 * iç izlenebilirliktir ve operasyon ekranında görünür.
 */
export const TicketSenderEnum = z.enum(['customer', 'admin', 'ai']);
export type TicketSender = z.infer<typeof TicketSenderEnum>;

/**
 * Yorum moderasyonu — ÜÇ hâl (DOMAIN §14). Boolean olsaydı "bekliyor" ile "reddedildi" aynı kovaya
 * düşer, reddedilen yorum her açılışta kuyruğa geri gelirdi. Yayınlanan geri çekilebilir.
 *
 * Metin hiçbir hâlde DÜZENLENMEZ: onay/ret vardır, sansürlü yeniden yazım yoktur. **Moderasyon
 * yalnız metne uygulanır** — metinsiz kayıt (yalnız yıldız ya da yalnız beğeni) `approved` doğar.
 */
export const ReviewStatusEnum = z.enum(['pending', 'approved', 'rejected']);
export type ReviewStatus = z.infer<typeof ReviewStatusEnum>;

/**
 * Değerlendirmenin bağlamı — **kapıları farklıdır**: `purchase` satın alma doğrulaması ister
 * (doğrulanmamış yorum sosyal kanıt değil reklamdır); `candidate` isteyemez, çünkü aday ürün henüz
 * satılmıyor ve kimse almamıştır (DOMAIN §13, §14).
 */
export const FeedbackContextEnum = z.enum(['purchase', 'candidate']);
export type FeedbackContext = z.infer<typeof FeedbackContextEnum>;

/** Kaydırmanın yönü — beğen / geç. */
export const FeedbackVoteEnum = z.enum(['like', 'dislike']);
export type FeedbackVote = z.infer<typeof FeedbackVoteEnum>;

/**
 * Puan kazanımının/harcamasının sebebi (DOMAIN §14). Bağlam adları `ProductFeedback.context` ile
 * HİZALI (`feedback_purchase`/`feedback_candidate`): aynı olayı iki ayrı sözlükle adlandırmak,
 * "hangi aksiyona kaç puan" ayarını okurken her seferinde çeviri yapmak olurdu.
 *
 * `review` ayrı bir sebeptir ve bu bilinçli: müşteri önce beğeni verip sonra yorum yazabilir —
 * ikisi ayrı beyanlar, ayrı puanlar. Defterdeki tekillik `(müşteri, sebep, kaynak)` üzerinde
 * olduğu için ikisi çakışmadan yan yana durur.
 */
export const PointsReasonEnum = z.enum([
  'review',
  'feedback_purchase',
  'feedback_candidate',
  'order',
  'referral',
  /**
   * Günlük ziyaret — günde bir kez. Öteki sebeplerden AYRI ve ayrılması şart: onlar **veri
   * bedeli**dir (müşteri bir beyanda bulundu), bu **gelme bedeli**dir (müşteri geri döndü).
   * Aynı sebebe yığılsalardı aday panosunu okuyan kişi ziyaretle beslenen puanı ürün sinyali
   * sanardı. Tekillik gün bazlı kısmi unique indekste (`points_entry_visit_day`).
   */
  'visit',
  'redemption',
  'manual',
]);
export type PointsReason = z.infer<typeof PointsReasonEnum>;

/**
 * Davetin gittiği kanal (17.2). Müşterinin tercih ettiği kanal değil, DAVETİN kanalı: hangisinin
 * daha çok tamamlandığını bilmek, kanalları karşılaştırmanın tek yolu.
 */
export const FeedbackChannelEnum = z.enum(['email', 'whatsapp']);
export type FeedbackChannel = z.infer<typeof FeedbackChannelEnum>;

/**
 * Hata kaydı önem seviyesi (18.5 · `0008_observability.sql`).
 *
 * `warning` = beklenen ama izlenmeli (dış servis geçici hata döndü, yeniden denendi) ·
 * `error` = beklenmeyen istisna · `fatal` = akış tamamen koptu, kullanıcı sonuç alamadı.
 *
 * Seviye ekranın sıralama ölçütü DEĞİL (sıra son görülmeye göredir): taze bir uyarı, üç gün önceki
 * bir hatadan daha çok şey söyler.
 */
export const ErrorLogLevelEnum = z.enum(['warning', 'error', 'fatal']);
export type ErrorLogLevel = z.infer<typeof ErrorLogLevelEnum>;

/**
 * Sistem sağlığı hükmü (18.5 · `0008_observability.sql`) — eşiklerden TÜRETİLİR, elle yazılmaz.
 * `crit` = servis/kaynak arızası · `warn` = baskı altında · `ok` = rahat.
 */
export const HealthStatusEnum = z.enum(['ok', 'warn', 'crit']);
export type HealthStatus = z.infer<typeof HealthStatusEnum>;

/**
 * Depolar arası transfer durumu (DOMAIN §17 · `0031_warehouse.sql`).
 *
 * `draft` YOK: hazırlık ekranı henüz yok ve kullanılmayan bir enum değeri yalan söyler — sevk anı
 * ilk kalıcı andır. Bu yüzden `cancelled`'ın anlamı da dardır: iptal edilen şey her zaman **zaten
 * sevk edilmiş** bir kayıttır ve yalnız TEK hâli kapsar — "sevk kaydı hatalıydı, mal hiç çıkmadı"
 * (`cancel_transfer`, 19.6). Mal çıkıp geri döndüyse cevap bu değer değil, ters yönlü yeni bir
 * transferdir: mal fiilen iki kez yol gitti, tek kayda indirmek soğuk zincir geçmişini silerdi.
 */
export const TransferStatusEnum = z.enum(['in_transit', 'received', 'cancelled']);
export type TransferStatus = z.infer<typeof TransferStatusEnum>;
