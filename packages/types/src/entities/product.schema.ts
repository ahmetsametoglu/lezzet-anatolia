import { z } from 'zod';
import { dbNumeric, dbNumericNullable } from '../primitives/db-numeric';
import { ChannelEnum } from '../primitives/enums.schema';
import { hasAllLocales, LocalizedTextSchema, type LocalizedText } from '../primitives/localized-text.schema';
import { IMAGE_RENDER_FIELDS, ImageMetaInsertSchema, ImageMetaSchema } from '../primitives/image.schema';
import { ProductVariantSchema } from './product-variant.schema';

// Ürün — paylaşılan alanlar (satılabilir birim ProductVariant'ta). 0005 migration, DATA_MODEL.
export const ProductDateTypeEnum = z.enum(['DLC', 'DDM']);
export type ProductDateType = z.infer<typeof ProductDateTypeEnum>;

/**
 * Saklama rejimi — soğuk zincirin kendisi; iade edilen donuk ürünün imha varsayılanı bu değere bakar.
 * `shippable` yerine geçmez: o teslimat olgusu, bu saklama olgusu.
 */
export const ProductStorageTypeEnum = z.enum(['ambient', 'chilled', 'frozen']);
export type ProductStorageType = z.infer<typeof ProductStorageTypeEnum>;

// AB'nin 14 alerjeni (yasal beyan); enum anahtarı ASCII, görünen ad `ALLERGEN_LABELS`ta.
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

// Alerjenin çok dilli görünen adı — operasyon ve müşteri yüzeyi buradan çözer; enum'un yanında ki yeni değer adsız kalmasın.
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
 * Ürünün satış durumu — tek kolon, çünkü iki bayrak üç durum için dört birleşim üretir ve ikisi aynı davranışa çıkar.
 * Aday satılamaz, yalnız keşif akışında görünür (DOMAIN §13).
 */
export const ProductStatusEnum = z.enum(['active', 'passive', 'candidate']);
export type ProductStatus = z.infer<typeof ProductStatusEnum>;

/**
 * Durumun operasyon yüzeyindeki adı — enum'un yanında durur ki yeni durum adsız kalmasın (`Record` derlemeyi durdurur).
 * Personel ekranları yalnız Türkçe; müşteri yüzeyi bu haritayı kullanmaz, orada durum bir görünürlük kuralıdır.
 */
export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  active: 'Satışta',
  passive: 'Pasif',
  candidate: 'Aday',
};

/**
 * Besin değerleri — INCO'nun zorunlu seti, 100 g başına ve sabit kalemli ki tablo, form ve çeviri aynı listeden üretilsin.
 * `null` kalem "bilinmiyor" demektir ve o satır gösterilmez.
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
 * Kalemlerin operatöre görünen adı ve birimi — `Record` olduğu için şemaya eklenen kalem adsız kalamaz.
 * Enerjinin iki kalemi aynı büyüklüğün iki birimidir (kJ · kcal); okuyan yüzeyler onları tek satırda birleştirir.
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
 * Eksik beyanın operatöre görünen adı — ürün önizlemesi ve asistan kuyruğu aynı eksiği aynı adla yazsın diye burada.
 * `lang` genel kalır; hangi dilin eksik olduğunu ekran kendi bağlamından söyler.
 */
export const DECLARATION_GAP_LABELS: Record<DeclarationGap, string> = {
  lang: 'dil içeriği',
  ingredients: 'içindekiler',
  nutrition: 'besin değerleri',
  storage: 'saklama koşulları',
  allergens: 'alerjen beyanı',
};

/**
 * Yasal beyanın hangi parçaları eksik — `product.is_incomplete` üretilmiş kolonunun karşılığı; süzgeç ve sayaç kolonu, ekran ve asistan bu fonksiyonu okur.
 * `traces` bilerek dışarıda: boş olması "risk yok" demektir, eksik beyan değil.
 */
