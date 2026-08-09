'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IMAGE_ROLES, type ImageCrop, type LocalizedText } from '@lezzet/types';
import { Button } from '@/components/operation/ui/button';
import { ImageCropField } from '@/components/operation/form/image-crop-field';
import { LocalizedTextField } from '@/components/operation/form/localized-text-field';
import { clearSiteImageAction, saveSiteImageAltAction, saveSiteImageCropAction, uploadSiteImageAction } from './site-image-actions';
import { SITE_IMAGE_CATALOG } from './site-images-catalog';
import type { SiteImageView } from './site-images-read';

/**
 * VİTRİN GÖRSELLERİ sekmesi (09.16 · `site_image`) — müşteri yüzeyindeki dört "sayfa yeri"nin
 * görselleri: ana sayfa kahramanı, Paketler ve Professionnels kahramanları, boş sepet çizimi.
 *
 * ── NEDEN AYARLARDA, KENDİ EKRANINDA DEĞİL ──────────────────────────────────
 * Tasarımın kendi yerleşimi (`Operasyon - Ayarlar.dc.html`, 7. sekme) ve doğru: bunlar veriyle
 * büyümeyen, doğal tavanı olan bir kümedir (dört slot, migration'la büyür) ve kurulum işidir —
 * kataloğun yanına konsaydı her gün bakılan bir liste gibi görünürdü.
 *
 * ── DÖRT KART, TEK BİLEŞEN ──────────────────────────────────────────────────
 * Oran slot'a göre değişiyor (16:9 · 3:2 · 13:10) ve aynı fotoğraf bu çerçevelere farklı oturuyor,
 * bu yüzden her kart kendi kırpma önizlemesini gösteriyor. Ama dört ayrı yükleyici YAZILMADI: kart
 * tek, çerçeveyi sözlükten (`SITE_IMAGE_CATALOG`) parametre alıyor.
 *
 * ── KAYIT ANINDA, "Kaydet" DÜĞMESİ YOK ──────────────────────────────────────
 * Kardeş ekranlarda görsel bir FORMUN parçası (ürün formu kaydedilince kırpım da yazılır); burada
 * form yok — dört bağımsız kayıt var. Kırpma diyalogdan onaylanınca yazılıyor, alt metin alandan
 * çıkınca. Toplu bir "Kaydet" düğmesi, dört slotu tek işlem sanmaya iterdi.
 */
interface SiteImagesTabProps {
  images: SiteImageView[];
}

export function SiteImagesTab({ images }: SiteImagesTabProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
        Müşteri yüzeyindeki sabit görseller. Yüklenmemiş slot bir arıza değildir — sayfa kendi yer tutucusunu
        çizmeye devam eder. Dosya HAM saklanır, kadraj görüntüleme anında uygulanır: aynı fotoğrafı iki farklı
        çerçevede kullanabilmenin yolu bu.
      </p>

      <div className="grid grid-cols-2 gap-4">
        {images.map((image) => (
          <SlotCard key={image.slot} image={image} />
        ))}
      </div>
    </div>
  );
}

function SlotCard({ image }: { image: SiteImageView }) {
  const router = useRouter();
  const spec = SITE_IMAGE_CATALOG[image.slot];
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Alt metin YEREL taslakta: her tuşta sunucuya gitmek, üç dilli bir alanda onlarca tur demekti.
  // Yazma alandan ÇIKINCA (`onBlur`) — kaydet düğmesi koymak dört kartta dört düğme üretirdi.
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
    // Kayıt YOKSA yazacak bir şey de yok: kırpma bir dosyanın odağıdır, dosyasız odak yoktur.
    // (Diyalog bu hâlde zaten önce yükleme yaptırıyor; koruma ikinci kapı.)
    if (!image.id) return;
    void run(() => saveSiteImageCropAction(image.id!, crop));
  };

  return (
    <div className="flex flex-col gap-3 rounded-ops-card border border-ops-line bg-ops-white px-4 py-3.5">
      <div className="flex items-baseline gap-2">
        <span className="font-ops-display text-ops-base font-semibold text-ops-ink">{spec.label}</span>
        <span className="ml-auto font-ops-mono text-ops-micro text-ops-faint">{IMAGE_ROLES[spec.role].label}</span>
      </div>
      <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">{spec.where}</span>

      {/* Genişlik SINIRLI: boş slotun yer tutucusu oranına göre çiziliyor ve kartın tamamını
          kaplayınca ekran dört büyük boşluk hâline geliyordu. Sınır kadrajı da dürüst tutuyor —
          önizleme müşterideki boyu değil, oranı gösterir. */}
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

      {/* Alt metin ÇOK DİLLİ ve isteğe bağlı — yazılmazsa sayfanın kendi cümlesi kalır. Hangi
          davranışın geçerli olduğu slot'a göre değişiyor ve künye onu söylüyor: dekoratif
          görselde varsayılan BOŞ, yani boş bırakmak bir eksiklik değil bir karardır.

          **Görsel yokken alan HİÇ ÇİZİLMİYOR** — bir tur çizilip yazma yolu kapalı bırakılmıştı ve
          bu, operatöre yazdığını sandırmanın en sessiz yolu: kayıt yoksa yazılacak satır da yok.
          Yerine ne yapması gerektiğini söyleyen tek cümle duruyor. */}
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

      <div className="flex items-center gap-2">
        {error ? <span className="mr-auto font-ops-body text-ops-xs font-semibold text-ops-red">{error}</span> : null}
        {/* Boşaltma yalnız DOLU slotta ve `destructive` değil: görsel silinince sayfa yer
            tutucusuna döner, veri kaybolmaz — dosya kovada, aynı slota yükleme onu ezer. */}
        {image.id ? (
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            disabled={busy}
            onClick={() => void run(() => clearSiteImageAction(image.slot))}
          >
            Görseli kaldır
          </Button>
        ) : (
          <span className="ml-auto font-ops-body text-ops-xs text-ops-faint">Slot boş — sayfa yer tutucusunu çiziyor</span>
        )}
      </div>
    </div>
  );
}
