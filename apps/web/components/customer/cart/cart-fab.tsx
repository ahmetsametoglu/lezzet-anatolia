'use client';

import { Link } from '@/i18n/navigation';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { useCart } from './cart-context';

/**
 * Yüzen sepet düğmesi, native `CartFab`ın telefon görünümü ikizi: sepet boşken ve ilk okuma bitmeden hiç çizilmez, doluyken adedi
 * rozetle söyler. Düğme ekranın yerleşim kararıyla konumlanır: sekme köklerinde çubuğun üstünde (`tab-bar`), detay ekranlarında
 * alttan güvenli alan payıyla (`detail`).
 */
interface CartFabProps {
  /** Ekran okuyucu adı ("Sepetim" / "Mon panier") — i18n çağıranda çözülür; adet ona eklenir. */
  label: string;
  placement: 'tab-bar' | 'detail';
}

export function CartFab({ label, placement }: CartFabProps) {
  const { view, ready } = useCart();
  const count = view.itemCount;
  if (!ready || count <= 0) return null;

  return (
    <Link
      href="/cart"
      aria-label={`${label} (${count})`}
      title={label}
      className={[
        'flex size-14 cursor-pointer items-center justify-center rounded-full bg-olive text-card shadow-hard transition-[background-color,translate,box-shadow] hover:bg-olive-dark active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
        placement === 'tab-bar'
          ? 'absolute right-[18px] bottom-[calc(100%+20px)]'
          : 'fixed right-[18px] bottom-[calc(112px+max(0px,env(safe-area-inset-bottom)-14px))] z-30',
      ].join(' ')}
    >
      <MobileIcon name="cart" size={23} />
      {/* Rozet ekran okuyucuya ayrıca okunmaz: adet düğmenin adında (native kural). */}
      <span
        aria-hidden
        className="absolute -top-1 -right-0.5 rounded-xl border-[1.5px] border-sand-50 bg-terracotta px-1.5 py-0.5 font-sans text-micro font-bold text-card"
      >
        {count}
      </span>
    </Link>
  );
}
