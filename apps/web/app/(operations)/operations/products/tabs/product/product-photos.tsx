'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { cropOf, PRODUCT_GALLERY_MAX, type ImageCrop } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { ImageCropField } from '@/components/operation/form/image-crop-field';
import { ImageCropDialog } from '@/components/operation/form/image-crop-dialog';
import { ImageUploadButton } from '@/components/operation/ui/image-upload-button';
import { ImageIcon, PlusIcon, StarIcon, TrashIcon } from '@/components/operation/ui/icons';
import { Skeleton, SkeletonBlock } from '@/components/operation/ui/skeleton';
import { SortableList } from '@/components/operation/ui/sortable-list';
import type { ActionResult } from '@/lib/error';
import {
  deleteGalleryPhotoAction,
  listProductPhotosAction,
  makeCoverAction,
  reorderGalleryAction,
  setGalleryCropAction,
  uploadGalleryPhotoAction,
} from './actions';
import type { ProductPhotoView } from './product-form-types';

/**
 * Ürün fotoğrafları — KAPAK (büyük) + GALERİ ŞERİDİ (küçük kareler).
 *
 * Neden eşit dörtlü ızgara değil: kapak dört ayrı çerçeveye türüyor (katalog kartı 3:2, sepet karesi
 * 1:1, kategori dairesi, paylaşım kartı) — odak ayarı asıl orada kritik, o yüzden türev önizlemeleri
 * yalnız kapağın altında duruyor. Galeri fotoğrafı tek çerçevede görünüyor (detay galerisi, 3:2), bu
 * yüzden küçük ve sade. Dördü eşit gösterilseydi hangisinin müşterinin ilk gördüğü fotoğraf olduğu
 * yalnız bir rozetten okunurdu.
 *
 * GALERİ CANLI yönetilir (yükle/sil/sırala/kırp anında yazılır), çünkü dosya zaten anında R2'ye
 * gidiyor — önizleme onsuz çizilemez. Kapağın odak/zoom'u bunun DIŞINDA: o ürün satırının alanı,
 * formla birlikte kaydedilir ("kaydeden yayınlar", §0B).
 */
interface ProductPhotosProps {
  /** Kayıt yoksa (yeni ürün) galeri yönetilemez — R2 anahtarı slug'a bağlı. */
  productId: string | null;
  coverUrl: string | null;
  coverCrop: ImageCrop;
  onCoverCropChange: (crop: ImageCrop) => void;
  uploadCover?: (form: FormData) => Promise<ActionResult>;
  camera?: boolean;
}

