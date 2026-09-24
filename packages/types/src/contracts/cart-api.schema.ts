import { z } from 'zod';
import { BundleSchema } from '../entities/bundle.schema';
import { CartItemSchema } from '../entities/cart.schema';
import { ProductVariantSchema } from '../entities/product-variant.schema';
import { StockSchema } from '../entities/stock.schema';
import { CartLineRouteEnum, CouponRejectionEnum } from '../primitives/enums.schema';
import { CatalogImageSchema } from './catalog-api.schema';

/**
 * `/api/v1/me/cart` sözleşmesi, sunucu sepetinin mobil yüzü; sepet iki yüzeyde paylaşılır. Gövde fiyat taşımaz, cevap
 * `getCartView`in çözülmüş görünümüdür ve her uçta güncel sepettir; satırın kimliği varyant + partidir (`stockId`).
 */

/**
 * Cevabın satırı; `unitPrice` bağlayıcı olmadığı için, `addedAt` sunucunun sinyali olduğu için dışarıda. `bundleId` kalır.
 */
export const MeCartLineSchema = CartItemSchema.omit({ unitPrice: true, addedAt: true });
export type MeCartLine = z.infer<typeof MeCartLineSchema>;

/** Sepetin tamamı — HER ucun cevabı (karar 3). */
export const MeCartLinesSchema = z.array(MeCartLineSchema);

/**
 * Yazma gövdesi: varyant satırı `{variantId, stockId}`, paket satırı `{bundleId}`, tür kendi bayrağını taşır.
 * `stockId` varsayılanı `null`, çünkü unutulduğu gün sessizce ikinci satır açardı.
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
 * Misafir sepetinin devri giriş anında birleşir; tavan, istemciden gelen dizinin sepeti şişirmesini önler.
 */
export const MAX_CART_TAKEOVER_ITEMS = 50;

export const MeCartTakeOverBodySchema = z.object({
  items: z.array(MeCartItemWriteSchema).max(MAX_CART_TAKEOVER_ITEMS),
});

/**
 * Ekleme gövdesi her zaman listedir: sepet tek satırda (`cart.items` jsonb) yaşadığı için eşzamanlı ayrı istekler
 * birbirinin yazımını silerdi; tek kullanıcı eylemi tek istektir. Tavan devrinkiyle aynı.
 */
export const MeCartAddBodySchema = z.object({
  items: z.array(MeCartItemWriteSchema).min(1).max(MAX_CART_TAKEOVER_ITEMS),
});

/* Sepetin çözülmüş görünümü: her okumada yeniden çözülür ve çözümü istemci yapmaz (`getCartView`). Şekil `CartView`in
   aynasıdır; `vatRate`, `shippable` ve indirim payları sunucuda kalır, çok dilli metin sunucuda çözülür. */

/**
 * Kuponun tutmama sebebi: motorun kararları + kapının iki hâli. `not_yours` müşteriye `unknown_code` olarak düşer ki
 * kodun varlığı doğrulanmasın; `outranked` kupon geçerli ama daha büyük indirim uygulandı.
 */
export const CartCouponFailureEnum = z.enum([...CouponRejectionEnum.options, 'unknown_code', 'outranked']);
export type CartCouponFailure = z.infer<typeof CartCouponFailureEnum>;

/**
 * Kendiliğinden inen indirimin sebebi; kampanyanın iç adı kullanılmaz, sebep türden doğar. `campaign.percent` yalnız oran
 * bütün sepet için doğruysa dolar.
 */
export const CartDiscountReasonSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('campaign'), percent: z.number().nullable() }),
]);

/**
 * Sepete inen indirim ya da kuponun reddi; `rejected`te kazanan indirim (`appliedInstead`) adıyla taşınır, müşteri onu kaybetmez.
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

/**
 * Eşiğe az kalmış kampanya; inen indirimle aynı anda var olabilir, bu yüzden ayrı alan. Yalnız eşik sebebiyle kaçırılan taşınır.
 */
export const MeCartReachableDiscountSchema = z.object({
  /** Eşiğe kalan tutar (ham cent) — cümlenin "{n} daha ekleyin" parçası. */
  missingCents: z.number().int().positive(),
  /** Eşiğin kendisi (ham cent). */
  minBasketCents: z.number().int().positive(),
  /**
   * Eşiğe varıldığında inecek indirimin alt sınırı (cent); müşteri daha azını bulmaz.
   */
  projectedCents: z.number().int().positive(),
  /** Kampanyanın müşteriye görünen adı, seçili dilde; `null` = ad verilmemiş, ekran adsız konuşur. */
  label: z.string().nullable(),
});

