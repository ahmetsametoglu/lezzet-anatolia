import { z } from 'zod';
import { BundleSchema } from '../entities/bundle.schema';
import { CartItemSchema } from '../entities/cart.schema';
import { ProductVariantSchema } from '../entities/product-variant.schema';
import { StockSchema } from '../entities/stock.schema';
import { CartLineRouteEnum, CouponRejectionEnum } from '../primitives/enums.schema';
import { CatalogImageSchema } from './catalog-api.schema';

/**
 * `/api/v1/me/cart` SÖZLEŞMESİ — sunucu sepetinin mobil yüzü.
 *
 * NEDEN VAR: sepet iki yüzeyde PAYLAŞILIR (kullanıcı kararı 09.08) — telefonda doldurulan sepet
 * webde açılır. Paylaşımın kabı zaten vardı (`cart` tablosu, `customerId` anahtarlı — DOMAIN §4/§5);
 * eksik olan mobilin o kaba açılan kapısıydı.
 *
 * ── SÖZLEŞMENİN ÜÇ KARARI ───────────────────────────────────────────────────
 * 1. **GÖVDE FİYAT TAŞIMAZ.** Yazma uçları yalnız satırın ADRESİNİ ve adedini kabul eder. İstemcinin
 *    yazabildiği bir tutar, siparişin parasını belirleyemez; sunucu sepete kendi çözdüğü değeri
 *    yazar (web `cart/actions.ts` künyesindeki aynı hüküm) ve o değer zaten BAĞLAYICI DEĞİLDİR —
 *    bağlayıcı fiyat checkout başlangıcında çözülür (DOMAIN §5).
 * 2. **CEVAP ÇÖZÜLMÜŞ GÖRÜNÜMDÜR** (`MeCartView`, 21.21): ad · fiyat · indirim · yol · tükendi ·
 *    asgari sepet. Hiçbiri istemcide hesaplanmaz — hepsi `getCartView` kuralından gelir
 *    (`@lezzet/application`) ve web sepeti AYNI kapıyı çağırır. İki ayrı yerde hesaplanan bir sepet
 *    toplamı bir gün iki farklı sayı gösterir ve hangisinin tahsil edileceğini söyleyecek bir yer
 *    kalmaz.
 * 3. **CEVAP HER UÇTA GÜNCEL SEPETTİR** (adres uçlarının kararı — `address-api.schema.ts`): yazma
 *    komşu satırı da oynatabilir (aynı satır iki kez eklendiğinde adetler birleşir), tek kaydı
 *    dönmek istemciyi ikinci tura mecbur bırakırdı.
 *
 * SATIRIN KİMLİĞİ BİR ÇİFTTİR: varyant + parti (`stockId`). Teklif satırı normal satırdan ayrı
 * yaşar (DOMAIN §5) — bu yüzden `stockId` bir ayrıntı değil, adresin parçasıdır.
 */

/**
 * Cevabın tek satırı — sepet kaleminin `unitPrice`/`addedAt` alanları OMİT edilmiş hâli.
 *
 * `unitPrice` bilerek dışarıda: gösterim fiyatı görünümün işi (karar 2), ve saklanan değer
 * bağlayıcı olmadığı için istemciye bir şey vaat etmez — göndermek, ekranın onu tutar sanmasına
 * davetiye olurdu. `addedAt` de dışarıda: sepet kurtarma zamanlaması SUNUCUNUN sinyalidir, ekranın
 * çizdiği bir bilgi değil.
 *
 * `bundleId` DURUYOR: paket satırı da bu satırla anılır (yazma gövdesi 21.21'den beri paket dalını
 * da kabul ediyor) ve webden eklenmiş bir paket cevapta görünür kalmalı — sözleşmeden düşürmek,
 * mobil istemciye sepetin eksik bir kopyasını doğru diye okuturdu.
 */
export const MeCartLineSchema = CartItemSchema.omit({ unitPrice: true, addedAt: true });
export type MeCartLine = z.infer<typeof MeCartLineSchema>;

/** Sepetin tamamı — HER ucun cevabı (karar 3). */
export const MeCartLinesSchema = z.array(MeCartLineSchema);

