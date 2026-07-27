import { z } from 'zod';
import { LocalizedTextSchema, type LocalizedText } from './localized-text.schema';
import { ImageMetaInsertSchema, ImageMetaSchema } from './image.schema';

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

// PG numeric supabase-js'te string dönebilir → number'a indir (okuma tarafı).
const dbNumeric = z.union([z.number(), z.string()]).transform((v) => Number(v));
const dbNumericNullable = z
  .union([z.number(), z.string()])
  .nullable()
  .transform((v) => (v == null ? null : Number(v)));

export const ProductSchema = z.object({
  id: z.string().uuid(),
  name: LocalizedTextSchema,
  description: LocalizedTextSchema.nullable(),
  slug: z.string(),
  categoryId: z.string().uuid().nullable(),
  allergens: z.array(ProductAllergenEnum),
  vatRate: dbNumeric,
  dateType: ProductDateTypeEnum,
  shelfLifeDays: z.number().int().nullable(),
  shippable: z.boolean(),
  isCandidate: z.boolean(),
  isActive: z.boolean(),
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
  allergens: z.array(ProductAllergenEnum).optional(),
  vatRate: z.number().optional(),
  dateType: ProductDateTypeEnum.optional(),
  shelfLifeDays: z.number().int().nullish(),
  shippable: z.boolean().optional(),
  isCandidate: z.boolean().optional(),
  isActive: z.boolean().optional(),
  targetMarginPercent: z.number().nullish(),
  autoPrice: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
}).merge(ImageMetaInsertSchema);
export type ProductInsert = z.infer<typeof ProductInsertSchema>;

export const ProductUpdateSchema = ProductSchema.partial().required({ id: true });
export type ProductUpdate = z.infer<typeof ProductUpdateSchema>;

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
  allergens: true,
  vatRate: true,
  dateType: true,
  shelfLifeDays: true,
  shippable: true,
  isActive: true,
  isCandidate: true,
  targetMarginPercent: true,
  autoPrice: true,
}).partial();
export type ProductDetailsUpdate = z.infer<typeof ProductDetailsUpdateSchema>;
