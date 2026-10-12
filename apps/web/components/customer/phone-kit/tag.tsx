/*
  Eğik rozet — fiyat çipi, "Tükendi", indirim, "TOPTAN" hep budur; açı içeriğe göre değiştiği için prop, tonlar token'dan.
  Dönüş satır içi `rotate` özelliğiyle: Tailwind derleme anında bilinmeyen açıdan sınıf üretemez, `transform` da basılı ölçeklemeyle çakışırdı.
*/

type TagTone = 'terracotta' | 'soft' | 'ink' | 'cream' | 'sand' | 'olive' | 'muted' | 'blocked';

const TONE: Record<TagTone, string> = {
  terracotta: 'bg-terracotta text-card',
  soft: 'bg-terracotta-bg text-terracotta',
  ink: 'bg-ink text-sand-50',
  cream: 'bg-sand-50 text-ink',
  sand: 'bg-sand-150 text-olive-dark',
  // Hak edilmiş ödül: değerlendirmede yorum puanı kazanılınca rozet zeytine döner.
  olive: 'bg-olive text-card',
  muted: 'bg-muted text-card',
  // Bu adrese gitmeyen ürünün fiyat çipi: terracotta "al" diyen bir vurgudur, o karta yakışmaz.
  blocked: 'bg-sand-650 text-card',
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
