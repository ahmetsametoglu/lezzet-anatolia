import { z } from 'zod';
import { PortionKindEnum } from './product-variant.schema';
import { NewVariantBarcodeSchema } from './variant-barcode.schema';
import { LocalizedTextSchema } from '../primitives/localized-text.schema';
import { CountryEnum } from '../primitives/enums.schema';
import { PostalCodeSchema } from '../primitives/postal-code.schema';
import { DocumentKindEnum, DocumentVatRegimeEnum, MovementDirectionEnum } from './money.schema';
import { ProductDateTypeEnum, ProductSchema, ProductStorageTypeEnum } from './product.schema';

/**
 * Asistanın onay kuyruğu (`0042_assistant_proposal.sql`): `payload` bir komut değil dilekçedir, uygulama onaydan sonra normal
 * servis ve motor yolundan koşar, bu yüzden şemalar tablo kolonlarını değil servis kapılarının girdisini taklit eder. Şema kind
 * başına tek yerde (`PROPOSAL_PAYLOAD_SCHEMAS`), çünkü yazan araç, gösteren panel ve uygulayan kapı ayrı yazsaydı panelde görünen
 * ile uygulanan ayrışırdı.
 */

export const AssistantProposalKindEnum = z.enum([
  'bundle_draft',
  'featured_flag',
  'discount_draft',
  'purchase_order',
  'stock_intake',
  'money_movement',
  'zone_extend',
  'product_draft',
  'recipe_draft',
  'batch_offer',
  'product_create',
  'money_document',
  'supplier_create',
]);
export type AssistantProposalKind = z.infer<typeof AssistantProposalKindEnum>;

/**
 * Faturadan beklenen teslimatın para künyesi: onayda sipariş gönderilmiş açılır ve fatura siparişe bağlı bir belge olarak doğar,
 * tedarikçi borcu o belgeden türer. Toplam faturanın kendi yazdığıdır (fark nakliye, iskonto ya da okunamamış satırdır); KDV
 * belgede yoksa `null`, çünkü sıfır "KDV yok" demek olurdu.
 */
export const InvoiceTermsPayloadSchema = z.object({
  number: z.string().nullable(),
  issuedOn: z.string().nullable(),
  dueOn: z.string().nullable(),
  totalAmountCents: z.number().int().positive(),
  vatAmountCents: z.number().int().nonnegative().nullable(),
  vatRegime: DocumentVatRegimeEnum,
});
export type InvoiceTermsPayload = z.infer<typeof InvoiceTermsPayloadSchema>;

export const AssistantProposalStatusEnum = z.enum(['pending', 'applied', 'rejected', 'expired', 'failed']);
export type AssistantProposalStatus = z.infer<typeof AssistantProposalStatusEnum>;

// ─── Payload şemaları ─────────────────────────────────────────────────────────────
//
// Şemasız tip için öneri doğmaz: yazıp uygulayamamak, panelde onaylanan ama hiçbir şey yapmayan bir kalem üretirdi.

/** Vitrin işareti — en küçük yazma: tek boolean, tek kayıt. */
export const FeaturedFlagPayloadSchema = z.object({
  target: z.enum(['category', 'collection', 'bundle']),
  id: z.string().uuid(),
  isFeatured: z.boolean(),
  /**
   * Kaydın ADI — yalnız ÖNİZLEME içindir, uygulama bunu kullanmaz (kimlikten yeniden çözer).
   * Saklanması bilinçli: kayıt sonradan yeniden adlandırılırsa geçmişte "neyi onaylamıştım"
   * sorusunun cevabı o günkü ad olmalı.
   */
  name: z.string().min(1),
  /**
   * Aynı türde şu an vitrinde kaç kayıt var: vitrin bir seçkidir ve doluysa eklenen şey ötekini aşağı iter, patron bu farkı
   * görmeli. Sayı önerinin kurulduğu andaki hâldir, uygulama anında değişmiş olabilir; karar girdisidir, kural değil.
   */
  currentlyFeaturedCount: z.number().int().nonnegative().optional(),
});

