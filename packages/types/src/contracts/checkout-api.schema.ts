import { z } from 'zod';
import { OrderSchema } from '../entities/order.schema';
import { DeliveryTypeEnum, PaymentMethodEnum } from '../primitives/enums.schema';
import { MeAddressSchema } from './address-api.schema';

/**
 * `/api/v1/checkout` SÖZLEŞMESİ — "Siparişi tamamla" ekranının ve sipariş açan ucun ortak dili.
 *
 * ── EKRAN SEÇİM YAPAR, SUNUCU KARAR VERİR ────────────────────────────────────
 * İstemciden yalnız SEÇİMLER alınır: hangi adres, hangi gün, hangi ödeme yolu. Tutar, kargo
 * ücreti, indirim ve teslimat türü istemciden HİÇ kabul edilmez — hepsi sunucuda çözülür
 * (`createCheckoutDraft` künyesi). Aksi hâlde uygulamadan gönderilen bir `total` alanı siparişin
 * parasını belirlerdi.
 *
 * ── ANLIK GÖRÜNTÜ TEK TURDUR ─────────────────────────────────────────────────
 * Adres seçilince ekranın öğrenmesi gereken her şey (yol · günler · kargo ücreti · açık ödeme
 * yolları · toplam) TEK cevapta gelir. Bölünseydi ara hâller doğardı: gün listesi yeni adresin,
 * ödeme yolları eskisinin olurdu. Kaynağı `@lezzet/application`ın checkout anlık görüntüsü ve web
 * checkout'u AYNI kapıyı çağırır — ekranda görünen ücret ile kasada kesilen ücret ancak böyle
 * aynı hesaptan çıkar (yaşanmış arıza: sepette 13 € eşik, checkout'ta 0 € uygulama).
 *
 * ── HER SEÇİM YENİDEN DOĞRULANIR ─────────────────────────────────────────────
 * Sipariş açılırken gönderilen gün gerçekten uygun günlerden biri mi, gönderilen yöntem gerçekten
 * açık yöntemlerden biri mi diye yeniden sorulur. Ekran doğru davranıyor diye sunucu güvenmez:
 * ekran açık kaldığı sürede bölge kapanmış, tavan değişmiş, ürün tükenmiş olabilir.
 */

/**
 * Teslimat dilimi — adres seçilince "nasıl ve ne zaman gelir" sorusunun cevabı.
 *
 * **SAAT ARALIĞI YOKTUR ve bu bir eksiklik değil:** teslimat GÜN düzeyinde sözleşilir (`order`
 * kaydında da alan `date`), tasarım da gün yazar ("Çarşamba 13 Ağustos"). Saat aralığı vaat etmek,
 * veride karşılığı olmayan bir söz vermek olurdu.
 */
export const CheckoutDeliverySchema = z.object({
  deliveryType: DeliveryTypeEnum,
  /** Rota-içi teslimatın yaklaşan somut tarihleri (ISO gün); kargoda BOŞ — tarih taşıyıcıya bağlı. */
  availableDates: z.array(z.string()),
  /** Tek tarih varsa ekran seçim sunmaz, onu gösterir (DOMAIN §6). */
  requiresDateChoice: z.boolean(),
  /**
   * Bu adrese HİÇBİR yoldan gidilemiyor: rota dışı adres + sepette soğuk zincir kalemi. Kargo
   * dolgusu ona açılmaz (DOMAIN §6) — sipariş verilemez, sepet bölünmeli (K32).
   */
  blocked: z.boolean(),
});

/**
 * Ödeme dilimi — motorun "bu müşteri bu siparişi nasıl ödeyebilir" kararı.
 *
 * `methods` KAPALI bir kümedir: ekran bu listenin dışına çıkamaz. Kapalı yöntemin neden kapalı
 * olduğu ayrı alanlarda çünkü müşteriye SEBEP söylenir — "kapıda ödeme yok" ile "bu tutarda kapıda
 * ödeme sunulamıyor" farklı cümlelerdir ve ikincisinde müşteri sepetini küçültüp yöntemi açabilir.
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
 * Ekranın tek okuma sonucu. Üç dilim de `null` olabilir ve `null`lar ANLAMLIDIR:
 * adres listesi boşsa teslimat da ödeme de sorulamaz — ekran önce adres ister.
 */
