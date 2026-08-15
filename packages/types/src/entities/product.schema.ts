import { z } from 'zod';
import { dbNumeric, dbNumericNullable } from '../primitives/db-numeric';
import { LOCALIZED_TEXT_KEYS, LocalizedTextSchema, type LocalizedText } from '../primitives/localized-text.schema';
import { ImageMetaInsertSchema, ImageMetaSchema } from '../primitives/image.schema';
import { ProductVariantSchema } from './product-variant.schema';

// Ürün — paylaşılan alanlar (satılabilir birim ProductVariant'ta). 0005 migration, DATA_MODEL.
export const ProductDateTypeEnum = z.enum(['DLC', 'DDM']);
export type ProductDateType = z.infer<typeof ProductDateTypeEnum>;

// AB 14 alerjeni (FR/DE yasal beyan). Enum anahtarı ASCII; görünen ad (TR/FR/DE) UI'da. DATA_MODEL §Enum.
export const ProductAllergenEnum = z.enum([
  'gluten',
  'kabuklu',
  'yumurta',
  'balik',
  'yer_fistigi',
  'soya',
  'sut',
  'sert_kabuklu',
  'kereviz',
  'hardal',
  'susam',
  'sulfit',
  'aci_bakla',
  'yumusaka',
]);
export type ProductAllergen = z.infer<typeof ProductAllergenEnum>;

// Alerjenin görünen adı — çok dilli (FR/DE yasal beyan). Enum'la TEK KAYNAK; her iki yüzey (operasyon +
// müşteri) buradan çözer (resolveLocalizedText). Liste enum'dan türer: ProductAllergenEnum.options.
export const ALLERGEN_LABELS: Record<ProductAllergen, LocalizedText> = {
  gluten: { tr: 'Gluten', fr: 'Gluten', de: 'Gluten' },
  kabuklu: { tr: 'Kabuklu deniz ürünleri', fr: 'Crustacés', de: 'Krebstiere' },
  yumurta: { tr: 'Yumurta', fr: 'Œufs', de: 'Eier' },
  balik: { tr: 'Balık', fr: 'Poisson', de: 'Fisch' },
  yer_fistigi: { tr: 'Yer fıstığı', fr: 'Arachides', de: 'Erdnüsse' },
  soya: { tr: 'Soya', fr: 'Soja', de: 'Soja' },
  sut: { tr: 'Süt', fr: 'Lait', de: 'Milch' },
  sert_kabuklu: { tr: 'Sert kabuklu yemişler', fr: 'Fruits à coque', de: 'Schalenfrüchte' },
  kereviz: { tr: 'Kereviz', fr: 'Céleri', de: 'Sellerie' },
  hardal: { tr: 'Hardal', fr: 'Moutarde', de: 'Senf' },
  susam: { tr: 'Susam', fr: 'Graines de sésame', de: 'Sesamsamen' },
  sulfit: { tr: 'Sülfit', fr: 'Sulfites', de: 'Sulfite' },
  aci_bakla: { tr: 'Acı bakla', fr: 'Lupin', de: 'Lupinen' },
  yumusaka: { tr: 'Yumuşakça', fr: 'Mollusques', de: 'Weichtiere' },
};

/**
 * Ürünün satış durumu — DB'de TEK kolon (`product_status` enum'u), türetme yok.
 *
 * Önce `is_candidate` + `is_active` ikilisiyle tutuluyordu: üç durum için dört kombinasyon doğuruyor,
 * ikisi ("aday+aktif", "aday+pasif") davranışta aynı şeye çıkıyordu. Bu yüzden formda "Satışta"yı
 * açmak aday üründe hiçbir şeyi değiştirmiyordu — imkânsız durum temsil edilebilir kaldığı sürece
 * arayüz de tutarsız kalıyor. Tek alan bunu kapatır; süzgeç de artık düz bir eşitlik.
 *
 * Aday satılamaz, yalnız keşif akışında görünür (DOMAIN §13).
 */
export const ProductStatusEnum = z.enum(['active', 'passive', 'candidate']);
export type ProductStatus = z.infer<typeof ProductStatusEnum>;

