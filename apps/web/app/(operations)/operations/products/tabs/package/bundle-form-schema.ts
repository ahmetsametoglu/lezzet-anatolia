import { z } from 'zod';
import { bundleBalance } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import { amount } from '@/components/operation/ui/format';
import {
  BundleInsertSchema,
  BundleItemEntrySchema,
  DEFAULT_CROP_FIELDS,
  ImageCropFieldsSchema,
  pickCropFields,
  resolveLocalizedText,
  type BundleItemEntry,
  type LocalizedText,
} from '@lezzet/types';
import type { BundleView } from '../../products-types';

// Paket formu şeması — `BundleInsertSchema`'dan TÜRETİLİR (ürün formunun deseni). Formda olmayanlar
// çıkarılır: slug servis türetir, imageKey ayrı yükleme akışında, sortOrder kürasyon sırası (liste
// sürüklemesi), imageAlt boşsa müşteride paket adına düşer.
export const BundleFormSchema = BundleInsertSchema.omit({
  slug: true,
  imageKey: true,
  imageAlt: true,
  sortOrder: true,
  isActive: true,
})
  .extend({
    // Fiyat ZORUNLU: müşterinin gördüğü tek sayı, varsayılanı olamaz.
    totalPrice: z.number().nonnegative(),
    // Aktiflik formda METİN olarak taşınır (`MultiToggle` metin anahtarlarıyla çalışır) ve payload'da
    // boolean'a çevrilir — ürün formunun `vatRate`'te yaptığı daraltmanın aynısı. Alternatif, paylaşılan
    // komponente boolean kipi eklemekti; tek alan için ortak komponenti karmaşıklaştırmaya değmez.
    status: z.enum(['active', 'passive']),
    /**
     * **Vitrinde göster** (05.18) — `status`tan AYRI karar: biri satış, öteki ana sayfa seçkisi.
     * Formda DA duruyor (satırdaki hızlı anahtarın yanında), çünkü YENİ pakette satır henüz yok:
     * formda olmasaydı yeni bir paketi vitrine işaretlemenin hiçbir yolu olmazdı.
     */
    isFeatured: z.boolean(),
    items: z.array(BundleItemEntrySchema),
  })
  .merge(ImageCropFieldsSchema)
  .superRefine((v, ctx) => {
    // Kaydetmenin ÖN KOŞULLARI tek yerde: hem şema (submit'i durdurur) hem altlık (düğmeyi kilitler,
    // sebebi yazar) aynı fonksiyonu okur. İki yerde ayrı yazılsaydı biri "tutuyor" derken öbürü
    // reddeder ve operatör hangi cümleye inanacağını bilemezdi.
    const block = bundleBlock(v as BundleFormValues);
    if (block) ctx.addIssue({ code: 'custom', path: [block.path], message: block.message });
  });
export type BundleFormValues = z.infer<typeof BundleFormSchema>;

/** Kaydetmeyi engelleyen İLK sorun — alanı ve operatörün dilinden sebebi. Yoksa `null`. */
interface BundleBlock {
  path: 'name' | 'totalPrice' | 'items';
  message: string;
}

/**
 * Paket kaydedilebilir mi? Tek soru, tek cevap — şema bunu doğrulama olarak, altlık kilit sebebi
 * olarak kullanır. Mutabakat kararı yine motorda (`bundleBalance`); burada yalnız sıra ve dil var.
 */
export function bundleBlock(v: BundleFormValues): BundleBlock | null {
  if (!resolveLocalizedText(v.name)) return { path: 'name', message: 'Paket adı gerekli' };
  // Fiyat 0 geçerli bir paket değil: müşterinin gördüğü tek sayı o. Kalemsiz paketle aynı sırada
  // denetlenir ki yeni formda şerit "0 = 0, toplam tutar" diye yeşil yanmasın.
  if (v.totalPrice <= 0) return { path: 'totalPrice', message: 'Paket fiyatı girilmeli' };
  if (v.items.length === 0) return { path: 'items', message: 'Pakete en az bir kalem eklenmeli' };

  const balance = bundleBalance(
    v.items.map((i) => ({ qty: i.qty, allocatedUnitPriceCents: toCents(i.allocatedUnitPrice) })),
    toCents(v.totalPrice),
  );
  if (balance.balanced) return null;
  // Tutar biçimi TEK kaynaktan: elle `(x/100).toFixed(2).replace` yazmak, cent→euro dönüşümünü
  // ikinci kez tanımlamaktı (kardeş dosya aynı işi `fromCents` ile yapıyor).
  const gap = amount(Math.abs(balance.diffCents));
  return {
    path: 'items',
    message: `Paylar tutmuyor: ${gap} € ${balance.diffCents > 0 ? 'fazla' : 'eksik'} — şeritteki çareyi kullanın`,
  };
}

/** Boş dilleri atar (kaydederken temiz jsonb) — ürün formundaki aynı yardımcı. */
function cleanLocalized(t: LocalizedText): LocalizedText {
  const o: LocalizedText = {};
  if (t.tr?.trim()) o.tr = t.tr.trim();
  if (t.fr?.trim()) o.fr = t.fr.trim();
  if (t.de?.trim()) o.de = t.de.trim();
  return o;
}

/**
 * RHF varsayılanları — paket alanları liste satırından, KALEMLER dışarıdan (diyalog açılırken ayrı
 * okunuyor; liste satırı kalem taşımıyor).
 */
export function buildBundleDefaults(b: BundleView | null, items: BundleItemEntry[] = []): BundleFormValues {
  if (!b) {
    return {
      name: {},
      description: null,
      totalPrice: 0,
      serves: null,
      status: 'active',
      // Yeni paket vitrine KAPALI doğar: vitrin bir seçkidir, varsayılan olarak girilmez.
      isFeatured: false,
      ...DEFAULT_CROP_FIELDS,
      items: [],
    };
  }
  return {
    name: b.name,
    description: b.description,
    totalPrice: b.totalPrice,
    serves: b.serves,
    status: b.isActive ? 'active' : 'passive',
    isFeatured: b.isFeatured,
    ...pickCropFields(b),
    items,
  };
}

/** Form değerlerini action girdisine indirger. */
export function toBundlePayload(values: BundleFormValues) {
  return {
    name: cleanLocalized(values.name),
    description: values.description ? cleanLocalized(values.description) : null,
    totalPrice: values.totalPrice,
    serves: values.serves ?? null,
    isActive: values.status === 'active',
    isFeatured: values.isFeatured,
    ...pickCropFields(values),
    items: values.items.map((i) => ({
      id: i.id,
      variantId: i.variantId,
      qty: i.qty,
      allocatedUnitPrice: i.allocatedUnitPrice,
    })),
  };
}
