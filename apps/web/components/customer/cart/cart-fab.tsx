'use client';

import { Link } from '@/i18n/navigation';
import { useCart } from './cart-context';

/**
 * Yüzen sepet düğmesi — native `CartFab`ın web karşılığı (kullanıcı kararı 20.08, sekizinci tur).
 *
 * Başlıksız detay sayfalarında (ürün/paket) sepete giden yol bu: üst bar kalktı, sabit satın alma
 * çubuğu akışa indi — sepet ne bir sekme ne bir bar, sağ altta duran bir daire. Native kuralları
 * aynen: sepet BOŞKEN hiç çizilmez (boş bir sepete davet etmenin anlamı yok), doluyken adedi
 * terracotta rozetle söyler; krem halka rozeti zeytin daireden ayırır. İlk okuma bitmeden de
 * çizilmez — sunucudaki sepeti görmeden düğme gösterip kaybolması bir anlık yalan olurdu.
 */
interface CartFabProps {
  /** Ekran okuyucu adı ("Sepetim" / "Mon panier") — i18n çağıranda çözülür. */
  label: string;
}

export function CartFab({ label }: CartFabProps) {
  const { view, ready } = useCart();
  const count = view.itemCount;
  if (!ready || count <= 0) return null;

  return (
    <Link
      href="/cart"
      aria-label={label}
      title={label}
      className="fixed right-4 bottom-5 z-30 flex size-14 cursor-pointer items-center justify-center rounded-full bg-olive text-white shadow-lg transition-colors hover:bg-olive-dark"
    >
      {/* Alışveriş çantası (klasik "shopping bag" çizimi): ilk deneme dikdörtgen gövde + kulptu ve
          ekranda çöp kutusu gibi okundu — gövdenin alta doğru genişlemesi ve üstteki kulp kavisi
          ayrımı yapan iki çizgi. */}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
      {/* Rozet ekran okuyucuya AYRICA okunmaz: düğmenin adı zaten sepeti söylüyor (native kural). */}
      <span
        aria-hidden
        className="absolute -top-1 -right-1 rounded-pill border-2 border-cream bg-terracotta px-1.5 py-px font-sans text-micro font-bold text-white"
      >
        {count}
      </span>
    </Link>
  );
}