/** Tedarik siparişi taslağı — eşik-altı sinyalinden; hedef depo ZORUNLU (varsayılan depo yoktur). */
export const PurchaseOrderPayloadSchema = z.object({
  warehouseId: z.string().uuid(),
  /**
   * Deponun kodu, çünkü kimlik onay ekranında okunmaz ve "hangi depoya mal isteniyor" tedarik siparişinin kararının kendisidir.
   * `.default(null)`: alan sonradan açıldı, onsuz yazılmış dilekçeler `safeParse`ta düşmesin.
   */
  warehouseCode: z.string().nullable().default(null),
  supplierId: z.string().uuid().nullable(),
  supplierName: z.string().nullable(),
  lines: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        productName: z.string().min(1),
        qty: z.number().int().positive(),
        /**
         * Bu tedarikçiden son alınan birim fiyat (cent), siparişin tahmini tutarının tabanı; kesin fiyat mal kabulde doğar ama
         * kasadan çıkacak parayı bilmeden verilen sipariş kararı eksiktir. Eşleme yoksa `null` ve kart toplamı yazmaz, çünkü eksik
         * tabanla bulunan tutar gerçeğinden azdır.
         */
        lastPurchasePriceCents: z.number().int().nonnegative().nullable().default(null),
        /**
         * Faturanın birim fiyatı (cent, KDV hariç), yalnız faturadan sipariş kaynağında: tedarikçinin kestiği fiyattır, taslağa
         * yazılır ve eşlemedeki son alışın önüne geçer.
         */
        unitPriceCents: z.number().int().nonnegative().nullable().default(null),
        /** Tedarikçinin kalemi: mal kabul dilekçesinin aynı üç alanı (anahtar, ad, eşleme önerisi). */
        supplierItemKey: z.string().nullable().default(null),
        supplierItemName: z.string().nullable().default(null),
        mappingProposed: z.boolean().default(false),
      }),
    )
    .min(1),
  note: z.string().optional(),
  /**
   * Kaynak: `engine` eşik altı eksiğinden (adetleri motor hesaplar, taslak doğar), `invoice` tedarikçinin faturasından (sipariş
   * gönderilmiş açılır, fatura siparişe bağlı belge olarak doğar). `.default`: eski dilekçeler.
   */
  source: z.enum(['engine', 'invoice']).default('engine'),
  invoice: InvoiceTermsPayloadSchema.nullable().default(null),
});

/** Paket taslağı — paylar `domain-core`'un mutabakat kuralından geçer (servis kapısında). */
export const BundleDraftPayloadSchema = z.object({
  name: LocalizedTextSchema,
  description: LocalizedTextSchema.nullable().optional(),
  /** Paketin TEK fiyatı (euro, `Bundle.totalPrice` ile aynı birim — paket ailesi henüz cent'e göçmedi). */
  totalPrice: z.number().positive(),
  serves: z.number().int().positive().nullable().optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        productName: z.string().min(1),
        qty: z.number().int().positive(),
        /** Kaleme atanan birim fiyat (euro). Toplamı paket fiyatını tutmalı — kural motorda. */
        allocatedUnitPrice: z.number().nonnegative(),
      }),
    )
    .min(2),
});

/**
 * Mal kabul, patronun verdiği faturadan kurulur; alış fiyatı (`unitCostCents`) burada var ve bu çelişki değil, çünkü finans sınırı
 * okuma yönlüdür ve bilgi zaten patronun belgesinden gelir. Asistan yazdığını geri okuyamaz (okuma araçlarında alış fiyatı yok).
 */
