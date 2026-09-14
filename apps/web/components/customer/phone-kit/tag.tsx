/*
  EĞİK ROZET — native `apps/mobile/src/components/ui/tag.tsx`in web telefon görünümündeki ikizi (14.09).
  Fiyat çipi · "Tükendi" · indirim · "TOPTAN" · takip çipi hep budur; imzası hafif dönüştür ve açı
  içeriğe göre değiştiği için PROP. Dört ton token'dan: terracotta (fiyat/fırsat) · ink (koyu vurgu) ·
  cream (fotoğraf ve koyu blok üstünde) · sand (yumuşak vurgu). Yazı ve gölge rozetin KENDİ
  kademesinden (`text-badge`, `shadow-badge` — Token Kararlari #16).

  Dönüş satır içi `rotate` ile: açı çağırandan gelen bir sayı ve Tailwind derleme anında bilinmeyen bir
  değerden sınıf üretemez. `transform` değil `rotate` özelliği — basılı ölçekleme (`scale`) ile
  çakışmasın.
*/

type TagTone = 'terracotta' | 'ink' | 'cream' | 'sand';

const TONE: Record<TagTone, string> = {
  terracotta: 'bg-terracotta text-card',
  ink: 'bg-ink text-sand-50',
  cream: 'bg-sand-50 text-ink',
  sand: 'bg-sand-150 text-olive-dark',
};

interface TagProps {
  /** Rozet metni — çeviri çağıranda çözülür, komponent metin gömmez. */
  label: string;
  tone?: TagTone;
  /** Derece cinsinden dönüş (tasarım aralığı −7…+6); varsayılan düz. */
  rotate?: number;
  /** Rozetin kendi gölgesi — fotoğrafın ya da kartın üstünde yüzen rozetler taşır. */
  shadow?: boolean;
  /** Köşe kademesi: `badge` (12) bugünkü kullanımların hepsi; `pill` hap köşe (kampanya rozeti, 23.08). */
  shape?: 'badge' | 'pill';
}

export function Tag({ label, tone = 'terracotta', rotate = 0, shadow = false, shape = 'badge' }: TagProps) {
  return (
    <span
      style={rotate === 0 ? undefined : { rotate: `${rotate}deg` }}
      className={[
        'inline-block px-3 py-1.5 font-sans text-badge leading-[1.2] whitespace-nowrap',
        shape === 'pill' ? 'rounded-pill' : 'rounded-badge',
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