/**
 * Yazma gövdesi — satırın adresi + adedi. **İKİ TÜR satır vardır ve kimlikleri farklı doğar**
 * (`CartEntry`nin aynı ayrımı, `@lezzet/application`):
 *   varyant satırı → `{variantId, stockId}`; aynı varyantın farklı partisi AYRI satırdır (teklif çıpası).
 *   paket satırı   → `{bundleId}`; paketin varyantı YOKTUR, satılan şey paketin kendisidir (DOMAIN §13).
 *
 * **Birleşim, tek düz nesne DEĞİL** ve tür kendi bayrağını taşır. İki gerekçe:
 * - Tek nesnede dört alan tutulsaydı "paketin partisi" gibi imkânsız hâller yazılabilir kalır ve
 *   "hangisi dolu" kontrolü her çağrı yerine dağılırdı.
 * - Tür kimlik alanının VARLIĞINDAN çıkarılamaz: TypeScript yalnız birim tipli alanlarla daraltma
 *   yapar, `string` birim tip değildir — o yoldan gidilseydi her okuma yerinde elle kontrol gerekirdi.
 *
 * Paket satırı ÖNCE yazılamıyordu (paketin uuid'si detay sözleşmesinde yoktu, yalnız `slug` vardı)
 * ve sonucu sessiz bir eksiklikti: uygulamadan eklenen paket CİHAZDA kalıyor, sunucunun çözdüğü
 * toplama hiç girmiyordu — müşteri sepetinde gördüğü paketi sipariş edemiyordu. `PackageDetailSchema`
 * artık `id` taşıyor (21.21).
 *
 * `stockId` varsayılanı `null`: teklif çıpası OLMAYAN satır normal satıştır ve istemcinin bunu her
 * seferinde yazması, unutulduğu gün sessizce ikinci bir satır açardı.
 */
export const MeCartItemWriteSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('variant'),
    variantId: ProductVariantSchema.shape.id,
    qty: CartItemSchema.shape.qty,
    stockId: StockSchema.shape.id.nullable().default(null),
  }),
  z.object({
    kind: z.literal('bundle'),
    bundleId: BundleSchema.shape.id,
    qty: CartItemSchema.shape.qty,
  }),
]);
export type MeCartItemWrite = z.input<typeof MeCartItemWriteSchema>;

/**
 * Adet gövdesi — **sıfır geçerlidir ve satırı SİLER.** Arayüzde "−" ile sıfıra inmek çıkarmaktır
 * (`CartService.setQty`in aynı kuralı); sıfırı reddetseydik istemci aynı niyet için iki ayrı uç
 * arasında seçim yapmak zorunda kalırdı.
 */
export const MeCartQtyBodySchema = z.object({
  qty: CartItemSchema.shape.qty.or(z.literal(0)),
});

/**
 * Misafir sepetinin DEVRİ — cihazda biriken satırlar giriş anında müşterinin sepetiyle BİRLEŞİR
 * (`CartService.takeOver`): giriş, daha önce eklenmiş bir ürünü sessizce kaybettirmemeli.
 *
 * Tavan bir titizlik değil kapı: gövde istemciden geliyor ve sınırsız bir dizi, tek istekte
 * sepeti şişirmenin en ucuz yolu olurdu. 50 satır, elle doldurulmuş bir sepetin çok üstünde.
 */
export const MAX_CART_TAKEOVER_ITEMS = 50;

export const MeCartTakeOverBodySchema = z.object({
  items: z.array(MeCartItemWriteSchema).max(MAX_CART_TAKEOVER_ITEMS),
});

/**
 * EKLEME GÖVDESİ HER ZAMAN BİR LİSTEDİR — tek ürün, bir elemanlı listedir.
 *
 * **Neden liste** (ölçüldü 09.08, tarif ekranı): "Malzemeleri sepete ekle" üç satırı üç AYRI istekle
 * gönderiyordu ve sunucuda ikisi kayboluyordu. Sebep sepetin tek satırda (`cart.items` jsonb)
 * yaşaması: her istek sepeti OKUR, üstüne ekler, geri YAZAR — eşzamanlı üç okuma aynı başlangıcı
 * görür ve son yazan ötekileri siler (klasik kayıp güncelleme). Canlı ölçüm: sırayla üç ekleme → 3
 * satır; eşzamanlı üç ekleme → 1–2 satır, hangisinin kalacağı belirsiz.
 *
 * İstemciyi "istekleri sıraya diz" diye uyarmak çözüm DEĞİLDİ: kural her çağrı yerinde tekrar
 * hatırlanmak zorunda kalırdı ve unutulduğu gün sepet yine sessizce kalem düşürürdü. **Tek kullanıcı
 * eylemi = tek istek**; sepeti bir kez okuyup bir kez yazan tek bir kod yolu kalır ve yarış kaynağında
 * biter.
 *
 * Tavan devrinkiyle aynı (`MAX_CART_TAKEOVER_ITEMS`): ikisi de istemciden gelen bir liste, ikisi de
 * tek istekte sepeti şişirmenin en ucuz yolu olurdu. `min(1)`: boş ekleme bir niyet değildir.
 */
