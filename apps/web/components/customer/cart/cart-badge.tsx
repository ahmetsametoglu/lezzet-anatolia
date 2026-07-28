'use client';

import { Link } from '@/i18n/navigation';
import { useCart } from './cart-context';

/**
 * K12 · Başlıktaki sepet ikonu ve sayacı.
 *
 * Sayı yalnız sepet DOLUYKEN çizilir (tasarım): boş sepette "0" rozeti, olmayan bir şeyi vurgular.
 * İlk okuma bitene kadar da çizilmez — sunucudaki sepeti görmeden "0" göstermek, girişli müşteriye
 * sepetini kaybetmiş gibi bir an yaşatır.
 */
interface CartBadgeProps {
  label: string;
  compact?: boolean;
}

export function CartBadge({ label, compact = false }: CartBadgeProps) {
  const { view, ready } = useCart();
  const count = view.itemCount;

  return (
    <Link href="/cart" aria-label={label} title={label} className="relative cursor-pointer">
      <span className={['font-sans text-ink', compact ? 'text-icon-sm' : 'text-icon'].join(' ')}>🧺</span>
      {ready && count > 0 && (
        <span className="absolute -top-1.5 -right-2 rounded-soft bg-terracotta px-1.5 py-px font-sans text-micro font-bold text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