export const StockIntakePayloadSchema = z.object({
  warehouseId: z.string().uuid(),
  warehouseCode: z.string().min(1),
  supplierId: z.string().uuid().nullable(),
  supplierName: z.string().nullable(),
  /** Bağlı tedarik siparişi — PO'suz doğrudan giriş de meşru (küçük/plansız alım). */
  purchaseOrderId: z.string().uuid().nullable(),
  /** İrsaliye/fatura numarası — önizlemenin "belge no" satırı. */
  documentNo: z.string().nullable(),
  /**
   * `date` mal kabulün tarihi: verilmezse kabul bugüne yazılır, oysa fatura genelde dünküdür ve yanlış tarih stok yaşını ve dönem
   * mutabakatını kaydırır. `totalAmountCents` faturanın kendi toplamıdır, satırlardan hesaplanmaz, çünkü farkı (nakliye, iskonto,
   * okunamayan satır) tam aranan şeydir; görünmüyorsa `null`.
   */
  date: z.string().nullable().default(null),
  totalAmountCents: z.number().int().nonnegative().nullable().default(null),
  /**
   * Faturanın KDV'si, rejimi ve vadesi: toplam okunduysa fatura kabule bağlı bir belge olarak doğar ve tedarikçi borcu o belgeden
   * türer. KDV belgede yoksa `null` (ters yükleme ve muafiyette belgede KDV olmaz); `.default`: eski dilekçeler.
   */
  vatAmountCents: z.number().int().nonnegative().nullable().default(null),
  vatRegime: DocumentVatRegimeEnum.default('standard'),
  dueOn: z.string().nullable().default(null),
  lines: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        productName: z.string().min(1),
        qty: z.number().int().positive(),
        /** SKT — **zorunlu**: tarihsiz parti yazılamaz (gıda; `stock.expiry_date` not null). */
        expiryDate: z.string().min(8),
        lotNumber: z.string().nullable(),
        unitCostCents: z.number().int().nonnegative().nullable(),
        /**
         * Tedarikçinin kalemi: faturadaki ad ya da kod, anahtarı motor türetir (`supplierItemKeyOf`), varyantı tedarikçinin
         * eşlemesi verir. `mappingProposed`: eşleme yoktu, varyantı asistan buldu ve onayda eşleme bu anahtarla kaydedilir;
         * `.default`: eski dilekçeler.
         */
        supplierItemKey: z.string().nullable().default(null),
        supplierItemName: z.string().nullable().default(null),
        mappingProposed: z.boolean().default(false),
      }),
    )
    .min(1),
});

/** Para hareketi — elle giriş (gider · tahsilat · transfer). Tutar CENT (STACK §8). */
export const MoneyMovementPayloadSchema = z.object({
  accountId: z.string().uuid(),
  accountName: z.string().min(1),
  direction: z.enum(['in', 'out']),
  amountCents: z.number().int().positive(),
  /**
   * `money_movement.type` alt kümesi: sipariş ödemesi ve iadesi yok, çünkü sipariş bakiyesi iki yerden değişemez. `purchase` da
   * yok, çünkü stok alımı mal kabule bağlıdır ve motor bağsız satırı reddeder; alım önerisi `stock_intake`ten geçer.
   */
  type: z.enum(['expense', 'transfer', 'capital', 'misc']),
  /**
   * Tür, sözlük slug'ı (`movement_nature`): defter türü sözlükten ister ve sözlükte olmayan kelimeyle açılan hareket türsüz kalır,
   * bu yüzden araç kelimeyi öneri anında doğrular (`matchNature`). `.default(null)`: `category` taşıyan eski dilekçe türsüz açılır.
   */
  nature: z.string().nullable().default(null),
  description: z.string().nullable(),
  /**
   * Cari, kime ödendi ya da kimden geldi; tedarikçi bu tipte yok, çünkü mal bedeli mal kabule bağlı `purchase` satırıdır. Kimlik
   * sunucuda addan nokta atışı çözülür (`pinpointCounterparty`); çözülemezse `null` kalır, ad `counterpartyName`ta durur ve
   * seçimi operatör yapar.
   */
  counterpartyId: z.string().uuid().nullable().default(null),
  counterpartyName: z.string().nullable(),
  counterAccountId: z.string().uuid().nullable(),
  /**
   * Hedef hesabın adı, transferde kararın yarısı: kimlik tek başına okunamaz ve ad öneri anında yazılır ki hesap sonradan yeniden
   * adlandırılsa da öneri neyi teklif ettiğini söylesin. `.default(null)`: alan sonradan açıldı, onsuz yazılmış dilekçeler
   * düşmesin.
   */
  counterAccountName: z.string().nullable().default(null),
  valueDate: z.string().nullable(),
});

/**
 * Bölgeye posta kodu ekleme, geri alınamaz dış etkisi olan tek tip: kod bölgeye girince uzlaştırma işi (`zone_available`) haber
 * bekleyenlere bildirim gönderir. Uygulayıcı bildirimi kendisi göndermez, çünkü ikinci bir gönderim yolu aynı mesajı iki kez
 * yollardı; bölge sonradan kapatılsa bile mesaj gitmiş olur.
 */
