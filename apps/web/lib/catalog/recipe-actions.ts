'use server';

import { revalidatePath } from 'next/cache';
import { ProductService, RecipeService, serviceDb } from '@lezzet/database';
import { publicImageUrl } from '@lezzet/storage';
import { resolveLocalizedText } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { constraintMessage } from '@/lib/constraint-message';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { titleOf } from '@/lib/catalog/title';
import { OPERATIONS_LOCALE } from '@/components/operation/ui/labels';
import { RecipeFormSchema, type RecipeVariantOption } from '@/components/operation/form/recipe-form/schema';
import { withProposal } from '@/lib/assistant/handoff';

/**
 * Tarif yönetiminin yazma yolları (09.21).
 *
 * **Kural VERİDE, cümle burada:** yayın kapısı (üç dil dolmadan `is_active` olmaz) bir veritabanı
 * kısıtıdır; bu dosya onu yeniden uygulamaz, ihlali okunur bir cümleye çevirir. Kuralı iki yerde
 * yazmak, bir gün ayrışan iki kural demektir.
 */

/** Kısıt adı → insan cümlesi. Adı bilinmeyen hata olduğu gibi geçer. */
const CONSTRAINT_MESSAGE: Record<string, string> = {
  recipe_active_needs_all_locales:
    'Bu tarif yayına alınamaz: adı üç dilde de dolu olmalı. Eksik dilde müşteri adsız bir kart görürdü.',
  recipe_item_recipe_id_variant_id_key:
    'Aynı malzeme iki kez eklenmiş. Bir varyant tarifte tek satır olur — adet artırmak için "Adet" alanını kullanın.',
};

const readable = (error: unknown): string => constraintMessage(error, CONSTRAINT_MESSAGE);

/**
 * Tarifi ve malzemelerini TEK yazımda kaydeder.
 *
 * İkisi birlikte çünkü diyalog ikisini birlikte gönderiyor; ayrı çağrılar yarım bir ara hâl
 * bırakırdı (metin güncellendi, malzemeler eski). Slug ADDAN türer ve operatörden istenmez —
 * sormak, aynı tarifin iki kez farklı slug'la açılmasına kapı açardı (05.16 kararı).
 */
export async function saveRecipeAction(input: unknown, proposalId?: string): Promise<ActionResult<{ id: string }>> {
  try {
    const staff = await requireAdmin();
    const parsed = RecipeFormSchema.parse(input);
    const { id, items, ...fields } = parsed;

    const service = new RecipeService(serviceDb());
    // **Kuyruk ikinci bir yazma yolu AÇMIYOR** (22.18): asistanın tarif önerisi onaylandığında da
    // bu eylem koşuyor, `withProposal` yalnız kuyruk satırını kapatıyor. `proposalId` yoksa akış
    // tek satır bile farklı değil.
    const savedId = await withProposal(
      proposalId,
      staff.profileId,
      async () => {
        const saved = id ? await service.updateWithItems({ id, ...fields, items }) : await service.createWithItems({ ...fields, items });
        return saved.id;
      },
      // DOĞAN kaydın kimliği künyeye yazılır (`KIND_META.recipe_draft.resultKey`).
      (recipeId) => ({ recipeId }),
    );

    revalidatePath('/operations/recipes');
    return { data: { id: savedId }, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

/**
 * Yayına al / taslağa çek.
 *
 * Ayrı bir eylem çünkü ayrı bir KARAR: metni düzeltmek ile yayınlamak aynı an değil. Kaydetme
 * akışına gömülseydi, bir yazım hatasını düzeltmek tarifi istemeden yayından kaldırabilirdi.
 * Kısıt yine veritabanında — burası yalnız çağırır ve ihlali çevirir.
 */
export async function setRecipeActiveAction(id: string, isActive: boolean): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    // `items` VERİLMİYOR: servis sözleşmesi gereği o zaman kalemlere dokunulmuyor. Boş dizi
    // göndermek, yayınlama düğmesine basınca malzemeleri silmek olurdu.
    const saved = await new RecipeService(serviceDb()).updateWithItems({ id, isActive });
    revalidatePath('/operations/recipes');
    return { data: { id: saved.id }, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

// Silme eylemi YAZILMADI: ekranda silme düğmesi yok ve tüketicisi olmayan bir yazma kapısı, bir
// gün yanlışlıkla çağrılacak ölü koddur. Tarifi yayından çekmek zaten var (`setRecipeActiveAction`)
// ve operatörün gerçek ihtiyacı çoğunlukla o — silmek geri alınamaz.

/** Aramanın tavanı — eşleşen ürün sayısı; her ürün birkaç varyant açar. */
const VARIANT_SEARCH_LIMIT = 20;

/**
 * Malzeme seçicisinin kaynağı — **arama SUNUCUDA**, katalog forma indirilmez.
 *
 * Seçilen şey VARYANT, ürün değil (05.16): *"Ezine Beyaz Peynir" yetmez, "350 g" olan satır
 * sepete eklenebilen tek şeydir.* O yüzden her ürün varyantları kadar seçenek üretiyor.
 *
 * **Pasif varyant da GELİR:** tarif bugünün stoğunu değil, yemeğin tarifini anlatıyor. Süzseydik
 * geçici olarak satıştan kalkmış bir boy tarifin malzeme listesinden sessizce düşerdi. Satılamaz
 * olduğunu ekran zaten söylüyor (önizlemedeki "tükendi" rozeti).
 */
export async function searchRecipeVariantsAction(term: string): Promise<ActionResult<RecipeVariantOption[]>> {
  try {
    await requireAdmin();
    const query = term.trim();
    if (!query) return { data: [], error: null };

    const db = serviceDb();
    const service = new ProductService(db);
    const page = await service.listPriceRows({ filters: { query }, limit: VARIANT_SEARCH_LIMIT });
    const pool = await service.listPool(VARIANT_SEARCH_LIMIT, page.rows.map((row) => row.id));

    return {
      data: pool.flatMap((product) => {
        const name = resolveLocalizedText(product.name, OPERATIONS_LOCALE) || 'Adsız ürün';
        // Görsel ÜRÜNÜN (boyun değil) — malzeme satırı ve seçici listesi küçük resmi buradan alır.
        const imageUrl = publicImageUrl(product.imageKey, product.imageUpdatedAt);
        return product.variants.map((variant) => ({
          variantId: variant.id,
          label: titleOf(name, resolveLocalizedText(variant.label, OPERATIONS_LOCALE)),
          imageUrl,
        }));
      }),
      error: null,
    };
  } catch (error) {
    // Salt OKUMA — çarpabileceği bir kısıt yok, `readable` bağlanmıyor.
    return { data: null, error: getErrorMessage(error) };
  }
}
