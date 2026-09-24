import { z } from 'zod';
import { OrderSchema, ServicePointSnapshotSchema } from '../entities/order.schema';
import { DeliveryTypeEnum, PaymentMethodEnum } from '../primitives/enums.schema';
import { AddressLookupPointSchema, MeAddressSchema } from './address-api.schema';
import { CartDiscountReasonSchema } from './cart-api.schema';

/**
 * `/api/v1/checkout` sözleşmesi: ekran yalnız seçim gönderir (adres, gün, ödeme yolu), tutar ve ücret sunucuda çözülür. Anlık
 * görüntü tek turdur ve web ile aynı kapıdan gelir; sipariş açılırken her seçim yeniden doğrulanır.
 */

/**
 * Teslimat dilimi. Saat aralığı yoktur: teslimat gün düzeyinde sözleşilir, veride karşılığı olmayan saat vaat edilmez.
 */
export const CheckoutDeliverySchema = z.object({
  /**
   * Geniş küme: adresin cevabı (`route`/`shipping`) ya da müşterinin seçtiği gel-al (`pickup`). Gel-al yalnız
   * `pickup` dilimi doluyken ve istek `pickupWarehouseId` taşıdığında döner; gün, davet ve engel orada boştur.
   */
  deliveryType: DeliveryTypeEnum,
  /** Rota-içi teslimatın yaklaşan somut tarihleri (ISO gün); kargoda BOŞ — tarih taşıyıcıya bağlı. */
  availableDates: z.array(z.string()),
  /** Tek tarih varsa ekran seçim sunmaz, onu gösterir (DOMAIN §6). */
  requiresDateChoice: z.boolean(),
  /**
   * Bekleyen komşu davetleri, gün başına en fazla bir kayıt (son kabul edilen kazanır); günü seçilebilir olmayan davet sunucuda
   * süzülür. Davet kişiye yazılıdır; ekran onu yazar ve günü önseçili getirir, seçim yine müşterinindir.
   */
  neighborInvites: z.array(z.object({ inviteId: z.string().uuid(), inviterName: z.string(), deliveryDate: z.string() })),
  /**
   * Bu adrese HİÇBİR yoldan gidilemiyor: rota dışı adres + sepette soğuk zincir kalemi. Kargo
   * dolgusu ona açılmaz (DOMAIN §6) — sipariş verilemez, sepet bölünmeli.
   */
  blocked: z.boolean(),
  /**
   * Adres bir teslimat bölgesinde mi. Kargo siparişinde kapı yolu kapalıdır; bölge içindeki adreste sebep bölge dışı olmak değil,
   * ürünlerin bölgenin deposunda olmamasıdır ve ekran bunu ayırt etmeli.
   */
  addressInRoute: z.boolean(),
});

/**
 * Ödeme dilimi: `methods` kapalı bir kümedir; kapalı yöntemin sebebi ayrı alanlarda, çünkü müşteriye farklı cümle kurulur.
 */
export const CheckoutPaymentSchema = z.object({
  methods: z.array(PaymentMethodEnum),
  /** Vadeli ("hesaba") satın alma — ödeme YÖNTEMİ değil, siparişin bayrağı (B2B). */
  creditAvailable: z.boolean(),
  /** Kapıda ödeme neden kapalı; `null` = kapalı değil ya da zaten listede yok. */
  codBlockedReason: z.enum(['over_limit', 'customer_blocked', 'shipping']).nullable(),
  /** Nakit yasal sınırına yaklaşıldı — yöntem açık ama uyarı yazılır. */
  cashWarning: z.boolean(),
  /** Kargo ücreti (cent); 0 olabilir ve NEDEN 0 olduğunu `shippingFreeReason` söyler. */
  shippingFeeCents: z.number().int(),
  /** `route` = araçla gidiyor, ücret zaten yok · `threshold` = eşik aşıldı · `pickup` = müşteri alıyor · `null` = ücretli. */
  shippingFreeReason: z.enum(['route', 'threshold', 'pickup']).nullable(),
  /** Müşteriden tahsil edilecek TOPLAM (sepet + kargo, cent) — ekranın son satırı. */
  orderTotalCents: z.number().int(),
  /** Asgari sepet tutmuyorsa sipariş açılmaz (DOMAIN §6, ayardan gelir). */
  minBasketOk: z.boolean(),
  missingForMinBasketCents: z.number().int(),
  /**
   * Eşiği hangi YERİN belirlediği — "67000 Strasbourg". Bölge ADI değil, posta kodu + şehir:
   * müşteri bizim bölge adımızı ("Strasbourg Merkez") bilmiyor, adresini biliyor.
   */
  placeLabel: z.string(),
});

