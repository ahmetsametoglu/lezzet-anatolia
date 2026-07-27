import { z } from 'zod';
import {
  DEFAULT_CROP_FIELDS,
  EMPTY_NUTRITION,
  hasNutrition,
  ImageCropFieldsSchema,
  pickCropFields,
  ProductInsertSchema,
  ProductStatusEnum,
  ProductVariantEntrySchema,
  resolveLocalizedText,
  type LocalizedText,
} from '@lezzet/types';
import { type ProductView } from '../../products-types';

// Ürün formu şeması — ProductInsertSchema'dan TÜRETİLİR (referans deseni: .omit().extend()). Formda
// olmayan alanlar çıkarılır (slug servis türetir; imageKey ayrı yükleme; isCandidate/sortOrder yok;
// imageAlt boşsa müşteride ürün adına düşer → formda yok). vatRate segment için string'e daraltılır;
// görsel ODAK/ZOOM forma aittir ("kaydeden yayınlar", §0B) → ortak ImageCropFieldsSchema MERGE edilir
// (odak/zoom alanları elle yazılmaz, tek kaynak). Tip elle yazılmaz — z.infer.
export const ProductFormSchema = ProductInsertSchema.omit({
  slug: true,
  imageKey: true,
  imageAlt: true,
  sortOrder: true,
  vatRate: true,
})
  .extend({
    vatRate: z.enum(['5.5', '20']),
    // Durum ZORUNLU'ya daraltılır: insert şemasında opsiyonel (DB default'u var), formda ise her zaman
    // bir seçim vardır — alt bardaki üçlü seçici. DB'de de tek kolon (`product_status`).
    status: ProductStatusEnum,
    variants: z.array(ProductVariantEntrySchema),
  })
  .merge(ImageCropFieldsSchema)
  // Boy etiketi TEK varyantta boş kalabilir (müşteri seçici görmez), ama İKİ boydan sonra ayırt edici
  // olmak zorunda: etiketsiz iki satır müşteriye aynı görünen iki seçenek demektir. Kural burada, DB'de
  // değil — DB tek boylu ürünü de tutuyor ve orada boşluk doğru cevap.
  .superRefine((v, ctx) => {
    if (v.variants.length < 2) return;
    v.variants.forEach((variant, i) => {
      if (resolveLocalizedText(variant.label)) return;
      ctx.addIssue({
        code: 'custom',
        path: ['variants', i, 'label'],
        message: 'Birden çok boy varsa etiket gerekli',
      });
    });
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
      traces: [],
      ingredients: null,
      nutrition: EMPTY_NUTRITION,
      storageInstructions: null,
      vatRate: '5.5',
      dateType: 'DDM',
      shelfLifeDays: null,
      shippable: true,
      status: 'active',
      targetMarginPercent: null,
      autoPrice: false,
      ...DEFAULT_CROP_FIELDS,
      variants: [{ label: {}, netWeightG: null, minStockQty: null, sku: null, isActive: true }],
    };
  }
  return {
    name: p.name,
    description: p.description,
    categoryId: p.categoryId,
    allergens: p.allergens,
    traces: p.traces,
    ingredients: p.ingredients,
    nutrition: p.nutrition ?? EMPTY_NUTRITION,
    storageInstructions: p.storageInstructions,
    vatRate: p.vatRate === 20 ? '20' : '5.5',
    dateType: p.dateType,
    shelfLifeDays: p.shelfLifeDays,
    shippable: p.shippable,
    status: p.status,
    targetMarginPercent: p.targetMarginPercent,
    autoPrice: p.autoPrice,
    ...pickCropFields(p),
    variants: p.variants.map((v) => ({
      id: v.id,
      label: v.label,
      netWeightG: v.netWeightG,
      minStockQty: v.minStockQty,
      sku: v.sku,
      isActive: v.isActive,
    })),
  };
}

/** Form değerlerini action girdisine indirger (dilleri temizler, vat number'a, boş varyant satırlarını atar). */
export function toActionPayload(values: ProductFormValues) {
  return {
    name: cleanLocalized(values.name),
    description: values.description ? cleanLocalized(values.description) : null,
    categoryId: values.categoryId ?? null,
    allergens: values.allergens ?? [],
    traces: values.traces ?? [],
    // Beyan metinleri `**vurgu**` işaretini KORUYARAK gider — düz metin, HTML değil (rich-text).
    ingredients: values.ingredients ? cleanLocalized(values.ingredients) : null,
    // Hiçbir kalemi girilmemiş künye null yazılır: boş bir nesne "beyan var" gibi görünürdü.
    nutrition: hasNutrition(values.nutrition ?? null) ? values.nutrition : null,
    storageInstructions: values.storageInstructions ? cleanLocalized(values.storageInstructions) : null,
    vatRate: Number(values.vatRate),
    dateType: values.dateType ?? 'DDM',
    shelfLifeDays: values.shelfLifeDays ?? null,
    shippable: values.shippable ?? true,
    status: values.status,
    targetMarginPercent: values.targetMarginPercent ?? null,
    autoPrice: values.autoPrice ?? false,
    ...pickCropFields(values),
    // KAYITLI satır (id'li) her zaman gider: listeden çıkmasının TEK yolu silme düğmesidir. Eskiden
    // ölçüt "etiketi boş olanı at"tı — etiketi silinen kayıtlı varyant sessizce silinirdi. Yeni satır
    // (id'siz) ise hiçbir alanı doldurulmamışsa atılır: "+ varyant"a basıp vazgeçmek boş satır bırakmaz.
    variants: values.variants
      .filter((v) => v.id || resolveLocalizedText(v.label) || v.sku?.trim() || v.netWeightG != null || v.minStockQty != null)
      .map((v) => ({
        id: v.id,
        label: cleanLocalized(v.label),
        netWeightG: v.netWeightG,
        minStockQty: v.minStockQty,
        sku: v.sku?.trim() || null,
        isActive: v.isActive,
      })),
  };
}
