import { z } from 'zod';
import { ProductInsertSchema, ProductVariantEntrySchema, type LocalizedText } from '@lezzet/types';
import { productStatus, type ProductView } from '../../products-types';

// Ürün formu şeması — ProductInsertSchema'dan TÜRETİLİR (referans deseni: .omit().extend()). Formda
// olmayan alanlar çıkarılır (slug servis türetir; imageKey ayrı yükleme; isCandidate/sortOrder yok).
// vatRate segment için string'e daraltılır; varyant satırları eklenir. Tip elle yazılmaz — z.infer.
export const ProductFormSchema = ProductInsertSchema.omit({
  slug: true,
  imageKey: true,
  isCandidate: true,
  sortOrder: true,
  vatRate: true,
}).extend({
  vatRate: z.enum(['5.5', '20']),
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
    variants: values.variants
      .filter((v) => v.label.trim())
      .map((v) => ({ id: v.id, label: v.label.trim(), netWeightG: v.netWeightG, sku: v.sku?.trim() || null, isActive: v.isActive })),
  };
}