export const ZoneExtendPayloadSchema = z.object({
  zoneId: z.string().uuid(),
  zoneName: z.string().min(1),
  /**
   * Kapalı küme, çünkü daraltmayı ekran yapsaydı tanınmayan ülkede öneri sessizce yarım açılırdı; araç geçersiz ülkeyi kuyruğa
   * hiç yazamaz. Küme genişlerse tek yerden genişler.
   */
  country: CountryEnum,
  postalCodes: z
    .array(
      z.object({
        postalCode: PostalCodeSchema,
        placeName: z.string().nullable(),
        requestCount: z.number().int().nonnegative(),
        waitingCount: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

/**
 * Belgeden ürün: patron ambalajın fotoğrafını verir, asistan okur ve kuyruğa dilekçe bırakır; iki tip (`product_create`,
 * `product_draft`) ortak alanları bir kez tanımlanmış parçalardan alır. Alerjen ve saklama alanları açık, çünkü bilgi uydurma
 * değil belgeden okumadır ve duvar onay ekranıdır; `status` hiçbirinde yok, ürün aday doğar ve yayın ayrı karardır.
 */
const DeclarationGapEnum = z.enum(['lang', 'ingredients', 'nutrition', 'storage', 'allergens']);

/**
 * Ambalajdan okunan beyan alanları `ProductSchema`dan türetilir: elle yazılsaydı ürünün tipi değiştiğinde onay ekranı asistanın
 * yazdığını ürünün kabul edeceğinden farklı doğrulardı. `pick` bilinçli (yarın eklenen alan buraya kendiliğinden girmez),
 * `partial()` dilekçenin doğası; alerjen ve iz kapalı küme, model cümle uyduramaz.
 */
const ProductDeclarationSchema = ProductSchema.pick({
  description: true,
  ingredients: true,
  storageInstructions: true,
  nutrition: true,
  allergens: true,
  traces: true,
}).partial();

/**
 * Onay ekranının iki karar girdisi, ikisi de araçta hesaplanır: `uncertainFields` modelin net okuyamadığı alanlardır ve ekranın
 * gözü oraya yönlendirmesi her alanı okutmaktan değerlidir (boş dizi "hepsini net okudum"). `remainingGaps` öneri uygulanırsa
 * hâlâ eksik kalacak beyanlardır, ölçüt motordan (`missingDeclarations`) gelir.
 */
const ProductReviewSignalsSchema = z.object({
  uncertainFields: z.array(z.string()).default([]),
  remainingGaps: z.array(DeclarationGapEnum).default([]),
});

/**
 * Ambalajdan okunan ama BEYAN olmayan künye: saklama rejimi, tarih türü, raf ömrü, kargo izni ve kategori. Dili yoktur,
 * bu yüzden beyan alanlarının yanında ayrı durur. Saklama rejimi sorulmazsa kolonun varsayılanı kalır ve o varsayılan
 * DONUK'tur (`0005`): rafta duran sirke dondurucuya yazılırdı, üstelik onay ekranında görünmeden.
 */
const ProductIdentitySchema = z
  .object({
    /** Kategori kimlikten ÇÖZÜLÜR ama adı da taşınır — panel uuid göstermez. */
    categoryId: z.string().uuid().nullable(),
    categoryName: z.string().nullable(),
    dateType: ProductDateTypeEnum,
    /** Toplam raf ömrü (gün); parti tarihiyle birlikte "kalan %" bundan çıkar. */
    shelfLifeDays: z.number().int().positive().nullable(),
    shippable: z.boolean(),
    storageType: ProductStorageTypeEnum,
  })
  .partial();
export type ProductIdentityPayload = z.infer<typeof ProductIdentitySchema>;

/** Yeni ürün — ambalajdan. `status` YOK: ürün aday doğar, satışa çıkarmak ayrı karardır. */
export const ProductCreatePayloadSchema = ProductDeclarationSchema.merge(ProductReviewSignalsSchema).extend({
  name: LocalizedTextSchema,
  /** Kategori kimlikten ÇÖZÜLÜR ama adı da taşınır — panel uuid göstermez. */
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().nullable(),
  dateType: ProductDateTypeEnum,
  /**
   * Saklama rejimi — `shippable` ile aynı kaynaktan ("-18 °C'de saklayınız") okunur ama ayrı soruya cevap verir: bu
   * iade/imha kuralını ve vitrin işaretini belirler. `null` okunamadı demektir, kapının varsayılanı geçerli kalır.
   */
  storageType: ProductStorageTypeEnum.nullable().default(null),
  /** Toplam raf ömrü (gün); parti tarihiyle birlikte "kalan %" bundan çıkar. */
  shelfLifeDays: z.number().int().positive().nullable(),
  vatRate: z.number().positive(),
  /**
   * Kargoyla gönderilebilir mi: ambalajdan okunabilir bir karar ("-18 °C'de saklayın" yazan ürün kargoya verilemez) ve
   * sorulmadığında her ürün sessizce kargolanabilir doğardı. `null` "bilinmiyor" demektir ve "hayır"dan ayrıdır; ürün kapının
   * kendi varsayılanıyla doğar.
   */
  shippable: z.boolean().nullable().default(null),
  /**
   * En az bir boy, çünkü fiyat ve stok varyanta bağlıdır; fiyat burada yok, ayrı karardır. Etiket metni ("500 g") ile net ağırlık
   * (500) ayrı alanlar: biri müşterinin okuduğu, öteki kilo başı fiyatın ve kargo hesabının tabanı; okunamıyorsa `null`.
   */
  variants: z
    .array(
      z.object({
        label: LocalizedTextSchema,
        netWeightG: z.number().positive().nullable().default(null),
        piecesCount: z.number().int().positive().nullable().default(null),
        portionKind: PortionKindEnum.nullable().default(null),
        /**
         * Ambalajlı ürün ölçüsü ambalajın üstünde yazmaz, tartılıp ölçülür: model fotoğraftan tahmin ederse sayı kargo
         * tarifesine girer. Bu yüzden varsayılan `null`; operatör ölçüyü söyleyebilir ya da tedarikçi künyesinde yazılı olabilir.
         */
        packedWeightG: z.number().int().positive().nullable().default(null),
        packedLengthMm: z.number().int().positive().nullable().default(null),
        packedWidthMm: z.number().int().positive().nullable().default(null),
        packedHeightMm: z.number().int().positive().nullable().default(null),
        /** Ambalajın üstünde basılı kod — ürün kaydedilince bu boya bağlanır (`bindNewBarcodes`). */
        barcode: NewVariantBarcodeSchema.optional(),
      }),
    )
    .min(1),
});
export type ProductCreatePayload = z.infer<typeof ProductCreatePayloadSchema>;

/**
 * Var olan ürünün tamamlanması, ambalajdan ya da elle. Ad da yazılabilir ve bu SEO'yu kırmaz, çünkü slug ürün yaratılırken bir
 * kez üretilir ve `updateDetails` ona dokunmaz.
 */
export const ProductDraftPayloadSchema = ProductReviewSignalsSchema.extend({
  productId: z.string().uuid(),
  productName: z.string().min(1),
  /**
   * Asistanın YAZDIĞI alanlar. `currentFields` ile aynı şekilde — simetri bilinçli: ekran iki
   * nesneyi alan alan yan yana koyabilsin, kendi eşleme tablosunu kurmak zorunda kalmasın.
   */
  fields: ProductDeclarationSchema.extend({ name: LocalizedTextSchema.optional() }).default({}),
  /** Beyan olmayan künye — yeni üründe yazılabilen alanlar var olan üründe de yazılabilmeli, yoksa eksik künye elde kalırdı. */
  identity: ProductIdentitySchema.default({}),
  /**
   * VAR OLAN boyların künyesi; satır `variantId` ile bulunur. Dilekçe yeni boy AÇMAZ ve var olanı SİLMEZ: onay formu
   * varyant listesinin tamamını kaydeder, eksik gelen satır silinirdi — bir onay ürünün boylarını götürürdü.
   */
  variants: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        /** Boyun BUGÜNKÜ okunur adı — kategoriyle aynı gerekçe: panel uuid göstermez. */
        variantLabel: z.string().min(1),
        label: LocalizedTextSchema.optional(),
        netWeightG: z.number().int().positive().nullable().optional(),
        piecesCount: z.number().int().positive().nullable().optional(),
        portionKind: PortionKindEnum.nullable().optional(),
        /** Ambalajlı ürün ölçüsü ambalajda YAZMAZ, tartılır: model tahmin etmez, operatör ya da tedarikçi künyesi söyler. */
        packedWeightG: z.number().int().positive().nullable().optional(),
        packedLengthMm: z.number().int().positive().nullable().optional(),
        packedWidthMm: z.number().int().positive().nullable().optional(),
        packedHeightMm: z.number().int().positive().nullable().optional(),
        /** Ambalajın üstünde basılı kod — onaylanınca bu boya bağlanır; kod ZATEN başkasındaysa araç önermez. */
        barcode: NewVariantBarcodeSchema.optional(),
      }),
    )
    .default([]),
  /**
   * Alanların bugünkü hâli, çünkü uygulama üzerine yazar ve sürüm tutmaz: patron neyi kaybedeceğini görerek onaylar. Alanın `null`
   * gelmesi "boştu", `currentFields`in hiç gelmemesi "eski hâl okunamadı" demektir ve ekran o zaman varsaymaz.
   */
  currentFields: ProductDeclarationSchema.extend({ name: LocalizedTextSchema.nullable().optional() }).optional(),
  /** Künyenin bugünkü hâli — `currentFields` ile aynı gerekçe: değişen alanın öncesi ekranda görünsün. */
  currentIdentity: ProductIdentitySchema.optional(),
}).refine(
  (p) =>
    Object.values(p.fields).some((v) => v !== undefined) || Object.values(p.identity).some((v) => v !== undefined) || p.variants.length > 0,
  { message: 'En az bir alan doldurulmalı' },
);

/**
 * Kampanya ya da indirim tanımı; kupon her zaman sepet düzeyindedir (`DOMAIN §5`), kategori ve koleksiyon kapsamı yalnız otomatik
 * indirimde anlamlı. Şema bu kuralı taşımaz (kural motorda ve veride), araç önerdiği kombinasyonu kapıya sorar.
 */
export const DiscountDraftPayloadSchema = z.object({
  name: z.string().min(1),
  /**
   * Müşteriye görünen ad, dil başına: `name` operatörün listesi içindir, bu ise sepette ve mailde indirim satırının etiketidir.
   * Zorunlu, çünkü veride de zorunlu (`discount_public_label_filled`) ve eksik öneri uygulama anında değil doğuş anında
   * reddedilmeli.
   */
  publicLabel: LocalizedTextSchema,
  trigger: z.enum(['coupon', 'automatic']),
  type: z.enum(['percent', 'fixed']),
  /** `percent` ise dolu; yüzde tavanı (%100) VERİDE — burada tekrarlanmaz. */
  percent: z.number().positive().nullable(),
  /** `fixed` ise dolu, CENT. */
  amountCents: z.number().int().positive().nullable(),
  scope: z.enum(['cart', 'category', 'collection']),
  categoryId: z.string().uuid().nullable(),
  collectionId: z.string().uuid().nullable(),
  /** Önizlemede okunacak ad — kimlik değil (kapsamın hangi kategori/koleksiyon olduğu). */
  scopeName: z.string().nullable(),
  minBasketCents: z.number().int().nonnegative().nullable(),
  /** Yalnız İLK siparişte mi geçerli — müşteri kazanım kampanyalarının belirleyici koşulu. */
  firstOrderOnly: z.boolean().optional(),
  /**
   * Kullanım tavanları: sınırsız bir kupon ticari bir risktir ve alan olmasaydı karar sessizce "sınırsız"a düşerdi. Bir kararın
   * varsayılanı, o karar hiç sorulmadığında en tehlikeli hâline düşmemeli.
   */
  maxUses: z.number().int().positive().nullable().optional(),
  perCustomerLimit: z.number().int().positive().nullable().optional(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  /** Kupon kodu (yalnız `trigger: 'coupon'`). Kod ÜRETİLMEZ, önerilir — çakışmayı kapı çözer. */
  code: z.string().nullable(),
});

/**
 * Sofra tarifi taslağı — **üç dil dolmadan yayınlanamaz** (`DOMAIN §13`) ve bu kural VERİDE;
 * asistan taslağı doldurur, yayına almak insanın kararıdır (ürün taslağıyla aynı desen).
 *
 * Malzeme bağı VARYANTA kurulur: "Ezine Beyaz Peynir" yetmez, sepete eklenebilen tek şey
 * "350 g" satırıdır.
 */
export const RecipeDraftPayloadSchema = z.object({
  /** Alan adları `Recipe` varlığının kendisinden: `name` (başlık değil), `serves` METİN. */
  name: LocalizedTextSchema,
  description: LocalizedTextSchema.nullable().optional(),
  /** Hazırlanış adımları — dil başına tek metin (adım ayracı ekranın işi). */
  steps: LocalizedTextSchema,
  /** "4 kişilik" gibi bir METİN — sayı değil (modelde `LocalizedText`). */
  serves: LocalizedTextSchema.nullable().optional(),
  /**
   * Tarif formunun kalan üç kutusu (`duration`, `meal`, `pantry`): dilekçede olmasalar onay ekranında boş kutu kalırdı ve boş kutu
   * "asistan atladı" diye okunur. `pantry` tarifin bizden satın alınmayan malzemesidir (tuz, su), satılabilir satır değil ama
   * söylenmesi gerekir.
   */
  duration: LocalizedTextSchema.nullable().optional(),
  meal: LocalizedTextSchema.nullable().optional(),
  pantry: LocalizedTextSchema.nullable().optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        productName: z.string().min(1),
        qty: z.number().int().positive(),
      }),
    )
    .min(1),
});

