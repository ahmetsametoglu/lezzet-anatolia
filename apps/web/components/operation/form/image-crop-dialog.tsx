'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  IMAGE_ROLES,
  IMAGE_ZOOM_MAX,
  IMAGE_ZOOM_MIN,
  sourceAdvisory,
  type ImageCrop,
  type ImageRole,
  type SourceImageInfo,
} from '@lezzet/types';
import type { ActionResult } from '@/lib/error';
import { FramedImage } from '@/components/media/framed-image';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { ImageUploadButton } from '@/components/operation/ui/image-upload-button';
import { ImageIcon } from '@/components/operation/ui/icons';

// Türev çerçeve önizlemesi — TEK KAYNAK: hem editör diyaloğu (canlı) hem form alanı (onaylanmış)
// aynı satırı gösterir. `role` hangi çerçevelerin (3:2 · 1:1 · daire) türeyeceğini belirler.
interface FramePreviewsProps {
  role: ImageRole;
  src: string | null;
  crop: ImageCrop;
  /** Tüm önizlemelerin SABİT yüksekliği (px); genişlik orandan türer → aynı satırda hizalı dururlar. */
  height?: number;
}

export function FramePreviews({ role, src, crop, height = 64 }: FramePreviewsProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {IMAGE_ROLES[role].frames.map((f, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          {/* Sabit yükseklik, oran genişliği belirler → 3:2 ve 1:1 aynı yükseklikte hizalanır. */}
          <div style={{ width: height * f.ratio }}>
            <FramedImage src={src} alt="" ratio={f.ratio} crop={crop} circle={f.circle} placeholder={<ImageIcon size={16} />} />
          </div>
          <span className="font-ops-mono text-[9px] text-ops-faint">{f.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Görsel düzenleme diyaloğu — Komponent Envanteri O15 (Fotoğraf bloğu), formdan AYRI. Bu kadar özellik
 * (yükleme · odak · zoom · türev önizleme · kalite uyarısı) form yerleşimini bozduğu için ayrı katmanda
 * yaşar: form yalnız önizleme + "Düzenle" taşır, düzenleme burada olur. "Tamam"da kırpma forma yazılır.
 *
 * Kırpma YEREL kopyada tutulur; Vazgeç değişikliği atar, Tamam onaylar. Dosyanın kendisi (upload) anında
 * R2'ye gider (odak/zoom'dan bağımsız); yeni görsel yüklenince src tazelenir, diyalog açık kalır.
 */
interface ImageCropDialogProps {
  role: ImageRole;
  src: string | null;
  initialCrop: ImageCrop;
  onConfirm: (crop: ImageCrop) => void;
  onClose: () => void;
  /** Dosyayı R2'ye taşıyan action; yoksa (kayıt öncesi) yükleme gösterilmez. */
  upload?: (form: FormData) => Promise<ActionResult>;
  camera?: boolean;
}

export function ImageCropDialog({ role, src, initialCrop, onConfirm, onClose, upload, camera }: ImageCropDialogProps) {
  const spec = IMAGE_ROLES[role];
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [crop, setCrop] = useState<ImageCrop>(initialCrop);
  const [info, setInfo] = useState<SourceImageInfo | null>(null);

  // Kaynak doğal boyutları — kırpma sonrası kalite/kadraj uyarısı için ölçülür (sunucuya sormadan).
  useEffect(() => {
    if (!src) {
      setInfo(null);
      return;
    }
    let alive = true;
    const im = new Image();
    im.onload = () => alive && setInfo({ width: im.naturalWidth, height: im.naturalHeight, type: 'image/jpeg' });
    im.src = src;
    return () => {
      alive = false;
    };
  }, [src]);

  const setFocalFromEvent = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = frameRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
    setCrop((c) => ({ ...c, x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) }));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!src) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setFocalFromEvent(e);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current) setFocalFromEvent(e);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };

  const advisory = src && info ? sourceAdvisory(role, info, crop.zoom) : null;

  const footer = (
    <>
      <span className="mr-auto font-ops-body text-[11px] text-ops-faint">Kaynak {spec.label} · min {spec.minWidth}×{spec.minHeight}</span>
      <Button variant="secondary" onClick={onClose}>
        Vazgeç
      </Button>
      <Button variant="primary" onClick={() => onConfirm(crop)}>
        Tamam
      </Button>
    </>
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title="Görseli düzenle"
      subtitle="Odak noktasını tıkla/sürükle, zoom ile yaklaş — çerçeveler bu kaynaktan türer"
      footer={footer}
      maxWidth={560}
    >
      <div className="flex flex-col gap-4">
        {/* Ana çerçeve: tüm kare odak seçimi; yükleme küçük köşe çipinde (kareyi kaplamaz) */}
        <div className="relative">
          <div
            ref={frameRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className={src ? 'cursor-crosshair' : ''}
          >
            <FramedImage src={src} alt="" ratio={spec.ratio} crop={crop} placeholder={<ImageIcon size={34} />} />
            {src ? (
              <>
                <span className="pointer-events-none absolute left-0 right-0 h-px bg-white/70" style={{ top: `${crop.y}%` }} />
                <span className="pointer-events-none absolute bottom-0 top-0 w-px bg-white/70" style={{ left: `${crop.x}%` }} />
                <span
                  className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(34,37,31,0.5)]"
                  style={{ left: `${crop.x}%`, top: `${crop.y}%` }}
                />
              </>
            ) : null}
          </div>
          {upload ? (
            src ? (
              <ImageUploadButton
                upload={upload}
                camera={camera}
                className="absolute right-2 top-2 cursor-pointer rounded-md bg-[rgba(30,33,27,0.6)] px-2.5 py-1 font-ops-display text-[10.5px] font-semibold text-white transition-colors hover:bg-[rgba(30,33,27,0.82)]"
              >
                Değiştir
              </ImageUploadButton>
            ) : (
              <ImageUploadButton
                upload={upload}
                camera={camera}
                className="absolute inset-0 flex cursor-pointer items-center justify-center font-ops-display text-[13px] font-semibold text-ops-muted transition-colors hover:text-ops-olive"
              >
                Görsel yükle
              </ImageUploadButton>
            )
          ) : null}
        </div>

        {/* Zoom + merkeze al — yalnız görsel varken */}
        {src ? (
          <div className="flex items-center gap-3">
            <span className="font-ops-body text-[11px] text-ops-muted">Zoom</span>
            <input
              type="range"
              min={IMAGE_ZOOM_MIN}
              max={IMAGE_ZOOM_MAX}
              value={crop.zoom}
              onChange={(e) => setCrop((c) => ({ ...c, zoom: Number(e.target.value) }))}
              style={{ accentColor: 'var(--color-ops-olive)' }}
              className="h-1 flex-1 cursor-pointer"
              aria-label="Zoom"
            />
            <span className="w-10 shrink-0 text-right font-ops-mono text-[11px] text-ops-body">{crop.zoom}%</span>
            <button
              type="button"
              onClick={() => setCrop({ x: 50, y: 50, zoom: 100 })}
              className="shrink-0 cursor-pointer rounded-md border border-ops-line-strong px-2.5 py-1 font-ops-display text-[10.5px] font-semibold text-ops-muted transition-colors hover:border-ops-olive hover:text-ops-olive"
            >
              Merkeze al
            </button>
          </div>
        ) : null}

        {/* Türev kırpmalar — müşteride nerede nasıl görüneceği (canlı) */}
        {src ? (
          <div className="flex flex-col gap-2 rounded-[9px] border border-ops-line-soft bg-ops-subtle p-3">
            <span className="font-ops-display text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ops-muted">
              Müşteride görünecek çerçeveler
            </span>
            <FramePreviews role={role} src={src} crop={crop} height={64} />
          </div>
        ) : null}

        {/* Kalite/kadraj uyarısı — RED değil, bilgi (amber) */}
        {advisory ? (
          <div className="rounded-[9px] border border-ops-amber-line bg-ops-amber-bg px-3 py-2">
            <span className="font-ops-body text-[11px] leading-[1.5] text-ops-amber-dark">{advisory}</span>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
