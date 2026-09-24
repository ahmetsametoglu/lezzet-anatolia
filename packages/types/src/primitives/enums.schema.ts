import { z } from 'zod';

// Proje geneli enum'lar: birden çok varlığın kullandığı enum burada, tek varlığa özgü olan o varlığın şemasında durur.

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
 * Sipariş durumunun operasyon yüzeyindeki adı (personel ekranları yalnız Türkçe); enum'la aynı dosyada durur ki yeni durumda `Record` eksik anahtarı derlemede söylesin.
 * Müşteri yüzeyi bu haritayı kullanmaz, orada durum adı i18n mesaj dosyasından gelir.
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
 * Ödeme durumunun operasyon yüzeyindeki adı; proje genelidir, çünkü sipariş, müşteri ve özet ekranları aynı kelimeleri yazar ve kopyalar ayrışıyordu.
 */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Bekliyor',
  partial: 'Kısmi',
  paid: 'Ödendi',
  refunded: 'İade',
};

/**
 * Sipariş durumunun müşteri yüzeyindeki kategorisi: iç durum adları sızmaz, dokuz iç durum yediye iner (gel-alda `ready` ayrı hâldir, çünkü müşterinin eylemini bekler).
 * Metin değil kategori: adı üç dilde sayfanın `messages.json`'undan gelir; eşleme `domain-core/order/customer-status`tadır.
 */
export const CustomerOrderStatusEnum = z.enum([
  'received',
  'preparing',
  /** Gel-al siparişi hazır, müşteri depodan alabilir — "yolda" hiç olmaz, bu hâl onun yerini tutar. */
  'ready_for_pickup',
  'on_the_way',
  'delivered',
  'cancelled',
  'returning',
]);
export type CustomerOrderStatus = z.infer<typeof CustomerOrderStatusEnum>;

/**
 * Sipariş kaynağı (nereden kapandı), kanaldan bağımsız eksen; sohbette kurulup sitede ödenen sipariş sohbetin kanalını taşır, çünkü kapandığı yer sepetin netleştiği yerdir.
 */
export const OrderSourceEnum = z.enum(['web', 'whatsapp', 'messenger', 'instagram', 'door', 'manual']);
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

/**
 * Mal müşteriye nasıl ulaşır: bizim aracımız, taşıyıcı ya da müşterinin kendisi.
 * `pickup` yerinde satıştır ve adres, bölge, kurye dışındadır; `route` yazılsaydı aracın gitmediği teslimat rota teslimatı sayılırdı.
 */
export const DeliveryTypeEnum = z.enum(['route', 'shipping', 'pickup']);
export type DeliveryType = z.infer<typeof DeliveryTypeEnum>;

/**
 * Bir adresin çözülebildiği teslimat türleri (`pickup` hariç): yerinde satışın adresi yoktur, bölge ve kargo ücreti bu dar kümeyi konuşur.
 * `.exclude()` ile türer ki küme büyüyünce tek yer değişsin; elle yazılmış dar birleşimler bu yüzden kırılmıştı.
 */
export const AddressDeliveryTypeEnum = DeliveryTypeEnum.exclude(['pickup']);
export type AddressDeliveryType = z.infer<typeof AddressDeliveryTypeEnum>;

/**
 * Depo türü: tesis ya da kurye aracı; araç da bir yerdir (yüklenir, sayılır, transfer alır).
 * Türün sonuçları veride zorlanır: araç bölgeye bağlanamaz, kargo deposu olamaz, depo-üstü toplama girmez.
 */
export const WarehouseKindEnum = z.enum(['facility', 'vehicle']);
export type WarehouseKind = z.infer<typeof WarehouseKindEnum>;

/**
 * Kargo taşıyıcısı tanımlı bir kümedir, çünkü takip bağlantısı taşıyıcının URL kalıbından üretilir.
 * `other` yeni taşıyıcı migration beklemesin diye var; seçilince bağlantı gösterilmez, numara düz metin durur.
 */
export const CarrierEnum = z.enum(['colissimo', 'chronopost', 'dhl', 'ups', 'other']);
export type Carrier = z.infer<typeof CarrierEnum>;