/**
 * Durumun OPERASYON yüzeyindeki adı — `ORDER_STATUS_LABELS` ile aynı gerekçe (bkz. `enums.schema`):
 * enum'la AYNI dosyada durur ki yeni bir durum eklenince karşılığının yazılması unutulmasın
 * (`Record` eksik anahtarda derlemeyi durdurur), ve tek yerde durur ki ekranlar ayrışmasın.
 *
 * Ayrışma yaşandı: ürün ekranında üç kopya vardı ve `active` iki farklı kelimeyle yazılıyordu —
 * rozette "Aktif", durum seçicisinde "Satışta". Aynı ürün aynı ekranda iki ad taşıyordu. Kazanan
 * "Satışta": tasarımın kendi dili de öyle (*"aday ürün / **satılabilir** ürün"*), ve "Aktif" neyin
 * aktif olduğunu söylemiyor.
 *
 * Personel ekranları yalnız Türkçedir (CLAUDE.md §2), o yüzden düz metin. Müşteri yüzeyi bu haritayı
 * KULLANMAZ — orada ürün durumu bir etiket değil, görünürlük kuralıdır.
 */
export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  active: 'Satışta',
  passive: 'Pasif',
  candidate: 'Aday',
};

/**
 * Besin değerleri — INCO'nun zorunlu beyan seti, **100 g başına**, SABİT kalemli. Serbest anahtarlı
 * jsonb değil: müşteri tablosu, operasyon formu ve çeviri aynı listeden üretilir (satır adları arayüz
 * i18n'inde, veride değil). Kalem `null` bırakılabilir → bilinmiyor, o satır gösterilmez.
 */
export const NutritionSchema = z.object({
  energyKj: z.number().nullable(),
  energyKcal: z.number().nullable(),
  fatG: z.number().nullable(),
  saturatedFatG: z.number().nullable(),
  carbohydrateG: z.number().nullable(),
  sugarsG: z.number().nullable(),
  proteinG: z.number().nullable(),
  saltG: z.number().nullable(),
});
export type Nutrition = z.infer<typeof NutritionSchema>;

/** Tablo sırası TEK KAYNAK — INCO'nun beyan sırası; hem form hem müşteri tablosu bunu izler. */
export const NUTRITION_KEYS = Object.keys(NutritionSchema.shape) as Array<keyof Nutrition>;

/**
 * Kalemlerin operatöre görünen adı ve birimi — sıranın yanında, TEK KAYNAK.
 *
 * `Record<keyof Nutrition, …>` olduğu için şemaya yeni kalem eklenirse okuyan her yüzey derlenmez;
 * yani yeni alan sessizce ekransız kalamaz. İki yüzey okuyor (ürün formunun künye tablosu ve
 * asistan kuyruğunun önizlemesi) — ayrı yazılsalardı aynı satır iki ekranda iki ad taşırdı.
 *
 * Enerjinin iki kalemi de "Enerji" adını taşır ve bu doğru: aynı büyüklüğün iki birimi (kJ · kcal),
 * ayrı satır değil. Okuyan yüzeyler ikisini tek satırda birleştirir.
 */
export const NUTRITION_LABELS: Record<keyof Nutrition, { label: string; unit: string }> = {
  energyKj: { label: 'Enerji', unit: 'kJ' },
  energyKcal: { label: 'Enerji', unit: 'kcal' },
  fatG: { label: 'Yağ', unit: 'g' },
  saturatedFatG: { label: 'Doymuş yağ', unit: 'g' },
  carbohydrateG: { label: 'Karbonhidrat', unit: 'g' },
  sugarsG: { label: 'Şeker', unit: 'g' },
  proteinG: { label: 'Protein', unit: 'g' },
  saltG: { label: 'Tuz', unit: 'g' },
};

/** Hiçbir kalemi girilmemiş boş künye — form varsayılanı bunu SPREAD eder. */
export const EMPTY_NUTRITION: Nutrition = Object.fromEntries(NUTRITION_KEYS.map((k) => [k, null])) as Nutrition;

/** En az bir kalem girilmiş mi — "beyan eksik" ölçütü boş künyeyi dolu saymamalı. */
export function hasNutrition(n: Nutrition | null): boolean {
  return n !== null && NUTRITION_KEYS.some((k) => n[k] !== null);
}

