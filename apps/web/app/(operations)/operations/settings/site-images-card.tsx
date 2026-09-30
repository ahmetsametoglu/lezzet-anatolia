'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IMAGE_ROLES, type ImageCrop, type LocalizedText, type SiteImageSlot } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { ImageCropField } from '@/components/operation/form/image-crop-field';
import { LocalizedTextField } from '@/components/operation/form/localized-text-field';
import { clearSiteImageAction, saveSiteImageAltAction, saveSiteImageCropAction, uploadSiteImageAction } from './site-image-actions';
import { SITE_IMAGE_CATALOG } from './site-images-catalog';
import type { SiteImageView } from './site-images-read';
import { pressable, SettingsCard } from './settings-sections';

/**
 * Vitrin görselleri: müşteri yüzeyindeki dört sabit görsel yeri. Kart her yerin kadrajlı önizlemesini gösterir; düzenleme
 * (kadraj, alternatif metin, kaldırma) tıklayınca açılan pencerede.
 */
interface SiteImagesCardProps {
  images: SiteImageView[];
}

export function SiteImagesCard({ images }: SiteImagesCardProps) {
  const [openSlot, setOpenSlot] = useState<SiteImageSlot | null>(null);
  const open = openSlot ? (images.find((i) => i.slot === openSlot) ?? null) : null;

  return (
    <SettingsCard
      title="Vitrin görselleri"
      count={`${images.filter((i) => i.id !== null).length} / ${images.length}`}
      hint="Müşteri yüzeyindeki sabit görseller. Yüklenmemiş yer arıza değildir, sayfa kendi yer tutucusunu çizer; düzenlemek için karta tıklayın."
    >
      <div className="grid grid-cols-4 border-t border-ops-line-soft">
        {images.map((image, i) => (
          <SlotTile key={image.slot} image={image} last={i === images.length - 1} onOpen={() => setOpenSlot(image.slot)} />
        ))}
      </div>
      {/* Pencere slot'u adla değil anahtarla tutar: yükleme sonrası tazelenen veride güncel kayıt yeniden bulunur. */}
      {open ? <SlotDialog key={open.slot} image={open} onClose={() => setOpenSlot(null)} /> : null}
    </SettingsCard>
  );
}

function SlotTile({ image, last, onOpen }: { image: SiteImageView; last: boolean; onOpen: () => void }) {
  const spec = SITE_IMAGE_CATALOG[image.slot];
  const role = IMAGE_ROLES[spec.role];
  const filled = image.id !== null;

  return (
    <div
      {...pressable(onOpen)}
      className={[
        'flex min-w-0 cursor-pointer flex-col gap-1 px-4 pb-4 pt-3.5 transition-colors hover:bg-ops-subtle',
        last ? '' : 'border-r border-ops-line-soft',
      ].join(' ')}
    >
      <div className="mb-1.5 grid h-[104px] place-items-center rounded-ops-card bg-ops-subtle">
        {filled ? (
          <div className="h-[84px]" style={{ aspectRatio: role.ratio }}>
            <FramedImage src={image.url} alt="" ratio={role.ratio} crop={image.crop} placeholder={null} />
          </div>
        ) : (
          <span
            className="grid h-[84px] place-items-center rounded-ops-btn border border-dashed border-ops-line-strong bg-ops-white font-ops-mono text-ops-micro text-ops-body"
            style={{ aspectRatio: role.ratio }}
          >
            boş
          </span>
        )}
      </div>
      <span className="flex items-baseline gap-2">
        <span className="font-ops-body text-ops-base font-semibold text-ops-ink">{spec.label}</span>
        <span className="font-ops-mono text-ops-micro text-ops-faint">{role.label}</span>
      </span>
      <span className="line-clamp-2 font-ops-body text-ops-xs leading-[1.45] text-ops-body">{spec.where}</span>
      <span className={['font-ops-body text-ops-xs font-medium', filled ? 'text-ops-olive-dark' : 'text-ops-body'].join(' ')}>
        {filled ? 'Yüklü' : 'Boş — sayfa yer tutucusunu çiziyor'}
      </span>
    </div>
  );
}

/**
 * Tek görsel yerinin düzenleme penceresi. Kayıt anında yazılır, "Kaydet" yok: kadraj onaylanınca, alternatif metin alandan
 * çıkınca.
 */
function SlotDialog({ image, onClose }: { image: SiteImageView; onClose: () => void }) {
  const router = useRouter();
  const spec = SITE_IMAGE_CATALOG[image.slot];
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Alt metin yerel taslakta: her tuşta sunucuya gitmek üç dilli bir alanda onlarca tur demekti.
  const [alt, setAlt] = useState<LocalizedText>(image.alt ?? {});

  const run = async (work: () => Promise<{ error: string | null }>) => {
    setBusy(true);
    setError(null);
    const result = await work();
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  const onCropChange = (crop: ImageCrop) => {
    // Kayıt yoksa kırpacak dosya da yok; kırpma penceresi bu hâlde zaten önce yükleme yaptırır.
    if (!image.id) return;
    void run(() => saveSiteImageCropAction(image.id!, crop));
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={spec.label}
      subtitle={spec.where}
      maxWidth={520}
      footer={
        <div className="flex w-full items-center gap-2.5">
          {/* Kaldırma yıkıcı değil: sayfa yer tutucusuna döner, dosya kovada kalır ve aynı yere yükleme onu ezer. */}
          {image.id ? (
            <Button variant="secondary" disabled={busy} onClick={() => void run(() => clearSiteImageAction(image.slot))}>
              Görseli kaldır
            </Button>
          ) : null}
          <Button variant="dark" className="ml-auto" onClick={onClose}>
            Kapat
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="max-w-[340px]">
          <ImageCropField
            role={spec.role}
            src={image.url}
            crop={image.crop}
            onCropChange={onCropChange}
            upload={(form) => uploadSiteImageAction(image.slot, form)}
            caption="müşteride görünüm"
          />
        </div>

        {/* Görsel yokken alan çizilmez: yazılacak kayıt yokken yazdığını sandırmak en sessiz hata olurdu. */}
        {image.id ? (
          <LocalizedTextField
            value={alt}
            onChange={setAlt}
            onBlur={() => void run(() => saveSiteImageAltAction(image.id!, alt))}
            label="Alternatif metin"
            layout="tabs"
            maxLength={160}
            placeholder={(lang) => (lang === 'tr' ? 'Görselin ne anlattığı' : lang === 'fr' ? 'Ce que montre l’image' : 'Was das Bild zeigt')}
            hint={`Ekran okuyucuya söylenen cümle. Boş bırakılırsa varsayılan: ${spec.altFallback}.`}
          />
        ) : (
          <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-faint">
            Alternatif metin görsel yüklendikten sonra yazılır — bir görselin cümlesidir.
          </span>
        )}

        {error ? <span className="font-ops-body text-ops-xs font-semibold text-ops-red">{error}</span> : null}
      </div>
    </Dialog>
  );
}
