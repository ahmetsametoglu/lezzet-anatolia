'use client';

import { Link } from '@/i18n/navigation';
import { MobileCustomerIcon } from '@/components/customer/ui/mobile-icon';
import { useCart } from './cart-context';

/**
 * Yüzen sepet düğmesi — native `CartFab`ın (`screens/customer-kit/cart-fab.tsx`) telefon görünümü
 * ikizi (kullanıcı kararı 14.09: gezinme native'in modeli, sepet sekme değil).
 *
 * Native kuralları aynen: sepet BOŞKEN hiç çizilmez (boş bir sepete davet etmenin anlamı yok),
 * doluyken adedi terracotta rozetle söyler; `sand-50` halka rozeti zeytin daireden ayırır. İlk okuma
 * bitmeden de çizilmez — sunucudaki sepeti görmeden düğme gösterip kaybolması bir anlık yalan olurdu.
 * Ölçüler native'in: 56px daire, sert gölge; basılınca gölgeyi yutar (3px kayar — karar #8).
 *
 * Düğme ekranın yerleşim kararıyla konumlanır (native'de de öyle): sekme köklerinde çubuğun 20px
 * üstünde (`tab-bar` — çubuğun içinde durur, çubukla birlikte yapışır), ürün/paket/tarif detayında
 * alttan 112px + güvenli alan payı (`detail` — native `productFabBottom`).
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
      <MobileCustomerIcon name="cart" size={23} />
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
