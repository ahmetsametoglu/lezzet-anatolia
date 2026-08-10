import { z } from 'zod';
import { LocalizedTextSchema } from '../primitives/localized-text.schema';
import { CountryEnum } from '../primitives/enums.schema';
import { ProductDateTypeEnum, ProductSchema } from './product.schema';

/**
 * AI asistanının ONAY KUYRUĞU (22.3) — `0042_assistant_proposal.sql`.
 * Kurgu: `docs/architecture/AI_ADMIN_ASSISTANT.md §5`.
 *
 * **`payload` bir KOMUT değil DİLEKÇEDİR.** Asistan "şu tabloya şunu yaz" demez; "şu paketi şu
 * kalemlerle kur" der ve uygulama onaydan sonra NORMAL servis/motor yolundan koşar. Bu yüzden
 * payload şemaları hedef tablonun kolonlarını değil, **var olan servis kapılarının girdisini**
 * taklit eder — kuyruk ikinci bir yazma yolu açmaz.
 *
 * **Şema kind başına ayrı ve TEK YERDE** (`PROPOSAL_PAYLOAD_SCHEMAS`): üç yüzey (öneriyi YAZAN
 * MCP aracı, GÖSTEREN panel, UYGULAYAN kapı) aynı sözlükten okur. Ayrı ayrı yazılsalardı biri
 * gevşer ve panelde görünen ile uygulanan ayrışırdı — onay ekranının tek vaadi tam olarak budur.
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
]);
export type AssistantProposalKind = z.infer<typeof AssistantProposalKindEnum>;

export const AssistantProposalStatusEnum = z.enum(['pending', 'applied', 'rejected', 'expired', 'failed']);
export type AssistantProposalStatus = z.infer<typeof AssistantProposalStatusEnum>;

// ─── Payload şemaları — bugün UYGULANABİLEN YEDİ tip ─────────────────────────
//
// Enum dokuz tip taşıyor ve bugün DOKUZU DA uygulanabilir (09.08: son iki tip eklendi). Şemasız tip için öneri HİÇ DOĞMAZ: yazıp uygulayamamak, panelde
// onaylanan ama hiçbir şey yapmayan bir kalem üretirdi — "çizip yazmamak"ın kuyruk hâli.
//
// Kapsam 09.08'de TASARIMA göre genişledi (kullanıcı kararı): ilk üç tip "en kolay yazılabilen"e
// göre seçilmişti; tasarımın seçtiği beşli ise kullanıcının gerçek iş listesiydi (faturadan stok
// girişi, para girişi, ürün tamamlama, bölge önerisi). Değer kolaylığı yendi.

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
   * Aynı türde ŞU AN vitrinde kaç kayıt var (22.5 · denetim taraması 09.08).
   *
   * "Vitrine ekle" kararı tek başına verilemez: vitrin bir liste değil bir SEÇKİdir ve doluysa
   * eklenen şey ötekini aşağı iter. Önizleme bunu söylemiyordu; patron "bir tane daha eklemekle"
   * "sekizinciyi eklemek" arasındaki farkı göremiyordu. Sayı önerinin kurulduğu andaki hâldir —
   * uygulama anında değişmiş olabilir, o yüzden karar girdisi, kural değil.
   */
  currentlyFeaturedCount: z.number().int().nonnegative().optional(),
});

