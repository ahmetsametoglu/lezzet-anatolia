'use client';

import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import { focusRingClass } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';
import { formatPrice } from '@/lib/storefront/format';
import { useCart } from './cart-context';

/**
 * Masaüstü başlığının sepet hapı: adet ve sepetin toplamı ("8 ürün · 103,20 €"), boşken "Sepet boş". İlk okuma bitmeden sayı yazılmaz, çünkü
 * sunucudaki sepeti görmeden "Sepet boş" demek girişli müşteriye sepetini kaybetmiş gibi bir an yaşatırdı.
 */
interface CartPillProps {
  locale: Locale;
  /** Ekran okuyucu adı ve ilk okuma öncesi metin ("Sepetim"). */
  label: string;
  copy: { items: string; itemsOne: string; empty: string };
}

export function CartPill({ locale, label, copy }: CartPillProps) {
  const { view, ready } = useCart();
  const count = view.itemCount;
  const text = !ready
    ? label
    : count > 0
      ? (count === 1 ? copy.itemsOne : copy.items).replace('{n}', String(count)).replace('{total}', formatPrice(view.totalCents, locale))
      : copy.empty;

  return (
    <Link
      href="/cart"
      aria-label={label}
      title={label}
      className={`flex flex-none cursor-pointer items-center gap-2.25 rounded-pill bg-ink px-4.25 py-2.5 font-sans text-note font-bold whitespace-nowrap text-sand-50 transition-colors hover:bg-ink-hover ${focusRingClass}`}
    >
      <Icon name="basket" size={19} />
      <span>{text}</span>
    </Link>
  );
}