/** Ödeme yöntemi; `on_account` (vadeli) bu listede değildir, çünkü vade bir yöntem değil siparişin bayrağıdır (DOMAIN §7). */
export const PaymentMethodEnum = z.enum(['online', 'cash', 'card', 'cheque', 'bank_transfer']);
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

/** Yöntemin operasyon yüzeyindeki adı; enum'la aynı dosyada durur ki yeni yöntemde `Record` eksik anahtarı derlemede söylesin. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  online: 'online',
  cash: 'nakit',
  card: 'kart',
  cheque: 'çek',
  bank_transfer: 'havale',
};

/**
 * İçerik dili; `packages/i18n` aynı üçlüyü arayüz için `LOCALES` olarak tutar, çünkü `types` hiçbir iç pakete bağlanmaz.
 * Değerler değişirse ikisi birden güncellenir.
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

/**
 * İndirimin OPERASYON yüzeyindeki adları — `PRODUCT_STATUS_LABELS` ile aynı gerekçe: enum'un
 * Türkçe karşılığı bir sunum kararı ama TEK olmalı. İki ekran (kupon sekmesi ve asistan kuyruğunun
 * indirim önizlemesi) aynı satırı okuyor; ayrı ayrı yazılsalardı biri "Kampanya", öteki "Otomatik"
 * derdi ve aynı kayıt iki ekranda iki ad taşırdı.
 */
export const DISCOUNT_TRIGGER_LABELS: Record<DiscountTrigger, string> = {
  coupon: 'Kupon',
  automatic: 'Kampanya',
};

/** İndirim kapsamı — kupon daima `cart` düzeyindedir (DOMAIN §5). */
export const DiscountScopeEnum = z.enum(['cart', 'category', 'collection']);
export type DiscountScope = z.infer<typeof DiscountScopeEnum>;

/** Kapsamın operatör dili. `cart` "sepet" DEĞİL "tüm sepet": kapsam bir daraltmadır, boş bırakılmaz. */
export const DISCOUNT_SCOPE_LABELS: Record<DiscountScope, string> = {
  cart: 'Tüm sepet',
  category: 'Kategori',
  collection: 'Koleksiyon',
};

/**
 * Ödeme durumu türetilir, elle yazılmaz: net tahsilat karşılanan tutarla karşılaştırılır; `partial` para eksenidir, eksik karşılanma ayrı eksendir.
 * Fazla tahsilat yeni değer açmaz: durum `paid` kalır, fark iade borcu olarak türer.
 */
export const PaymentStatusEnum = z.enum(['pending', 'paid', 'partial', 'refunded']);
export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

/**
 * İptalin sebebi (`null` = iptal edilmedi); ayrım paranın yolunu izler: `payment_failed`/`superseded` para çekilmedi, `out_of_stock` çekildi ve iade edildi, `customer`/`staff` iptali kim istedi.
 * Bayrak değil sebep, çünkü hem müşteriye kurulacak cümleyi hem operasyonun iptal listesindeki "neden" sütununu cevaplar.
 */
export const OrderCancelReasonEnum = z.enum(['payment_failed', 'superseded', 'out_of_stock', 'customer', 'staff']);
export type OrderCancelReason = z.infer<typeof OrderCancelReasonEnum>;

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
 * Talebin durumu: üç hâl, atama/öncelik/SLA yok; çözülen talep müşteri dönerse yeniden açılır.
 * Bu adlar iç dildir; müşterinin okuduğu metin yüzeyin çevirisidir.
 */
export const TicketStatusEnum = z.enum(['open', 'in_progress', 'resolved']);
export type TicketStatus = z.infer<typeof TicketStatusEnum>;

/**
 * Talep tür ve durumunun operasyon yüzeyindeki adı; kelimeler tasarım çiziminin kelimeleridir ve dar çip sütununa sığacak kadar kısadır.
 * Müşteriye giden metin buradan gelmez; kısa etiketin kaybettiği ayrımı (`damaged` ≠ `defective`) enum anahtarı taşır.
 */
