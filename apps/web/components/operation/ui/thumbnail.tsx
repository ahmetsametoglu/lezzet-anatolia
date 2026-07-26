import { ImageIcon } from './icons';

/**
 * Küçük görsel kutusu — görsel varsa <img>, yoksa placeholder ikon. Tek yerde (ürün önizleme, mobil
 * liste/sheet, ileride müşteri avatarı…) → placeholder markup'ı tekrarlanmaz (no-duplication kuralı).
 * `size` px kenar; `src` yoksa/eksikse zarifçe placeholder'a düşer.
 */
interface ThumbnailProps {
  src: string | null;
  alt: string;
  size: number;
  iconSize?: number;
  className?: string;
}

export function Thumbnail({ src, alt, size, iconSize, className }: ThumbnailProps) {
  return (
    <div
      style={{ width: size, height: size }}
      className={[
        'grid flex-none place-items-center overflow-hidden rounded-[10px] border border-[#e0e2da] bg-[#e9eae4] text-[#b3b7ac]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <ImageIcon size={iconSize ?? Math.round(size * 0.36)} />
      )}
    </div>
  );
}
