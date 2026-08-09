import { z } from 'zod';
import { ImageMetaInsertSchema, ImageMetaSchema } from '../primitives/image.schema';

/**
 * SAYFA GÖRSELİ (`site_image`, 09.16 · `0043_site_image.sql`).
 *
 * Kardeşlerinden (ürün · kategori · koleksiyon · paket · tarif) tek farkı sahibi: onlarınki bir
 * VARLIĞA aittir ve varlık silinince anlamsızlaşır, bunlar bir **SAYFA YERİNE** aittir. "Boş
 * sepet çizimi"nin karşılık geldiği bir satır yoktur ve olmayacaktır.
 *
 * **Boş slot = satır YOK.** `imageKey` burada nullable DEĞİL (kardeşlerinde nullable): satırın
 * kendisi görseldir, anahtarsız satır ekranı "dolu" sanmaya iter ve boş çerçeve çizdirir.
 */

/**
 * Slot kümesi KAPALI — yeni slot ancak onu çizen ekran doğunca eklenir (enum, migration gerektirir).
 * Serbest metin, ekranda karşılığı olmayan bir görselin yüklenmesine izin verirdi.
 */
export const SITE_IMAGE_SLOTS = ['home_hero', 'packages_hero', 'professionals_hero', 'empty_cart'] as const;
export const SiteImageSlotSchema = z.enum(SITE_IMAGE_SLOTS);
export type SiteImageSlot = z.infer<typeof SiteImageSlotSchema>;

export const SiteImageSchema = z
  .object({
    id: z.string().uuid(),
    slot: SiteImageSlotSchema,
  })
  .merge(ImageMetaSchema)
  // Künye ortak bloktan gelir (no-duplication); yalnız anahtarın zorunluluğu daraltılır.
  .extend({ imageKey: z.string() });
export type SiteImage = z.infer<typeof SiteImageSchema>;

export const SiteImageInsertSchema = z
  .object({
    slot: SiteImageSlotSchema,
    imageKey: z.string(),
  })
  .merge(ImageMetaInsertSchema.omit({ imageKey: true }));
export type SiteImageInsert = z.infer<typeof SiteImageInsertSchema>;

export const SiteImageUpdateSchema = SiteImageSchema.partial().required({ id: true });
export type SiteImageUpdate = z.infer<typeof SiteImageUpdateSchema>;
