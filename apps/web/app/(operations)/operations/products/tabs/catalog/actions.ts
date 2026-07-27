'use server';

import { revalidatePath } from 'next/cache';
import { CategoryService, CollectionService, serviceDb } from '@lezzet/database';
import { getR2, r2Keys } from '@lezzet/storage';
import { pickCropFieldsPartial, resolveLocalizedText, type ImageCropFields, type LocalizedText } from '@lezzet/types';
import { requireStaff } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { PRODUCTS_PATH } from '../../products-paths';
import type { CatalogKind } from '../../products-types';

// Katalog (kategori + koleksiyon) server action'ları. İkisi de aynı düz/sıralı desen (çok dilli ad ·
// slug · sortOrder · isActive) ve aynı servis API'si (create/edit/reorder) → ayrı action çiftleri
// yerine `kind` ile TEK eylem seti (no-duplication). UI de tek dialogda `kind` ile çatallanır.

const CATALOG_LABEL: Record<CatalogKind, string> = { category: 'Kategori', collection: 'Koleksiyon' };

function catalogService(kind: CatalogKind) {
  const db = serviceDb();
  return kind === 'category' ? new CategoryService(db) : new CollectionService(db);
}

function requireCatalogName(kind: CatalogKind, name: LocalizedText): LocalizedText {
  if (!resolveLocalizedText(name)) throw new Error(`${CATALOG_LABEL[kind]} adı gerekli.`);
  return name;
}

/**
 * Formun gönderdiği katalog girdisi. `description` / `slug` / `productIds` yalnız KOLEKSİYONDA
 * anlamlıdır (koleksiyon = paylaşılabilir vitrin sayfası + ürün listesi); kategoride yok sayılır.
 */
// Kapak (OG kartı) odak/zoom künyesi ortak ImageCropFields'ten gelir (Partial — yalnız koleksiyonda).
interface CatalogInput extends Partial<ImageCropFields> {
  name: LocalizedText;
  isActive: boolean;
  description?: LocalizedText | null;
  /** Paylaşım linki — yalnız OLUŞTURMADA; boşsa addan türetilir. */
  slug?: string;
  /** Üyelik; dizinin SIRASI vitrin sırasıdır (kürasyon). */
  productIds?: string[];
}

/** Yeni kategori/koleksiyon. Koleksiyon içeriğiyle (ve istenen slug'la) birlikte doğabilir. */
export async function createCatalogAction(kind: CatalogKind, input: CatalogInput): Promise<ActionResult> {
  try {
    await requireStaff();
    const db = serviceDb();
    const name = requireCatalogName(kind, input.name);
    if (kind === 'category') {
      await new CategoryService(db).create({ name, isActive: input.isActive });
    } else {
      await new CollectionService(db).create({
        name,
        description: input.description,
        slug: input.slug,
        isActive: input.isActive,
        productIds: input.productIds,
      });
    }
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Kategori/koleksiyonu düzenler. slug SABİT kalır (paylaşılmış link kırılmasın — bu yüzden `slug`
 * girdisi düzenlemede yok sayılır). Koleksiyonda tek kaydet = ad + açıklama + aktiflik + ÜYELİK/SIRA
 * (tek tur, tek revalidate).
 */
export async function updateCatalogAction(kind: CatalogKind, id: string, input: CatalogInput): Promise<ActionResult> {
  try {
    await requireStaff();
    const db = serviceDb();
    const name = requireCatalogName(kind, input.name);
    // Kırpma künyesi İKİ türde de var (kategori görseli + koleksiyon OG kapağı) → ortak seçiciyle
    // taşınır; alan adları burada yazılmaz (no-duplication).
    const crop = pickCropFieldsPartial(input);
    if (kind === 'category') {
      await new CategoryService(db).edit(id, { name, isActive: input.isActive, ...crop });
    } else {
      const svc = new CollectionService(db);
      await svc.edit(id, { name, description: input.description, isActive: input.isActive, ...crop });
      if (input.productIds) await svc.setProducts(id, input.productIds);
    }
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Katalog görselini R2'ye yükler ve imageKey'i günceller — kategori görseli (anasayfa şeridi) ve
 * koleksiyon kapağı (paylaşım/OG kartı) aynı akış: yalnız depo anahtarı deseni farklı → tek action
 * `kind` ile çatallanır (no-duplication). Dosya HAM saklanır; kırpma görüntüleme anında (odak+zoom).
 */
export async function uploadCatalogImageAction(kind: CatalogKind, id: string, form: FormData): Promise<ActionResult> {
  try {
    await requireStaff();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new Error('Görsel dosyası bulunamadı.');
    const r2 = getR2();
    if (!r2) throw new Error('Depolama (R2) ayarlı değil.');
    const svc = catalogService(kind);
    const row = await svc.getById(id);
    if (!row) throw new Error(`${CATALOG_LABEL[kind]} bulunamadı.`);
    const key = kind === 'category' ? r2Keys.categoryImage(row.slug, file.name) : r2Keys.collectionImage(row.slug, file.name);
    await r2.uploadFile(key, Buffer.from(await file.arrayBuffer()), file.type || 'image/jpeg');
    await svc.setImageKey(id, key);
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Sürükle-bırak sırasını kalıcılaştırır (verilen id dizisi = yeni sıra, sortOrder 0..n-1). */
export async function reorderCatalogAction(kind: CatalogKind, orderedIds: string[]): Promise<ActionResult> {
  try {
    await requireStaff();
    await catalogService(kind).reorder(orderedIds);
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
