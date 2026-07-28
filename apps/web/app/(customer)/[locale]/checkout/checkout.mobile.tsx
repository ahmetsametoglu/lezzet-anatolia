'use client';

import { Link } from '@/i18n/navigation';
import { AccountLine, AddressStep, DeliveryStep, LockedStep, OrderSummary, PaymentStep } from './components/checkout-steps';
import { CheckoutProgress } from './components/checkout-progress';
import { GuestVerify } from './components/guest-verify';
import { CheckoutStepsSkeleton } from './components/checkout-skeleton';
import type { CheckoutViewProps } from './checkout-types';

/**
 * Checkout · mobil (tasarım: "açılmış tam akış" — bölümler alt alta, özet en altta).
 *
 * Özet SONA gelir, yapışkan değil: dar ekranda kalıcı bir özet paneli, üzerinde karar verilen
 * adımın yerini yerdi. Yerine üstteki **şerit** yapışkan olur — tutarı ve kalan adımları taşır,
 * tek satır yer kaplar (desen: `~/dev/petitcigogne`).
 */
export function CheckoutMobile(props: CheckoutViewProps) {
  const { t } = props;

  return (
    <div className="flex w-full flex-col gap-3.5 px-4 py-5">
      <div className="flex flex-col gap-1">
        <Link href="/cart" className="w-max cursor-pointer font-sans text-note font-semibold text-olive hover:text-olive-dark">
          {t.backToCart}
        </Link>
        <span className="font-sans text-micro font-semibold tracking-wide text-muted uppercase">{t.eyebrow}</span>
        <h1 className="font-serif text-h1-sm text-ink">{t.title}</h1>
      </div>

      <CheckoutProgress {...props} />

      {props.authenticated ? (
        <>
          <AccountLine t={t} email={props.customerEmail} compact={props.compact} />
          {/* Adım verisi istemcide çözülüyor: bitmeden adımlar çizilmez. Önce hiç çizilmiyordu
              (sayfa yarım görünüyordu) ve adres adımı veri gelmeden "kayıtlı adresiniz yok"
              diyordu — henüz bilinmeyen, üstelik yanlış olabilen bir hüküm. */}
          {props.snapshotReady ? (
            <>
              <AddressStep {...props} />
              <DeliveryStep {...props} />
              <PaymentStep {...props} />
            </>
          ) : (
            <CheckoutStepsSkeleton t={t} compact={props.compact} />
          )}
        </>
      ) : (
        <>
          <GuestVerify t={t} locale={props.locale} compact={props.compact} onVerified={props.onVerified} />
          <LockedStep step={t.address.step} title={t.address.title} hint={t.verify.locked} compact />
          <LockedStep step={t.delivery.step} title={t.delivery.title} hint={t.verify.locked} compact />
          <LockedStep step={t.payment.step} title={t.payment.title} hint={t.verify.locked} compact />
        </>
      )}

      <OrderSummary {...props} />

      {/* Güven satırı en altta: mobilde başlık zaten dar, ve kart alanına gelen müşteri sayfanın
          sonuna inmiş oluyor — cümle tam orada işe yarıyor. */}
      <span className="text-center font-sans text-micro font-semibold text-muted">🔒 {t.secure}</span>
    </div>
  );
}