/** Tedarik siparişi taslağı — eşik-altı sinyalinden; hedef depo ZORUNLU (varsayılan depo yoktur). */
export const PurchaseOrderPayloadSchema = z.object({
  warehouseId: z.string().uuid(),
  supplierId: z.string().uuid().nullable(),
  supplierName: z.string().nullable(),
  lines: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        productName: z.string().min(1),
        qty: z.number().int().positive(),
      }),
    )
    .min(1),
  note: z.string().optional(),
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
 * Mal kabul / alım girişi — patronun verdiği FATURADAN kurulur.
 *
 * **Alış fiyatı (`unitCostCents`) burada VAR ve bu çelişki değil** (`AI_ADMIN_ASSISTANT §6`):
 * finans sınırı OKUMA yönlüdür. Bilgi zaten patronun elindeki belgeden geliyor, yani sızma yönü
 * tersine dönmüyor — asistan yazdığını geri OKUYAMAZ (okuma araçlarında alış fiyatı yok ve testi
 * bunu kilitliyor).
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
   * `money_movement.type` ALT kümesi — üç tip bilerek dışarıda.
   *
   * `order_payment`/`order_refund` baştan yoktu: sipariş bakiyesi iki yerden değişemez.
   * **`purchase` 22.5'te ÇIKARILDI (operasyon şeridinin sorusu, 09.08):** stok alımı mal kabule
   * bağlıdır ve motor bağsız satırı `supply_link_missing` ile zaten reddediyor — yani asistan
   * uygulanması İMKÂNSIZ bir öneri kurabiliyordu. Kuyruğun en sinsi çürüme yolu bu: reddedilmeyi
   * bekleyen kalemler patronun onay refleksini köreltir. Alım önerisi `stock_intake`ten geçer.
   */
  type: z.enum(['expense', 'transfer', 'capital', 'misc']),
  category: z.string().nullable(),
  description: z.string().nullable(),
  supplierId: z.string().uuid().nullable(),
  counterpartyName: z.string().nullable(),
  counterAccountId: z.string().uuid().nullable(),
  /**
   * Hedef hesabın ADI — transferde kararın yarısı (22.11).
   *
   * Kimlik tek başına okunamaz: "Kasa → `9a46b355…` 500 €" diye bir öneri onaylanamaz, çünkü paranın
   * nereye gittiği görünmüyor. Ad öneri anında yazılıyor (`accountName` ile aynı gerekçe): dilekçe
   * o günün gerçeğini taşır, hesap sonradan yeniden adlandırılsa bile öneri neyi teklif ettiğini
   * söylemeye devam eder.
   *
   * `.default(null)` — alan sonradan açıldı ve kuyrukta onsuz yazılmış dilekçeler var; zorunlu
   * yapmak onları `safeParse`ta düşürür ve kartları sessizce asistanın cümlesine indirirdi.
   */
  counterAccountName: z.string().nullable().default(null),
  valueDate: z.string().nullable(),
});

/**
 * Bölgeye posta kodu ekleme — **geri alınamaz dış etkisi olan tek tip**.
 *
 * Kod bölgeye girince `zone_available` uzlaştırma işi haber bekleyenlere bildirim gönderir
 * (14.10 · 19.21). Uygulayıcı bildirimi KENDİ göndermez — cron zaten "kapsanmış ve haberi
 * gitmemiş" bekleyişleri arıyor; ikinci bir gönderim yolu açmak aynı mesajı iki kez yollardı.
 * Ekranın uyarısı bu yüzden doğru ve şart: bölge kapatılsa bile mesaj gitmiş olur.
 */
