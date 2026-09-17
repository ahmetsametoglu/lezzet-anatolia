'use server';

import { revalidatePath } from 'next/cache';
import { learnCode } from '@lezzet/application';
import { ProductService, ProductVariantService, serviceDb } from '@lezzet/database';
import { barcodeProblem, productPublishGaps } from '@lezzet/domain-core';
import {
  resolveLocalizedText,
  type LocalizedText,
  type NewVariantBarcode,
  type ProductDetailsUpdate,
  type ProductVariantEntry,
} from '@lezzet/types';
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
    'Ürün yayına alınamıyor: ad, açıklama, içindekiler ve saklama metni (aile üyesinde aile etiketi de) üç dilde de dolu olmalı.',
  product_publish_requires_allergens: 'Ürün yayına alınamıyor: alerjen beyanı girilmeli ("Alerjen içermez" de bir beyandır).',
  product_family_label_required: 'Aileye bağlı üründe aile etiketi zorunlu.',
};

// Ürün yazma yolu — ürün ekranı ile asistan kuyruğunun ortak eylemi; tek sayfaya ait olmadığı için `lib/`'te (CLAUDE §2).

/** Formun gönderdiği tam girdi: düzenlenebilir ürün alanları (şemadan türer) + varyant satırları (yazılacak kodlarıyla). */
type ProductFormInput = ProductDetailsUpdate & { variants: (ProductVariantEntry & { newBarcodes?: NewVariantBarcode[] })[] };

/**
 * Formda yazılan yeni kodların ÖN denetimi — sağlaması tutmayan kod yazmadan önce elenir.
 *
 * Kod okutulduğunda cihaz kendi doğrular; formda doğrulayan yoktur ve yanlış bir hane sessizce
 * kaydedilir: arıza ilk kez depoda, koli okutulup hiçbir şey olmayınca görünür (`gtinCheckDigit`).
 */
function barcodeProblems(variants: ProductFormInput['variants']): string | null {
  const problems = variants.flatMap((v) => (v.newBarcodes ?? []).flatMap((b) => barcodeProblem(b.code) ?? []));
  return problems.length > 0 ? problems.join(' · ') : null;
}

/**
 * Yazılan kodları varyantlara bağlar — satır SIRASIYLA eşleşir, çünkü yeni açılan boyun kimliği ancak
 * kaydedildikten sonra doğar. Kod başka bir boya bağlıysa `learnCode` onu söyler: ikinci kayıt açılmaz,
 * cümle operatöre döner (ürünün kendisi zaten kaydedilmiştir).
 */
async function bindNewBarcodes(
  db: ReturnType<typeof serviceDb>,
  rows: readonly { variantId: string; codes: readonly NewVariantBarcode[] }[],
  actorId: string | null,
): Promise<string | null> {
  const problems: string[] = [];
  for (const row of rows) {
    for (const code of row.codes) {
      const outcome = await learnCode(db, { ...code, variantId: row.variantId, actorId });
      if (outcome.status === 'already_bound') {
        problems.push(
          `"${code.code}" zaten «${outcome.productName} ${outcome.variantLabel}» boyuna bağlı — eşlemeyi oradan silmeden buraya yazılamaz.`,
        );
      }
    }
  }
  return problems.length > 0 ? problems.join(' · ') : null;
}

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
    const db = serviceDb();
    const { variants, ...fields } = input;
    const name = requireName(fields.name);

    // Yayın kapısı yazmadan önce: yeni üründe birleştirilecek kayıt yok, formda ne varsa ürün odur; kural yalnız `active`e bakar.
    if (fields.status === 'active') {
      const engel = publishGapMessage(productPublishGaps({ ...fields, name }));
      if (engel) return { data: null, error: engel };
    }
    const kodSorunu = barcodeProblems(variants);
    if (kodSorunu) return { data: null, error: kodSorunu };

    let acilanBoylar: { id: string }[] = [];
    await withProposal(
      proposalId,
      staff.profileId,
      async () => {
        const created = await new ProductService(db).create({
          ...fields,
          name,
          variants: variants.map((v) => ({
            label: v.label,
            netWeightG: v.netWeightG,
            piecesCount: v.piecesCount,
            // Porsiyon türü ve ambalaj ölçüsü BU KAPIDAN da geçer: formda girdisi var ve ambalaj
            // fotoğrafından da okunuyor, burada düşürülünce yeni ürün onları kaybediyordu.
            portionKind: v.portionKind,
            packedWeightG: v.packedWeightG,
            packedLengthMm: v.packedLengthMm,
            packedWidthMm: v.packedWidthMm,
            packedHeightMm: v.packedHeightMm,
            minStockQty: v.minStockQty,
            sku: v.sku,
            isActive: v.isActive,
          })),
        });
        acilanBoylar = created.variants;
        return created;
      },
      // DOĞAN kaydın kimliği künyeye yazılır: "bu ürünü hangi öneri kurdu" sorusunun cevabı ve
      // arşivdeki köprünün dayanağı (`KIND_META.product_create.resultKey`).
      ({ product }) => ({ productId: product.id }),
    );

    // Kod eşlemesi ürün YAZILDIKTAN sonra kurulur: yeni boyun kimliği ancak burada vardır.
    const kodHatasi = await bindNewBarcodes(
      db,
      acilanBoylar.map((v, i) => ({ variantId: v.id, codes: variants[i]?.newBarcodes ?? [] })),
      staff.profileId,
    );

    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: kodHatasi };
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
    const kodSorunu = barcodeProblems(variants);
    if (kodSorunu) return { data: null, error: kodSorunu };

    let yazilanBoylar: { id: string }[] = [];
    await withProposal(
      proposalId,
      // Profil kimliği: `assistant_proposal.decided_by` `user_profiles`'a bağlı, auth kimliği geçmek yabancı anahtar ihlali verir.
      staff.profileId,
      async () => {
        await new ProductService(db).updateDetails(id, fields);
        yazilanBoylar = await new ProductVariantService(db).syncVariants(id, variants);
      },
      // ── HANGİ ALANLARIN YAZILDIĞI KAYITTA DURUR ──────────────────────────
      // Operatör formda asistanın önerisini değiştirmiş olabilir; arşiv "öneri uygulandı" derken
      // neyin yazıldığını da söyleyebilmeli. Yalnız `productId` yazsaydık o soru cevapsız kalırdı.
      () => ({ productId: id, fields: Object.keys(fields).join(',') }),
    );

    // Kod eşlemesi satırlar yazıldıktan sonra: `syncVariants` girdi SIRASINI koruyarak döner, yeni
    // açılan boyun kimliği de buradan gelir.
    const kodHatasi = await bindNewBarcodes(
      db,
      yazilanBoylar.map((v, i) => ({ variantId: v.id, codes: variants[i]?.newBarcodes ?? [] })),
      staff.profileId,
    );

    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: kodHatasi };
  } catch (err) {
    return { data: null, error: constraintMessage(err, CONSTRAINT_MESSAGES) };
  }
}
