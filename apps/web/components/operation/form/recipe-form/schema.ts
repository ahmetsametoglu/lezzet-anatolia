import { z } from 'zod';
import { LocalizedTextDraftSchema, RecipeInsertSchema, RecipeItemEntrySchema } from '@lezzet/types';

/*
  TARİF FORMUNUN ŞEMASI VE GİRDİ TİPLERİ (22.18) — `recipes-types.ts`ten TAŞINDI, kopyalanmadı.

  Form ortak alana çıktı (asistan kuyruğu da aynı formu kendi içinde açıyor) ve bir komponentin
  sayfa klasöründen şema okuması ters yönlü bağımlılıktır (`docs:check §3e`). Sayfa bunları
  `recipes-types`ten yeniden ihraç ederek okuyor: tanım tek, sayfa kodu değişmedi.
*/

/**
 * Formun şeması — **paket şemasından TÜRETİLİR** (`CLAUDE §1`), alanlar elle yazılmaz.
 *
 * `slug` DIŞARIDA: addan türetiliyor ve operatörden istenmiyor (05.16 kararı — sormak, aynı tarifin
 * iki kez farklı slug'la açılmasına kapı açardı). `isActive` de dışarıda: yayın ayrı bir KARAR ve
 * ayrı bir eylemi var (`setRecipeActiveAction`); kaydetme akışına gömülseydi bir yazım hatasını
 * düzeltmek tarifi istemeden yayından kaldırabilirdi.
 */
export const RecipeFormSchema = RecipeInsertSchema.omit({ slug: true, isActive: true }).extend({
  /** Doluysa güncelleme, boşsa oluşturma. */
  id: z.string().uuid().optional(),
  items: z.array(RecipeItemEntrySchema),
  /**
   * İsteğe bağlı metinler formda `null` OLMAZ, boş nesne olur.
   *
   * Paket şeması `.nullish()` diyor (veritabanında alan gerçekten boş olabilir) ama form alanı üç
   * dilin kutusudur ve o kutu hep vardır — `null` geçirmek, alanın "yok" ile "boş" hâlini aynı
   * yapar ve kontrol her açılışta tipini sorgulamak zorunda kalırdı.
   *
   * `.default({})` KULLANILMIYOR: zod'un varsayılanı giriş tipini isteğe bağlı, çıkış tipini
   * zorunlu yapıyor ve RHF çözücüsü ikisini bağdaştıramıyor. Boş nesneyi form `defaultValues` ile
   * veriyor — varsayılanın yeri zaten orası.
   */
  description: LocalizedTextDraftSchema,
  duration: LocalizedTextDraftSchema,
  serves: LocalizedTextDraftSchema,
  meal: LocalizedTextDraftSchema,
  steps: LocalizedTextDraftSchema,
  pantry: LocalizedTextDraftSchema,
});
export type RecipeFormValues = z.infer<typeof RecipeFormSchema>;

/** Malzeme seçicisinin satırı — seçilen şey VARYANT, ürün değil (05.16). */
export interface RecipeVariantOption {
  variantId: string;
  /** "Ezine Beyaz Peynir · 350 g" — `titleOf` ile kurulur, ekran ikinci kez kurmaz. */
  label: string;
}

/** Boş form — yeni tarif ve asistan taslağının ortak tabanı. */
export function buildRecipeDefaults(): RecipeFormValues {
  return { name: {}, description: {}, duration: {}, serves: {}, meal: {}, steps: {}, pantry: {}, items: [] };
}

/**
 * Kaydetmenin engeli ve SEBEBİ — iki yüzey aynı emniyeti paylaşsın (`bundleBlock` deseni).
 *
 * Ad boşken submit tarayıcıda sessizce yutuluyordu ve operatör düğmeye basıp hiçbir şey olmadığını
 * görüyordu. Ölü tıklama, hatayı hiç göstermemekten kötüdür.
 */
export function recipeBlock(values: RecipeFormValues): string | null {
  const filled = values.name && Object.values(values.name).some((v) => v?.trim());
  return filled ? null : 'Tarif adı gerekli';
}