export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  damaged: 'Bozuk',
  missing: 'Eksik',
  question: 'Soru',
  other: 'Diğer',
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Açık',
  in_progress: 'İşlemde',
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
 * Talebi/sohbeti kim yürütüyor: `hybrid`te AI taslak yazar ve operatör onaylamadan hiçbir şey gitmez, `ai` özerktir ve operatör izler.
 * Devralmada `human`a döner ve AI o talepte susar; `conversation.handledBy` de bu enum'u kullanır.
 */
export const TicketHandlerEnum = z.enum(['human', 'hybrid', 'ai']);
export type TicketHandler = z.infer<typeof TicketHandlerEnum>;

/**
 * Sohbette operatörün seçebileceği modlar: talepteki üçün aynısı, liste `TicketHandlerEnum.options`tan türer ki iki liste ayrışmasın.
 * Ayrı ad, çünkü mobil sözleşme onu adıyla tüketir ve "sohbette hangi modlar" sorusunun tek adresidir.
 */
export const ConversationHandlerEnum = z.enum(TicketHandlerEnum.options);
export type ConversationHandler = z.infer<typeof ConversationHandlerEnum>;

/**
 * Sohbet–müşteri bağının kanıtı (`conversation.link_proof`): yazan yalnız sistemdir — `cart_link` müşterinin açtığı bağlantının
 * jetonu, `chat_code` sohbete yapıştırdığı kod. İlk üç değer kaldırılan elle bağlamadan kalır; satır DB kısıtıyla birebir kalsın diye burada.
 */
export const ConversationLinkProofEnum = z.enum(['order_ref', 'email', 'phone', 'cart_link', 'chat_code']);
export type ConversationLinkProof = z.infer<typeof ConversationLinkProofEnum>;

/** Mod anahtarının etiketleri; Talepler ve WhatsApp ekranı aynı üçlüyü okur. */
export const TICKET_HANDLER_LABELS: Record<TicketHandler, string> = {
  human: 'İnsan',
  hybrid: 'Hibrit',
  ai: 'AI',
};

/**
 * Yazışmada kim konuştu: `ai` üçüncü göndericidir, çünkü `admin` içine gömülseydi "bunu kim söyledi" sorusu cevapsız kalırdı.
 * Müşteriye giden metin aynıdır; ayrım iç izlenebilirliktir.
 */
export const TicketSenderEnum = z.enum(['customer', 'admin', 'ai']);
export type TicketSender = z.infer<typeof TicketSenderEnum>;

/**
 * Yorum moderasyonu üç hâldir, çünkü boolean olsaydı reddedilen yorum her açılışta kuyruğa geri gelirdi; metin hiçbir hâlde düzenlenmez.
 * Moderasyon yalnız metne uygulanır: metinsiz kayıt `approved` doğar.
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
 * Puan kazanımının/harcamasının sebebi; bağlam adları `ProductFeedback.context` ile hizalıdır ki ayar okunurken çeviri gerekmesin.
 * `review` ayrı sebeptir: beğeni ve yorum ayrı beyanlardır ve tekillik `(müşteri, sebep, kaynak)` üzerinde olduğu için çakışmaz.
 */