export const CheckoutSnapshotSchema = z.object({
  addresses: z.array(MeAddressSchema),
  delivery: CheckoutDeliverySchema.nullable(),
  payment: CheckoutPaymentSchema.nullable(),
});
export type CheckoutSnapshot = z.infer<typeof CheckoutSnapshotSchema>;

/**
 * SİPARİŞ AÇMA GÖVDESİ — yalnız seçimler.
 *
 * Burada OLMAYANLAR en az olanlar kadar önemli: tutar yok, kargo ücreti yok, indirim tutarı yok,
 * teslimat türü yok, kalem listesi yok. Sepet sunucuda (`customerId` anahtarlı) ve tür adresten
 * çözülür; hepsini istemciden almak, siparişin parasını tarayıcı konsoluna açmak olurdu.
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
   * **AYNI SİPARİŞİ İKİ KEZ AÇMANIN TEK PANZEHİRİ.** Mobilde bu bir titizlik değil, gerçek bir hâl:
   * ağ kesintisinde istemci isteği yeniden dener ve cevabın kaybolması siparişin açılmadığı anlamına
   * GELMEZ; müşteri "onayla"ya iki kez basabilir, uygulama arka plandan dönerken ekran yeniden
   * kurulabilir. Anahtar aynıysa sunucu ikinci turda YENİ sipariş açmaz, açılmış olanı döndürür.
   *
   * İstemci üretir çünkü "aynı niyet" sorusunun cevabı istemcidedir: anahtar, müşterinin bastığı
   * DÜĞMEYE aittir — sunucu iki isteği ayırt edemez.
   */
  idempotencyKey: z.string().trim().min(8).max(64).nullable().default(null),
  /** Kampanya izni — checkout'ta sorulan tek pazarlama sorusu; siparişin değil MÜŞTERİNİN kaydı. */
  marketingConsent: z.boolean().default(false),
  /**
   * Bölünmüş sepetin KARGO yarısı için ayrı sipariş (19.15). Tür adresin cevabını EZER ve gün hiç
   * sorulmaz. Bayrak TÜRETİLMEZ, açıkça seçilir: ekranın gösterdiği ile siparişi açanın uyguladığı
   * aynı olmalı — türetilseydi ekran "kapıya teslim, kapıda ödeme" derken taslak kargo siparişi
   * açar, müşteri kasada reddedilirdi.
   */
  shippingOrder: z.boolean().default(false),
});

/**
 * Sipariş açma SONUCU — başarı ya da ADLI ret. Hiçbir hâl istisna fırlatmaz.
 *
 * Retler tek bir "olmadı"ya indirgenmez çünkü her biri müşteriden BAŞKA bir şey ister:
 * `blocked_lines` satır çıkarmayı, `insufficient_here` adet düşürmeyi, `price_changed` yeni fiyatı
 * onaylamayı, `date_unavailable` başka gün seçmeyi. Tek mesaja indirgenseydi müşteri neyi
 * düzelteceğini bilemez, çoğu sepeti büsbütün terk ederdi.
 */