/** Beyanı eksik bırakan alanlar — ekran göstergesi ve sunucu süzgeci AYNI listeyi izler. */
export type DeclarationGap = 'lang' | 'ingredients' | 'nutrition' | 'storage' | 'allergens';

/**
 * Eksik beyanın operatöre görünen adı (`PRODUCT_STATUS_LABELS` emsali).
 *
 * Enum'un yanında duruyor çünkü aynı eksiği İKİ ekran yazıyor: ürün önizlemesinin uyarı kutusu ve
 * asistan kuyruğunun "onaylasan da şu alanlar eksik kalacak" satırı. İki yerde yazılsalardı aynı
 * eksik iki ekranda iki ad taşırdı.
 *
 * `lang` ötekilerden farklı — hangi DİLİN eksik olduğunu ekran kendi bağlamından söyler
 * ("FR, DE içeriği"), bu yüzden buradaki karşılık genel kalır.
 */
export const DECLARATION_GAP_LABELS: Record<DeclarationGap, string> = {
  lang: 'dil içeriği',
  ingredients: 'içindekiler',
  nutrition: 'besin değerleri',
  storage: 'saklama koşulları',
  allergens: 'alerjen beyanı',
};

/**
 * Yasal beyanın hangi parçaları eksik. TEK KAYNAK: operasyon önizlemesindeki uyarı kutusu bunu
 * kullanır; `ProductService.buildQuery` aynı ölçütü PostgREST süzgecine çevirir (ikisi ayrışırsa
 * "24 beyan eksik" yazıp süzgeçte 12 satır gösteren ekran doğar — orada bu fonksiyona atıf var).
 *
 * Ölçüt: müşteri ürün sayfasının ZORUNLU bölümlerinden biri boşsa eksiktir. `traces` (çapraz bulaşma)
 * bilerek dışarıda — boş olması "risk yok" demektir, eksik beyan değil.
 */
export function missingDeclarations(
  p: Pick<Product, 'name' | 'ingredients' | 'nutrition' | 'storageInstructions' | 'allergens'>,
): DeclarationGap[] {
  const gaps: DeclarationGap[] = [];
  if (LOCALIZED_TEXT_KEYS.some((l) => !p.name[l]?.trim())) gaps.push('lang');
  if (!p.ingredients || !LOCALIZED_TEXT_KEYS.some((l) => p.ingredients?.[l]?.trim())) gaps.push('ingredients');
  if (!hasNutrition(p.nutrition)) gaps.push('nutrition');
  if (!p.storageInstructions || !LOCALIZED_TEXT_KEYS.some((l) => p.storageInstructions?.[l]?.trim())) gaps.push('storage');
  if (p.allergens.length === 0) gaps.push('allergens');
  return gaps;
}

export const ProductSchema = z.object({
  id: z.string().uuid(),
  name: LocalizedTextSchema,
  description: LocalizedTextSchema.nullable(),
  slug: z.string(),
  categoryId: z.string().uuid().nullable(),
  // Yasal beyan (INCO) — müşteri ürün sayfasının zorunlu bölümlerini besler.
  // `ingredients`/`storageInstructions` düz metin + `**vurgu**` işareti taşır (bkz. @lezzet/helper).
  ingredients: LocalizedTextSchema.nullable(),
  nutrition: NutritionSchema.nullable(),
  storageInstructions: LocalizedTextSchema.nullable(),
  allergens: z.array(ProductAllergenEnum),
  /** Çapraz bulaşma — cümle bu listeden i18n şablonuyla kurulur, serbest metin tutulmaz. */
  traces: z.array(ProductAllergenEnum),
  vatRate: dbNumeric,
  /**
   * "Beyan eksik" — üretilmiş kolon (0005): ad dillerinden biri yok, içindekiler/besin/saklama hiç
   * girilmemiş ya da alerjen listesi boş. Süzgeç ve sayaç AYNI gerçeği okusun diye veritabanında
   * hesaplanır. HANGİ beyanın eksik olduğu `missingDeclarations` ile (rozet ayrıntısı).
   */
  isIncomplete: z.boolean(),
  dateType: ProductDateTypeEnum,
  shelfLifeDays: z.number().int().nullable(),
  shippable: z.boolean(),
  /** Satış durumu — TEK alan (DB'de `product_status` enum'u). Bkz. ProductStatusEnum. */
  status: ProductStatusEnum,
  targetMarginPercent: dbNumericNullable,
  autoPrice: z.boolean(),
  sortOrder: z.number().int(),

  /**
   * **ÇEŞİT EKSENİ** (05.15) — ürün bir ailenin üyesi mi. `null` = ailesiz, çeşit bloğu HİÇ çizilmez.
   *
   * Varyanttan ayrı: varyant aynı ürünün boyudur (500 g / 1 kg), aile kimlik seçimidir
   * (limonlu / mangolu). Üye = tam bir ürün — kendi sayfası, beyanı, görseli, fiyatı var.
   */
  familyId: z.string().uuid().nullable(),
  /**
   * Ailedeki kart etiketi — ürün adından AYRI ve üç dilli. Ürün "Limonlu kek", etiket "Limonlu";
   * kartta okunan ikincisidir. Ürün adından türetilemez (ortak eki kırpmak "Çilekli Kek" ile
   * "Kek Dilimi" yan yana gelince bozulur). `familyId` doluyken **veri kısıtı zorunlu kılıyor**.
   */
  familyLabel: LocalizedTextSchema.nullable(),
  /** Aile İÇİNDEKİ sıra (operatörün sürüklediği). `sortOrder` katalog sırasıdır, karışmaz. */
  familyPosition: z.number().int(),

  createdAt: z.string(),
}).merge(ImageMetaSchema); // görsel alanları (anahtar + odak + alt metin) ortak şemadan gelir
export type Product = z.infer<typeof ProductSchema>;