export const PointsReasonEnum = z.enum([
  'review',
  'feedback_purchase',
  'feedback_candidate',
  'order',
  'referral',
  /**
   * Komşu daveti `referral`dan ayrıdır: `referral` yeni müşteri, `neighbor` var olan sefere ikinci sipariş kazandırır; tek sebepte iki cevap kaybolurdu.
   * `ref_id` komşunun siparişidir, tekillik "aynı siparişten iki kez ödül yok" der.
   */
  'neighbor',
  /**
   * Günlük ziyaret, günde bir kez; öteki sebepler veri bedeli, bu gelme bedelidir ve karışsaydı ziyaret puanı ürün sinyali sanılırdı.
   * Tekillik gün bazlı kısmi unique indekstedir (`points_entry_visit_day`).
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
 * Hata kaydı önem seviyesi: `warning` beklenen ama izlenmeli, `error` beklenmeyen istisna, `fatal` akış koptu.
 * Seviye ekranın sıralama ölçütü değildir (sıra son görülmeye göre), çünkü taze bir uyarı eski bir hatadan çok şey söyler.
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
 * Depolar arası transfer durumu; `draft` yoktur, çünkü sevk anı ilk kalıcı andır ve `cancelled` yalnız "sevk kaydı hatalıydı, mal hiç çıkmadı" demektir.
 * Mal çıkıp döndüyse cevap ters yönlü yeni transferdir; tek kayda indirmek soğuk zincir geçmişini silerdi.
 */
export const TransferStatusEnum = z.enum(['in_transit', 'received', 'cancelled']);
export type TransferStatus = z.infer<typeof TransferStatusEnum>;

/**
 * Katalog sıralama seçenekleri burada, çünkü web süzgeci, mobil API ve orkestrasyon aynı kümeyi okur ve kopyalar sessizce ayrışırdı.
 * Sıra anlamlıdır: `featured` varsayılandır, tanınmayan değer ona düşer.
 */
export const CatalogSortEnum = z.enum(['featured', 'priceAsc', 'priceDesc']);
export type CatalogSort = z.infer<typeof CatalogSortEnum>;

/**
 * Seçenek listesi ŞEMADAN türer, elle yazılmaz (`CLAUDE §1`) — enum'a bir değer eklenip listeye
 * eklenmediğinde süzgeç çubuğu o seçeneği sessizce göstermezdi. `readonly`: liste bir sabittir,
 * okuyanın sıralamasını değiştirebileceği bir tampon değil.
 */
export const CATALOG_SORTS = CatalogSortEnum.options;

/**
 * Ürünün yere göre stok hâli: `available` yerelde var, `shipping` kargo deposunda var, `elsewhere` ağda var ama ne yerelde ne kargoda, `out_of_stock` hiçbir depoda yok.
 * Tek bir `soldOut` bayrağı yetmez, çünkü "tükendi" yalnız ürün hiçbir depoda yokken söylenebilir.
 */
export const StockStatusEnum = z.enum(['available', 'shipping', 'elsewhere', 'out_of_stock']);
export type StockStatus = z.infer<typeof StockStatusEnum>;

/**
 * Sepet kaleminin hangi yoldan geleceği (`local`, `shipping` ayrı sipariş, `unavailable`, `not_shippable_here`); kararı `decideCartAgainstWarehouse` verir.
 * Zod tanımı burada, tip domain-core'da türer, çünkü mobil sözleşme aynı birliği zod olarak ifade etmek zorunda ve iki tanım ayrışırdı.
 */
export const CartLineRouteEnum = z.enum(['local', 'shipping', 'unavailable', 'not_shippable_here']);
export type CartLineRoute = z.infer<typeof CartLineRouteEnum>;

/**
 * Kuponun neden geçmediği: müşteriye sebep söylenir, çünkü asgari sepeti tutmayan kupon sepete ürün eklenerek kullanılabilir.
 * `not_yours` sızdırılmaz ve `unknown_code` gibi sunulur, yoksa kodun varlığı doğrulanmış olurdu.
 */
export const CouponRejectionEnum = z.enum([
  'inactive',
  'not_started',
  'expired',
  'min_basket',
  'first_order_only',
  'used_up',
  'not_yours',
]);
export type CouponRejection = z.infer<typeof CouponRejectionEnum>;

/**
 * Konuşmanın kaynağı, tekillik anahtarının hangi uzayda olduğunu söyler: `externalRef` WhatsApp'ta telefon, Messenger'da PSID, Instagram'da IGSID.
 * `messenger` ile `instagram` ayrı değerlerdir, çünkü aynı kişinin iki kimliği farklı dizelerdir.
 */
export const ConversationSourceEnum = z.enum(['whatsapp', 'messenger', 'instagram']);
export type ConversationSource = z.infer<typeof ConversationSourceEnum>;

/**
 * Mesajın YÖNÜ — `TicketSenderEnum` ile karıştırılmaz ve ayrım kalıcı: orada "kim yazdı"
 * (müşteri/personel/AI) sorulur, burada "hangi tarafa aktı". WhatsApp'ta bizim adımıza AI da
 * personel de yazabilir; ikisi de aynı numaradan çıkar ve müşteri farkı görmez.
 */
export const MessageDirectionEnum = z.enum(['inbound', 'outbound']);
export type MessageDirection = z.infer<typeof MessageDirectionEnum>;

/**
 * Mesajın taşıdığı biçim. `template` bir SÜS değil ÜCRET sınıfıdır: 24 saatlik servis penceresi
 * dışında yalnız Meta-onaylı şablon gönderilebilir ve ücretlidir (~€0,13 FR/DE) — ADR-005'in
 * "önce müşteri yazsın" ilkesi tam olarak bu satırdan doğuyor.
 */
export const MessageKindEnum = z.enum(['text', 'interactive', 'template', 'media']);
export type MessageKind = z.infer<typeof MessageKindEnum>;

/**
 * Şablonun Meta kategorisi fiyatı belirler: `marketing` her hâlde ücretli ve izin ister, `utility` servis penceresinde ücretsizdir ve dayanağı siparişin kendisidir, `authentication` güvenlik kodudur.
 * Kategori olmadan "WhatsApp bize ne yazdı" sorusu üç fiyatı tek toplama atardı.
 */
export const TemplateCategoryEnum = z.enum(['marketing', 'utility', 'authentication']);
export type TemplateCategory = z.infer<typeof TemplateCategoryEnum>;

/**
 * Durağın kapısı doğrulandı mı: sevkiyat masası ve kurye ekranının ortak kelimesi, iki yüzey aynı hâlleri okusun diye burada.
 * Sertlik sırasıyla: `elsewhere` en serttir (doğrusu elimizde), `unknown` hiç uyarı üretmez.
 */
export const DoorCheckEnum = z.enum(['confirmed', 'elsewhere', 'unverified', 'unknown']);
export type DoorCheck = z.infer<typeof DoorCheckEnum>;

/**
 * Adresin koordinatının inceliği; kademeler BAN'ın kendi değerleridir: `housenumber` kapı, `street` sokak, `locality` semt, `municipality` belediye merkezi.
 * Kademe saklanır, çünkü farkı gizlemek kaba bir ölçümü kesin gibi okuturdu ve kurye yanlış sıraya dizilirdi.
 */
export const AddressGeoPrecisionEnum = z.enum(['housenumber', 'street', 'locality', 'municipality']);
export type AddressGeoPrecision = z.infer<typeof AddressGeoPrecisionEnum>;

/**
 * Koordinatı kim koydu: BAN, Google (Almanya) ya da insan; kaynak yaşlanma kuralını belirler (`google` noktası 30 günden uzun saklanmaz, `ban` süresiz).
 */
export const AddressGeoSourceEnum = z.enum(['ban', 'google', 'manual']);
export type AddressGeoSource = z.infer<typeof AddressGeoSourceEnum>;

/**
 * Durak sırasını kim koydu: `manual` bir kilittir, `set_run_stop_order` motor yazımını zorlanmadıkça reddeder ki elle dizilen sıra yeniden hesapla ezilmesin.
 */
export const StopOrderSourceEnum = z.enum(['engine', 'manual']);
export type StopOrderSource = z.infer<typeof StopOrderSourceEnum>;

/**
 * Sıra hangi ölçüyle dizildi: kuş uçuşu bariyerin iki yakasını yakın sayar; ölçü veriye yazılır, çünkü ekrandaki sıraya bakan var, günlüğe bakan yok.
 */
export const StopOrderMetricEnum = z.enum(['haversine', 'matrix']);
export type StopOrderMetric = z.infer<typeof StopOrderMetricEnum>;

/**
 * Sıra hangi incelikte hesaplandı: `address` her durak kendi kapısından, `postal_centroid` posta kodu merkezinden (aynı koddaki duraklar arasında sıra keyfidir), `mixed` ikisi bir arada.
 */
export const StopOrderPrecisionEnum = z.enum(['address', 'postal_centroid', 'mixed']);
export type StopOrderPrecision = z.infer<typeof StopOrderPrecisionEnum>;
