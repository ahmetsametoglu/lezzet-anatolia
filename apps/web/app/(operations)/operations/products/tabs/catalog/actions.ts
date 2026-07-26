'use server';

import { revalidatePath } from 'next/cache';
import { CategoryService, CollectionService, serviceDb } from '@lezzet/database';
import { resolveLocalizedText, type LocalizedText } from '@lezzet/types';
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

/** Yeni kategori/koleksiyon (slug servis addan türetir). */
export async function createCatalogAction(kind: CatalogKind, name: LocalizedText): Promise<ActionResult> {
  try {
    await requireStaff();
    await catalogService(kind).create({ name: requireCatalogName(kind, name) });
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Kategori/koleksiyonu düzenler (çok dilli ad + aktiflik); slug SABİT kalır. `productIds` yalnız
 * KOLEKSİYONDA anlamlıdır (koleksiyon = ürün listesi, DOMAIN §13): verilirse üyelik ona eşitlenir.
 * Tek kaydet = ad + aktiflik + üyelik (tek tur, tek revalidate).
 */
export async function updateCatalogAction(
  kind: CatalogKind,
  id: string,
  input: { name: LocalizedText; isActive: boolean; productIds?: string[] },
): Promise<ActionResult> {
  try {
    await requireStaff();
    const db = serviceDb();
    const name = requireCatalogName(kind, input.name);
    if (kind === 'category') {
      await new CategoryService(db).edit(id, { name, isActive: input.isActive });
    } else {
      const svc = new CollectionService(db);
      await svc.edit(id, { name, isActive: input.isActive });
      if (input.productIds) await svc.setProducts(id, input.productIds);
    }
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