// name/slug zorunlu; kalanı DB default'lu/nullable → opsiyonel. slug servis türetir.
export const ProductInsertSchema = z.object({
  name: LocalizedTextSchema,
  slug: z.string(),
  description: LocalizedTextSchema.nullish(),
  categoryId: z.string().uuid().nullish(),
  ingredients: LocalizedTextSchema.nullish(),
  nutrition: NutritionSchema.nullish(),
  storageInstructions: LocalizedTextSchema.nullish(),
  allergens: z.array(ProductAllergenEnum).optional(),
  traces: z.array(ProductAllergenEnum).optional(),
  vatRate: z.number().optional(),
  dateType: ProductDateTypeEnum.optional(),
  shelfLifeDays: z.number().int().nullish(),
  shippable: z.boolean().optional(),
  status: ProductStatusEnum.optional(),
  targetMarginPercent: z.number().nullish(),
  autoPrice: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  // Aile üç alan birden verilir ya da hiç verilmez — kısmi gönderim veri kısıtına takılır
  // (`family_id` doluyken etiket zorunlu) ve bu doğru davranıştır.
  familyId: z.string().uuid().nullish(),
  familyLabel: LocalizedTextSchema.nullish(),
  familyPosition: z.number().int().optional(),
}).merge(ImageMetaInsertSchema);
export type ProductInsert = z.infer<typeof ProductInsertSchema>;

/**
 * **ÜRÜN AİLESİ** (05.15) — çeşit ekseninin kendisi.
 *
 * `name` TEK DİLLİ ve bu bilinçli: aile adı müşteriye görünmez (kullanıcı kararı 04.08).
 * Müşterinin gördüğü başlık arayüz metnidir ("Çeşitler"); bu ad yalnız operatörün panelde aileyi
 * tanımasına yarar ve operasyon yüzeyi zaten tek dillidir (`CLAUDE §2`).
 */
export const ProductFamilySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type ProductFamily = z.infer<typeof ProductFamilySchema>;

export const ProductFamilyInsertSchema = ProductFamilySchema.pick({ name: true }).extend({
  isActive: z.boolean().optional(),
});
export type ProductFamilyInsert = z.infer<typeof ProductFamilyInsertSchema>;

export const ProductFamilyUpdateSchema = ProductFamilySchema.partial().required({ id: true });
export type ProductFamilyUpdate = z.infer<typeof ProductFamilyUpdateSchema>;

/**
 * Ailedeki bir üyenin sırası — **tüm aile birden yazılır** (`replacePostalCodes` deseni).
 *
 * Kısmi güncelleme yazsaydık iki eşzamanlı sürükleme sıralamada delik bırakırdı ve hiçbir yer hata
 * vermezdi: kartlar bir gün kendiliğinden başka sırada görünürdü.
 */