export const MeCartAddBodySchema = z.object({
  items: z.array(MeCartItemWriteSchema).min(1).max(MAX_CART_TAKEOVER_ITEMS),
});

/* ─────────────────────────────────────────────────────────────────────────────
   SEPETİN ÇÖZÜLMÜŞ GÖRÜNÜMÜ — niyetin BUGÜNKÜ karşılığı.

   Yukarısı NİYET (ne istendi: varyant + adet + parti), aşağısı GÖRÜNÜM (o niyetin bugünkü adı,
   fiyatı, yolu, tavanı). Ayrım gerçek bir kuraldan doğar (DOMAIN §5): sepetteki fiyat BAĞLAYICI
   DEĞİLDİR — sepet aylarca bekleyebilir, fiyat da stok da o arada değişir. Görünüm bu yüzden her
   okumada YENİDEN çözülür, niyetin içinde saklanmaz.

   ÇÖZÜMÜ İSTEMCİ YAPMAZ: hesap `getCartView` kuralınındır (`@lezzet/application`) ve iki yüzey de
   onu çağırır. Mobil kendi toplamını hesaplasaydı aynı sepet telefonda ve webde farklı bir tutar
   gösterirdi — ve hangisinin tahsil edileceğini söyleyecek bir yer kalmazdı.

   ŞEKİL `CartView`in AYNASI, daraltması: alan adları birebir aynı tutuldu ki uç `z.input<>` ile
   tiplenip alan alan doğrulansın. Düşenler yalnız sunucuda kalan iki alan (`vatRate` — kargo
   KDV'sinin oransal bölünmesi checkout'un işi; `shippable` — `route` zaten kararı taşıyor) ve
   indirimin kalem payları (sipariş yazımının bilgisi, ekranın değil).

   ÇOK DİLLİ METİN SUNUCUDA ÇÖZÜLÜR (katalog sözleşmesinin aynı kuralı): kampanya adı düz string
   gelir — dil yedek zinciri (seçili → TR → FR → DE) tek yerde yaşamalı.
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Kuponun tutmama sebebi — motorun kararları + KAPININ iki kendi hâli.
 *
 * `unknown_code`: böyle bir kod yok. Kişisel kuponun başkasında olması da BURAYA düşer — motorun
 * `not_yours`u müşteriye asla gösterilmez (kodun varlığını doğrulamak olurdu).
 * `outranked`: kupon geçerli ama otomatik indirim / müşteri oranı daha büyük; sepete o uygulandı.
 *
 * Motorun listesinden TÜRER, elle kopyalanmaz: motora yeni bir koşul eklendiğinde ekranın
 * karşılaması gereken hâl de kendiliğinden büyür.
 */
export const CartCouponFailureEnum = z.enum([...CouponRejectionEnum.options, 'unknown_code', 'outranked']);
export type CartCouponFailure = z.infer<typeof CartCouponFailureEnum>;

/**
 * Kendiliğinden inen indirimin SEBEBİ — "neden indi" sorusunun cevabı.
 *
 * Kuponda sebep zaten kodun kendisidir; kod girilmeden inen indirimde müşterinin elinde hiçbir
 * ipucu yoktu (29.07 geri bildirimi). **Kampanyanın İÇ ADI kullanılmaz** — o operatörün listede
 * tanıdığı addır, tek dilde yazılır; Fransız müşteriye "Baklava haftası" yazmak olurdu. Sebep bu
 * yüzden TÜRDEN doğar ve cümlesini ekranın kendi sözlüğü kurar.
 *
 * `campaign.percent` YALNIZ oran bütün sepet için doğruysa dolar: kategoriye bağlı bir %15, sepetin
 * tamamına inmiş gibi okunursa müşteriye tutmayacağı bir söz verilir.
 */
export const CartDiscountReasonSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('campaign'), percent: z.number().nullable() }),
  z.object({ kind: z.literal('customer_rate'), percent: z.number() }),
]);