/**
 * Siparişin dökümü ve toplamı aynı okumadan gelir, ayrışmasınlar; `lines` tahsil edilecek kalemler, adrese gelemeyenler sepette bekler.
 */
/** Özetin tek satırı; `kind` taşınır, çünkü paket adetle değil künyesiyle anılır. */
export const CheckoutSummaryLineSchema = z.object({
  kind: z.enum(['variant', 'bundle']),
  name: z.string(),
  qty: z.number().int().positive(),
  /** Fiyatı çözülemeyen satır `null` — SIFIR yazılmaz; satışa kapanmış kalem "bedava" değildir. */
  lineTotalCents: z.number().int().nullable(),
});

export const CheckoutSummarySchema = z.object({
  lines: z.array(CheckoutSummaryLineSchema),
  /** İndirim ÖNCESİ ara toplam — asgari sepet eşiğinin ölçtüğü tutar. */
  subtotalCents: z.number().int(),
  /** Bu siparişe inen indirim; tutar KAPSAMIN payı kadardır, sepetin tamamının değil. */
  discount: z
    .object({ amountCents: z.number().int(), label: z.string().nullable(), reason: CartDiscountReasonSchema.nullable() })
    .nullable(),
  /** Siparişe girmeyen, sepette kalan satırların kendisi: ekran onları üstü çizili gösterir, adları aynı kaynaktan gelir. */
  excludedLines: z.array(CheckoutSummaryLineSchema),
  /** Özetin dayandığı sepetin imzası; onay gövdesi onu olduğu gibi geri gönderir, istemci üretmez. */
  fingerprint: z.string(),
});
export type CheckoutSummary = z.infer<typeof CheckoutSummarySchema>;

/**
 * Gel-al teklifi: yalnız izinli müşteriye (`pickup_allowed`) ve yalnız gel-al noktası olan tesisler için dolu. Depo adresi
 * burada müşteriye görünür — "depo gösterilmez" kuralının bilinçli tek istisnası, çünkü müşteri oraya gidecek.
 */
export const CheckoutPickupSchema = z.object({
  warehouses: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      /** Tek satır adres ("12 rue du Marché, 67000 Strasbourg"); kayıt jsonb'sinden ekran değil sunucu kurar. */
      addressLine: z.string(),
    }),
  ),
  /** İsteğin seçtiği depo; sunucu tanımadığı kimliği düşürür ve `null` döner. */
  selectedWarehouseId: z.string().uuid().nullable(),
});
export type CheckoutPickup = z.infer<typeof CheckoutPickupSchema>;

/**
 * Canlı kargo teklifi, yalnız kargo kulvarında dolu. Fiyat istemciden alınmaz: istemci yalnız `code`u söyler, tutar sipariş anında
 * yeniden hesaplanır.
 */
export const CheckoutShippingSchema = z.object({
  /** `ok` dışındaki hâl teklifin neden alınamadığıdır; ekran sebebi ve sabit tarifenin geçerli olduğunu söyler. */
  status: z.enum(['ok', 'unmeasured', 'no_box', 'too_large', 'no_sender', 'provider_error', 'off']),
  /** Eve teslimde en ucuz ve en hızlı, noktaya teslimde hepsi; fiyat KDV dahil. */
  options: z.array(
    z.object({
      code: z.string(),
      carrierCode: z.string(),
      carrierName: z.string(),
      name: z.string(),
      priceCents: z.number().int(),
      leadTimeHours: z.number().nullable(),
      lastMile: z.string().nullable(),
      /** Bu servis teslim noktası seçilmeden sipariş edilemez. */
      needsServicePoint: z.boolean(),
      tracked: z.boolean(),
    }),
  ),
  /** Kaç kutuya bölünüyor — ekran "2 koli" diyebilsin diye. */
  parcelCount: z.number().int(),
  selectedCode: z.string().nullable(),
  /**
   * Müşteriye seçim soruluyor mu: `customer`da kargo ücretini müşteri öder ve seçim onundur; `auto`da eşik geçildi, ücreti biz
   * öderiz ve koli eve gider. `auto`da `options` yine dolar ama çizilmez, çünkü taşıyıcıyı sevk anında depo seçer.
   */
  mode: z.enum(['customer', 'auto']),
});
export type CheckoutShipping = z.infer<typeof CheckoutShippingSchema>;
export type CheckoutShippingOption = CheckoutShipping['options'][number];