export const ProductFamilyOrderSchema = z.object({
  productId: z.string().uuid(),
  position: z.number().int(),
});
export type ProductFamilyOrder = z.infer<typeof ProductFamilyOrderSchema>;

// `isIncomplete` ÜRETİLMİŞ kolondur (0005) — yazılamaz, o yüzden güncelleme şemasından çıkarılır;
// yoksa forma dokunmamış bir alan bile update'e sızıp "cannot insert into generated column" verir.
export const ProductUpdateSchema = ProductSchema.omit({ isIncomplete: true }).partial().required({ id: true });
export type ProductUpdate = z.infer<typeof ProductUpdateSchema>;

/**
 * Ürün + TEK sorguda gelen ilişkileri. Varyantlar ve koleksiyon üyelikleri ürün başına ayrı sorguyla
 * çekilirse N+1 doğar; gömülü `select` ile aynı turda gelirler (STACK §13). Şema `ProductSchema`'yı
 * TÜRETİR — alanlar yeniden yazılmaz. Anahtar adları sorgudaki takma adlarla eşleşir (`variants:…`,
 * `collections:…`), böylece PostgREST tablo adları domain tipine sızmaz.
 */
export const ProductWithRelationsSchema = ProductSchema.extend({
  variants: z.array(ProductVariantSchema),
  collections: z.array(z.object({ collectionId: z.string().uuid() })),
});
export type ProductWithRelations = z.infer<typeof ProductWithRelationsSchema>;

/**
 * **`product_listing` görünümünün satırı** (08.10 · 21.6) — ürün + ilişkiler + görünümün HESAPLADIĞI
 * iki kolon.
 *
 * Ayrı şema olmasının sebebi bir arıza: servis cevabı `ProductWithRelationsSchema` ile parse
 * ediyordu ve Zod tanımadığı alanları düşürüyor — **görünüm hesaplıyor, servis çöpe atıyordu.**
 * Hiçbir yerde hata vermiyordu; yalnız ziyaretçi fiyatı okumanın ucuna hiç varmıyordu ve her
 * tüketici onu ikinci kez hesaplamak zorunda kalıyordu (mobil şeridin ölçümü, 07.08).
 *
 * `product` TABLOSUNDA bu iki kolon YOK ve olmamalı: fiyat kanaldan, müşteriden, depodan ve
 * yaklaşan son tarihli partiden türer — saklanan bir "geçerli fiyat" ilk gün yalan söyler. Görünüm
 * o türetimi tek yerde yapıyor (`0032`), bu şema da onun çıktısını tarif ediyor.
 */
export const ProductListingRowSchema = ProductWithRelationsSchema.extend({
  /** Ziyaretçinin göreceği birim fiyat; `null` = kanal fiyatı girilmemiş (satışa kapalı). */
  effectivePrice: dbNumericNullable,
  /** Fiyat yaklaşan son tarihli parti teklifinden mi geliyor — kartta "fırsat" rozeti. */
  hasNearExpiryOffer: z.boolean(),
});
export type ProductListingRow = z.infer<typeof ProductListingRowSchema>;

/**
 * Paket seçicisinin HAVUZU — ürünün yalnız kimlik/fiyat/durum alanları + boyların adı.
 *
 * Tam ürün okumak bu iş için 113 KB taşıyordu (besin değerleri, beyan metinleri, alerjenler,
 * saklama koşulları…) ve hepsi çöpe gidiyordu: havuz yedi alan kullanıyor. Dar okuma aynı listeyi
 * ~15 KB'a indiriyor — satır sayısı değil, SATIR GENİŞLİĞİ pahalıydı.
 */
export const ProductPoolSchema = ProductSchema.pick({
  id: true,
  name: true,
  imageKey: true,
  imageUpdatedAt: true,
  status: true,
  vatRate: true,
  targetMarginPercent: true,
}).extend({
  variants: z.array(ProductVariantSchema.pick({ id: true, label: true, isActive: true })),
});
export type ProductPool = z.infer<typeof ProductPoolSchema>;

