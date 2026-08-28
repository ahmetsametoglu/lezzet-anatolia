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
  type Product,
  type ProductVariant,
} from '@lezzet/types';
/**
 * Formun okuduğu ürün — **şemadan türer, sayfa view-model'ine bağlanmaz.**
 *
 * Bir tur girdi `ProductView` idi ve form ürün sayfasının klasöründeyken bu doğruydu. Form ortak
 * komponente taşınınca (22.14) o bağ ters yön olurdu: `components/` `app/`'e bakamaz (`STACK §4`,
 * bağımlılık tek yönlü). Zaten kullanılan alanlar da `Product` + varyantlar; görsel URL'i, kategori
 * adı ve koleksiyon adları formun hiç dokunmadığı türevlerdi.
 */
export type ProductFormSource = Product & { variants: ProductVariant[] };

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
export function buildDefaults(p: ProductFormSource | null): ProductFormValues {
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
      // **`false` — veriyle AYNI (28.08 düzeltmesi).** Kolon `0005`te bilerek `false` doğuyor
      // (kullanıcı kararı 08.08: *"unutulan alanın bedeli 'satılamadı' olmalı, 'bozuk gitti'
      // değil"*), ama form `true` ile doğuruyordu — üstelik aynı formda `storageType: 'frozen'`.
      // Yani formdan açılan her yeni ürün "donuk ama kargolanabilir" doğuyordu. `status`
      // varsayılanının 05.36'da düzeltilen arızasının birebir aynısı: yüzeyde verilmiş bir karar
      // veride verilmemişti — burada tersiydi, veride verilmiş karar yüzeyde eziliyordu.
      shippable: false,
      // Yeni ürün DONUK doğar — migration `0005` künyesindeki gerekçe: unutulan alanın bedeli
      // güvenli tarafta kalmalı. Yanlış `ambient` işaretlenmiş donuk ürünün iadesi rafa döner.
      storageType: 'frozen',
      // ── YENİ ÜRÜN **ADAY** DOĞAR (kullanıcı kararı 11.08) ─────────────────
      // Varsayılan bir tur `active` idi ve iki yüzeyde birden yanlıştı. Ölçüm: asistan önerisinden
      // doğan iki ürün SATIŞTA doğdu, üstelik beyanları eksikti — oysa ekran "ADAY olarak doğar,
      // vitrinde görünmez" diye söz veriyordu. Elle oluşturmada da aynı: yeni bir ürün doğduğu anda
      // satılabilir olmamalı, çünkü fiyatı ve stoğu HENÜZ YOK ve beyanı çoğu zaman eksik.
      // Yayına almak ayrı bir karar ve o karar durum seçicisinden veriliyor.
      //
      // "Pasif" değil "Aday": pasif geri çekilmiş bir kaydın hâli (arşiv değil, gizlenmiş), aday
      // ise HENÜZ tamamlanmamış olanın. İkisi ayrı şey ve `catalog_health` adayları ayrı sayıyor.
      status: 'candidate',
      targetMarginPercent: null,
      autoPrice: false,
      ...DEFAULT_CROP_FIELDS,
      variants: [{ label: {}, netWeightG: null, piecesCount: null, portionKind: null, packedWeightG: null, packedLengthMm: null, packedWidthMm: null, packedHeightMm: null, minStockQty: null, sku: null, isActive: true }],
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
      netWeightG: v.netWeightG,
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
    shippable: values.shippable ?? false,
    storageType: values.storageType ?? 'frozen',
    status: values.status,
    targetMarginPercent: values.targetMarginPercent ?? null,
    autoPrice: values.autoPrice ?? false,
    ...pickCropFields(values),
    // KAYITLI satır (id'li) her zaman gider: listeden çıkmasının TEK yolu silme düğmesidir. Eskiden
    // ölçüt "etiketi boş olanı at"tı — etiketi silinen kayıtlı varyant sessizce silinirdi. Yeni satır
    // (id'siz) ise hiçbir alanı doldurulmamışsa atılır: "+ varyant"a basıp vazgeçmek boş satır bırakmaz.
    variants: values.variants
      .filter(
        (v) =>
          v.id ||
          resolveLocalizedText(v.label) ||
          v.sku?.trim() ||
          v.netWeightG != null ||
          v.piecesCount != null ||
          v.minStockQty != null ||
          // Ambalaj bölmesi de "dokunulmuş satır" sayılır: yalnız ölçü girip etiketi boş bırakan
          // operatörün satırı atılırsa girdiği sayı sessizce kaybolur.
          v.portionKind != null ||
          v.packedWeightG != null ||
          v.packedLengthMm != null,
      )
      .map((v) => ({
        id: v.id,
        label: cleanLocalized(v.label),
        netWeightG: v.netWeightG,
        piecesCount: v.piecesCount,
        portionKind: v.portionKind,
        packedWeightG: v.packedWeightG,
        packedLengthMm: v.packedLengthMm,
        packedWidthMm: v.packedWidthMm,
        packedHeightMm: v.packedHeightMm,
        minStockQty: v.minStockQty,
        sku: v.sku?.trim() || null,
        isActive: v.isActive,
      })),
  };
}
