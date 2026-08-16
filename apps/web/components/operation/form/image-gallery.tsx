'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { cropOf, type ImageCrop, type ImageRole } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { ImageCropField } from '@/components/operation/form/image-crop-field';
import { ImageCropDialog } from '@/components/operation/form/image-crop-dialog';
import { ImageUploadButton } from '@/components/operation/ui/image-upload-button';
import { ImageIcon, PlusIcon, StarIcon, TrashIcon } from '@/components/operation/ui/icons';
import { Skeleton, SkeletonBlock } from '@/components/operation/ui/skeleton';
import { SortableList } from '@/components/operation/ui/sortable-list';
import type { ActionResult } from '@/lib/error';
import type { GalleryActions, GalleryPhotoView } from './image-gallery-types';

/**
 * KAPAK (büyük) + FOTOĞRAF ŞERİDİ (küçük kareler) — ürünün galerisi ve kategorinin havuzu aynı blok.
 *
 * Neden eşit dörtlü ızgara değil: kapak birden çok çerçeveye türüyor (katalog kartı 3:2, sepet
 * karesi 1:1, kategori dairesi, paylaşım kartı) — odak ayarı asıl orada kritik, o yüzden türev
 * önizlemeleri yalnız kapağın altında duruyor. Şeritteki fotoğraf daha az çerçevede görünür, bu
 * yüzden küçük ve sade. Dördü eşit gösterilseydi hangisinin müşterinin ilk gördüğü fotoğraf olduğu
 * yalnız bir rozetten okunurdu.
 *
 * ŞERİT CANLI yönetilir (yükle/sil/sırala/kırp anında yazılır), çünkü dosya zaten anında R2'ye
 * gidiyor — önizleme onsuz çizilemez. Kapağın odak/zoom'u bunun DIŞINDA: o varlık satırının alanı,
 * formla birlikte kaydedilir ("kaydeden yayınlar", §0B).
 *
 * ── İKİ YÜZEY, TEK BLOK (05.23) ──────────────────────────────────────────────
 * Ürün formundan buraya taşındı ve eylemler prop'a çıktı. Ayrışan her şey metin ya da parametre:
 * başlık, ipucu, tavan, kırpma rolü. Ayrışmayan şey davranış — sürükle-bırak sırası, iskelet, kapak
 * takası, sınır dolunca bilgi notu. İkinci bir nüsha yazılsaydı bunların biri gün gelip ötekinden
 * ayrışırdı ve fark ancak operatörün ekranında görünürdü.
 *
 * Kullanım farkı YALNIZ okumada: ürün şeridi müşteriye toplu gösterilir (detay galerisi), kategori
 * havuzu gösterilmez — kart tek kare çizer ve kareyi güne göre seçer. Bu yüzden kategoride sıra bir
 * vitrin sırası değil, rotasyonun döngü sırasıdır; fark `reorderHint` metnindedir.
 */
interface ImageGalleryProps {
  /** Kayıt yoksa (yeni varlık) şerit yönetilemez — R2 anahtarı slug'a bağlı. */
  parentId: string | null;
  /** Kapağın kırpma rolü — türev çerçeveleri belirler (`IMAGE_ROLES`). */
  coverRole: ImageRole;
  /** Şerit fotoğrafının kırpma rolü; kapağınkinden farklı olabilir (ürün: `gallery`). */
  photoRole: ImageRole;
  coverUrl: string | null;
  coverCrop: ImageCrop;
  onCoverCropChange: (crop: ImageCrop) => void;
  uploadCover?: (form: FormData) => Promise<ActionResult>;
  /** Kapak yükleme kapalıyken gösterilen sebep (yeni kayıt). */
  uploadDisabledHint: string;
  /** Kapak alanının altındaki bağlam etiketi — nerede görüneceğini söyler. */
  coverCaption?: string;
  /** Şeridin başlığı ("Galeri" · "Fotoğraf havuzu"). */
  title: string;
  /** Başlığın yanındaki tek satırlık açıklama. */
  hint: string;
  /** Birden çok fotoğraf varken altta görünen sıralama ipucu. */
  reorderHint: string;
  /** Şeritte tutulabilecek en çok fotoğraf. */
  max: number;
  actions: GalleryActions;
}

