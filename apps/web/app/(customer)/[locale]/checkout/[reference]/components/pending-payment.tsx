'use client';

import { useEffect, useRef, useState } from 'react';
import checkoutMessages from '@lezzet/i18n/customer/checkout';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import { useCart } from '@/components/customer/cart/cart-context';
import { Button } from '@/components/customer/ui/button';
import { Card } from '@/components/customer/ui/card';
import { useRouter } from '@/i18n/navigation';
import { formatPrice, formatTime } from '@/lib/storefront/format';
import { clientStripe } from '@/lib/stripe-client';
import { CardFields, CardPaymentScope, type CardFieldsHandle, type PayStage } from '../../components/payment-element';
import { takePaymentError } from '../../payment-error';
import { cancelPendingOrderAction, resumePaymentAction } from '../actions';
import type { ConfirmationViewProps } from '../confirmation-types';

/**
 * Ödemesi gerçekleşmeyen kart siparişinin eylemleri: müşteri aynı siparişi başka kartla öder ya da iptal eder, yeni sipariş açılmaz.
 * Kart alanı checkout'unkiyle aynıdır; hazırlık adımı taslak açmaz, aynı ödemenin anahtarını ister.
 */
export function PendingPayment({ shared, locale, view, compact }: ConfirmationViewProps) {
  const c = checkoutMessages[locale].confirmed;
  const router = useRouter();
  const { reload: reloadCart } = useCart();
  const cardRef = useRef<CardFieldsHandle>(null);
  const [cardReady, setCardReady] = useState(false);
  const [stage, setStage] = useState<PayStage | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Checkout'ta kartın düştüğü anın cümlesi; depo yalnız tarayıcıda olduğu için ilk çizimden sonra okunur, boş okuma notu ezmez.
  useEffect(() => {
    const message = takePaymentError(view.orderId);
    if (message !== null) setError(message);
  }, [view.orderId]);
  const stripe = clientStripe();
  const busy = stage !== null || cancelling;
  const returnUrlBase = typeof window === 'undefined' ? '' : `${window.location.origin}/${locale}/checkout`;
  const errorOf = (key: string | null, fallback: string) => (key === 'session_expired' ? shared.errors.session_expired : fallback);

  const prepare = async (): Promise<{ ok: true; clientSecret: string; orderId: string } | { ok: false; error: string }> => {
    const { data, errorKey } = await resumePaymentAction(view.orderId);
    if (errorKey || !data) return { ok: false, error: errorOf(errorKey, shared.payment.unavailable) };
    // Ödeme bu arada geçti, işleniyor ya da sipariş kapandı: sayfa sunucudan yeniden okunur ve yeni hâlini söyler.
    if (data.status === 'settled') {
      router.refresh();
      return { ok: false, error: '' };
    }
    return { ok: true, clientSecret: data.clientSecret, orderId: data.orderId };
  };

  const cancel = async () => {
    setCancelling(true);
    setError(null);
    const { data, errorKey } = await cancelPendingOrderAction(view.orderId);
    setCancelling(false);
    if (errorKey || !data) return setError(errorOf(errorKey, c.cancelFailed));
    // Kalemler sepete döndü; iptal edilemediyse ödeme geçmiş ya da işleniyordur ve sayfa bunu söyler.
    reloadCart();
    if (data.cancelled) router.push('/cart');
    else router.refresh();
  };

  const stageLabel = stage === 'validating' ? shared.pay.validating : stage === 'confirming' ? shared.pay.confirming : null;
  const payLabel = stageLabel ?? `${c.payNow} · ${formatPrice(view.totalCents, locale)}`;
  const deadline = view.payBy ? c.unpaidDeadline.replace('{time}', formatTime(view.payBy, locale)) : null;

  const fields =
    stripe && view.billing ? (
      <CardFields
        ref={cardRef}
        billing={view.billing}
        returnUrlBase={returnUrlBase}
        onPrepare={prepare}
        onError={(message) => setError(message || null)}
        onStage={setStage}
        onReady={setCardReady}
        labels={{ validating: shared.pay.validating, confirming: shared.pay.confirming, unavailable: shared.payment.unavailable }}
      />
    ) : (
      <p className="font-sans text-note leading-relaxed font-semibold text-honey">{shared.payment.unavailable}</p>
    );
  const pay = () => void cardRef.current?.submit();
  const canPay = cardReady && !busy;

  return (
    <CardPaymentScope stripe={stripe} locale={locale} amountCents={view.totalCents}>
      {compact ? (
        <div className="flex w-full flex-col gap-3 text-left">
          {deadline && <p className="text-center font-sans text-note leading-[1.6] text-muted">{deadline}</p>}
          <div className="rounded-card bg-card px-4 py-4">{fields}</div>
          {error && <p className="font-sans text-note leading-relaxed text-terracotta-bright">{error}</p>}
          <PrimaryButton shape="block" label={payLabel} onClick={pay} disabled={!canPay} />
          <SecondaryButton label={c.cancelOrder} onClick={() => void cancel()} disabled={busy} />
        </div>
      ) : (
        <Card gap="sm">
          <span className="font-sans text-eyebrow uppercase text-muted">{shared.payment.title}</span>
          {deadline && <p className="font-sans text-note leading-relaxed text-body">{deadline}</p>}
          {fields}
          {error && <p className="font-sans text-note leading-relaxed text-terracotta-bright">{error}</p>}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button onClick={pay} disabled={!canPay}>
              {payLabel}
            </Button>
            <Button variant="secondary" onClick={() => void cancel()} disabled={busy}>
              {c.cancelOrder}
            </Button>
          </div>
        </Card>
      )}
    </CardPaymentScope>
  );
}
