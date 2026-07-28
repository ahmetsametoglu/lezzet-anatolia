import type { ReactNode } from 'react';

/**
 * K5 · Rozet — kısa durum/sınır etiketi ("En fazla 5 adet", "Yeni", "Tükendi"). Semantik aile
 * seçilir, tonlar envanterin dört katmanından gelir (metin · zemin · kenarlık); çağıran yer renk
 * seçmez, ANLAM seçer.
 *
 * ÜÇ AĞIRLIK vardır ve seçim ANLAMA değil, ROZETİN KOMŞUSUNA bağlıdır:
 *   `tint`   — açık zeminli; ferah yerleşimde varsayılan.
 *   `filled` — dolu zemin + beyaz metin: ADIN YANINDA, aynı satırda dururken. Açık ton orada
 *              başlığın içinde erir, rozetin ayrı bir şey olduğu görünmez (tasarım: sepet satırı).
 *   `plain`  — zeminsiz: dar mobil kartta rozet kutusu satırı şişirir, yalnız renkli metin kalır.
 */
type BadgeTone = 'offer' | 'positive' | 'pending' | 'closed';
type BadgeVariant = 'tint' | 'filled' | 'plain';

const TONE: Record<BadgeTone, Record<BadgeVariant, string>> = {
  offer: { tint: 'bg-terracotta-bg text-terracotta', filled: 'bg-terracotta text-white', plain: 'text-terracotta' },
  positive: { tint: 'bg-olive-bg text-olive-dark', filled: 'bg-olive text-white', plain: 'text-olive-dark' },
  pending: { tint: 'bg-honey-bg text-honey', filled: 'bg-honey text-white', plain: 'text-honey' },
  // Tükendi rozeti ANTRASİTtir (envanter K3): açık gri bir "kapalı" tonu, adın yanında kaybolur.
  closed: { tint: 'bg-closed-bg text-closed', filled: 'bg-ink text-white', plain: 'text-closed' },
};

const SHAPE: Record<BadgeVariant, string> = {
  tint: 'rounded-soft px-2 py-0.5 text-note',
  filled: 'rounded-soft px-2 py-0.5 text-micro',
  plain: 'text-micro',
};

interface BadgeProps {
  tone: BadgeTone;
  variant?: BadgeVariant;
  children: ReactNode;
}

export function Badge({ tone, variant = 'tint', children }: BadgeProps) {
  return (
    <span className={['w-max font-sans font-semibold', SHAPE[variant], TONE[tone][variant]].join(' ')}>{children}</span>
  );
}
