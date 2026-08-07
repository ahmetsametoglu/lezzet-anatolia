import { z } from 'zod';
import { ImageMetaInsertSchema, ImageMetaSchema } from './image.schema';
import { LocalizedTextDraftSchema, LocalizedTextSchema } from './localized-text.schema';

/**
 * TARİF — "Sofradan Fikirler" (05.16, `0038_recipe.sql`). Kullanıcı kararları 07.08.
 *
 * Tarif bir ürün DEĞİL, bir vitrindir: kendi ürünlerimizi bir yemeğin içinde gösterir ve sepete
 * kalem kalem ekletir. Fiyatı, stoğu, siparişi yoktur — kalemleri vardır.
 *
 * ── HESAPLANMAYAN ALAN TİP TAŞIMAZ ──────────────────────────────────────────
 * `duration` ve `serves` çok dilli METİNdir, sayı değil. İkisinde de hesap yok: kimse süreye göre
 * süzmüyor, sıralamıyor. Sayı tutulsaydı üç dile birim eki basan bir biçimlendirici gerekirdi
 * (`dk` · `min` · `Min.`) — hesabı olmayan bir alan için kod. `serves` ayrıca sayı OLAMAZ: tasarım
 * "3–4 kişilik" diyor, yani aralık. **Sayı kalan tek alan `qty`** (toplam = Σ qty × fiyat).
 *
 * ── ÜÇ DİL DOLMADAN YAYIN YOK, VE KURAL VERİDE ──────────────────────────────
 * Şema burada `LocalizedTextDraftSchema` kullanır (her dil opsiyonel) çünkü **taslak tek dille
 * açılır**; yayın kısıtı DB'dedir (`recipe_publish_requires_all_locales`). Zod'a "üç dil de dolu"
 * yazsaydık taslak hiç kaydedilemezdi — kural yayına aittir, satıra değil.
 */

export const RecipeSchema = z
  .object({
    id: z.string().uuid(),
    /** Dil-bağımsız; dış URL'in dil farkı `routing.ts` segment sözlüğünden gelir (`SEO_I18N`). */
    slug: z.string(),
    name: LocalizedTextSchema,
    description: LocalizedTextDraftSchema.nullable(),
    /** "35 dk" — serbest metin, hesap yok. */
    duration: LocalizedTextDraftSchema.nullable(),
    /** "3–4 kişilik" — ARALIK olabildiği için sayı değil. */
    serves: LocalizedTextDraftSchema.nullable(),
    /** "Akşam yemeği" — öğün künyesi. */
    meal: LocalizedTextDraftSchema.nullable(),
    /** Hazırlanış: düz metin, **satır = adım**. Adım numarasını EKRAN verir. */
    steps: LocalizedTextDraftSchema.nullable(),
    /** Evde olması gerekenler: düz metin, **satır = madde**. Bunlar bizim ürünümüz DEĞİL. */
    pantry: LocalizedTextDraftSchema.nullable(),
    /** Yayında mı. Taslak olarak doğar (`false`) — üç dil dolmadan `true` yapılamaz (DB kısıtı). */
    isActive: z.boolean(),
    /** Editoryal seçki sırası — müşteri sıralamaz. */
    sortOrder: z.number().int(),
    createdAt: z.string(),
  })
  .merge(ImageMetaSchema);
export type Recipe = z.infer<typeof RecipeSchema>;

export const RecipeInsertSchema = z
  .object({
    slug: z.string(),
    name: LocalizedTextSchema,
    description: LocalizedTextDraftSchema.nullish(),
    duration: LocalizedTextDraftSchema.nullish(),
    serves: LocalizedTextDraftSchema.nullish(),
    meal: LocalizedTextDraftSchema.nullish(),
    steps: LocalizedTextDraftSchema.nullish(),
    pantry: LocalizedTextDraftSchema.nullish(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .merge(ImageMetaInsertSchema);
export type RecipeInsert = z.infer<typeof RecipeInsertSchema>;

export const RecipeUpdateSchema = RecipeSchema.partial().required({ id: true });
export type RecipeUpdate = z.infer<typeof RecipeUpdateSchema>;

/**
 * Tarifin ÜRÜN malzemesi — bağ VARYANTA kurulur, ürüne değil.
 *
 * Sepet yalnız varyantla çalışır; `product_id` de tutmak bir gün ayrışan İKİ gerçek demekti
 * (`CLAUDE §1`) — ürün varyanttan zaten türüyor. Aynı varyant bir tarifte iki kez yazılamaz
 * (DB'de unique): iki satır toplamı iki kez sayar ve ekranda malzeme alt alta iki kez görünürdü;
 * adet artırmak için `qty` var.
 *
 * **Ev malzemesi (tuz, su) burada DEĞİL** — o `recipe.pantry` metnidir, satılmayan bir şeye satır
 * açmak onu sepete eklenebilirmiş gibi gösterirdi.
 */
export const RecipeItemSchema = z.object({
  id: z.string().uuid(),
  recipeId: z.string().uuid(),
  variantId: z.string().uuid(),
  qty: z.number().int().positive(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
});
export type RecipeItem = z.infer<typeof RecipeItemSchema>;

export const RecipeItemInsertSchema = RecipeItemSchema.omit({ id: true, createdAt: true }).extend({
  sortOrder: z.number().int().optional(),
});
export type RecipeItemInsert = z.infer<typeof RecipeItemInsertSchema>;

export const RecipeItemUpdateSchema = RecipeItemSchema.partial().required({ id: true });
export type RecipeItemUpdate = z.infer<typeof RecipeItemUpdateSchema>;

/**
 * Formdan gelen kalem satırı — `id` varsa mevcut satır, yoksa yeni. `sortOrder` liste sırasından
 * yazılır, formda alan olarak durmaz (emsal `BundleItemEntry`).
 */
export const RecipeItemEntrySchema = RecipeItemInsertSchema.omit({ recipeId: true, sortOrder: true }).extend({
  id: z.string().uuid().optional(),
});
export type RecipeItemEntry = z.infer<typeof RecipeItemEntrySchema>;

/** Tarif + kalemleri TEK sorguda (gömülü select; N+1 yok). Şema `RecipeSchema`'yı TÜRETİR. */
export const RecipeWithItemsSchema = RecipeSchema.extend({ items: z.array(RecipeItemSchema) });
export type RecipeWithItems = z.infer<typeof RecipeWithItemsSchema>;
