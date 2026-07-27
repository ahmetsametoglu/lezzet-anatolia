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
  /** Kapsayıcıyı doldur: `w-full` + `ratio` en-boy oranı (form görsel önizlemesi gibi). */
  fluid?: boolean;
  /**
   * `fluid` en-boy oranı (genişlik ÷ yükseklik); varsayılan 1 = kare. Görsel `object-cover` ile
   * kırpıldığı için oran ÖNEMLİ: kutu oranı kaynaktan çok saparsa görselin büyük kısmı kesilir.
   * Ör. paylaşım (OG) kartı önizlemesi ≈ 1.91 → kartta gerçekte ne görüneceğini gösterir.
   */
  ratio?: number;
  iconSize?: number;
  className?: string;
}

export function Thumbnail({ src, alt, size, fluid = false, ratio = 1, iconSize, className }: ThumbnailProps) {
  return (
    <div
      style={fluid ? { aspectRatio: ratio } : { width: size, height: size }}
      className={[
        'grid place-items-center overflow-hidden rounded-[10px] border border-ops-gray-300 bg-ops-line text-ops-gray-700',
        fluid ? 'w-full' : 'flex-none',
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
