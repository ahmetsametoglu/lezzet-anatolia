import { ImageIcon } from './icons';

/**
 * Görsel kutusu — görsel varsa <img>, yoksa placeholder ikon. Tek yerde (ürün önizleme, mobil
 * liste/sheet, form görsel alanı, ileride müşteri avatarı…) → placeholder markup'ı tekrarlanmaz
 * (no-duplication kuralı). `size` px kenar (sabit); `fluid` ise kapsayıcıyı doldurur (kare, büyük
 * önizleme). `src` yoksa/eksikse zarifçe placeholder'a düşer.
 */
interface ThumbnailProps {
  src: string | null;
  alt: string;
  /** Sabit kenar (px). `fluid` verildiğinde yok sayılır. */
  size?: number;
  /** Kapsayıcıyı doldur: `w-full` + kare (form görsel önizlemesi gibi). */
  fluid?: boolean;
  iconSize?: number;
  className?: string;
}

export function Thumbnail({ src, alt, size, fluid = false, iconSize, className }: ThumbnailProps) {
  return (
    <div
      style={fluid ? undefined : { width: size, height: size }}
      className={[
        'grid place-items-center overflow-hidden rounded-[10px] border border-[#e0e2da] bg-[#e9eae4] text-[#b3b7ac]',
        fluid ? 'aspect-square w-full' : 'flex-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <ImageIcon size={iconSize ?? Math.round((size ?? 96) * 0.36)} />
      )}
    </div>
  );
}
