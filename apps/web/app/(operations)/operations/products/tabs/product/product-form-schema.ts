import { z } from 'zod';
import { IMAGE_ZOOM_MAX, IMAGE_ZOOM_MIN, ProductInsertSchema, ProductVariantEntrySchema, type LocalizedText } from '@lezzet/types';
import { productStatus, type ProductView } from '../../products-types';

// Ürün formu şeması — ProductInsertSchema'dan TÜRETİLİR (referans deseni: .omit().extend()). Formda
// olmayan alanlar çıkarılır (slug servis türetir; imageKey ayrı yükleme; isCandidate/sortOrder yok;
// imageAlt boşsa müşteride ürün adına düşer → formda yok). vatRate segment için string'e daraltılır;
// görsel ODAK/ZOOM forma aittir ("kaydeden yayınlar", §0B). Tip elle yazılmaz — z.infer.
export const ProductFormSchema = ProductInsertSchema.omit({
  slug: true,
  imageKey: true,
  imageAlt: true,
  isCandidate: true,
  sortOrder: true,
  vatRate: true,
}).extend({
  vatRate: z.enum(['5.5', '20']),
  imageFocalX: z.number().int().min(0).max(100),
  imageFocalY: z.number().int().min(0).max(100),
  imageZoom: z.number().int().min(IMAGE_ZOOM_MIN).max(IMAGE_ZOOM_MAX),
  variants: z.array(ProductVariantEntrySchema),
});
export type ProductFormValues = z.infer<typeof ProductFormSchema>;

// Boş dilleri atar (kaydederken temiz jsonb).
function cleanLocalized(t: LocalizedText): LocalizedText {
  const o: LocalizedText = {};
  if (t.tr?.trim()) o.tr = t.tr.trim();
  if (t.fr?.trim()) o.fr = t.fr.trim();
  if (t.de?.trim()) o.de = t.de.trim();
  return o;
}

/** RHF varsayılanları — düzenlemede ProductView'dan, oluşturmada boş şablon (varsayılan varyant satırı). */
export function buildDefaults(p: ProductView | null): ProductFormValues {
  if (!p) {
    return {
      name: {},
      description: null,
      categoryId: null,
      allergens: [],
      vatRate: '5.5',
      dateType: 'DDM',
      shelfLifeDays: null,
      shippable: true,
      isActive: true,
      targetMarginPercent: null,
      autoPrice: false,
      imageFocalX: 50,
      imageFocalY: 50,
      imageZoom: 100,
      variants: [{ label: '', netWeightG: null, sku: null, isActive: true }],
    };
  }
  return {
    name: p.name,
    description: p.description,
    categoryId: p.categoryId,
    allergens: p.allergens,
    vatRate: p.vatRate === 20 ? '20' : '5.5',
    dateType: p.dateType,
    shelfLifeDays: p.shelfLifeDays,
    shippable: p.shippable,
    isActive: productStatus(p) === 'active',
    targetMarginPercent: p.targetMarginPercent,
    autoPrice: p.autoPrice,
    imageFocalX: p.imageFocalX,
    imageFocalY: p.imageFocalY,
    imageZoom: p.imageZoom,
    variants: p.variants.map((v) => ({ id: v.id, label: v.label, netWeightG: v.netWeightG, sku: v.sku, isActive: v.isActive })),
  };
}

/** Form değerlerini action girdisine indirger (dilleri temizler, vat number'a, boş varyant satırlarını atar). */
export function toActionPayload(values: ProductFormValues) {
  return {
    name: cleanLocalized(values.name),
    description: values.description ? cleanLocalized(values.description) : null,
    categoryId: values.categoryId ?? null,
    allergens: values.allergens ?? [],
    vatRate: Number(values.vatRate),
    dateType: values.dateType ?? 'DDM',
    shelfLifeDays: values.shelfLifeDays ?? null,
    shippable: values.shippable ?? true,
    isActive: values.isActive ?? true,
    targetMarginPercent: values.targetMarginPercent ?? null,
    autoPrice: values.autoPrice ?? false,
    imageFocalX: values.imageFocalX,
    imageFocalY: values.imageFocalY,
    imageZoom: values.imageZoom,
    variants: values.variants
      .filter((v) => v.label.trim())
      .map((v) => ({ id: v.id, label: v.label.trim(), netWeightG: v.netWeightG, sku: v.sku?.trim() || null, isActive: v.isActive })),
  };
}