/**
 * Parti teklifi, SKT'si yaklaşan partiye indirimli fiyat: payload ürüne değil partiye bağlıdır, çünkü taze parti tam fiyatta
 * kalmalı ve ürün kapsamlı bir indirim taze malı da ucuzlatırdı. `listPriceCents` onay ekranı "3,20 € → 2,24 € (%30)" diyebilsin
 * diye taşınır, saklanmaz.
 */
export const BatchOfferPayloadSchema = z.object({
  batchId: z.string().uuid(),
  variantId: z.string().uuid(),
  /** "Artisan Limonlu Kek · 90 g" — panelin okuyacağı ad. */
  productName: z.string().min(1),
  warehouseCode: z.string().min(1),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Teklif fiyatı (cent, KDV DAHİL — b2c tabanı). `null` YAZILAMAZ: teklifi kaldırmak ayrı bir iştir. */
  offerPriceCents: z.number().int().positive(),
  listPriceCents: z.number().int().positive().nullable(),
  physicalQty: z.number().int().positive(),
});
export type BatchOfferPayload = z.infer<typeof BatchOfferPayloadSchema>;

/**
 * Belge: mal dışı faturadan borç (kira, muhasebe, sigorta, telefon); araç tedarikçiyi ve cariyi nokta atışı çözer, tür sözlükten
 * gelir, mal faturası ise alımına bağlı doğar. Dosya MCP'den geçmez, onay formunda bırakılır; `counterpartyId` çözülemediyse
 * `null` ve seçimi operatör yapar.
 */
