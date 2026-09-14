'use client';

import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import { focusRingClass } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';
import { formatPrice } from '@/lib/storefront/format';
import { cartPayableCents } from '@/lib/cart/cart-types';
import { useCart } from './cart-context';

/**
 * Masaüstü başlığının sepet hapı (v1, 13.09) — koyu hap, içinde adet ve ÖDENECEK tutar
 * ("8 ürün · 103,20 €"), boşken "Sepet boş".
 *
 * Tutar `cartPayableCents`ten: mobil sepet çubuğunun kuralı (kullanıcı kararı 19.08 — *"nereye
 * bakarsanız bakın ödenecek tutarı görürsünüz"*). İlk okuma bitmeden sayı yazılmaz — sunucudaki
 * sepeti görmeden "Sepet boş" demek girişli müşteriye sepetini kaybetmiş gibi bir an yaşatır
 * (`CartBadge` künyesi); o arada hap yalnız adını taşır.
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
      ? (count === 1 ? copy.itemsOne : copy.items).replace('{n}', String(count)).replace('{total}', formatPrice(cartPayableCents(view), locale))
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
