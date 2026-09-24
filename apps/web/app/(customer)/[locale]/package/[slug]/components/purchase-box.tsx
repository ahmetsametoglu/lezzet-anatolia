'use client';

import { Button, buttonClass } from '@/components/customer/ui/button';
import { QtyStepper } from '@/components/customer/ui/qty-stepper';
import type { Locale } from '@lezzet/i18n';
import { useCart } from '@/components/customer/cart/cart-context';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { PlaceGate } from '@/components/customer/delivery/place-gate';
import type { Messages } from '../package-types';

/**
 * Paketin satın alma kontrolü ürün detayıyla aynı tek kontrol modelidir (`purchase-panel.tsx`): paket bütün eklenir, sepette değilken
 * düğme, sepetteyken aynı kutuda adet seçicisi durur. Adet tavanı yoktur, çünkü teklif partisi ve indirim pakete uygulanmaz (DOMAIN §13).
 */
interface PurchaseBoxProps {
  t: Messages;
  locale: Locale;
  bundleId: string;
  soldOut: boolean;
  /** Paket yalnız kapıya teslim edilebiliyor mu (`pack.inRouteOnly`); yer bilinmiyorken eylem posta kodu isteğine bırakır. */
  routeOnly?: boolean;
  /** Telefon akış yerleşimi: kontrol tam genişlik, çünkü dar ekranda yarım düğme küçük bir yetim olurdu. */
  flow?: boolean;
}

export function PurchaseBox({ t, locale, bundleId, soldOut, routeOnly = false, flow = false }: PurchaseBoxProps) {
  const { add, setQty, lineOf } = useCart();
  const { place, ready } = useDeliveryPlace();
  const inCart = soldOut ? null : lineOf({ bundleId });

  // Tükendi hâlinde adet seçici GİZLENİR (tasarım): seçilecek bir adet yok, kutu boşuna yer kaplar.
  const control = routeOnly && ready && !place ? (
    <PlaceGate locale={locale} />
  ) : soldOut ? (
    <Button variant="primary" size="md" fullWidth disabled>
      {t.addToCart}
    </Button>
  ) : inCart ? (
    <QtyStepper
      value={inCart.qty}
      onChange={(next) => setQty({ kind: 'bundle', bundleId }, next)}
      min={0}
      size="lg"
      fullWidth
    />
  ) : (
    <button
      type="button"
      onClick={() => add({ kind: 'bundle', bundleId, qty: 1 })}
      className={buttonClass({
        variant: 'primary',
        size: 'lg',
        fullWidth: true,
        // `text-lead`in 1.6 satır aralığı bir düğme etiketinde ~9 px fazladan yükseklik demek.
        // Seçici de aynı ölçüyü kullanır, iki kutu aynı kalır.
        className: 'border-2 border-transparent !px-4 !py-3 leading-tight whitespace-nowrap',
      })}
    >
      {t.addToCart}
    </button>
  );

  return <div className={flow ? 'w-full' : 'w-1/2 min-w-56'}>{control}</div>;
}
