/*
  Eğik rozet — fiyat çipi, "Tükendi", indirim, "TOPTAN" hep budur; açı içeriğe göre değiştiği için prop, tonlar token'dan.
  Dönüş satır içi `rotate` özelliğiyle: Tailwind derleme anında bilinmeyen açıdan sınıf üretemez, `transform` da basılı ölçeklemeyle çakışırdı.
*/

type TagTone = 'terracotta' | 'ink' | 'cream' | 'sand' | 'muted';

const TONE: Record<TagTone, string> = {
  terracotta: 'bg-terracotta text-card',
  ink: 'bg-ink text-sand-50',
  cream: 'bg-sand-50 text-ink',
  sand: 'bg-sand-150 text-olive-dark',
  muted: 'bg-muted text-card',
};

interface TagProps {
  /** Rozet metni — çeviri çağıranda çözülür, komponent metin gömmez. */
  label: string;
  tone?: TagTone;
  /** Derece cinsinden dönüş (tasarım aralığı −7…+6); varsayılan düz. */
  rotate?: number;
  /** Rozetin kendi gölgesi — fotoğrafın ya da kartın üstünde yüzen rozetler taşır. */
  shadow?: boolean;
  /** Köşe kademesi: `badge` (12) ya da `pill` hap köşe. */
  shape?: 'badge' | 'pill';
  /** Boy: `lg` paket listesinin büyük fiyat rozeti (15 px yazı, 16 köşe). */
  size?: 'md' | 'lg';
}

export function Tag({ label, tone = 'terracotta', rotate = 0, shadow = false, shape = 'badge', size = 'md' }: TagProps) {
  return (
    <span
      style={rotate === 0 ? undefined : { rotate: `${rotate}deg` }}
      className={[
        'inline-block font-sans leading-[1.2] whitespace-nowrap',
        size === 'lg' ? 'px-3.5 py-2 text-chip' : 'px-3 py-1.5 text-badge',
        shape === 'pill' ? 'rounded-pill' : size === 'lg' ? 'rounded-control' : 'rounded-badge',
        TONE[tone],
        shadow ? 'shadow-badge' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {label}
    </span>
  );
}
