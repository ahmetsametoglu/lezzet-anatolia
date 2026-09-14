'use client';

import { FunnelHeader } from '@/components/customer/ui/funnel-header';
import { Icon } from '@/components/customer/ui/icons';
import { AccountLine, AddressStep, DeliveryStep, OrderSummary, PaymentStep } from './components/checkout-steps';
import { CheckoutProgress } from './components/checkout-progress';
import { CheckoutStepsSkeleton } from './components/checkout-skeleton';
import { ShippingOrderNote } from './components/shipping-order-note';
import type { CheckoutViewProps } from './checkout-types';

/**
 * Checkout · mobil (tasarım: "açılmış tam akış" — bölümler alt alta, özet en altta).
 *
 * Özet SONA gelir, yapışkan değil: dar ekranda kalıcı bir özet paneli, üzerinde karar verilen
 * adımın yerini yerdi. Yerine üstteki **şerit** yapışkan olur — tutarı ve kalan adımları taşır,
 * tek satır yer kaplar (desen: `~/dev/petitcigogne`).
 *
 * Kimlik ve adres SEPETTE çözülür (13.09); buraya girişsiz gelinmez (sayfa sepete çevirir).
 */
export function CheckoutMobile(props: CheckoutViewProps) {
  const { t } = props;

  return (
    // Kökte YATAY PED YOK: yapışkan kimlik barı sayfa boyu yapışabilsin diye başlık kökün
    // doğrudan çocuğu (`FunnelHeader` künyesi); içerik kendi pedli sarmalayıcısında.
    <div className="flex w-full flex-col pt-2 pb-5">
      {/* Huninin ORTAK başlığı — sepetin bir parçası olan kargo siparişinde eyebrow kendini söyler. */}
      <FunnelHeader
        backLabel={t.backLabel}
        fallback="/cart"
        eyebrow={props.separateOrder ? t.shippingEyebrow : t.eyebrow}
        title={t.title}
      />

      <div className="flex flex-col gap-3.5 px-4 pt-3.5">
        {/* Şerit sarmalayıcının İLK çocuğu: başlığın hemen altında akar, kaydırınca kimlik barının
            altına yapışır (altıncı tur). Sarmalayıcı sayfa sonuna kadar uzadığı için yapışma da
            sayfa boyu sürer — künyedeki kapsama dersi burada kendiliğinden sağlanıyor. */}
        <CheckoutProgress {...props} />
        <ShippingOrderNote {...props} />
        <AccountLine t={t} email={props.customerEmail} compact={props.compact} />
        {/* Adım verisi istemcide çözülüyor: bitmeden adımlar çizilmez (masaüstüyle aynı gerekçe). */}
        {props.snapshotReady ? (
          <>
            <AddressStep {...props} />
            <DeliveryStep {...props} />
            <PaymentStep {...props} />
          </>
        ) : (
          <CheckoutStepsSkeleton t={t} compact={props.compact} />
        )}

        <OrderSummary {...props} />

        {/* Güven satırı en altta: mobilde başlık zaten dar, ve kart alanına gelen müşteri sayfanın
            sonuna inmiş oluyor — cümle tam orada işe yarıyor. */}
        <span className="flex items-center justify-center gap-1.5 font-sans text-micro font-semibold text-muted">
          <Icon name="lock" size={13} />
          {t.secure}
        </span>
      </div>
    </div>
  );
}
