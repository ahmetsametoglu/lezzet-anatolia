import { z } from 'zod';
import {
  DEFAULT_CROP_FIELDS,
  EMPTY_NUTRITION,
  hasNutrition,
  ImageCropFieldsSchema,
  NewVariantBarcodeSchema,
  pickCropFields,
  ProductInsertSchema,
  ProductStatusEnum,
  ProductVariantEntrySchema,
  resolveLocalizedText,
  type LocalizedText,
  type Product,
  type ProductVariant,
} from '@lezzet/types';
/**
 * Formun okuduğu ürün — şemadan türer, sayfa view-model'ine bağlanmaz.
 * Form ortak komponentte durduğu için `app/`'e bakamaz (STACK §4, bağımlılık tek yönlü).
 */
export type ProductFormSource = Product & { variants: ProductVariant[] };

// Ürün formu şeması — `ProductInsertSchema`'dan türer; formda olmayan alanlar çıkarılır, görsel odak/zoom ortak kırpma şemasından birleşir.
// `vatRate` segment kontrolü için dizgeye daraltılır; tip elle yazılmaz (`z.infer`).
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
    /**
     * Varyant satırı + o satıra BAĞLANACAK yeni kodlar. Kod varyantın kolonu değil ayrı bir eşleme kaydıdır
     * (`variant_barcode`); kayıtlı kodlar editörün kendi okuması, buradaki liste yalnız kaydetmede bağlanacak
     * olanlardır. Yeni açılan boyda satırın kimliği henüz yok, eşleme satır sırasından kurulur.
     */
    variants: z.array(ProductVariantEntrySchema.extend({ newBarcodes: z.array(NewVariantBarcodeSchema).optional() })),
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
export function buildDefaults(p: ProductFormSource | null): ProductFormValues {
  if (!p) {
    return {
      name: {},
      description: null,
      categoryId: null,
      // Beyan girilmemiş doğar; "içermez" yalnız formdaki anahtarla verilir.
      allergens: null,
      traces: [],
      ingredients: null,
      nutrition: EMPTY_NUTRITION,
      storageInstructions: null,
      vatRate: '5.5',
      dateType: 'DDM',
      shelfLifeDays: null,
      // Veriyle aynı: kolon `false` doğar, çünkü unutulan kargo izninin bedeli "satılamadı" olmalı, "bozuk gitti" değil.
      shippable: false,
      // Yeni ürün DONUK doğar — migration `0005` künyesindeki gerekçe: unutulan alanın bedeli
      // güvenli tarafta kalmalı. Yanlış `ambient` işaretlenmiş donuk ürünün iadesi rafa döner.
      storageType: 'frozen',
      // Yeni ürün aday doğar: fiyatı ve stoğu henüz yok, beyanı çoğu zaman eksik; satışa almak durum seçicisinden verilen ayrı karar.
      // "Pasif" geri çekilmiş kaydın hâlidir, "aday" henüz tamamlanmamış olanın.
      status: 'candidate',
      targetMarginPercent: null,
      autoPrice: false,
      ...DEFAULT_CROP_FIELDS,
      variants: [
        {
          label: {},
          netQuantity: null,
          netUnit: 'g',
          piecesCount: null,
          portionKind: null,
          packedWeightG: null,
          packedLengthMm: null,
          packedWidthMm: null,
          packedHeightMm: null,
          minStockQty: null,
          sku: null,
          isActive: true,
        },
      ],
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
    storageType: p.storageType,
    status: p.status,
    targetMarginPercent: p.targetMarginPercent,
    autoPrice: p.autoPrice,
    ...pickCropFields(p),
    variants: p.variants.map((v) => ({
      id: v.id,
      label: v.label,
      netQuantity: v.netQuantity,
      netUnit: v.netUnit,
      piecesCount: v.piecesCount,
      portionKind: v.portionKind,
      packedWeightG: v.packedWeightG,
      packedLengthMm: v.packedLengthMm,
      packedWidthMm: v.packedWidthMm,
      packedHeightMm: v.packedHeightMm,
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
    allergens: values.allergens ?? null,
    traces: values.traces ?? [],
    // Beyan metinleri `**vurgu**` işaretini KORUYARAK gider — düz metin, HTML değil (rich-text).
    ingredients: values.ingredients ? cleanLocalized(values.ingredients) : null,
    // Hiçbir kalemi girilmemiş künye null yazılır: boş bir nesne "beyan var" gibi görünürdü.
    nutrition: hasNutrition(values.nutrition ?? null) ? values.nutrition : null,
    storageInstructions: values.storageInstructions ? cleanLocalized(values.storageInstructions) : null,
    vatRate: Number(values.vatRate),
    dateType: values.dateType ?? 'DDM',
    shelfLifeDays: values.shelfLifeDays ?? null,
    shippable: values.shippable ?? false,
    storageType: values.storageType ?? 'frozen',
    status: values.status,
    targetMarginPercent: values.targetMarginPercent ?? null,
    autoPrice: values.autoPrice ?? false,
    ...pickCropFields(values),
    // Kayıtlı satır (id'li) her zaman gider, listeden çıkmasının tek yolu silme düğmesidir.
    // Yeni satır (id'siz) hiçbir alanı doldurulmamışsa atılır: "+ varyant"a basıp vazgeçmek boş satır bırakmaz.
    variants: values.variants
      .filter(
        (v) =>
          v.id ||
          resolveLocalizedText(v.label) ||
          v.sku?.trim() ||
          v.netQuantity != null ||
          v.piecesCount != null ||
          v.minStockQty != null ||
          // Ambalaj bölmesi de "dokunulmuş satır" sayılır: yalnız ölçü girip etiketi boş bırakan
          // operatörün satırı atılırsa girdiği sayı sessizce kaybolur.
          v.portionKind != null ||
          v.packedWeightG != null ||
          v.packedLengthMm != null ||
          // Yalnız kod girilmiş satır da DOKUNULMUŞ sayılır: atılırsa yazılan kod sessizce kaybolurdu.
          (v.newBarcodes?.length ?? 0) > 0,
      )
      .map((v) => ({
        id: v.id,
        label: cleanLocalized(v.label),
        // Sayı ve birim BİRLİKTE yaşar (kısıt veride): miktarsız satırda birim de yazılmaz, miktar
        // varken birim boş kalmışsa gram sayılır — seçici zaten gramla açılıyor.
        netQuantity: v.netQuantity ?? null,
        netUnit: v.netQuantity == null ? null : (v.netUnit ?? 'g'),
        piecesCount: v.piecesCount,
        portionKind: v.portionKind,
        packedWeightG: v.packedWeightG,
        packedLengthMm: v.packedLengthMm,
        packedWidthMm: v.packedWidthMm,
        packedHeightMm: v.packedHeightMm,
        minStockQty: v.minStockQty,
        sku: v.sku?.trim() || null,
        isActive: v.isActive,
        // Kod varyantın kolonu değil: kapı satırı yazdıktan sonra eşlemeyi ayrıca kurar.
        newBarcodes: (v.newBarcodes ?? []).map((b) => ({ ...b, code: b.code.trim() })),
      })),
  };
}
