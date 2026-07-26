'use server';

import { revalidatePath } from 'next/cache';
import { CategoryService, CollectionService, ProductService, ProductVariantService, serviceDb } from '@lezzet/database';
import { getR2, r2Keys } from '@lezzet/storage';
import { resolveLocalizedText, type LocalizedText, type ProductDetailsUpdate, type ProductVariantEntry } from '@lezzet/types';
import { requireStaff } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';

// Ürünler ekranı server action'ları (referans deseni: 'use server' + requireStaff + servise devret +
// {data,error} DÖNER, throw etmez + revalidatePath). Form alanları ProductDetailsUpdate'ten türer
// (no-duplication). AI çeviri arka ucu henüz bağlı değil (UI hazır, stub aşağıda).

// Formun gönderdiği tam girdi: düzenlenebilir ürün alanları (şemadan türer) + varyant satırları.
type ProductFormInput = ProductDetailsUpdate & { variants: ProductVariantEntry[] };

function requireName(name: LocalizedText | undefined): LocalizedText {
  if (!name || !resolveLocalizedText(name)) throw new Error('Ürün adı gerekli.');
  return name;
}

const PATH = '/operations/products';

/** Ürünü satışa aç/kapa. */
export async function setProductActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    await requireStaff();
    await new ProductService(serviceDb()).setActive(id, isActive);
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Mevcut ürünü günceller (Temel + çok dilli + alerjen + marj) ve varyantları senkronlar. Slug sabit. */
export async function updateProductAction(id: string, input: ProductFormInput): Promise<ActionResult> {
  try {
    await requireStaff();
    const db = serviceDb();
    const { variants, ...fields } = input;
    requireName(fields.name);
    await new ProductService(db).updateDetails(id, fields);
    await new ProductVariantService(db).syncVariants(id, variants);
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Yeni ürün oluşturur (varyantlar verilirse onlarla, yoksa varsayılan varyant). Slug addan türetilir. */
export async function createProductAction(input: ProductFormInput): Promise<ActionResult> {
  try {
    await requireStaff();
    const { variants, ...fields } = input;
    const name = requireName(fields.name);
    await new ProductService(serviceDb()).create({
      ...fields,
      name,
      variants: variants.map((v) => ({ label: v.label, netWeightG: v.netWeightG, sku: v.sku, isActive: v.isActive })),
    });
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Mobil hızlı düzeltme: yalnız TR adı günceller (mevcut FR/DE korunur). */
export async function updateProductNameAction(id: string, nameTr: string): Promise<ActionResult> {
  try {
    await requireStaff();
    const tr = nameTr.trim();
    if (!tr) throw new Error('Ürün adı gerekli.');
    const svc = new ProductService(serviceDb());
    const existing = await svc.getById(id);
    if (!existing) throw new Error('Ürün bulunamadı.');
    await svc.updateDetails(id, { name: { ...existing.name, tr } });
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Ürün görselini R2'ye yükler ve imageKey'i günceller. */
export async function uploadProductImageAction(id: string, form: FormData): Promise<ActionResult> {
  try {
    await requireStaff();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new Error('Görsel dosyası bulunamadı.');
    const r2 = getR2();
    if (!r2) throw new Error('Depolama (R2) ayarlı değil.');
    const svc = new ProductService(serviceDb());
    const product = await svc.getById(id);
    if (!product) throw new Error('Ürün bulunamadı.');
    const key = r2Keys.productImage(product.slug, file.name);
    await r2.uploadFile(key, Buffer.from(await file.arrayBuffer()), file.type || 'image/jpeg');
    await svc.setImageKey(id, key);
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Yeni kategori (slug servis türetir). */
export async function createCategoryAction(name: LocalizedText): Promise<ActionResult> {
  try {
    await requireStaff();
    if (!resolveLocalizedText(name)) throw new Error('Kategori adı gerekli.');
    await new CategoryService(serviceDb()).create({ name });
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Kategori sırasını sürükle-bırak sonucuna göre kalıcılaştırır (verilen id dizisi = yeni sıra). */
export async function reorderCategoriesAction(orderedIds: string[]): Promise<ActionResult> {
  try {
    await requireStaff();
    await new CategoryService(serviceDb()).reorder(orderedIds);
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Yeni koleksiyon (slug servis türetir). */
export async function createCollectionAction(name: LocalizedText): Promise<ActionResult> {
  try {
    await requireStaff();
    if (!resolveLocalizedText(name)) throw new Error('Koleksiyon adı gerekli.');
    await new CollectionService(serviceDb()).create({ name });
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * AI çeviri önerisi — TR metinden FR/DE önerir. UI hazır; arka uç (packages/ai) sonraki dilimde.
 * Bilinçli stub: throw eder (öneri akışı; mutasyon değil — FormLocalizedText try/catch ile gösterir).
 */
export async function suggestTranslationAction(_text: LocalizedText): Promise<LocalizedText> {
  await requireStaff();
  throw new Error('AI çeviri önerisi sonraki dilimde bağlanacak (packages/ai).');
}
