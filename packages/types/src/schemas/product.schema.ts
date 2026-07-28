import { z } from 'zod';
import { dbNumeric, dbNumericNullable } from './db-numeric';
import { LOCALIZED_TEXT_KEYS, LocalizedTextSchema, type LocalizedText } from './localized-text.schema';
import { ImageMetaInsertSchema, ImageMetaSchema } from './image.schema';
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

/** Hiçbir kalemi girilmemiş boş künye — form varsayılanı bunu SPREAD eder. */
export const EMPTY_NUTRITION: Nutrition = Object.fromEntries(NUTRITION_KEYS.map((k) => [k, null])) as Nutrition;

/** En az bir kalem girilmiş mi — "beyan eksik" ölçütü boş künyeyi dolu saymamalı. */
export function hasNutrition(n: Nutrition | null): boolean {
  return n !== null && NUTRITION_KEYS.some((k) => n[k] !== null);
}

/** Beyanı eksik bırakan alanlar — ekran göstergesi ve sunucu süzgeci AYNI listeyi izler. */
export type DeclarationGap = 'lang' | 'ingredients' | 'nutrition' | 'storage' | 'allergens';

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
}).merge(ImageMetaInsertSchema);
export type ProductInsert = z.infer<typeof ProductInsertSchema>;

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
