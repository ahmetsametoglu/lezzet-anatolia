import { z } from 'zod';
import { dbNumeric, dbNumericNullable } from '../primitives/db-numeric';
import { ImageMetaInsertSchema, ImageMetaSchema } from '../primitives/image.schema';
import { LocalizedTextDraftSchema, LocalizedTextSchema } from '../primitives/localized-text.schema';

// Paket (bundle) — birden çok ürünü TEK fiyata sunan katalog kısayolu. 0005 migration, DOMAIN §13.
// Yeni ürün YARATMAZ: sepete eklenince her kalem ayrı `order_item` olur.
//
// Paket YALNIZ B2C'dedir → `totalPrice` tek sayı ve **TTC**. Kanal listesi/özel fiyat/`price` satırı
// yoktur. Paketin kendi KDV'si de yoktur: fatura her kalemin KDV'sini kendi ürününden alır.

export const BundleSchema = z
  .object({
    id: z.string().uuid(),
    name: LocalizedTextSchema,
    description: LocalizedTextDraftSchema.nullable(),
    slug: z.string(),
    /** Müşterinin gördüğü TEK fiyat (TTC). Kalemlerin atanmış fiyat toplamına EŞİT olmak zorunda. */
    totalPrice: dbNumeric,
    /** "6 kişilik" — tasarımda ad üstü künye; boşsa künye satırı hiç basılmaz. */
    serves: z.number().int().positive().nullable(),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
    /** **Ana sayfada göster** (05.18) — işaret seçim, sıra `sortOrder`'dan. `isActive` "satışta mı", bu "vitrinde mi". */
    isFeatured: z.boolean(),
    createdAt: z.string(),
  })
  .merge(ImageMetaSchema); // görsel künyesi ortak şemadan (3:2 kaynak + odak + alt metin)
export type Bundle = z.infer<typeof BundleSchema>;

export const BundleInsertSchema = z
  .object({
    name: LocalizedTextSchema,
    slug: z.string(),
    description: LocalizedTextDraftSchema.nullish(),
    totalPrice: z.number().nonnegative(),
    serves: z.number().int().positive().nullish(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    isFeatured: z.boolean().optional(),
  })
  .merge(ImageMetaInsertSchema);
export type BundleInsert = z.infer<typeof BundleInsertSchema>;

export const BundleUpdateSchema = BundleSchema.partial().required({ id: true });
export type BundleUpdate = z.infer<typeof BundleUpdateSchema>;

/**
 * Paket kalemi. `allocatedUnitPrice` MÜŞTERİYE GÖRÜNMEZ — iç muhasebe aracıdır: faturada her kalemin
 * KDV'si kendi ürününün oranından işlensin diye gerekli (baklava %5,5, malzeme %20). **0 = hediye**;
 * ayrı bir "hediye" işareti yoktur, fiyatın kendisi söyler.
 */
export const BundleItemSchema = z.object({
  id: z.string().uuid(),
  bundleId: z.string().uuid(),
  variantId: z.string().uuid(),
  qty: z.number().int().positive(),
  allocatedUnitPrice: dbNumeric,
  sortOrder: z.number().int(),
  createdAt: z.string(),
});
export type BundleItem = z.infer<typeof BundleItemSchema>;

export const BundleItemInsertSchema = z.object({
  bundleId: z.string().uuid(),
  variantId: z.string().uuid(),
  qty: z.number().int().positive(),
  allocatedUnitPrice: z.number().nonnegative(),
  sortOrder: z.number().int().optional(),
});
export type BundleItemInsert = z.infer<typeof BundleItemInsertSchema>;

export const BundleItemUpdateSchema = BundleItemSchema.partial().required({ id: true });
export type BundleItemUpdate = z.infer<typeof BundleItemUpdateSchema>;

/**
 * Formun gönderdiği kalem satırı — `id` varsa güncelle, yoksa ekle (varyant editörünün deseni).
 * `bundleId` ve `sortOrder` servis tarafından yönetilir; sıra satırın dizideki KONUMUDUR.
 *
 * OKUMA şemasından (`BundleItemSchema`) değil INSERT şemasından türer: okuma tarafı `dbNumeric` ile
 * string'i de kabul eder (PG numeric string dönebilir), ama form YAZAR — girdi tipinde `string|number`
 * kabul etmek RHF'in girdi/çıktı tiplerini ayrıştırıyor ve resolver tipi tutmuyor.
 */
export const BundleItemEntrySchema = BundleItemInsertSchema.omit({ bundleId: true, sortOrder: true }).extend({
  id: z.string().uuid().optional(),
});
export type BundleItemEntry = z.infer<typeof BundleItemEntrySchema>;

/** Paket + kalemleri TEK sorguda (gömülü select; N+1 yok). Şema BundleSchema'yı TÜRETİR. */
export const BundleWithItemsSchema = BundleSchema.extend({ items: z.array(BundleItemSchema) });
export type BundleWithItems = z.infer<typeof BundleWithItemsSchema>;

/**
 * Paket LİSTESİ satırı — `bundle_list_rows()` okuma fonksiyonunun çıktısı (STACK §13).
 *
 * Liste kalemleri TAŞIMAZ, kalemlerden türeyen ÖZETİ taşır: sayılar veritabanında toplanır, uygulama
 * yalnız kararı verir (mutabakat ve marj motorun işi — burada ham toplamlar var). Kalemlerin kendisi
 * ancak paket DİYALOGU açılınca okunur; liste için katalogun fiyatlarını ve parti satırlarını taşımak
 * gerekmiyor.
 *
 * `listTotal`/`costTotal` EKSİK olabilir: fiyatı ya da maliyeti girilmemiş kalem varsa toplam yarımdır
 * ve o hâlde sayı gösterilmez — `missing*Count` bunu söyler (yarım toplamı tam sanmak, yanlış marj).
 */
export const BundleListRowSchema = BundleSchema.extend({
  itemCount: z.number().int(),
  /** Kalemlerin varyant kimlikleri — ürün formundaki "bu ürün N pakette kullanılıyor" bağı. */
  variantIds: z.array(z.string().uuid()),
  /** Kalem adları ham hâlde: dil çözümü (TR→FR→DE) uygulamada, tek yerde. */
  itemNames: z.array(z.object({ p: LocalizedTextSchema, v: LocalizedTextSchema.nullable() })),
  allocatedTotal: dbNumeric,
  listTotal: dbNumericNullable,
  missingPriceCount: z.number().int(),
  costTotal: dbNumericNullable,
  missingCostCount: z.number().int(),
  /** KDV hariç satış — kalem kalem indirildi (paketin tek KDV oranı yoktur). */
  revenueHt: dbNumeric,
  /** Ürünü/boyu satışta olmayan kalem sayısı — paket vitrine çıkamaz demektir. */
  blockedItemCount: z.number().int(),
});
export type BundleListRow = z.infer<typeof BundleListRowSchema>;

// Paket formunun yazdığı alanlar — id/slug/createdAt/sortOrder hariç. Slug addan türer (servis).
export const BundleDetailsUpdateSchema = BundleSchema.pick({
  name: true,
  description: true,
  imageFocalX: true,
  imageFocalY: true,
  imageZoom: true,
  imageAlt: true,
  totalPrice: true,
  serves: true,
  isActive: true,
}).partial();
export type BundleDetailsUpdate = z.infer<typeof BundleDetailsUpdateSchema>;
