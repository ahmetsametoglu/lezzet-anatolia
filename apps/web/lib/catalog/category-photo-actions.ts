'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { CategoryImageService, CategoryService, serviceDb } from '@lezzet/database';
import { getR2, publicImageUrl, r2Keys } from '@lezzet/storage';
import { pickCropFields, CATEGORY_GALLERY_MAX, type CategoryImage, type ImageCropFields } from '@lezzet/types';
import { requireStaff } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { PRODUCTS_PATH } from './paths';
import type { GalleryPhotoView } from '@/components/operation/form/image-gallery-types';

// Kategori FOTOĞRAF HAVUZU yazma yolları (05.23) — ürün galerisinin (`product-photo-actions.ts`)
// birebir kardeşi. Kapak yükleme burada DEĞİL: o zaten `products/tabs/catalog/actions.ts`in
// `uploadCatalogImageAction`ında ve kategori ile koleksiyon için ortak.
//
// Havuz CANLI yönetilir: yükleme, silme, sıra ve kırpma anında yazılır — formun "kaydet"ine bağlı
// değildir. Sebep ürününkiyle aynı: dosyanın kendisi zaten anında R2'ye gidiyor (önizleme için
// şart); yarısı anında yarısı kaydedince uygulanan bir panel, "Vazgeç"in neyi geri aldığını
// belirsizleştirirdi. Kapağın odak/zoom'u bunun DIŞINDA — o kategori satırının alanı, formla
// birlikte kaydedilir (§0B).
//
// Kategori ekranı ürün ekranının bir sekmesi olduğu için tazelenen yol da orası (`PRODUCTS_PATH`).

// Havuz satırını client'ın gördüğü şekle indirger — okuma URL'i public bucket'tan saf birleştirmeyle
// kurulur (05.11), sürüm damgası satırın kendi `imageUpdatedAt`'inden gelir.
const toPhotoView = (row: CategoryImage): GalleryPhotoView => ({
  ...row,
  imageUrl: publicImageUrl(row.imageKey, row.imageUpdatedAt),
});

/** Bir kategorinin havuzu, rotasyonun döngü sırasında + okuma URL'leri. */
export async function listCategoryPhotosAction(categoryId: string): Promise<ActionResult<GalleryPhotoView[]>> {
  try {
    await requireStaff();
    const rows = await new CategoryImageService(serviceDb()).listByCategory(categoryId);
    return { data: rows.map(toPhotoView), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Havuza fotoğraf ekler (sona). Üst sınır aşılırsa reddedilir — sessizce yutulmaz. */
export async function uploadCategoryPhotoAction(categoryId: string, form: FormData): Promise<ActionResult<GalleryPhotoView>> {
  try {
    await requireStaff();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new Error('Görsel dosyası bulunamadı.');
    const r2 = getR2();
    if (!r2) throw new Error('Depolama (R2) ayarlı değil.');

    const db = serviceDb();
    const category = await new CategoryService(db).getById(categoryId);
    if (!category) throw new Error('Kategori bulunamadı.');

    const svc = new CategoryImageService(db);
    const current = await svc.listByCategory(categoryId);
    if (current.length >= CATEGORY_GALLERY_MAX) {
      throw new Error(`En çok ${CATEGORY_GALLERY_MAX} fotoğraf eklenebilir.`);
    }

    // Anahtar fotoğrafa özgü: kategori başına çok dosya var, slug tek başına ayırt etmez.
    const key = r2Keys.categoryGalleryImage(category.slug, randomUUID(), file.name);
    await r2.uploadFile(key, Buffer.from(await file.arrayBuffer()), file.type || 'image/jpeg');
    const row = await svc.add(categoryId, key);
    revalidatePath(PRODUCTS_PATH);
    return { data: toPhotoView(row), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Havuzdaki fotoğrafı siler — satırla BİRLİKTE depodaki nesneyi de (yetim dosya kalmasın). */
export async function deleteCategoryPhotoAction(photoId: string): Promise<ActionResult> {
  try {
    await requireStaff();
    const svc = new CategoryImageService(serviceDb());
    const row = await svc.getById(photoId);
    if (!row) throw new Error('Fotoğraf bulunamadı.');
    await svc.delete(photoId);
    await getR2()?.deleteFile(row.imageKey);
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Havuzdaki fotoğrafı kapak yapar — eski kapak onun yerine havuza geçer (takas, servis tarafında). */
export async function makeCategoryCoverAction(categoryId: string, photoId: string): Promise<ActionResult> {
  try {
    await requireStaff();
    await new CategoryService(serviceDb()).makeCover(categoryId, photoId);
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Sürükle-bırak sonrası havuz sırası — kartın gün gün hangi kareye geçeceğini bu sıra belirler. */
export async function reorderCategoryPhotosAction(orderedIds: string[]): Promise<ActionResult> {
  try {
    await requireStaff();
    await new CategoryImageService(serviceDb()).reorder(orderedIds);
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Havuz fotoğrafının odak/zoom künyesi. Dosya değişmediği için sürüm damgasına dokunulmaz. */
export async function setCategoryPhotoCropAction(photoId: string, crop: ImageCropFields): Promise<ActionResult> {
  try {
    await requireStaff();
    await new CategoryImageService(serviceDb()).setCrop(photoId, pickCropFields(crop));
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