export const MoneyDocumentPayloadSchema = z.object({
  kind: DocumentKindEnum,
  number: z.string().nullable(),
  issuedOn: z.string(),
  dueOn: z.string().nullable(),
  direction: MovementDirectionEnum,
  supplierId: z.string().uuid().nullable(),
  supplierName: z.string().nullable(),
  counterpartyId: z.string().uuid().nullable(),
  counterpartyName: z.string().nullable(),
  nature: z.string().nullable(),
  amountCents: z.number().int().positive(),
  vatAmountCents: z.number().int().nonnegative().nullable(),
  vatRegime: DocumentVatRegimeEnum,
  note: z.string().nullable(),
});

/**
 * Tedarikçi: faturanın başlığından yeni kart; araç kayıtlı bir tedarikçiye nokta atışı gitmediğini doğrular, çünkü aynı vergi
 * no, telefon ya da tam adla ikinci kart açılmamalı. Kapı onayda bir kez daha sorar.
 */
export const SupplierCreatePayloadSchema = z.object({
  name: z.string().min(1),
  vatNumber: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  country: z.string().regex(/^[A-Z]{2}$/).nullable(),
  paymentTermDays: z.number().int().nonnegative().nullable(),
  note: z.string().nullable(),
});
export type MoneyDocumentPayload = z.infer<typeof MoneyDocumentPayloadSchema>;
export type SupplierCreatePayload = z.infer<typeof SupplierCreatePayloadSchema>;