export function ProductPhotos({ productId, coverUrl, coverCrop, onCoverCropChange, uploadCover, camera }: ProductPhotosProps) {
  const [photos, setPhotos] = useState<ProductPhotoView[]>([]);
  /**
   * İlk okuma DÖNDÜ MÜ — `photos.length` tek başına iki durumu ayırmıyor.
   *
   * Bir tur ayrılmıyordu ve sonucu CLAUDE.md §1'in kırmızı çizgisiydi: galeri okunurken sayaç `0/5`
   * yazıyor, ızgarada yalnız "+" karesi duruyordu. Dört fotoğrafı olan ürün, "hiç fotoğrafı yok" gibi
   * görünüyordu — ölçülemeyen değer sıfır gösteriliyordu (bağımsız ajan denetimi, 30.07).
   */
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<ProductPhotoView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const reload = useCallback(async () => {
    if (!productId) return;
    const { data, error: err } = await listProductPhotosAction(productId);
    if (err) setError(err);
    else setPhotos(data ?? []);
    setLoaded(true);
  }, [productId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Her galeri eylemi aynı kalıpta: çalıştır → hatayı göster ya da listeyi tazele. Tek yerde durur ki
  // beş ayrı düğme aynı hata/yenileme kodunu tekrarlamasın.
  const run = (fn: () => Promise<ActionResult<unknown>>) =>
    startTransition(async () => {
      setError(null);
      const { error: err } = await fn();
      if (err) setError(err);
      else await reload();
    });

  const full = photos.length >= PRODUCT_GALLERY_MAX;

  return (
    <div className="flex flex-col gap-4">
      {/* Kapak — türev önizlemeleriyle birlikte (mevcut O15 alanı, değişmedi) */}
      <ImageCropField
        role="product"
        src={coverUrl}
        crop={coverCrop}
        onCropChange={onCoverCropChange}
        upload={uploadCover}
        uploadDisabledHint="Ürünü kaydedince görsel eklenebilir — R2 anahtarı slug'a bağlı."
        camera={camera}
      />

      {/* Galeri — yalnız kayıtlı üründe; kapak yokken de eklenebilir (ilki kapak yapılabilir) */}
      {productId ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.08em] text-ops-muted">Galeri</span>
            <span className="font-ops-body text-ops-micro text-ops-faint">detay sayfasındaki ek fotoğraflar</span>
            {loaded ? (
              <span className="ml-auto font-ops-mono text-ops-micro text-ops-faint">
                {photos.length}/{PRODUCT_GALLERY_MAX}
              </span>
            ) : (
              <Skeleton className="ml-auto h-2.5 w-8" />
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {/* İlk okuma dönene kadar kareler İSKELET ve "+" karesi ÇİZİLMEZ: dolu bir galeriye
                "ilk fotoğrafı ekle" davetiyle bakmak, olmayan bir boşluğu doldurmaya çağırmaktı. */}
            {!loaded ? (
              [0, 1, 2].map((i) => <SkeletonBlock key={i} className="aspect-[3/2] w-full" />)
            ) : (
              <>
            <SortableList
              items={photos}
              getId={(p) => p.id}
              layout="grid"
              grab="item"
              onReorder={(ids) => run(() => reorderGalleryAction(ids))}
              renderItem={(photo) => (
                <PhotoTile
                  photo={photo}
                  disabled={busy}
                  onEdit={() => setEditing(photo)}
                  onMakeCover={() => run(() => makeCoverAction(productId, photo.id))}
                  onDelete={() => run(() => deleteGalleryPhotoAction(photo.id))}
                />
              )}
            />

            {/* Ekleme karesi — sınıra gelince yerini bilgi notu alır (buton kaybolup şaşırtmasın) */}
            {full ? (
              <span className="grid place-items-center rounded-ops-card border border-dashed border-ops-line-soft p-2 text-center font-ops-body text-ops-micro leading-[1.4] text-ops-faint">
                Sınır doldu
              </span>
            ) : (
              <ImageUploadButton
                upload={(fd) => uploadGalleryPhotoAction(productId, fd)}
                multiple
                camera={camera}
                className="grid aspect-[3/2] cursor-pointer place-items-center gap-1 rounded-ops-card border border-dashed border-ops-line-strong text-ops-muted transition-colors hover:border-ops-olive hover:text-ops-olive"
              >
                <PlusIcon />
              </ImageUploadButton>
            )}
              </>
            )}
          </div>

          {photos.length > 1 ? (
            <span className="font-ops-body text-ops-micro text-ops-faint">
              Kareyi sürükleyerek sırala — müşteri galeriyi bu sırada görür. Tıkla: odak ve zoom.
            </span>
          ) : null}
          {error ? <span className="font-ops-body text-ops-xs text-ops-red">{error}</span> : null}
        </div>
      ) : null}

      {editing ? (
        <ImageCropDialog
          role="gallery"
          src={editing.imageUrl}
          initialCrop={cropOf(editing)}
          onConfirm={(crop) => {
            run(() => setGalleryCropAction(editing.id, { imageFocalX: crop.x, imageFocalY: crop.y, imageZoom: crop.zoom }));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Tek galeri karesi. Kare ~110px — üç metin düğmesi sığmaz, o yüzden eylemler İKİ İKONA indi ve
 * sürükleme tutamağı KALKTI: karenin kendisi sürükleniyor (SortableList `grab="item"`). Sürüklemek
 * keşfedilmesi gereken gizli bir eylem değil; kare zaten tutulup taşınacak bir nesne gibi duruyor.
 *
 * Tıklama ile sürükleme çakışmaz: sürükle-bırak 5px hareket eşiği istiyor, hareketsiz basış normal
 * tıklama olarak işliyor ve odak/zoom diyaloğunu açıyor.
 */
interface PhotoTileProps {
  photo: ProductPhotoView;
  disabled: boolean;
  onEdit: () => void;
  onMakeCover: () => void;
  onDelete: () => void;
}

// İkon düğmeleri: küçük kare, kart zeminli daire — üstteki fotoğraf ne olursa olsun okunur kalsın.
const TILE_ACTION = 'pointer-events-auto grid h-[22px] w-[22px] cursor-pointer place-items-center rounded-full bg-ops-card/90 shadow-sm transition-colors hover:bg-ops-card disabled:cursor-not-allowed';

function PhotoTile({ photo, disabled, onEdit, onMakeCover, onDelete }: PhotoTileProps) {
  return (
    <div className="group relative overflow-hidden rounded-ops-card border border-ops-line-soft bg-ops-subtle">
      <FramedImage src={photo.imageUrl} alt="" ratio={3 / 2} crop={cropOf(photo)} placeholder={<ImageIcon size={16} />} />

      {/* Karenin tamamı DÜZENLE — ikon düğmeleri bunun üstünde durur (olay onlara gider). */}
      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        title="Odak ve zoom"
        className="absolute inset-0 cursor-grab bg-[rgba(30,33,27,0)] transition-colors duration-150 group-hover:bg-[rgba(30,33,27,0.35)] active:cursor-grabbing"
      />

      <div className="pointer-events-none absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <button type="button" onClick={onMakeCover} disabled={disabled} title="Kapak yap" className={`${TILE_ACTION} text-ops-ink`}>
          <StarIcon size={13} />
        </button>
        <button type="button" onClick={onDelete} disabled={disabled} title="Sil" className={`${TILE_ACTION} text-ops-red`}>
          <TrashIcon size={13} />
        </button>
      </div>
    </div>
  );
}
