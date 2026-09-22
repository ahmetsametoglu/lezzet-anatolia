import { z } from 'zod';
import { OrderSchema } from '../entities/order.schema';
import { AddressDeliveryTypeEnum, PaymentMethodEnum } from '../primitives/enums.schema';
import { MeAddressSchema } from './address-api.schema';
import { CartDiscountReasonSchema } from './cart-api.schema';

/**
 * `/api/v1/checkout` sözleşmesi: ekran yalnız seçim gönderir (adres, gün, ödeme yolu), tutar ve ücret sunucuda çözülür. Anlık
 * görüntü tek turdur ve web ile aynı kapıdan gelir; sipariş açılırken her seçim yeniden doğrulanır.
 */

/**
 * Teslimat dilimi. Saat aralığı yoktur: teslimat gün düzeyinde sözleşilir, veride karşılığı olmayan saat vaat edilmez.
 */
export const CheckoutDeliverySchema = z.object({
  /** Dar küme (`pickup` yok): checkout bir adrese göre çözülür, yerinde satış buradan geçmez. */
  deliveryType: AddressDeliveryTypeEnum,
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
   * dolgusu ona açılmaz (DOMAIN §6) — sipariş verilemez, sepet bölünmeli (K32).
   */
  blocked: z.boolean(),
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
  /** `route` = araçla gidiyor, ücret zaten yok · `threshold` = eşik aşıldı · `null` = ücretli. */
  shippingFreeReason: z.enum(['route', 'threshold']).nullable(),
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
 * Ekranın tek okuma sonucu. Dört dilim de `null` olabilir ve `null`lar ANLAMLIDIR:
 * adres listesi boşsa teslimat da ödeme de özet de sorulamaz — ekran önce adres ister.
 */
export const CheckoutSnapshotSchema = z.object({
  addresses: z.array(MeAddressSchema),
  delivery: CheckoutDeliverySchema.nullable(),
  payment: CheckoutPaymentSchema.nullable(),
  summary: CheckoutSummarySchema.nullable(),
});
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
    deliveryType: AddressDeliveryTypeEnum,
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
    deliveryType: AddressDeliveryTypeEnum,
    clientSecret: z.string().min(1),
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
  /** Rota dışı adres + soğuk zincir kalemi: ne kapıya ne kargoya (K32). */
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
