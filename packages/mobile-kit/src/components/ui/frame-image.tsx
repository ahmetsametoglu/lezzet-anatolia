import { frameUrlFor, type CatalogImage, type FrameBox } from '@lezzet/types';
import { useState } from 'react';
import { Image, PixelRatio, type ImageProps, type LayoutChangeEvent } from 'react-native';

/*
  ÇERÇEVELİ GÖRSEL (21.303) — katalog görselinin native'deki TEK çizim ilkeli. Web'deki `FramedImage`in
  (`apps/web/components/media/framed-image.tsx`) karşılığı ve AYNI kapıdan seçer (`frameUrlFor`,
  `@lezzet/types`): kutunun ORANI hangi CDN çerçevesinin, BOYU hangi basamağın geleceğini söyler. Seçim
  kuralı bu dosyada YAZILMAZ — merkezi kütüphanededir, iki yüzey aynı görseli aynı çerçeveden çeker
  (kullanıcı kararı 10.09: "merkezi kütüphane, web ile kod tekrarı yok").

  ── NEDEN KUTU ÖLÇÜLÜYOR ─────────────────────────────────────────────────────
  Tarayıcı basamağı `srcset` + `sizes` ile kendisi seçer; RN seçemez: `srcSet`i yalnız yoğunluk
  betimleyicisiyle (`2x`) okuyor, genişlik betimleyicisini (`400w`) uyarıyla yok sayıyor (ölçüldü: RN 0.86
  `Libraries/Image/ImageSourceUtils.js`). Burada seçimi kutunun kendisi yapar: boyu çağırandan biliniyorsa
  (`box` — daire çapı) ilk karede, bilinmiyorsa `onLayout` ile ölçüp. Ölçüm gelene kadar adres istenmez —
  yanlış basamak indirmektense bir kare beklemek ucuz.

  ── NEDEN KIRPMA YAZILMIYOR ──────────────────────────────────────────────────
  Türev operatörün odak+zoom kadrajıyla ZATEN kesilmiş ve kutunun oranına en yakın çerçevede geliyor;
  `cover` yalnız iki oran arasındaki küçük farkı keser. CDN türevi yoksa (`frames: null` — yerelde r2.dev
  tabanı, ya da kaynak ölçüsü bilinmiyor) özgün dosya gelir ve kadraj merkezdedir: RN'de CSS'in
  `object-position`ının karşılığı yok, o yol yalnız yedektir.

  ── EN YAKIN ÇERÇEVE, TAM KARŞILIK DEĞİL ─────────────────────────────────────
  Seçim kutunun oranına EN YAKIN anahtarı alır; anahtar kümesi burada yazılı değil, `FRAME_RATIOS`ten
  gelir. Dört native kutu artık kendi oranına oturuyor: tarif rafı (220 × 280 = 0,79) ve ekranı dolduran
  keşif kartı dikey 4:5'i, tarif listesi (350 × 168 = 2,08) ve vitrin paket kartı (350 × 172 = 2,03)
  geniş 2:1'i alıyor. İki anahtar web şeridinden geldi (`bd1545c6`) ve bu dosya DEĞİŞMEDEN onları seçti;
  önceden kare ve sohbet çerçevesini (1,91) alıp aradaki büyük farkı `cover` ile kesiyordu.

  ── NEDEN `Accept` BAŞLIĞI ───────────────────────────────────────────────────
  CDN `format=auto` dosya biçimini isteğin `Accept` başlığından seçiyor. Ölçüldü 10.09, aynı kare türev
  (200 · 400 · 800): başlıksız ya da yalnız joker kabul eden istek → JPEG 2.645 · 6.380 · 17.004 B;
  WebP isteyene → 1.770 · 4.420 · 11.862 B, yani ~%30 küçük. Tarayıcı bu başlığı kendiliğinden
  gönderiyor (web AVIF alıyor); native'in ağ katmanı göndermiyor, başlık verilmezse uygulama her
  görselde JPEG iner. AVIF İSTENMEZ: Android'in çözücüsü (Fresco) AVIF açmıyor. Dönüşüm sayısı
  değişmez — `format=auto` biçimden bağımsız TEK dönüşüm sayılıyor.
*/

/**
 * CDN görsel isteğinin başlığı — WebP'yi açıkça ister (künye: "NEDEN `Accept` BAŞLIĞI"). Adresi hazır
 * gelen CDN küçük resimleri de (`CirclePhoto.photoUri` — operasyonun `thumbnailImageUrl`i) aynı başlıkla
 * istenir; kural tek yerde.
 */
export const CDN_IMAGE_HEADERS: Record<string, string> = { Accept: 'image/webp,*/*' };

type FrameImageProps = Omit<ImageProps, 'source' | 'resizeMode'> & {
  image: CatalogImage;
  /** Kutu çağırandan biliniyorsa (daire çapı gibi) ölçüm beklenmez — görsel ilk karede istenir. */
  box?: FrameBox;
};

export function FrameImage({ image, box, onLayout, ...rest }: FrameImageProps) {
  const [measured, setMeasured] = useState<FrameBox | null>(null);
  const size = box ?? measured;
  const uri = !image.frames ? image.url : size === null ? null : frameUrlFor(image, size, PixelRatio.get());

  /* Ölçüm yalnız kutu bilinmiyorsa ve türev varsa gerekir; tam sayıya yuvarlanır ki alt-piksel
     titreşimi aynı kutuyu yeniden "değişti" saydırmasın. */
  const measure = (event: LayoutChangeEvent) => {
    onLayout?.(event);
    const width = Math.round(event.nativeEvent.layout.width);
    const height = Math.round(event.nativeEvent.layout.height);
    if (width > 0 && height > 0 && (measured?.width !== width || measured?.height !== height)) setMeasured({ width, height });
  };

  return (
    <Image
      accessibilityIgnoresInvertColors
      {...rest}
      source={uri === null ? undefined : { uri, headers: CDN_IMAGE_HEADERS }}
      resizeMode="cover"
      onLayout={box === undefined && image.frames ? measure : onLayout}
    />
  );
}
