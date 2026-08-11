'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { ProductImageService, ProductService, serviceDb } from '@lezzet/database';
import { getR2, publicImageUrl, r2Keys } from '@lezzet/storage';
import { pickCropFields, PRODUCT_GALLERY_MAX, type ImageCropFields, type ProductImage } from '@lezzet/types';
import { requireStaff } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { PRODUCTS_PATH } from './paths';
import type { ProductPhotoView } from '@/components/operation/form/product-form/photos-types';

// Ürün GÖRSEL yazma yolları — İKİ yüzeyin ortak eylemleri (ürün ekranı · asistan kuyruğu).
//
// Ürün sekmesinin klasöründen buraya taşındılar (11.08), `updateProductAction`ın 22.14'te yaptığı
// devrin aynısı ve aynı gerekçeyle: ürün formu artık asistan kuyruğunun içinde de açılıyor ve
// kullanıcı formun BİREBİR aynısını istedi — *"eğer ben sistemde bir form kullanıyorsam o formu
// mümkünse bire bir kopyala; code duplication olmasın ama görüntüde bazı şeyleri kırpma."* Kuyruk
// bir sayfa klasöründen import etseydi bağımlılık yatay olurdu (`CLAUDE §2`).
//
// Galeri CANLI yönetilir: yükleme, silme, sıra ve kırpma anında yazılır — formun "kaydet"ine bağlı
// değildir. Sebep: dosyanın kendisi zaten anında R2'ye gidiyor (önizleme için şart); yarısı anında
// yarısı kaydedince uygulanan bir panel, "Vazgeç"in neyi geri aldığını belirsizleştirirdi. Kapağın
// odak/zoom'u bunun DIŞINDA: o ürün satırının alanı, formla birlikte kaydedilir (§0B).

// Galeri satırını client'ın gördüğü şekle indirger — okuma URL'i public bucket'tan saf birleştirmeyle
// kurulur (05.11), sürüm damgası satırın kendi `imageUpdatedAt`'inden gelir.
const toPhotoView = (row: ProductImage): ProductPhotoView => ({
  ...row,
  imageUrl: publicImageUrl(row.imageKey, row.imageUpdatedAt),
});

/** Formdaki dosyayı okur — üç yükleme action'ı aynı denetimi tekrarlamasın. */
function readUpload(form: FormData): File {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) throw new Error('Görsel dosyası bulunamadı.');
  return file;
}

/** Ürün KAPAK görselini R2'ye yükler ve imageKey'i günceller. */
export async function uploadProductImageAction(id: string, form: FormData): Promise<ActionResult> {
  try {
    await requireStaff();
    const file = readUpload(form);
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

/** Ürünün galerisi (kapak hariç), müşteriye gösterilecek sırada + okuma URL'leri. */
export async function listProductPhotosAction(productId: string): Promise<ActionResult<ProductPhotoView[]>> {
  try {
    await requireStaff();
    const rows = await new ProductImageService(serviceDb()).listByProduct(productId);
    return { data: rows.map(toPhotoView), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Galeriye fotoğraf ekler (sona). Üst sınır aşılırsa reddedilir — sessizce yutulmaz. */
export async function uploadGalleryPhotoAction(productId: string, form: FormData): Promise<ActionResult<ProductPhotoView>> {
  try {
    await requireStaff();
    const file = readUpload(form);
    const r2 = getR2();
    if (!r2) throw new Error('Depolama (R2) ayarlı değil.');

    const db = serviceDb();
    const product = await new ProductService(db).getById(productId);
    if (!product) throw new Error('Ürün bulunamadı.');

    const svc = new ProductImageService(db);
    const current = await svc.listByProduct(productId);
    if (current.length >= PRODUCT_GALLERY_MAX) {
      throw new Error(`En çok ${PRODUCT_GALLERY_MAX} ek fotoğraf eklenebilir.`);
    }

    // Anahtar fotoğrafa özgü: ürün başına çok dosya var, slug tek başına ayırt etmez.
    const key = r2Keys.productGalleryImage(product.slug, randomUUID(), file.name);
    await r2.uploadFile(key, Buffer.from(await file.arrayBuffer()), file.type || 'image/jpeg');
    const row = await svc.add(productId, key);
    revalidatePath(PRODUCTS_PATH);
    return { data: toPhotoView(row), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Galeri fotoğrafını siler — satırla BİRLİKTE depodaki nesneyi de (yetim dosya kalmasın). */
export async function deleteGalleryPhotoAction(photoId: string): Promise<ActionResult> {
  try {
    await requireStaff();
    const svc = new ProductImageService(serviceDb());
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

/** Galerideki fotoğrafı kapak yapar — eski kapak onun sırasına geçer (takas, servis tarafında). */
export async function makeCoverAction(productId: string, photoId: string): Promise<ActionResult> {
  try {
    await requireStaff();
    await new ProductService(serviceDb()).makeCover(productId, photoId);
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Sürükle-bırak sonrası galeri sırası. */
export async function reorderGalleryAction(orderedIds: string[]): Promise<ActionResult> {
  try {
    await requireStaff();
    await new ProductImageService(serviceDb()).reorder(orderedIds);
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Galeri fotoğrafının odak/zoom künyesi. Dosya değişmediği için sürüm damgasına dokunulmaz. */
export async function setGalleryCropAction(photoId: string, crop: ImageCropFields): Promise<ActionResult> {
  try {
    await requireStaff();
    await new ProductImageService(serviceDb()).setCrop(photoId, pickCropFields(crop));
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
