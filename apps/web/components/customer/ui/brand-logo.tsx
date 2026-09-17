import { brand } from '@lezzet/brand';

interface BrandLogoProps {
  /** `header` site başlığı (44 px); `compact` ince başlık, giriş ve geri bildirim (40 px). */
  size?: 'header' | 'compact';
  /** Yanında markanın adı zaten okunuyorsa boş verilir. */
  alt?: string;
}

const HEIGHT = { header: 'h-[44px]', compact: 'h-[40px]' } as const;

/**
 * Üst üste logo. Dosyalar 44 px'in tam 1-2-3 katı: tarayıcı büyük tek bir dosyayı küçültünce harf kenarları bulanıklaşıyordu.
 */
export function BrandLogo({ size = 'header', alt = brand.name }: BrandLogoProps) {
  return (
    <img
      src="/logo-dikey.png"
      srcSet="/logo-dikey.png 1x, /logo-dikey@2x.png 2x, /logo-dikey@3x.png 3x"
      alt={alt}
      className={`${HEIGHT[size]} w-auto`}
    />
  );
}