/**
 * Sepete inen indirim ya da kuponun reddi. Dört hâl ayrık; ekran hangi cümleyi kuracağını
 * `status`tan bilir, tutarı tahmin etmez.
 *
 * `rejected` hâlinde `appliedInsteadCents` taşınır: kupon tutmadı diye müşteri hak ettiği otomatik
 * indirimi KAYBETMEZ. `appliedInstead` onun kimliğidir (ad + sebep) — taşınmasaydı özet satırı
 * "İndirim — Baklava haftası" iken sırf bir kupon denendi diye "İndirim"e düşerdi.
 */
export const MeCartDiscountSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('none') }),
  z.object({
    status: z.literal('applied'),
    code: z.string(),
    amountCents: z.number().int(),
    /** Kampanyanın müşteriye görünen adı, seçili dilde; `null` = ad verilmemiş, ekran kodu yazar. */
    label: z.string().nullable(),
  }),
  z.object({
    status: z.literal('automatic'),
    amountCents: z.number().int(),
    label: z.string().nullable(),
    reason: CartDiscountReasonSchema,
  }),
  z.object({
    status: z.literal('rejected'),
    code: z.string(),
    reason: CartCouponFailureEnum,
    appliedInsteadCents: z.number().int(),
    appliedInstead: z.object({ label: z.string().nullable(), reason: CartDiscountReasonSchema }).nullable(),
  }),
]);

/** Her satırın ortak görünüm alanları — varyant satırı da paket satırı da bunları taşır. */
const CartLineViewShape = {
  /** Ürüne/pakete dönüş bağlantısı (`/product/[slug]`, `/package/[slug]`). */
  slug: z.string(),
  name: z.string(),
  image: CatalogImageSchema,
  /** Boy etiketi ("700 g tepsi"); tek boylu üründe boş. Pakette paketin künyesi. */
  unitLabel: z.string(),
  /** **`null` = satışa kapalı** (kanal fiyatı kalkmış) — satır çıkarılmadan devam edilemez. */
  unitPriceCents: z.number().int().nullable(),
  /** Teklif kazandıysa üstü çizilecek referans. **Alan hiç yoksa indirim de yoktur.** */
  wasCents: z.number().int().optional(),
  /** Teklifin adet tavanı (partide kalan); tavan yoksa `null`. */
  limitCap: z.number().int().nullable(),
  /**
   * **Fiyat ARTTI** — müşteriye açıkça söylenir ve onayı istenir (DOMAIN §5). Düşüşte DOLMAZ:
   * düşen fiyat sessizce uygulanır, "iyi haber, onaylıyor musunuz?" diye sormak olmayan bir kararı
   * müşteriye yıkmaktır. Yalnız SUNUCU sepetinde doğar — misafirin niyet listesinde çıpa yoktur.
   */
  priceChange: z.object({ previousCents: z.number().int() }).optional(),
  /** Satır toplamı — fiyat yoksa `null`. Sıfır YAZILMAZ (`CLAUDE §1`). */
  lineTotalCents: z.number().int().nullable(),
  /** Bu satır çıkarılmadan checkout'a geçilemez: tükenmiş ya da satışa kapanmış. */
  blocked: z.boolean(),
  /** Kalem hangi yoldan gelir; **`null` = yer bilinmiyor** ve o hâlde ayrım YAPILMAZ. */
  route: CartLineRouteEnum.nullable(),
  /**
   * Bu yerde ŞU AN kaç adet var. `null` = yol bilinmiyor. **Bir SÖZ DEĞİL, bir sayı**: sepet stok
   * ayırmaz (DOMAIN §4) — ekran "şu an en fazla 2 adet" der ve buna dayanıp kilitlemez.
   */
  availableHere: z.number().int().nullable(),
  /** PAKET satırının salt-okunur içeriği; varyant satırında boş dizi. Düzenlenemez, fiyat taşımaz. */
  contents: z.array(z.object({ name: z.string(), qty: z.number().int() })),
};

/**
 * Sepetin çözülmüş satırı. **İki tür** ve kimlikleri farklı doğar: varyant satırı `{variantId,
 * stockId}` (aynı varyantın farklı partisi AYRI satırdır — teklif çıpası), paket satırı
 * `{bundleId}` (paketin varyantı yoktur, satılan şey paketin kendisidir — DOMAIN §13).
 *
 * Birleşim olarak yazılması bilinçli: tek düz nesnede dört alan tutulsaydı "paketin partisi"
 * gibi imkânsız hâller yazılabilir kalır ve "hangisi dolu" kontrolü her çağrı yerine dağılırdı.
 */
