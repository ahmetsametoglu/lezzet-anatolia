'use client';

import { PRODUCT_GALLERY_MAX, type ImageCrop } from '@lezzet/types';
import { ImageGallery } from '@/components/operation/form/image-gallery';
import type { GalleryActions } from '@/components/operation/form/image-gallery-types';
import type { ActionResult } from '@/lib/error';
import {
  deleteGalleryPhotoAction,
  listProductPhotosAction,
  makeCoverAction,
  reorderGalleryAction,
  setGalleryCropAction,
  uploadGalleryPhotoAction,
} from '@/lib/catalog/product-photo-actions';

/**
 * Ürün fotoğrafları — kapak + galeri şeridi. Bloğun kendisi ORTAK (`ImageGallery`, 05.23); burada
 * yalnız ürünün eylem seti ve metinleri kuruluyor.
 *
 * Sarmalayıcı DURUYOR (blok doğrudan çağrılmıyor) çünkü iki yüzey bu formu birden açıyor — ürün
 * ekranı ve asistan kuyruğu. Ortak bloğu ikisinden de çağırsaydık aynı sekiz prop iki yerde
 * tekrarlanır ve biri gün gelip ötekinden ayrışırdı (kullanıcı 11.08: *"o formu bire bir kopyala;
 * code duplication olmasın ama görüntüde bazı şeyleri kırpma"*).
 */
interface ProductPhotosProps {
  /** Kayıt yoksa (yeni ürün) galeri yönetilemez — R2 anahtarı slug'a bağlı. */
  productId: string | null;
  coverUrl: string | null;
  coverCrop: ImageCrop;
  onCoverCropChange: (crop: ImageCrop) => void;
  uploadCover?: (form: FormData) => Promise<ActionResult>;
}

// Eylem seti modül düzeyinde SABİT: bileşenin içinde kurulsaydı her render'da yeni bir nesne olur ve
// `reload` bağımlılığı üzerinden okumayı sonsuz döngüye sokardı.
const PRODUCT_GALLERY_ACTIONS: GalleryActions = {
  list: listProductPhotosAction,
  upload: uploadGalleryPhotoAction,
  remove: deleteGalleryPhotoAction,
  makeCover: makeCoverAction,
  reorder: reorderGalleryAction,
  setCrop: setGalleryCropAction,
};

export function ProductPhotos({ productId, coverUrl, coverCrop, onCoverCropChange, uploadCover }: ProductPhotosProps) {
  return (
    <ImageGallery
      parentId={productId}
      // Kapak dört çerçeveye türüyor (kart · sepet karesi · kategori dairesi · paylaşım kartı),
      // galeri fotoğrafı tek çerçevede görünüyor (detay galerisi, 3:2) — roller bu yüzden ayrı.
      coverRole="product"
      photoRole="gallery"
      coverUrl={coverUrl}
      coverCrop={coverCrop}
      onCoverCropChange={onCoverCropChange}
      uploadCover={uploadCover}
      uploadDisabledHint="Ürünü kaydedince görsel eklenebilir — R2 anahtarı slug'a bağlı."
      title="Galeri"
      hint="detay sayfasındaki ek fotoğraflar"
      reorderHint="Kareyi sürükleyerek sırala — müşteri galeriyi bu sırada görür. Tıkla: odak ve zoom."
      max={PRODUCT_GALLERY_MAX}
      actions={PRODUCT_GALLERY_ACTIONS}
    />
  );
}