/**
 * Ekranın tek okuma sonucu; dilimlerin `null` olması anlamlıdır: adres listesi boşsa teslimat, ödeme ve özet sorulamaz, ekran
 * önce adres ister.
 */
export const CheckoutSnapshotSchema = z.object({
  addresses: z.array(MeAddressSchema),
  delivery: CheckoutDeliverySchema.nullable(),
  /** Kargo kulvarında dolu, rota ve gel-al siparişinde `null`. */
  shipping: CheckoutShippingSchema.nullable(),
  payment: CheckoutPaymentSchema.nullable(),
  summary: CheckoutSummarySchema.nullable(),
  /** Gel-al teklifi; izinsiz müşteride ya da gel-al noktası yokken `null` — ekran kartı hiç çizmez. */
  pickup: CheckoutPickupSchema.nullable(),
});

/** Teslim noktasının türü: dükkân, dolap ya da postane; sağlayıcı söylemiyorsa `null`. */
export const ServicePointKindEnum = z.enum(['servicepoint', 'locker', 'post_office']);

/** Haritadaki teslim noktası; siparişe yazılan kopya (`ServicePointSnapshotSchema`) bunun alt kümesidir. */
export const CheckoutServicePointSchema = ServicePointSnapshotSchema.extend({
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  /** Müşterinin adresine uzaklık (m). */
  distanceM: z.number().nullable(),
  active: z.boolean(),
  kind: ServicePointKindEnum.nullable(),
  /** Gün numarası ("0" pazartesi) → "09:00 - 12:00" dizileri; `null` bilinmiyor demek, "kapalı" değil. */
  openingTimes: z.record(z.array(z.string())).nullable(),
});
export type CheckoutServicePoint = z.infer<typeof CheckoutServicePointSchema>;

/**
 * Adrese yakın teslim noktaları, istenen taşıyıcıların hepsi için. `off` sağlayıcı yapılandırılmamış demek; `failedCarriers` araması
 * düşen taşıyıcılardır, ötekilerin noktaları yine gelir.
 */
export const CheckoutServicePointsSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    points: z.array(CheckoutServicePointSchema),
    failedCarriers: z.array(z.string()),
    /** Aramanın merkezi, müşterinin adresi: haritanın "Adresiniz" işareti; koordinatı çözülmemiş adreste `null`. */
    origin: AddressLookupPointSchema.pick({ lat: true, lng: true }).nullable(),
  }),
  z.object({ status: z.literal('address_not_found') }),
  z.object({ status: z.literal('off') }),
]);
export type CheckoutServicePoints = z.infer<typeof CheckoutServicePointsSchema>;
export type CheckoutSnapshot = z.infer<typeof CheckoutSnapshotSchema>;

/**
 * Sipariş açma gövdesi yalnız seçimlerdir: tutar, ücret, indirim, tür ve kalem listesi istemciden alınmaz.
 */