export const CheckoutOrderResultSchema = z.discriminatedUnion('status', [
  /**
   * Sipariş KESİNLEŞTİ, para şimdi geçmiyor — kapıda ödeme ya da vadeli ("hesaba").
   *
   * Sağlayıcıya hiç gidilmez ama sipariş taslak da kalmaz: referans numarası doğar, stok süresiz
   * ayrılır ve sepetten O SİPARİŞİN kalemleri düşer. Eskiden taslak bırakılıyordu ve onay ekranı
   * "bankanızdan onay bekliyoruz" diyordu — kapıda ödemede beklenen bir banka yok (web'de ölçülmüş
   * arıza, 29.07).
   */
  z.object({
    status: z.literal('placed'),
    orderId: OrderSchema.shape.id,
    /** Gösterim tutarı — ÇEKİLECEK tutar bu değil: onu sunucu siparişten yeniden çözer. */
    totalCents: z.number().int(),
    deliveryType: DeliveryTypeEnum,
  }),
  /**
   * Sipariş açıldı, sıra ÖDEMEDE — ekran yerel ödeme sayfasını bu `clientSecret` ile açar.
   *
   * **`clientSecret` bir YETKİ DEĞİL, bir oturum anahtarıdır:** tutarı belirlemez, hangi siparişin
   * ödendiğini sunucu niyetin künyesinden bilir ve onayı webhook işler. İstemcinin gönderdiği bir
   * tutar bu yolda hiçbir yere yazılmaz.
   */
  z.object({
    status: z.literal('payment_required'),
    orderId: OrderSchema.shape.id,
    totalCents: z.number().int(),
    deliveryType: DeliveryTypeEnum,
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
  /**
   * Adresin şehri posta kodunun kapsadığı yerleşimlerden biri değil (19.17). Sipariş SESSİZCE
   * kargoya çevrilmez: tür değişimi ücreti ve ödeme yollarını da değiştirir. `places` ekranın
   * "şu olmalı" diyebilmesi için taşınır.
   */
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
  /**
   * **Fiyat müşteriye SÖYLENDİĞİNDEN yüksek çıktı** (07.13 · DOMAIN §5). Kural asimetriktir:
   * artarsa bildirilir ve onay yenilenir, düşerse sessizce uygulanır — indirim sürpriz değil
   * hediyedir. Sessizce geçilseydi hiçbir şey patlamaz, müşteri yalnız beklemediği tutarı öderdi.
   */
  z.object({
    status: z.literal('price_changed'),
    lines: z.array(z.object({ name: z.string(), fromCents: z.number().int(), toCents: z.number().int() })),
  }),
  z.object({ status: z.literal('customer_not_found') }),
  /**
   * Sipariş açıldı ama STOK AYRILAMADI — son anda başkası aldı (yarış hâli). Sipariş taslak kalır
   * ve kapatılır: müşteriye söz verilmemiş olur. Kapıda/vadeli ödemede **para hiç çekilmedi**.
   *
   * `insufficient_here`ten farkı ZAMANI: orası "sepette şu kadar yok" der ve checkout'a girerken
   * ölçülür, burası "onaya bastığın SANİYEDE kalmadı" der. Ekran ikisine aynı cümleyi kuramaz.
   *
   * **Ürünün ADI taşınmaz, kimliği taşınır** ve bu bilinçli: ekranın elinde zaten çözülmüş sepet
   * görünümü var (`MeCartView.lines` — ad, fiyat, görsel hepsi orada). Adı sunucudan ikinci kez
   * istemek, istemcinin bildiği bir şeyi ona geri okutmak olurdu.
   */
  z.object({
    status: z.literal('insufficient_stock'),
    variantId: z.string().uuid(),
    available: z.number().int(),
  }),
  /**
   * Kasa açılmadı — müşteri her şeyi doğru yaptı, ödeme oturumu doğmadı. Huninin en pahalı kaybı.
   *
   * **Kartın REDDİ burada DEĞİL:** o karar sağlayıcının kendi yüzeyinde veriliyor ve sunucuya hiç
   * uğramıyor. Buradaki dört sebep bizim tarafımızın hâlleri.
   */
  z.object({
    status: z.literal('payment_unavailable'),
    reason: z.enum(['stale', 'not_found', 'provider_unavailable', 'no_client_secret']),
  }),
  /** İç arıza — sipariş açılamadı ve sebebi kümedeki hiçbir hâlle anlatılamıyor. Sebep UYDURULMAZ. */
  z.object({ status: z.literal('order_not_placed') }),
]);
export type CheckoutOrderResult = z.infer<typeof CheckoutOrderResultSchema>;