export const MeCartViewLineSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('variant'),
    variantId: ProductVariantSchema.shape.id,
    stockId: StockSchema.shape.id.nullable(),
    qty: CartItemSchema.shape.qty,
    ...CartLineViewShape,
  }),
  z.object({
    kind: z.literal('bundle'),
    bundleId: BundleSchema.shape.id,
    qty: CartItemSchema.shape.qty,
    ...CartLineViewShape,
  }),
]);
export type MeCartViewLine = z.infer<typeof MeCartViewLineSchema>;

/**
 * Sepet ekranının tek okuma sonucu — HER sepet ucunun cevabı.
 *
 * **Kargo satırı burada YOK ve bu bilinçli:** kargo ücreti teslimat türüne, tür de ADRESE bağlıdır
 * ve adres checkout'ta sorulur. Sepette "Teslimat: Ücretsiz" yazıp checkout'ta 6,90 € çıkarmak,
 * tutulmayan bir söz vermektir. Taşınan şey motorun GİRDİSİ (eşik + tarife + kargo grubunun
 * toplamı); ücreti hesaplayan `shippingGroupFee` iki yüzeyde de aynı motordur.
 */
export const MeCartViewSchema = z.object({
  lines: z.array(MeCartViewLineSchema),
  /** Kalem toplamı — kargo ve indirim HARİÇ. */
  subtotalCents: z.number().int(),
  discount: MeCartDiscountSchema,
  /** Ara toplam − indirim. */
  totalCents: z.number().int(),
  /** Toplam adet — yüzen düğmenin ve başlığın sayacı. */
  itemCount: z.number().int(),
  /** Çıkarılmadan devam edilemeyecek satır var mı — "Siparişi tamamla" pasifleşir. */
  hasBlocked: z.boolean(),
  /** Asgari sepet tutuyor mu (DOMAIN §6, AYARDAN gelir — ekran eşiği kendi bilmez). */
  minBasketOk: z.boolean(),
  missingForMinBasketCents: z.number().int(),
  /** Eşiğin kendisi — "en az 25,00 € gerekir" cümlesi bunu yazar. */
  minBasketCents: z.number().int(),
  /** Ücretsiz kargo eşiği; **0 = eşik tanımsız**, ilerleme bloğu hiç çizilmez. */
  freeShippingCents: z.number().int(),
  /** KARGO grubunun toplamı — ücretsiz kargo eşiği buna bakar, sepetin tamamına değil (K37). */
  shippingSubtotalCents: z.number().int(),
  /** Kargo TARİFESİ (ham tutar) — ücretsiz olup olmadığı kararı motorun. */
  shippingTariffCents: z.number().int(),
  /** Sepetin tamamı kargo grubundaysa müşteriye "iki sipariş vereceksiniz" DENMEZ. */
  shippingOnly: z.boolean(),
});
export type MeCartView = z.infer<typeof MeCartViewSchema>;

/**
 * MİSAFİRİN görünüm sorusu — `POST /api/v1/cart/view` gövdesi (oturumsuz, Bearer'sız).
 *
 * NEDEN AYRI BİR UÇ: sunucu sepeti `customerId` anahtarlıdır, yani misafirin sunucuda sepeti YOKTUR
 * (web de öyle: satırları tarayıcı taşır). Ama görünümü yine SUNUCU çözmeli — fiyatı, tükendi
 * kararını ve asgari sepeti istemciye hesaplatmak, aynı sepetin misafirken bir, giriş yapınca başka
 * bir tutar göstermesi demekti.
 *
 * **Niyet gövdeden gelir, fiyat GELMEZ** — kabul edilen tek şey `{variantId, qty, stockId}`.
 * Girişli kullanıcının niyeti ise gövdeden ASLA alınmaz: onunki sunucudaki sepettir.
 */
export const CartViewBodySchema = z.object({
  items: z.array(MeCartItemWriteSchema).max(MAX_CART_TAKEOVER_ITEMS),
  /** Uygulanmak İSTENEN kupon kodu; geçerliliği sunucunun kararı (`discount.status`). */
  couponCode: z.string().trim().min(1).max(64).nullable().default(null),
});