export const CheckoutOrderBodySchema = z.object({
  addressId: z.string().uuid(),
  /**
   * Rota-içi teslimatta seçilen gün (ISO); kargoda `null`. Gönderilen gün sunucuda YENİDEN
   * doğrulanır — uygun günlerden biri değilse sipariş açılmaz (`date_unavailable`).
   */
  deliveryDate: z.string().date().nullable().default(null),
  paymentMethod: PaymentMethodEnum,
  /** Vadeli satın alma niyeti; yetkisi sunucuda sorulur (`creditAvailable` bir GÖSTERİM değil kapı). */
  onAccount: z.boolean().default(false),
  couponCode: z.string().trim().min(1).max(64).nullable().default(null),
  /**
   * Müşteriye gösterilen sepetin imzası; farklıysa sunucu `cart_changed` der. Tutar ya da kalem listesi değildir, boşsa kontrol
   * atlanır.
   */
  expectedCartFingerprint: z.string().min(1).max(64).nullable().default(null),
  /**
   * Aynı siparişi iki kez açmanın panzehiri: ağ yeniden denemesinde ya da çift dokunuşta sunucu açılmış olanı döndürür.
   * İstemci üretir, çünkü anahtar müşterinin bastığı düğmeye aittir.
   */
  idempotencyKey: z.string().trim().min(8).max(64).nullable().default(null),
  /** Kampanya izni — checkout'ta sorulan tek pazarlama sorusu; siparişin değil MÜŞTERİNİN kaydı. */
  marketingConsent: z.boolean().default(false),
  /** Bölünmüş sepetin kargo yarısı: tür adresin cevabını ezer, gün sorulmaz; ekran ile sipariş aynı olsun diye açıkça seçilir. */
  shippingOrder: z.boolean().default(false),
  /** Seçilen kargo servisi; yoksa eve giden en ucuz. Fiyatı sunucu hesaplar. */
  shippingOptionCode: z.string().min(1).nullable().default(null),
  /** Servis teslim noktası istiyorsa seçilen nokta; sunucu sağlayıcıdan yeniden okur. */
  servicePointId: z.string().min(1).nullable().default(null),
  /**
   * Gel-al: müşterinin malı alacağı depo; doluysa tür `pickup`tur ve izinle depo sunucuda yeniden sorulur
   * (`pickup_not_allowed` · `pickup_warehouse_unavailable`). Adres yine gönderilir, çünkü fatura adresi olarak kalır.
   */
  pickupWarehouseId: z.string().uuid().nullable().default(null),
});

/**
 * Sipariş açma sonucu: başarı ya da adlı ret, istisna yok. Retler tek bir "olmadı"ya indirgenmez, her biri müşteriden başka bir
 * düzeltme ister.
 */