/**
 * Kalemin grubu: `local` kapıya teslim, `shipping` kargo, `undeliverable` bu adrese gelemez. Sözleşmede, çünkü RN istemcisi
 * kuralı import edemez; teslim edilemeyen kalem sepetten silinmez, yalnız işaretlenir.
 */
export const CartLineGroupEnum = z.enum(['local', 'shipping', 'undeliverable']);
export type CartLineGroup = z.infer<typeof CartLineGroupEnum>;

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
   * Fiyat arttı: müşteriye söylenir ve onayı istenir (DOMAIN §5); düşüşte dolmaz. Yalnız sunucu sepetinde doğar.
   */
  priceChange: z.object({ previousCents: z.number().int() }).optional(),
  /** Satır toplamı — fiyat yoksa `null`. Sıfır YAZILMAZ (`CLAUDE §1`). */
  lineTotalCents: z.number().int().nullable(),
  /** Bu satır çıkarılmadan checkout'a geçilemez: tükenmiş ya da satışa kapanmış. */
  blocked: z.boolean(),
  /** Kalem hangi yoldan gelir; **`null` = yer bilinmiyor** ve o hâlde ayrım YAPILMAZ. */
  route: CartLineRouteEnum.nullable(),
  /**
   * Kalemin grubu; ekran satırı buna göre yerleştirir. `null` yok, yer bilinmezken kalem ana grupta (`local`) durur.
   */
  group: CartLineGroupEnum,
  /**
   * Bu yerde şu an kaç adet var; söz değil sayı. `null` yol bilinmiyor.
   */
  availableHere: z.number().int().nullable(),
  /** PAKET satırının salt-okunur içeriği; varyant satırında boş dizi. Düzenlenemez, fiyat taşımaz. */
  contents: z.array(z.object({ name: z.string(), qty: z.number().int() })),
};

/**
 * Sepetin çözülmüş satırı: varyant satırı `{variantId, stockId}`, paket satırı `{bundleId}`; birleşim imkânsız hâlleri dışlar.
 */
export const MeCartViewLineSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('variant'),
    variantId: ProductVariantSchema.shape.id,
    stockId: StockSchema.shape.id.nullable(),
    qty: CartItemSchema.shape.qty,
    /**
     * Kampanya kapsamının üyeliği; istemci adet değişince indirimi aynı motorla (`applyBestDiscount`) tazeleyebilsin diye.
     */
    categoryId: z.string().uuid().nullable(),
    collectionIds: z.array(z.string().uuid()),
    /** Müşteriye özel fiyatlı kalem indirim matrahına girmez (`isDiscountable`); alan yoksa değildir. */
    specialPrice: z.literal(true).optional(),
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
 * Yer değişince bir kalemin yeni hâli; web ve native aynı farkı aynı cümleyle söyler (`diffCartByPlace`, `placeChangeText`). Kalem
 * silinmez, her değişiklik tek tek söylenir.
 */
export const CartLineChangeSchema = z.discriminatedUnion('kind', [
  /** Kapıdan kargoya düştü; artık ayrı bir siparişle gider. */
  z.object({ kind: z.literal('to_shipping'), name: z.string() }),
  /** Kargodan kapıya çıktı; yeni yerin deposunda var. */
  z.object({ kind: z.literal('to_route'), name: z.string() }),
  /** Yeni yerde karşılanamıyor: soğuk zincir olduğu için kargoya da verilemiyor ya da hiçbir depoda kalmadı. */
  z.object({ kind: z.literal('unavailable'), name: z.string() }),
  /** Kalem var ama sepetteki adet kadar yok; ayrı hâl, çünkü "alınamıyor" denirse müşteri kalemi büsbütün siler. */
  z.object({ kind: z.literal('reduced'), name: z.string(), qty: z.number().int(), availableHere: z.number().int() }),
  /** Fiyat değişti; teklif partisi yere bağlıdır (DOMAIN §5). */
  z.object({ kind: z.literal('price'), name: z.string(), fromCents: z.number().int(), toCents: z.number().int() }),
  /** Yeni adres hiçbir yoldan karşılanamıyor ve kalemin yolu bilinmez hâle düştü. */
  z.object({ kind: z.literal('no_delivery'), name: z.string() }),
]);
export type CartLineChange = z.infer<typeof CartLineChangeSchema>;

