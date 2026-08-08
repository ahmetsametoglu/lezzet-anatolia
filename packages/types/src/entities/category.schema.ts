import { z } from 'zod';
import { LocalizedTextSchema } from '../primitives/localized-text.schema';
import { ImageMetaInsertSchema, ImageMetaSchema } from '../primitives/image.schema';

// Category — düz (tek seviye), her ürün tek kategoride (DATA_MODEL, DOMAIN §13). 0004 migration.
// Konvansiyon: app modeli camelCase; Schema / InsertSchema / UpdateSchema türetilir.
export const CategorySchema = z
  .object({
    id: z.string().uuid(),
    name: LocalizedTextSchema,
    /**
     * Kısa tanıtım — vitrin bandının ALTYAZISI (05.17). Başlık değil: başlık kategori adıdır.
     *
     * Boş bırakılabilir ve öyle kalmalı — altyazısız kategori altyazısız çizilir, yedek metin
     * UYDURULMAZ (ada düşmek "Börekler / Börekler" gibi bir tekrar üretirdi).
     */
    tagline: LocalizedTextSchema.nullable(),
    slug: z.string(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    /**
     * **Ana sayfada göster** (05.18). `isActive` ile karıştırılmaz: aktiflik "yayında mı", bu
     * "vitrinde mi". İşaret SEÇİMDİR — sıra `sortOrder`'dan gelir, ikinci bir vitrin sırası
     * tutulmaz (iki sıra bir gün çelişir ve hangisinin kazandığı ekrandan anlaşılmaz).
     */
    isFeatured: z.boolean(),
    createdAt: z.string(),
  })
  .merge(ImageMetaSchema); // görsel künyesi (anahtar + odak + zoom + alt) ortak şemadan
export type Category = z.infer<typeof CategorySchema>;

// id/createdAt DB üretir; sort_order/is_active DB default'lu → opsiyonel. slug servis türetir.
export const CategoryInsertSchema = z
  .object({
    name: LocalizedTextSchema,
    tagline: LocalizedTextSchema.nullish(),
    slug: z.string(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
  })
  .merge(ImageMetaInsertSchema);
export type CategoryInsert = z.infer<typeof CategoryInsertSchema>;

// Update: id zorunlu, kalanı opsiyonel (yalnız verilen alanlar yazılır). slug rename'de sabit kalır.
export const CategoryUpdateSchema = CategorySchema.partial().required({ id: true });
export type CategoryUpdate = z.infer<typeof CategoryUpdateSchema>;
