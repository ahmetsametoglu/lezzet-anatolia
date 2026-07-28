'use client';

import { useState } from 'react';
import { IMAGE_ROLES, type ImageCrop, type ImageRole } from '@lezzet/types';
import type { ActionResult } from '@/lib/error';
import { ImageIcon } from '@/components/operation/ui/icons';
import { FramePreviews, ImageCropDialog } from './image-crop-dialog';

/**
 * Formdaki görsel alanı — Komponent Envanteri O15. KOMPAKT: yalnız "nerede nasıl görünecek" türev
 * önizlemeleri taşır; düzenleme kabın HOVER'ında beliren buton ile ayrı diyalogda (ImageCropDialog)
 * yapılır → form yerleşimi bozulmaz. Odak/zoom form değeridir (kaydeden yayınlar §0B). Alt metin ayrı
 * alan DEĞİL: boşsa müşteri yüzeyinde ürün adına düşer (kopya tutulmaz, ad değişince kendiliğinden güncel).
 */
interface ImageCropFieldProps {
  role: ImageRole;
  /** Yüklenmiş görselin okuma URL'i (yoksa null). */
  src: string | null;
  crop: ImageCrop;
  onCropChange: (crop: ImageCrop) => void;
  /** Dosyayı R2'ye taşıyan action; kayıt henüz yoksa (yeni nesne) verilmez → düzenleme kilitli. */
  upload?: (form: FormData) => Promise<ActionResult>;
  /** Yükleme yapılamıyorken (kayıt öncesi) gösterilecek not. */
  uploadDisabledHint?: string;
  /** Başlık yanındaki bağlam etiketi (varsayılan "müşteride görünüm"; koleksiyonda "paylaşım kartı"). */
  caption?: string;
  camera?: boolean;
}

export function ImageCropField({ role, src, crop, onCropChange, upload, uploadDisabledHint, caption = 'müşteride görünüm', camera }: ImageCropFieldProps) {
  const [open, setOpen] = useState(false);
  const spec = IMAGE_ROLES[role];
  // Kayıt yoksa (upload verilmemiş) ve görsel de yoksa düzenleme kilitli — dosya R2 anahtarı için kayıt gerekir.
  const canEdit = upload !== undefined || src !== null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="font-ops-display text-[10px] font-medium uppercase tracking-[0.08em] text-ops-muted">Fotoğraf</span>
        {src ? <span className="ml-auto font-ops-body text-[10px] text-ops-faint">{caption}</span> : null}
      </div>

      {/* Kap: önizleme (ya da boş kare) + HOVER'da beliren düzenle/ekle örtüsü */}
      <div className="group relative overflow-hidden rounded-ops-card border border-ops-line-soft bg-ops-subtle">
        {src ? (
          <div className="p-3">
            <FramePreviews role={role} src={src} crop={crop} height={64} />
          </div>
        ) : (
          <div style={{ aspectRatio: spec.ratio }} className="grid place-items-center text-ops-gray-700">
            <ImageIcon size={28} />
          </div>
        )}

        {canEdit ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="absolute inset-0 flex cursor-pointer items-center justify-center bg-[rgba(30,33,27,0)] font-ops-display text-[12px] font-semibold text-transparent transition-colors duration-150 group-hover:bg-[rgba(30,33,27,0.45)] group-hover:text-white"
          >
            {src ? 'Görseli düzenle' : 'Görsel ekle'}
          </button>
        ) : null}
      </div>

      {!canEdit && uploadDisabledHint ? (
        <span className="font-ops-body text-[10.5px] leading-[1.5] text-ops-faint">{uploadDisabledHint}</span>
      ) : null}

      {open ? (
        <ImageCropDialog
          role={role}
          src={src}
          initialCrop={crop}
          upload={upload}
          camera={camera}
          onConfirm={(c) => {
            onCropChange(c);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