/**
 * Stok ekranının ürün SATIRI — havuzun kardeşi, aynı gerekçeyle dar (09.13).
 *
 * Stok listesi ürünün beyanını ve fiyat alanlarını hiç kullanmaz; ihtiyacı dört şeydir: kimin stoğu
 * (ad, kategori, **görsel**), hangi tarih rejimi (`dateType` + `shelfLifeDays` — raf ömrü
 * kararlarının girdisi) ve hangi boylar. Tarih alanları ÜRÜNDE durduğu için parti satırı tek başına
 * "yaklaşan mı" sorusunu yanıtlayamaz; bu okuma o eksiği kapatır.
 *
 * **Görsel 22.30'da eklendi** (kullanıcı tespiti 14.08: *"ürünlerin resmi ile beraber görmek daha
 * kalıcı olur"*). Adla birlikte gelen küçük görsel, uzun listede satırı okumadan tanımayı sağlıyor —
 * depoda ürünler adlarıyla değil görünüşleriyle hatırlanır. Ek sorgu değil: iki kolon, aynı okumada.
 *
 * `minStockQty` boyla gelir: "eşiğin altına düştü" göstergesi ayrı bir sorgu istemesin.
 */
export const ProductStockRowSchema = ProductSchema.pick({
  id: true,
  name: true,
  categoryId: true,
  dateType: true,
  shelfLifeDays: true,
  status: true,
  imageKey: true,
  imageUpdatedAt: true,
}).extend({
  variants: z.array(
    ProductVariantSchema.pick({ id: true, label: true, isActive: true, minStockQty: true, sku: true }),
  ),
});
export type ProductStockRow = z.infer<typeof ProductStockRowSchema>;

/**
 * Fiyat ekranının ürün SATIRI — havuzun/stok satırının kardeşi, aynı gerekçeyle dar (09.5).
 *
 * Fiyat kararının ürün tarafından istediği dört şey var: kimin fiyatı (ad, kategori), hangi KDV
 * tabanı (`vatRate` — b2c fiyatı KDV DAHİL, maliyet hariç; marj bu oran bilinmeden hesaplanamaz),
 * hedef marj ve otomatik fiyat anahtarı. Son ikisi ÜRÜNDE durur, fiyat ise varyantta: satır tek
 * başına "marj-altında mı" sorusunu yanıtlayamaz, bu okuma o eksiği kapatır.
 *
 * `status` gelir çünkü aday ürünün de fiyatı girilebilir (satışa açılmadan hazırlanır); ekran bunu
 * söyler, saklamaz.
 */
export const ProductPriceRowSchema = ProductSchema.pick({
  id: true,
  name: true,
  categoryId: true,
  vatRate: true,
  targetMarginPercent: true,
  autoPrice: true,
  status: true,
}).extend({
  // `sortOrder` boyla gelir: fiyat tablosunda aynı ürünün boyları alt alta ve HER ZAMAN aynı sırada
  // durmalı. Gömülü seçim sırayı garanti etmez — iki yenilemede satırların yer değiştirdiği bir
  // fiyat listesi, karşılaştırma yapılamayan bir listedir.
  variants: z.array(ProductVariantSchema.pick({ id: true, label: true, isActive: true, sortOrder: true })),
});
export type ProductPriceRow = z.infer<typeof ProductPriceRowSchema>;


// Ürün düzenleme formunun yazdığı alanlar (Temel + içerik + beyan + görsel künyesi) — id/slug/
// imageKey/sortOrder/createdAt hariç, hepsi opsiyonel (yalnız verilenler yazılır). ProductSchema'dan
// TÜRETİLİR (tek kaynak; alan tekrarı yok). Dosyanın kendisi ayrı yükleme akışında (imageKey), ama
// ODAK ve ALT METİN forma aittir: "kaydeden yayınlar" (envanter §0B kaydetme kapısı).
export const ProductDetailsUpdateSchema = ProductSchema.pick({
  name: true,
  description: true,
  categoryId: true,
  imageFocalX: true,
  imageFocalY: true,
  imageZoom: true,
  imageAlt: true,
  ingredients: true,
  nutrition: true,
  storageInstructions: true,
  allergens: true,
  traces: true,
  vatRate: true,
  dateType: true,
  shelfLifeDays: true,
  shippable: true,
  status: true,
  targetMarginPercent: true,
  autoPrice: true,
}).partial();
export type ProductDetailsUpdate = z.infer<typeof ProductDetailsUpdateSchema>;