/**
 * İstemcinin motoru çalıştırabilmesi için kampanya kuralı, `DiscountRule`in taşınabilir kesiti. `codes` taşınmaz, çünkü
 * herkese geçerli kod listesi vermek olurdu; kalan alanlar vitrinde zaten açık.
 */
export const MeCartDiscountRuleSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['percent', 'fixed']),
  percent: z.number().nullable(),
  amountCents: z.number().int().nullable(),
  scope: z.enum(['cart', 'category', 'collection']),
  categoryId: z.string().uuid().nullable(),
  collectionId: z.string().uuid().nullable(),
  minBasketCents: z.number().int().nullable(),
});
export type MeCartDiscountRule = z.infer<typeof MeCartDiscountRuleSchema>;

/**
 * Her sepet ucunun cevabı. Kargo ücreti satırı yok, çünkü ücret adrese bağlıdır; taşınan şey motorun girdisidir.
 */
export const MeCartViewSchema = z.object({
  lines: z.array(MeCartViewLineSchema),
  /** Kalem toplamı — kargo ve indirim HARİÇ. */
  subtotalCents: z.number().int(),
  discount: MeCartDiscountSchema,
  /** Eşiğe az kalmış kampanya; `null` = söylenecek bir şey yok. Toplama GİRMEZ, yalnız söylenir. */
  reachableDiscount: MeCartReachableDiscountSchema.nullable(),
  /** Ara toplam − indirim. */
  totalCents: z.number().int(),
  /** Toplam adet — yüzen düğmenin ve başlığın sayacı. */
  itemCount: z.number().int(),
  /**
   * KENDİLİĞİNDEN İNEN kampanya havuzu — istemci adet değiştirdiğinde indirimi TAZELEYEBİLSİN diye
   * (künye: `MeCartDiscountRuleSchema`). Kupon kuralları bu havuzda YOKTUR.
   */
  discountRules: z.array(MeCartDiscountRuleSchema),
  /** İlk sipariş mi — `firstOrderOnly` kampanyaların yüklemi. */
  isFirstOrder: z.boolean(),
  /**
   * Satılamaz satır var mı; "Siparişi tamamla" bunda pasifleşir. Teslim edilemeyen kalem buraya girmez.
   */
  hasBlocked: z.boolean(),
  /**
   * Bu adrese gelemeyen kalemlerin toplamı, asgari sepete sayılmaz; `minBasketOk` ve `missingForMinBasketCents` bunu zaten düşmüştür.
   */
  undeliverableSubtotalCents: z.number().int(),
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
  /**
   * Kargo grubunun çözülmüş ücreti, eşik aşıldıysa 0; kararı sunucu `shippingGroupFee` ile verir, istemci kopyalamaz.
   */
  shippingGroupFeeCents: z.number().int(),
  /**
   * Ücretsiz kargoya kalan (cent) — 0 ise ya eşik aşıldı ya eşik tanımsız.
   *
   * Ham çıkarma (`freeShippingCents − shippingSubtotalCents`) ekranda YAPILMAZ: eşik tanımsızken
   * (0) o çıkarma negatif çıkar ve "−33,25 € kaldı" gibi bir cümle üretirdi.
   */
  shippingFreeRemainingCents: z.number().int(),
});
export type MeCartView = z.infer<typeof MeCartViewSchema>;

/**
 * Misafirin görünüm sorusu (`POST /api/v1/cart/view`): misafirin sunucu sepeti yoktur ama görünümü yine sunucu çözer.
 * Gövdeden yalnız `{variantId, qty, stockId}` kabul edilir, fiyat gelmez.
 */
export const CartViewBodySchema = z.object({
  items: z.array(MeCartItemWriteSchema).max(MAX_CART_TAKEOVER_ITEMS),
  /** Uygulanmak İSTENEN kupon kodu; geçerliliği sunucunun kararı (`discount.status`). */
  couponCode: z.string().trim().min(1).max(64).nullable().default(null),
});
