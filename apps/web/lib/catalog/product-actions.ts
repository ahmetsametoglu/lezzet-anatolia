'use server';

import { revalidatePath } from 'next/cache';
import { ProductService, ProductVariantService, serviceDb } from '@lezzet/database';
import { productPublishGaps } from '@lezzet/domain-core';
import { resolveLocalizedText, type LocalizedText, type ProductDetailsUpdate, type ProductVariantEntry } from '@lezzet/types';
import { requireStaff } from '@/lib/guard';
import { withProposal } from '@/lib/assistant/handoff';
import { constraintMessage } from '@/lib/constraint-message';
import type { ActionResult } from '@/lib/error';
import { publishGapMessage } from './publish-labels';
import { PRODUCTS_PATH } from './paths';

/**
 * Kısıt ihlalinin operatör cümlesi — ikinci savunma hattı; ilk hat `productPublishGaps` yazmadan önce sorar.
 * Kısıt alan adını söyleyemez, cümle en azından neyin eksik olduğunu ve nereye bakılacağını anlatır.
 */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  product_publish_requires_all_locales:
    'Ürün yayına alınamıyor: ad, açıklama, içindekiler ve saklama metni (görsel/aile varsa alt metin ve aile etiketi) üç dilde de dolu olmalı.',
  product_family_label_required: 'Aileye bağlı üründe aile etiketi zorunlu.',
};

// Ürün yazma yolu — ürün ekranı ile asistan kuyruğunun ortak eylemi; tek sayfaya ait olmadığı için `lib/`'te (CLAUDE §2).

/** Formun gönderdiği tam girdi: düzenlenebilir ürün alanları (şemadan türer) + varyant satırları. */
type ProductFormInput = ProductDetailsUpdate & { variants: ProductVariantEntry[] };

function requireName(name: LocalizedText | undefined): LocalizedText {
  if (!name || !resolveLocalizedText(name)) throw new Error('Ürün adı gerekli.');
  return name;
}

/**
 * Yeni ürün oluşturur (varyant verilmezse varsayılan varyantla); slug addan türetilir.
 * Durumu formdaki seçici belirler; kuyrukta seçici olmadığı için öneriden doğan ürün kapının varsayılanıyla aday doğar.
 */
export async function createProductAction(
  input: ProductFormInput,
  /** Asistan önerisinden gelindiyse o önerinin kimliği. */
  proposalId?: string | null,
): Promise<ActionResult> {
  try {
    const staff = await requireStaff();
    const { variants, ...fields } = input;
    const name = requireName(fields.name);

    // Yayın kapısı yazmadan önce: yeni üründe birleştirilecek kayıt yok, formda ne varsa ürün odur; kural yalnız `active`e bakar.
    if (fields.status === 'active') {
      const engel = publishGapMessage(productPublishGaps({ ...fields, name }));
      if (engel) return { data: null, error: engel };
    }

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
    return { data: null, error: constraintMessage(err, CONSTRAINT_MESSAGES) };
  }
}

/**
 * Mevcut ürünü günceller ve varyantları eşitler; slug sabit.
 * Asistan önerisi onaylandığında da bu eylem koşar, `withProposal` yalnız kuyruk satırını kapatır — ikinci bir yazma yolu yoktur.
 */
export async function updateProductAction(
  id: string,
  input: ProductFormInput,
  /** Asistan önerisinden gelindiyse o önerinin kimliği. */
  proposalId?: string | null,
): Promise<ActionResult> {
  try {
    const staff = await requireStaff();
    const db = serviceDb();
    const { variants, ...fields } = input;
    requireName(fields.name);

    // Yayın kapısı mevcut kayıtla birleştirilerek sorulur: form kısmi gönderebilir, kısıt ise satırın yazım sonrası hâline bakar.
    if (fields.status === 'active') {
      const mevcut = await new ProductService(db).getById(id);
      const engel = publishGapMessage(productPublishGaps({ ...mevcut, ...fields }));
      if (engel) return { data: null, error: engel };
    }

    await withProposal(
      proposalId,
      // Profil kimliği: `assistant_proposal.decided_by` `user_profiles`'a bağlı, auth kimliği geçmek yabancı anahtar ihlali verir.
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
    return { data: null, error: constraintMessage(err, CONSTRAINT_MESSAGES) };
  }
}