export const CheckoutOrderResultSchema = z.discriminatedUnion('status', [
  /**
   * Sipariş kesinleşti, para şimdi geçmiyor (kapıda ya da vadeli): referans doğar, stok süresiz ayrılır, sepetten o siparişin
   * kalemleri düşer.
   */
  z.object({
    status: z.literal('placed'),
    orderId: OrderSchema.shape.id,
    /** Gösterim tutarı — ÇEKİLECEK tutar bu değil: onu sunucu siparişten yeniden çözer. */
    totalCents: z.number().int(),
    deliveryType: DeliveryTypeEnum,
    /** Müşteriye gösterilen numara, yalnız bu dalda: kart dalında sipariş henüz taslak ve numara yok. `null` ise satır çizilmez. */
    referenceNo: OrderSchema.shape.referenceNo,
  }),
  /**
   * Sipariş açıldı, sıra ödemede: `clientSecret` yetki değil oturum anahtarıdır, tutarı belirlemez; onayı sunucu işler.
   */
  z.object({
    status: z.literal('payment_required'),
    orderId: OrderSchema.shape.id,
    totalCents: z.number().int(),
    deliveryType: DeliveryTypeEnum,
    clientSecret: z.string().min(1),
  }),
  /**
   * Önceki kart ödemesi geçti (`paid`, sipariş onaylandı) ya da bankada işleniyor (`processing`): yeni sipariş açılmadı, müşteri o
   * siparişe gider. Açılsaydı aynı sepet için ikinci kez para çekilirdi.
   */
  z.object({
    status: z.literal('open_payment'),
    state: z.enum(['paid', 'processing']),
    orderId: OrderSchema.shape.id,
    totalCents: z.number().int(),
    deliveryType: DeliveryTypeEnum,
    referenceNo: OrderSchema.shape.referenceNo,
  }),
  /** Yer çözülemedi — VERİ/YAPILANDIRMA hatası; müşteriye "bölge dışısınız" DENMEZ, o başka şey. */
  z.object({ status: z.literal('warehouse_unresolved'), reason: z.enum(['ambiguous_zone', 'no_shipping_warehouse']) }),
  z.object({ status: z.literal('empty_cart') }),
  /** Tükenmiş/satışa kapanmış satır — çıkarılmadan sipariş açılmaz. */
  z.object({ status: z.literal('blocked_lines'), lines: z.array(z.string()) }),
  /** Kalem VAR ama sepetteki adet kadar YOK. Adet sessizce düşürülmez — müşterinin yazdığı sayı. */
  z.object({
    status: z.literal('insufficient_here'),
    lines: z.array(z.object({ name: z.string(), available: z.number().int() })),
  }),
  z.object({ status: z.literal('min_basket'), missingCents: z.number().int() }),
  z.object({ status: z.literal('address_not_found') }),
  /** Adresin şehri posta kodunun yerleşimlerinden biri değil: sipariş sessizce kargoya çevrilmez, `places` ekranın önerisidir. */
  z.object({
    status: z.literal('address_city_mismatch'),
    postalCode: z.string(),
    city: z.string(),
    places: z.array(z.string()),
  }),
  /** Rota dışı adres + soğuk zincir kalemi: ne kapıya ne kargoya. */
  z.object({ status: z.literal('cold_chain_unshippable') }),
  z.object({ status: z.literal('date_unavailable'), availableDates: z.array(z.string()) }),
  z.object({ status: z.literal('payment_not_allowed'), methods: z.array(PaymentMethodEnum) }),
  /** Fiyat müşteriye söylenenden yüksek çıktı: artış bildirilir ve onay yenilenir, düşüş sessizce uygulanır. */
  z.object({
    status: z.literal('price_changed'),
    lines: z.array(z.object({ name: z.string(), fromCents: z.number().int(), toCents: z.number().int() })),
  }),
  /**
   * Sepet müşteriye gösterildiğinden beri değişti: sipariş sunucudaki sepetten açıldığı için bu kapı olmadan müşteri başka bir
   * sipariş alabilirdi. Payload yok, yeni liste özette zaten görünür.
   */
  z.object({ status: z.literal('cart_changed') }),
  z.object({ status: z.literal('customer_not_found') }),
  /** Seçilen kargo servisi artık yok; ekran listeyi yeniden okur. */
  z.object({ status: z.literal('shipping_option_unavailable') }),
  /** Servis teslim noktası istiyor ama nokta yok, kapalı ya da başka taşıyıcının. */
  z.object({ status: z.literal('service_point_invalid') }),
  /** Gel-al istendi ama müşterinin izni yok — ekran kartı göstermemişti, istek elle kurulmuştur. */
  z.object({ status: z.literal('pickup_not_allowed') }),
  /** Seçilen depo gel-al noktası değil, pasif ya da yok; ekran teklifi yeniden okur. */
  z.object({ status: z.literal('pickup_warehouse_unavailable') }),
  /**
   * Stok son anda ayrılamadı (yarış): taslak kapatılır, kapıda/vadeli ödemede para çekilmedi. Ad değil kimlik taşınır, ekranın
   * elinde çözülmüş sepet var.
   */
  z.object({
    status: z.literal('insufficient_stock'),
    variantId: z.string().uuid(),
    available: z.number().int(),
  }),
  /** Ödeme oturumu doğmadı, müşteri her şeyi doğru yaptı. Kart reddi burada değildir, sağlayıcının yüzeyinde verilir. */
  z.object({
    status: z.literal('payment_unavailable'),
    reason: z.enum(['stale', 'not_found', 'provider_unavailable', 'no_client_secret']),
  }),
  /** İç arıza — sipariş açılamadı ve sebebi kümedeki hiçbir hâlle anlatılamıyor. Sebep UYDURULMAZ. */
  z.object({ status: z.literal('order_not_placed') }),
]);
export type CheckoutOrderResult = z.infer<typeof CheckoutOrderResultSchema>;

/**
 * Onay ekranının sipariş durumu: native kart ödemesini bu cevapla bekler. Çağrı taslakta sağlayıcıya da sorar; `channel`da çalan
 * zil yeniden sormanın işaretidir, veri taşımaz.
 */
export const CheckoutOrderStatusSchema = z.object({
  placed: z.boolean(),
  cancelled: z.boolean(),
  /** İptal edilmiş siparişin parası iade edildi mi. */
  refunded: z.boolean(),
  awaitingCard: z.boolean(),
  /** Yalnız kart beklenirken dolu; `null` = sağlayıcıya sorulamadı. */
  paymentState: z.enum(['paid', 'processing', 'incomplete']).nullable(),
  referenceNo: OrderSchema.shape.referenceNo,
  channel: z.string().min(1),
});
export type CheckoutOrderStatus = z.infer<typeof CheckoutOrderStatusSchema>;