export function missingDeclarations(
  p: Pick<Product, 'name' | 'ingredients' | 'nutrition' | 'storageInstructions' | 'allergens'>,
): DeclarationGap[] {
  const gaps: DeclarationGap[] = [];
  if (!hasAllLocales(p.name)) gaps.push('lang');
  if (!hasAllLocales(p.ingredients)) gaps.push('ingredients');
  if (!hasNutrition(p.nutrition)) gaps.push('nutrition');
  if (!hasAllLocales(p.storageInstructions)) gaps.push('storage');
  if (p.allergens == null) gaps.push('allergens');
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
  /** Alerjen beyanı — `null` girilmedi, boş liste "alerjen içermez"; satıştaki üründe veri kısıtıyla zorunlu. */
  allergens: z.array(ProductAllergenEnum).nullable(),
  /** Çapraz bulaşma — cümle bu listeden i18n şablonuyla kurulur, serbest metin tutulmaz. */
  traces: z.array(ProductAllergenEnum),
  vatRate: dbNumeric,
  /**
   * "Beyan eksik" — üretilmiş kolon; süzgeç ve sayaç aynı gerçeği okusun diye veritabanında hesaplanır.
   * Hangi beyanın eksik olduğunu `missingDeclarations` söyler.
   */
  isIncomplete: z.boolean(),
  dateType: ProductDateTypeEnum,
  shelfLifeDays: z.number().int().nullable(),
  shippable: z.boolean(),
  /** Saklama rejimi — soğuk zincirin kendisi; `shippable` ile karıştırılmaz (bkz. ProductStorageTypeEnum). */
  storageType: ProductStorageTypeEnum,
  /** Satış durumu — tek alan (DB'de `product_status` enum'u), ayrıntı `ProductStatusEnum`da. */
  status: ProductStatusEnum,
  targetMarginPercent: dbNumericNullable,
  /** B2B'ye özel hedef marj; `null` = ortak hedef B2B'de de geçerli (çözüm `targetMarginFor`). */
  targetMarginB2bPercent: dbNumericNullable,
  autoPrice: z.boolean(),
  sortOrder: z.number().int(),

  /**
   * Çeşit ekseni — ürün bir ailenin üyesi mi; `null` = ailesiz, çeşit bloğu çizilmez.
   * Varyant aynı ürünün boyudur, aile kimlik seçimidir: üye kendi sayfası ve beyanı olan tam bir üründür.
   */
  familyId: z.string().uuid().nullable(),
  /**
   * Ailedeki kart etiketi — üç dilli ve ürün adından ayrı; ortak eki kırparak türetmek "Kek Dilimi" gibi adlarda bozulur.
   * `familyId` doluyken veri kısıtı onu zorunlu kılar.
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
  allergens: z.array(ProductAllergenEnum).nullish(),
  traces: z.array(ProductAllergenEnum).optional(),
  vatRate: z.number().optional(),
  dateType: ProductDateTypeEnum.optional(),
  shelfLifeDays: z.number().int().nullish(),
  shippable: z.boolean().optional(),
  storageType: ProductStorageTypeEnum.optional(),
  status: ProductStatusEnum.optional(),
  targetMarginPercent: z.number().nullish(),
  targetMarginB2bPercent: z.number().nullish(),
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
 * Ürün ailesi — çeşit ekseninin kendisi.
 * `name` tek dillidir: aile adı müşteriye görünmez, müşteri arayüz metnini ("Çeşitler") görür.
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

/** Ailedeki üyelerin sırası — tüm aile birden yazılır; kısmi güncellemede iki eşzamanlı sürükleme sırada sessiz bir delik bırakır. */
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
 * Ürün ve tek sorguda gelen ilişkileri — gömülü `select` N+1'i önler; şema `ProductSchema`'dan türer.
 * Anahtarlar sorgudaki takma adlarla eşleşir ki PostgREST tablo adları domain tipine sızmasın.
 */
export const ProductWithRelationsSchema = ProductSchema.extend({
  variants: z.array(ProductVariantSchema),
  collections: z.array(z.object({ collectionId: z.string().uuid() })),
});
export type ProductWithRelations = z.infer<typeof ProductWithRelationsSchema>;

/**
 * `product_listing` görünümünün satırı — görünümün hesapladığı kolonlar ayrı şemada, yoksa Zod onları tanımadan düşürür.
 * Bu kolonlar `product` tablosunda yok: fiyat kanal, müşteri, depo ve partiden türer; saklanan bir "geçerli fiyat" bayatlar.
 */
export const ProductListingRowSchema = ProductWithRelationsSchema.extend({
  /** Satırın kanalı — görünümün taneciği depo × kanal × ürün; süzgeci unutan okuma ürünü kanal sayısı kadar döndürür. */
  channel: ChannelEnum,
  /** Birincil boyun bu kanaldaki birim fiyatı — `null` olamaz: görünüm o kanalda fiyatı olmayan ürünü listelemez. */
  effectivePrice: dbNumeric,
  /** Fiyat yaklaşan son tarihli parti teklifinden mi geliyor — kartta "fırsat" rozeti. */
  hasNearExpiryOffer: z.boolean(),
});
export type ProductListingRow = z.infer<typeof ProductListingRowSchema>;

/**
 * Paket seçicisinin havuzu — ürünün yalnız kimlik, fiyat ve durum alanları ile boy adları.
 * Dar okuma bilinçli: tam ürünün beyan metinleri ve besin değerleri bu listede kullanılmaz, yalnız satırı genişletir.
 */
export const ProductPoolSchema = ProductSchema.pick({
  id: true,
  name: true,
  // Görseli çizmek için gereken alanlar: seçici listesi küçük resmi CDN kadrajıyla alır.
  ...IMAGE_RENDER_FIELDS,
  status: true,
  vatRate: true,
  targetMarginPercent: true,
}).extend({
  variants: z.array(ProductVariantSchema.pick({ id: true, label: true, isActive: true })),
});
export type ProductPool = z.infer<typeof ProductPoolSchema>;

/**
 * Stok ekranının ürün satırı — havuzun kardeşi, aynı gerekçeyle dar: ad, kategori, görsel, tarih rejimi ve boylar.
 * Tarih alanları üründe durduğu için parti satırı "yaklaşan mı" sorusunu tek başına yanıtlayamaz; bu okuma o eksiği kapatır.
 */
export const ProductStockRowSchema = ProductSchema.pick({
  id: true,
  name: true,
  categoryId: true,
  dateType: true,
  shelfLifeDays: true,
  status: true,
  // Küçük resim CDN'den, operatörün kadrajıyla çizilir.
  ...IMAGE_RENDER_FIELDS,
}).extend({
  variants: z.array(
    ProductVariantSchema.pick({ id: true, label: true, isActive: true, minStockQty: true, sku: true }),
  ),
});
export type ProductStockRow = z.infer<typeof ProductStockRowSchema>;

/**
 * Fiyat ekranının ürün satırı — dar: ad, kategori, KDV oranı, hedef marj ve otomatik fiyat anahtarı.
 * Marj bu oran ve hedef bilinmeden hesaplanamaz; `status` da gelir çünkü aday ürünün fiyatı satışa açılmadan hazırlanabilir.
 */
export const ProductPriceRowSchema = ProductSchema.pick({
  id: true,
  name: true,
  categoryId: true,
  vatRate: true,
  targetMarginPercent: true,
  targetMarginB2bPercent: true,
  autoPrice: true,
  status: true,
  // Satırın başındaki ürün görseli için; `imageUpdatedAt` önbellek kırıcıdır, kadraj ve ölçü küçük resmin CDN adresini kurar.
  ...IMAGE_RENDER_FIELDS,
}).extend({
  // `sortOrder` boyla gelir: gömülü seçim sırayı garanti etmez, oysa aynı ürünün boyları her yenilemede aynı sırada durmalı.
  variants: z.array(ProductVariantSchema.pick({ id: true, label: true, isActive: true, sortOrder: true })),
});
export type ProductPriceRow = z.infer<typeof ProductPriceRowSchema>;


// Ürün düzenleme formunun yazdığı alanlar — `ProductSchema`'dan türer, hepsi opsiyonel, yalnız verilenler yazılır.
// Dosya ayrı yükleme akışında; odak ve alt metin ise forma aittir ("kaydeden yayınlar").
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
  targetMarginB2bPercent: true,
  autoPrice: true,
}).partial();
export type ProductDetailsUpdate = z.infer<typeof ProductDetailsUpdateSchema>;