export function ImageGallery({
  parentId,
  coverRole,
  photoRole,
  coverUrl,
  coverCrop,
  onCoverCropChange,
  uploadCover,
  uploadDisabledHint,
  coverCaption,
  title,
  hint,
  reorderHint,
  max,
  actions,
}: ImageGalleryProps) {
  const [photos, setPhotos] = useState<GalleryPhotoView[]>([]);
  /**
   * İlk okuma DÖNDÜ MÜ — `photos.length` tek başına iki durumu ayırmıyor.
   *
   * Bir tur ayrılmıyordu ve sonucu CLAUDE.md §1'in kırmızı çizgisiydi: şerit okunurken sayaç `0/5`
   * yazıyor, ızgarada yalnız "+" karesi duruyordu. Dört fotoğrafı olan ürün, "hiç fotoğrafı yok" gibi
   * görünüyordu — ölçülemeyen değer sıfır gösteriliyordu (bağımsız ajan denetimi, 30.07).
   */
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<GalleryPhotoView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const reload = useCallback(async () => {
    if (!parentId) return;
    const { data, error: err } = await actions.list(parentId);
    if (err) setError(err);
    else setPhotos(data ?? []);
    setLoaded(true);
  }, [parentId, actions]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Her şerit eylemi aynı kalıpta: çalıştır → hatayı göster ya da listeyi tazele. Tek yerde durur ki
  // beş ayrı düğme aynı hata/yenileme kodunu tekrarlamasın.
  const run = (fn: () => Promise<ActionResult<unknown>>) =>
    startTransition(async () => {
      setError(null);
      const { error: err } = await fn();
      if (err) setError(err);
      else await reload();
    });

  const full = photos.length >= max;

  return (
    <div className="flex flex-col gap-4">
      {/* Kapak — türev önizlemeleriyle birlikte (mevcut O15 alanı, değişmedi) */}
      <ImageCropField
        role={coverRole}
        src={coverUrl}
        crop={coverCrop}
        onCropChange={onCoverCropChange}
        upload={uploadCover}
        uploadDisabledHint={uploadDisabledHint}
        caption={coverCaption}
      />

      {/* Şerit — yalnız kayıtlı varlıkta; kapak yokken de eklenebilir (ilki kapak yapılabilir) */}
      {parentId ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.08em] text-ops-muted">{title}</span>
            <span className="font-ops-body text-ops-micro text-ops-faint">{hint}</span>
            {loaded ? (
              <span className="ml-auto font-ops-mono text-ops-micro text-ops-faint">
                {photos.length}/{max}
              </span>
            ) : (
              <Skeleton className="ml-auto h-2.5 w-8" />
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {/* İlk okuma dönene kadar kareler İSKELET ve "+" karesi ÇİZİLMEZ: dolu bir şeride
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
                  onReorder={(ids) => run(() => actions.reorder(ids))}
                  renderItem={(photo) => (
                    <PhotoTile
                      photo={photo}
                      disabled={busy}
                      onEdit={() => setEditing(photo)}
                      onMakeCover={() => run(() => actions.makeCover(parentId, photo.id))}
                      onDelete={() => run(() => actions.remove(photo.id))}
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
                    upload={(fd) => actions.upload(parentId, fd)}
                    multiple
                    className="grid aspect-[3/2] cursor-pointer place-items-center gap-1 rounded-ops-card border border-dashed border-ops-line-strong text-ops-muted transition-colors hover:border-ops-olive hover:text-ops-olive"
                  >
                    <PlusIcon />
                  </ImageUploadButton>
                )}
              </>
            )}
          </div>

          {photos.length > 1 ? <span className="font-ops-body text-ops-micro text-ops-faint">{reorderHint}</span> : null}
          {error ? <span className="font-ops-body text-ops-xs text-ops-red">{error}</span> : null}
        </div>
      ) : null}

      {editing ? (
        <ImageCropDialog
          role={photoRole}
          src={editing.imageUrl}
          initialCrop={cropOf(editing)}
          onConfirm={(crop) => {
            run(() => actions.setCrop(editing.id, { imageFocalX: crop.x, imageFocalY: crop.y, imageZoom: crop.zoom }));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Tek fotoğraf karesi. Kare ~110px — üç metin düğmesi sığmaz, o yüzden eylemler İKİ İKONA indi ve
 * sürükleme tutamağı KALKTI: karenin kendisi sürükleniyor (SortableList `grab="item"`). Sürüklemek
 * keşfedilmesi gereken gizli bir eylem değil; kare zaten tutulup taşınacak bir nesne gibi duruyor.
 *
 * Tıklama ile sürükleme çakışmaz: sürükle-bırak 5px hareket eşiği istiyor, hareketsiz basış normal
 * tıklama olarak işliyor ve odak/zoom diyaloğunu açıyor.
 */
interface PhotoTileProps {
  photo: GalleryPhotoView;
  disabled: boolean;
  onEdit: () => void;
  onMakeCover: () => void;
  onDelete: () => void;
}

// İkon düğmeleri: küçük kare, kart zeminli daire — üstteki fotoğraf ne olursa olsun okunur kalsın.
const TILE_ACTION =
  'pointer-events-auto grid h-[22px] w-[22px] cursor-pointer place-items-center rounded-full bg-ops-card/90 shadow-sm transition-colors hover:bg-ops-card disabled:cursor-not-allowed';

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