/**
 * Kind → payload şeması; şeması olmayan tip öneri üretemez, çünkü araçlar, panel ve uygulayan kapı bu sözlükten okur. Kuyruk
 * içinde karar alan tiplerde (`inline`) yazan kapı varlığın kendi eylemidir, şema yine burada, çünkü dilekçenin şekli tek yerde.
 */
export const PROPOSAL_PAYLOAD_SCHEMAS = {
  featured_flag: FeaturedFlagPayloadSchema,
  purchase_order: PurchaseOrderPayloadSchema,
  bundle_draft: BundleDraftPayloadSchema,
  stock_intake: StockIntakePayloadSchema,
  money_movement: MoneyMovementPayloadSchema,
  zone_extend: ZoneExtendPayloadSchema,
  product_draft: ProductDraftPayloadSchema,
  discount_draft: DiscountDraftPayloadSchema,
  recipe_draft: RecipeDraftPayloadSchema,
  batch_offer: BatchOfferPayloadSchema,
  product_create: ProductCreatePayloadSchema,
  money_document: MoneyDocumentPayloadSchema,
  supplier_create: SupplierCreatePayloadSchema,
} as const satisfies Partial<Record<AssistantProposalKind, z.ZodTypeAny>>;

/** Bugün öneri ÜRETİLEBİLEN tipler — MCP araçları ve panel bu listeden türer. */
export type SupportedProposalKind = keyof typeof PROPOSAL_PAYLOAD_SCHEMAS;