export const ZoneExtendPayloadSchema = z.object({
  zoneId: z.string().uuid(),
  zoneName: z.string().min(1),
  /**
   * **KAPALI küme (22.5 · operasyon şeridinin sorusu, 09.08).** Önce `z.string().length(2)` idi ve
   * daraltmayı EKRAN yapıyordu: tanınmayan ülkede rota kurulumu ön dolgu yapamıyor, öneri sessizce
   * yarım açılıyordu. Daraltma şemaya taşındı — araç geçersiz ülkeyi kuyruğa hiç yazamaz, yani
   * uygulanamayacak bir öneri doğmaz. Kapalı küme genişlerse (yeni ülke) tek yerden genişler.
   */
  country: CountryEnum,
  postalCodes: z
    .array(
      z.object({
        postalCode: z.string().min(3),
        placeName: z.string().nullable(),
        requestCount: z.number().int().nonnegative(),
        waitingCount: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

/**
 * ─── BELGEDEN ÜRÜN (22.6) — ortak parçalar ───────────────────────────────────
 *
 * Patron ambalajın fotoğrafını asistana verir; asistan okur, kuyruğa dilekçe bırakır. İki hâl var
 * (`product_create` yeni kayıt · `product_draft` var olanı tamamlama) ve alanların çoğu ortak —
 * bu yüzden bir kez tanımlanıp ikisinde de kullanılır (`CLAUDE §1`: duplication yok).
 *
 * ── GIDA DUVARI ŞEMADAN EKRANA TAŞINDI (kullanıcı kararı 09.08) ─────────────
 * 22.3'te alerjen ve saklama alanları payload'da YOKTU — "fiziksel engel", çünkü modelin
 * uydurduğu bir alerjen satırı insana zarar verebilir. Bu senaryoda o duvar işlevsiz: **ambalajın
 * fotoğrafını patron veriyor**, yani bilgi uydurma değil belgeden okuma (fatura senaryosunda aynı
 * karar zaten verilmişti — `AI_ADMIN_ASSISTANT §6` write-only nüansı). Yeni duvar kullanıcının
 * kendi cümlesiyle: *"en net duvarımız onay ekranımız."*
 *
 * Duvarın veri tarafındaki ayağı ise DEĞİŞMEDİ: `status` bu payload'ların hiçbirinde YOK. Asistan
 * beyanı doldurabilir ama ürünü satışa çıkaramaz — ürün aday doğar, yayın ayrı karardır. Yanlış
 * okunmuş bir alerjen en kötü hâlde bile vitrine düşmez.
 */
const DeclarationGapEnum = z.enum(['lang', 'ingredients', 'nutrition', 'storage', 'allergens']);

/**
 * Ambalajdan okunan beyan alanları — iki tipin de ortak gövdesi.
 *
 * **`ProductSchema`'dan TÜRETİLİR, yeniden yazılmaz** (denetim K2-1, 10.08): altı alanın tipi
 * ürünün kendi tanımıyla aynı kalmalı. Elle yazıldığı sürece `NutritionSchema` bir kalem eklerse
 * ya da `allergens` kümesi değişirse, dilekçe eski tipte kalır ve **onay ekranı asistanın yazdığını
 * ürünün kabul edeceğinden farklı doğrular** — hata vermeden.
 *
 * `pick` bilinçli: ürüne yarın eklenen bir alan buraya KENDİLİĞİNDEN girmez. Asistanın
 * dokunabileceği küme kapalı kalır (`AI_ADMIN_ASSISTANT §6`), açık olan yalnız tipler.
 * `partial()` ise dilekçenin doğası — belgeden okunamayan alan boş gelir.
 *
 * Alan künyeleri: **saklama koşulu** 22.3'te yasaktı, belgeden okuma olduğu için açıldı (yukarıdaki
 * künye). **Alerjen ve iz** serbest metin DEĞİL, kapalı küme — model cümle uyduramaz, listeden seçer.
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
 * Onay ekranının iki karar girdisi — ikisi de ARAÇTA hesaplanır, ekranda değil.
 *
 * `uncertainFields`: modelin net okuyamadığı alan adları (bulanık, kesik, yansımalı satır).
 * Ekranın gözü buraya yönlendirmesi bütün alanları tek tek okutmaktan değerli — patron ürünü
 * zaten tanıyor, ona "şuraya bak" demek yeter. Boş dizi "hepsini net okudum" demektir.
 *
 * `remainingGaps`: **bu öneri uygulanırsa hangi beyanlar HÂLÂ eksik kalacak.** Ölçüt motordan
 * (`missingDeclarations`) gelir, araç kendi ölçütünü uydurmaz. Ekranın en önemli tek cümlesi
 * buradan çıkar: *"onaylarsan kayıt tam olur"* ya da *"onaylasan da besin künyesi eksik kalacak"*.
 */
const ProductReviewSignalsSchema = z.object({
  uncertainFields: z.array(z.string()).default([]),
  remainingGaps: z.array(DeclarationGapEnum).default([]),
});

/** Yeni ürün — ambalajdan. `status` YOK: ürün aday doğar, satışa çıkarmak ayrı karardır. */
export const ProductCreatePayloadSchema = ProductDeclarationSchema.merge(ProductReviewSignalsSchema).extend({
  name: LocalizedTextSchema,
  /** Kategori kimlikten ÇÖZÜLÜR ama adı da taşınır — panel uuid göstermez. */
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().nullable(),
  dateType: ProductDateTypeEnum,
  /** Toplam raf ömrü (gün); parti tarihiyle birlikte "kalan %" bundan çıkar. */
  shelfLifeDays: z.number().int().positive().nullable(),
  vatRate: z.number().positive(),
  /**
   * En az BİR boy — varyantsız ürün satılamaz (fiyat ve stok varyanta bağlıdır). Fiyat BURADA YOK
   * ve olmayacak: ayrı bir karar, ayrı bir ekran.
   */
  variants: z.array(z.object({ label: LocalizedTextSchema })).min(1),
});
export type ProductCreatePayload = z.infer<typeof ProductCreatePayloadSchema>;

/**
 * Var olan ürünün tamamlanması — ambalajdan ya da elle. Alan kümesi 22.6'da **beş çok dilli
 * alana + beyan alanlarına** genişledi; gerekçe yukarıdaki ortak künyede.
 *
 * `ad` da yazılabilir hâle geldi (kullanıcı isteği: *"uzun adları kısaltmak için öneri"*) ve bu
 * SEO'yu kırmıyor: slug ürün yaratılırken bir kez üretiliyor, `updateDetails` ona hiç dokunmuyor —
 * yani ad değişse de URL sabit kalır (ölçüldü 09.08).
 */
export const ProductDraftPayloadSchema = ProductReviewSignalsSchema.extend({
  productId: z.string().uuid(),
  productName: z.string().min(1),
  /**
   * Asistanın YAZDIĞI alanlar. `currentFields` ile aynı şekilde — simetri bilinçli: ekran iki
   * nesneyi alan alan yan yana koyabilsin, kendi eşleme tablosunu kurmak zorunda kalmasın.
   */
  fields: ProductDeclarationSchema.extend({ name: LocalizedTextSchema.optional() }).refine(
    (f) => Object.values(f).some((v) => v !== undefined),
    { message: 'En az bir alan doldurulmalı' },
  ),
  /**
   * ALANLARIN BUGÜNKÜ HÂLİ — çünkü uygulama ÜZERİNE YAZAR (22.5 · denetim taraması 09.08).
   *
   * `updateDetails` düz bir `update`tir ve sürüm tutmaz: dolu bir açıklama onaylandığı an
   * kaybolur, geri getirilemez. Ekran "fark tablosu" vaat ediyordu ama karşılaştıracak eski
   * değeri hiç almıyordu — yani yazan taraf "boş alanı dolduruyorum" diyordu, gerçekte bunu
   * kimse doğrulamıyordu. Eski değer payload'da: patron neyi kaybedeceğini GÖREREK onaylar.
   *
   * Alanın `null` gelmesi "boştu" demektir (ezilen bir şey yok); `currentFields`in hiç gelmemesi
   * "eski hâl okunamadı" demektir ve ekran o zaman varsaymaz — ikisi ayrı şeydir.
   */
  currentFields: ProductDeclarationSchema.extend({ name: LocalizedTextSchema.nullable().optional() }).optional(),
});

/**
 * Kampanya / indirim tanımı.
 *
 * **Kupon her zaman sepet düzeyindedir** (`DOMAIN §5`) — kod alanı `scope`u `cart` dışına
 * taşıyamaz; kategori/koleksiyon kapsamı yalnız OTOMATİK indirimde anlamlı. Şema bu kuralı
 * taşımaz (kural motorda ve veride), ama araç önerdiği kombinasyonu kapıya sorar.
 */
export const DiscountDraftPayloadSchema = z.object({
  name: z.string().min(1),
  /**
   * MÜŞTERİYE görünen ad, dil başına — `name` operatörün listesi içindir, bu sepette ve mailde
   * indirim satırının etiketidir ("İndirim — Hoş geldin indirimi").
   *
   * Alan 10.08'de EKLENDİ ve gerekçesi kullanıcının sorusudur: form kuyruğa gelince boş kutular
   * görünür oldu ve *"bunlardan asistanın haberi var mıydı?"* diye soruldu. Yoktu — şemada bu alan
   * hiç bulunmuyordu. Boş kalan bir kutu "asistan atladı" gibi okunur; oysa gerçek "asistana
   * sorulmadı"ydı ve ikisi bambaşka şeyler. Boş bırakılırsa müşteri yalnız "İndirim" görür.
   */
  publicLabel: LocalizedTextSchema.nullable().optional(),
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
   * Kullanım tavanları. **Sınırsız bir kupon ticari bir risktir** ve asistanın bunu önerememesi,
   * kararı sessizce "sınırsız"a bırakıyordu: alan yoksa varsayılan `null` yazılıyor, `null` da
   * sınırsız demek. Bir kararın varsayılanı, o karar hiç sorulmadığında en tehlikeli hâline
   * düşmemeli.
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
 * Parti teklifi — SKT'si yaklaşan partiye indirimli satış fiyatı (`stock.offer_price`).
 *
 * **Payload PARTİYE bağlıdır, ürüne değil** ve bu ayrım kurgunun kendisidir: aynı ürünün taze
 * partisi tam fiyatta kalır, yalnız tarihi yaklaşan parti ucuzlar. İndirim tablosuna ürün kapsamı
 * eklemek (harici denetimin önerisiydi) bunu YAPAMAZDI — indirim ürünün tamamını kapsar ve taze
 * malı da ucuzlatırdı.
 *
 * `listPriceCents` künye olarak taşınır: onay ekranı "3,20 € → 2,24 € (%30)" diyebilsin diye.
 * Uygulama anında fiyat değişmişse motor değil ekran yanılmış olur — o yüzden karar anında da
 * gösterilir, saklanmaz.
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

/** Kind → payload şeması. Uygulayıcısı olmayan tip burada YOKTUR (yukarıdaki gerekçe). */
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
