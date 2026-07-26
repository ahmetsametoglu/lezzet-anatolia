'use server';

import { revalidatePath } from 'next/cache';
import { ProductService, ProductVariantService, serviceDb } from '@lezzet/database';
import { getR2, r2Keys } from '@lezzet/storage';
import { resolveLocalizedText, type LocalizedText, type ProductDetailsUpdate, type ProductVariantEntry } from '@lezzet/types';
import { requireStaff } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { PRODUCTS_PATH } from '../../products-paths';

// Ürün sekmesi server action'ları (referans deseni: 'use server' + requireStaff + servise devret +
// {data,error} DÖNER, throw etmez + revalidatePath). Form alanları ProductDetailsUpdate'ten türer
// (no-duplication). Çok dilli çeviri önerisi sayfa seviyesindedir (actions/translate.ts).

// Formun gönderdiği tam girdi: düzenlenebilir ürün alanları (şemadan türer) + varyant satırları.
type ProductFormInput = ProductDetailsUpdate & { variants: ProductVariantEntry[] };

function requireName(name: LocalizedText | undefined): LocalizedText {
  if (!name || !resolveLocalizedText(name)) throw new Error('Ürün adı gerekli.');
  return name;
}

/** Ürünü satışa aç/kapa. */
export async function setProductActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    await requireStaff();
    await new ProductService(serviceDb()).setActive(id, isActive);
    revalidatePath(PRODUCTS_PATH);
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
    revalidatePath(PRODUCTS_PATH);
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
    revalidatePath(PRODUCTS_PATH);
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
    revalidatePath(PRODUCTS_PATH);
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
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
