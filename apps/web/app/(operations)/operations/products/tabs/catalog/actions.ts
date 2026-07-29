'use server';

import { revalidatePath } from 'next/cache';
import { CategoryService, CollectionService, ProductService, serviceDb } from '@lezzet/database';
import { getR2, publicImageUrl, r2Keys } from '@lezzet/storage';
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

/**
 * Koleksiyon üyeliği seçicisinin satırı — ad · görsel · kategori. Ürün view-model'inin TAMAMI
 * değil: seçici bir liste değil, daralt-ve-seç aracıdır.
 */
export interface CollectionProductOption {
  id: string;
  name: LocalizedText;
  imageUrl: string | null;
  categoryName: string;
}

/** Aramada kaç ürün döner — paket seçicisiyle aynı ölçü, aynı gerekçe. */
const MEMBER_SEARCH_LIMIT = 20;

/**
 * Üyelik seçicisinin kaynağı — **iki soru, tek okuma**.
 *
 * `ids` verilirse KİMLİKTEN çözer (formun açılışta üyelerini tanıması için), yoksa terimle arar.
 * İkisi ayrı yazılsaydı üye satırı ile arama satırı bir gün farklı görünürdü.
 *
 * **Neden gerekli:** form üyelerini eskiden ekranın YÜKLENMİŞ ürün listesinden çözüyordu — ilk
 * sayfa, üstelik o anki süzgeçten geçmiş 30 satır. Havuzda bulunmayan üye sessizce düşüyor,
 * sıralama kaydedildiğinde de listeden siliniyordu: 40 üyeli bir koleksiyonda tek bir sürükleme
 * kalan üyeleri koleksiyondan çıkarıyordu.
 */
async function collectionOptions(opts: { ids?: string[]; term?: string }): Promise<CollectionProductOption[]> {
  const db = serviceDb();
  const productSvc = new ProductService(db);

  const rows = opts.ids
    ? await productSvc.listByIds(opts.ids)
    : (await productSvc.list({ filters: { query: opts.term }, limit: MEMBER_SEARCH_LIMIT })).rows;
  if (rows.length === 0) return [];

  // Kategori doğal tavanı olan bir küme (operatörün elle kurduğu) — tek turda çekilir (CLAUDE.md §1).
  const categories = new Map((await new CategoryService(db).list()).map((c) => [c.id, resolveLocalizedText(c.name)]));

  const byId = new Map(rows.map((p) => [p.id, p]));
  // Kimlikten çözerken SIRA çağıranın verdiği sıradır: üyelik dizisi vitrin kürasyonudur.
  const ordered = opts.ids ? opts.ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])) : rows;

  return ordered.map((p) => ({
    id: p.id,
    name: p.name,
    imageUrl: publicImageUrl(p.imageKey, p.imageUpdatedAt),
    categoryName: p.categoryId ? (categories.get(p.categoryId) ?? '—') : '—',
  }));
}

/** Formun açılışta üyelerini tanıması — kimlikten, sırası korunarak. */
export async function loadCollectionMembersAction(ids: string[]): Promise<ActionResult<CollectionProductOption[]>> {
  try {
    await requireStaff();
    if (ids.length === 0) return { data: [], error: null };
    return { data: await collectionOptions({ ids }), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Ekleme menüsünün araması — **sunucuda**, katalog forma indirilmez. */
export async function searchCollectionProductsAction(term: string): Promise<ActionResult<CollectionProductOption[]>> {
  try {
    await requireStaff();
    const query = term.trim();
    if (!query) return { data: [], error: null };
    return { data: await collectionOptions({ term: query }), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