export type FeaturedFlagPayload = z.infer<typeof FeaturedFlagPayloadSchema>;
export type PurchaseOrderPayload = z.infer<typeof PurchaseOrderPayloadSchema>;
export type BundleDraftPayload = z.infer<typeof BundleDraftPayloadSchema>;
export type StockIntakePayload = z.infer<typeof StockIntakePayloadSchema>;
export type MoneyMovementPayload = z.infer<typeof MoneyMovementPayloadSchema>;
export type ZoneExtendPayload = z.infer<typeof ZoneExtendPayloadSchema>;
export type ProductDraftPayload = z.infer<typeof ProductDraftPayloadSchema>;
export type DiscountDraftPayload = z.infer<typeof DiscountDraftPayloadSchema>;
export type RecipeDraftPayload = z.infer<typeof RecipeDraftPayloadSchema>;

/**
 * Ham payload'ı kind'ına göre doğrular. Desteklenmeyen tip **sessizce geçmez**: kuyruğa şekli
 * bilinmeyen bir dilekçe girerse onay ekranı onu çizemez ve uygulayıcı da anlamaz.
 */
export function parseProposalPayload(kind: AssistantProposalKind, raw: unknown) {
  const schema = (PROPOSAL_PAYLOAD_SCHEMAS as Record<string, z.ZodTypeAny | undefined>)[kind];
  if (!schema) throw new Error(`[assistant] '${kind}' tipi için payload şeması yok — bu tip henüz uygulanamıyor.`);
  return schema.parse(raw);
}

export const AssistantProposalSchema = z.object({
  id: z.string().uuid(),
  kind: AssistantProposalKindEnum,
  /** Öneriyi üreten sohbet/oturum etiketi — denetim izi (üretim turunda FK olur). */
  sourceSession: z.string().nullable(),
  /** Şekli `kind`'a göre değişir; `parseProposalPayload` ile çözülür. */
  payload: z.unknown(),
  /** Patronun okuyacağı TEK cümle — panel bunu gösterir, JSON'u değil. */
  summary: z.string(),
  /** Öneri neye dayanıyor — panelde ayrı kutu; null ise "gerekçe yazılmadı" hâli çizilir. */
  reason: z.string().nullable(),
  status: AssistantProposalStatusEnum,
  expiresAt: z.string(),
  createdAt: z.string(),
  decidedBy: z.string().uuid().nullable(),
  decidedAt: z.string().nullable(),
  decidedNote: z.string().nullable(),
  appliedAt: z.string().nullable(),
  /** Uygulamanın doğurduğu kayıtların kimlikleri (`{"bundleId": "..."}`). */
  result: z.unknown().nullable(),
  error: z.string().nullable(),
});
export type AssistantProposal = z.infer<typeof AssistantProposalSchema>;

export const AssistantProposalInsertSchema = AssistantProposalSchema.pick({
  kind: true,
  payload: true,
  summary: true,
}).extend({
  reason: z.string().nullish(),
  sourceSession: z.string().nullish(),
  expiresAt: z.string(),
});
export type AssistantProposalInsert = z.infer<typeof AssistantProposalInsertSchema>;

export const AssistantProposalUpdateSchema = AssistantProposalSchema.partial().required({ id: true });
export type AssistantProposalUpdate = z.infer<typeof AssistantProposalUpdateSchema>;
