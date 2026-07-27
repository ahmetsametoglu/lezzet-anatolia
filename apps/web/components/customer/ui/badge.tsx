import type { ReactNode } from 'react';

/**
 * K5 · Rozet — kısa durum/sınır etiketi ("En fazla 5 adet", "Yeni", "Tükendi"). Semantik aile
 * seçilir, tonlar envanterin dört katmanından gelir (metin · zemin · kenarlık); çağıran yer renk
 * seçmez, ANLAM seçer.
 *
 * `plain` varyantı zeminsizdir: dar mobil kartlarda rozet kutusu satırı şişirdiği için yalnız
 * renkli metin kalır — anlam aynı, ağırlık farklı (tasarım: Anasayfa Mobil fırsat kartı).
 */
type BadgeTone = 'offer' | 'positive' | 'pending' | 'closed';

const TONE: Record<BadgeTone, { solid: string; plain: string }> = {
  offer: { solid: 'bg-terracotta-bg text-terracotta', plain: 'text-terracotta' },
  positive: { solid: 'bg-olive-bg text-olive-dark', plain: 'text-olive-dark' },
  pending: { solid: 'bg-honey-bg text-honey', plain: 'text-honey' },
  closed: { solid: 'bg-closed-bg text-closed', plain: 'text-closed' },
};

interface BadgeProps {
  tone: BadgeTone;
  /** Zeminsiz varyant (dar yerleşimde). */
  plain?: boolean;
  children: ReactNode;
}

export function Badge({ tone, plain = false, children }: BadgeProps) {
  const style = TONE[tone];
  return (
    <span
      className={[
        'w-max font-sans font-semibold',
        plain ? `text-micro ${style.plain}` : `rounded-soft px-2 py-0.5 text-note ${style.solid}`,
      ].join(' ')}
    >
      {children}
    </span>
  );
}
