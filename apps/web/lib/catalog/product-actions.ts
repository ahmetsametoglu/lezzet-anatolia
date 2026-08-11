'use server';

import { revalidatePath } from 'next/cache';
import { ProductService, ProductVariantService, serviceDb } from '@lezzet/database';
import { resolveLocalizedText, type LocalizedText, type ProductDetailsUpdate, type ProductVariantEntry } from '@lezzet/types';
import { requireStaff } from '@/lib/guard';
import { withProposal } from '@/lib/assistant/handoff';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { PRODUCTS_PATH } from './paths';

// Ürün YAZMA yolu — İKİ yüzeyin ortak eylemi (ürün ekranı 05.x · asistan kuyruğu 22.14).
//
// Server action'lar kural gereği sayfa klasöründe kolokasyon eder; bu eylem artık tek bir sayfaya
// ait olmadığı için `lib/`'e taşındı (`CLAUDE §2`: paylaşılan yardımcı lib'te). Aynı devir indirim
// ve teklif yazma yollarında da yaşanmıştı (`lib/prices/discount-actions`, `lib/stock/offer-actions`)
// — desen o.

/** Formun gönderdiği tam girdi: düzenlenebilir ürün alanları (şemadan türer) + varyant satırları. */
type ProductFormInput = ProductDetailsUpdate & { variants: ProductVariantEntry[] };

function requireName(name: LocalizedText | undefined): LocalizedText {
  if (!name || !resolveLocalizedText(name)) throw new Error('Ürün adı gerekli.');
  return name;
}

/**
 * Yeni ürün oluşturur (varyantlar verilirse onlarla, yoksa varsayılan varyant). Slug addan türetilir.
 *
 * Ürün sekmesinin klasöründen buraya taşındı (11.08 · 22.16): aynı form asistan kuyruğunda da
 * açılıyor ve `product_create` önerisi oradan uygulanıyor. Güncelleme eyleminin 22.14'te yaptığı
 * devrin aynısı — kuyruk bir sayfa klasöründen import etseydi bağımlılık yatay olurdu (`CLAUDE §2`).
 *
 * **Kayıt ADAY doğar ve bu değişmedi:** durumu formdaki seçici belirliyor, kuyrukta o seçici yok,
 * yani öneriden doğan ürün kapının kendi varsayılanıyla gelir. Satışa çıkarmak ürün ekranının kararı.
 */
export async function createProductAction(
  input: ProductFormInput,
  /** Asistan önerisinden gelindiyse o önerinin kimliği (22.16). */
  proposalId?: string | null,
): Promise<ActionResult> {
  try {
    const staff = await requireStaff();
    const { variants, ...fields } = input;
    const name = requireName(fields.name);

    await withProposal(
      proposalId,
      staff.profileId,
      () =>
        new ProductService(serviceDb()).create({
          ...fields,
          name,
          variants: variants.map((v) => ({
            label: v.label,
            netWeightG: v.netWeightG,
            piecesCount: v.piecesCount,
            minStockQty: v.minStockQty,
            sku: v.sku,
            isActive: v.isActive,
          })),
        }),
      // DOĞAN kaydın kimliği künyeye yazılır: "bu ürünü hangi öneri kurdu" sorusunun cevabı ve
      // arşivdeki köprünün dayanağı (`KIND_META.product_create.resultKey`).
      ({ product }) => ({ productId: product.id }),
    );

    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Mevcut ürünü günceller (temel + çok dilli + beyan + marj) ve varyantları senkronlar. Slug sabit.
 *
 * **Kuyruk ikinci bir yazma yolu AÇMIYOR:** asistan önerisi onaylandığında da bu eylem koşuyor,
 * `withProposal` yalnız kuyruk satırını kapatıyor. `proposalId` yoksa akış tek satır bile farklı
 * değil — ürün ekranının elle kullandığı yol hiç değişmedi.
 */
export async function updateProductAction(
  id: string,
  input: ProductFormInput,
  /** Asistan önerisinden gelindiyse o önerinin kimliği (22.14). */
  proposalId?: string | null,
): Promise<ActionResult> {
  try {
    const staff = await requireStaff();
    const db = serviceDb();
    const { variants, ...fields } = input;
    requireName(fields.name);

    await withProposal(
      proposalId,
      // PROFİL kimliği — `assistant_proposal.decided_by` `user_profiles`'a FK'li. Bir tur `staff.id`
      // (auth kimliği) geçiliyordu ve dev bypass'ta ikisi ayrı olduğu için ilk gerçek denemede FK
      // ihlaliyle patladı (`23503`, kullanıcı 11.08) — `lib/guard` künyesindeki nöbet tam bunun için
      // konmuştu. Öteki beş `withProposal` çağrısı zaten `profileId` geçiyordu.
      staff.profileId,
      async () => {
        await new ProductService(db).updateDetails(id, fields);
        await new ProductVariantService(db).syncVariants(id, variants);
      },
      // ── HANGİ ALANLARIN YAZILDIĞI KAYITTA DURUR ──────────────────────────
      // Operatör formda asistanın önerisini değiştirmiş olabilir; arşiv "öneri uygulandı" derken
      // neyin yazıldığını da söyleyebilmeli. Yalnız `productId` yazsaydık o soru cevapsız kalırdı.
      () => ({ productId: id, fields: Object.keys(fields).join(',') }),
    );

    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
