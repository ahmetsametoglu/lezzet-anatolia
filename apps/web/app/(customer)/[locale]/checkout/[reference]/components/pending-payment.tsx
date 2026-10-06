'use client';

import { useState } from 'react';
import checkoutMessages from '@lezzet/i18n/customer/checkout';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import { useCart } from '@/components/customer/cart/cart-context';
import { Button } from '@/components/customer/ui/button';
import { Card } from '@/components/customer/ui/card';
import { useRouter } from '@/i18n/navigation';
import { hapticError } from '@/lib/haptics/haptics';
import { formatPrice, formatTime } from '@/lib/storefront/format';
import { CardTrustNote, type PayStage } from '../../components/revolut-card';
import { cancelPendingOrderAction, resumePaymentAction } from '../actions';
import type { ConfirmationViewProps } from '../confirmation-types';

/**
 * Ödemesi gerçekleşmeyen kart siparişinin eylemleri: müşteri aynı siparişi başka kartla öder ya da iptal eder, yeni sipariş açılmaz.
 * Ödeme checkout'takiyle aynı Revolut penceresinde alınır; basınca aynı ödemenin jetonu istenir.
 */
export function PendingPayment({ shared, locale, view, compact }: ConfirmationViewProps) {
  const c = checkoutMessages[locale].confirmed;
  const router = useRouter();
  const { reload: reloadCart } = useCart();
  const [stage, setStage] = useState<PayStage | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = stage !== null || cancelling;
  const errorOf = (key: string | null, fallback: string) => (key === 'session_expired' ? shared.errors.session_expired : fallback);

  // Ödeme bu arada geçtiyse, işleniyorsa ya da sipariş kapandıysa sayfa sunucudan yeniden okunur ve yeni hâlini söyler.
  const pay = async () => {
    setStage('preparing');
    setError(null);
    const { data, errorKey } = await resumePaymentAction(view.orderId);
    if (errorKey || !data) {
      setStage(null);
      hapticError();
      return setError(errorOf(errorKey, shared.payment.unavailable));
    }
    if (data.status === 'settled') return router.refresh();
    setStage('confirming');
    window.location.assign(data.checkoutUrl);
  };

  const cancel = async () => {
    setCancelling(true);
    setError(null);
    const { data, errorKey } = await cancelPendingOrderAction(view.orderId);
    setCancelling(false);
    if (errorKey || !data) {
      hapticError();
      return setError(errorOf(errorKey, c.cancelFailed));
    }
    // Kalemler sepete döndü; iptal edilemediyse ödeme geçmiş ya da işleniyordur ve sayfa bunu söyler.
    reloadCart();
    if (data.cancelled) router.push('/cart');
    else router.refresh();
  };

  const stageLabel = stage ? shared.pay[stage] : null;
  const payLabel = stageLabel ?? `${c.payNow} · ${formatPrice(view.totalCents, locale)}`;
  const deadline = view.payBy ? c.unpaidDeadline.replace('{time}', formatTime(view.payBy, locale)) : null;

  const fields = <CardTrustNote text={shared.payment.cardTrust} />;

  return (
    <>
      {compact ? (
        <div className="flex w-full flex-col gap-3 text-left">
          {deadline && <p className="text-center font-sans text-note leading-[1.6] text-muted">{deadline}</p>}
          <div className="rounded-card bg-card px-4 py-4">{fields}</div>
          {error && <p className="font-sans text-note leading-relaxed text-terracotta-bright">{error}</p>}
          <PrimaryButton shape="block" label={payLabel} onClick={() => void pay()} disabled={busy} />
          <SecondaryButton label={c.cancelOrder} onClick={() => void cancel()} disabled={busy} />
        </div>
      ) : (
        <Card gap="sm">
          <span className="font-sans text-eyebrow uppercase text-muted">{shared.payment.title}</span>
          {deadline && <p className="font-sans text-note leading-relaxed text-body">{deadline}</p>}
          {fields}
          {error && <p className="font-sans text-note leading-relaxed text-terracotta-bright">{error}</p>}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button onClick={() => void pay()} disabled={busy}>
              {payLabel}
            </Button>
            <Button variant="secondary" onClick={() => void cancel()} disabled={busy}>
              {c.cancelOrder}
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
