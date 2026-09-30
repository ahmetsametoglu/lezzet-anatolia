'use client';

import { confirmationCopy, type Locale } from '@lezzet/i18n';
import checkoutMessages from '@lezzet/i18n/customer/checkout';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import { SummaryPanel } from '@/components/customer/phone-kit/summary-panel';
import { Icon } from '@/components/customer/ui/icons';
import { formatDeliveryDate, formatPrice } from '@/lib/storefront/format';
import type { CheckoutCopy } from '../checkout-types';
import { useShareLink } from '@/lib/use-share-link.hook';
import { confirmationPhaseOf, confirmationToneOf, isRefundedCancellation } from '@lezzet/domain-core';
import { PendingPayment } from './components/pending-payment';
import { useNotifyAsk } from './components/use-notify-ask.hook';
import type { ConfirmationView, ConfirmationViewProps, Messages } from './confirmation-types';

/**
 * Sipariş alındı — telefon görünümü, native onay ekranının web ikizi. Kart ödemesinin dönüş yeri olduğu için taslakta
 * "onaylanıyor", tamamlanmayan ödemede ve iptalde kendi cümlesi çizilir; işaretin rengi hâli söyler.
 */

const MARK: Record<ReturnType<typeof confirmationToneOf>, string> = {
  ok: 'bg-olive',
  waiting: 'bg-honey',
  failed: 'bg-terracotta-bright',
};

export function ConfirmationMobile(props: ConfirmationViewProps) {
  const { t, locale, view } = props;
  const copy = checkoutMessages[locale];
  const c = copy.confirmed;
  const phase = confirmationPhaseOf({ ...view, refunded: isRefundedCancellation(view) });
  const tone = confirmationToneOf(phase);
  const failed = tone === 'failed';
  // Kesinleşmemiş hâlde cümle başlığın hemen altında — ekranın asıl söylediği o. Kesinleşmişte native'in notu özetin altında.
  const status = phase === 'placed' ? null : confirmationCopy(locale, phase);

  return (
    <div className="flex flex-col items-center gap-3.5 px-7.5 pt-17.5 pb-[calc(30px+env(safe-area-inset-bottom))] text-center">
      <span aria-hidden className={['grid size-23 flex-none place-items-center rounded-full text-card', MARK[tone]].join(' ')}>
        <Icon name={failed ? 'close' : tone === 'ok' ? 'check' : 'timer'} size={40} strokeWidth={2.2} />
      </span>
      <h1 className="font-serif text-page-title-sm leading-[1.15] text-ink">{status?.title ?? c.title}</h1>
      {status !== null && <p className="font-sans text-body-sm leading-[1.6] text-body">{status.body}</p>}
      {/* Numara ilk kalıcı durumda doğar: taslakta satır HİÇ çizilmez — "bilinmiyor" yazan numara, olmayandan kötüdür. */}
      {view.referenceNo && <p className="font-sans text-body-sm font-semibold text-muted">{c.reference.replace('{reference}', view.referenceNo)}</p>}

      <div className="w-full text-left">
        <SummaryPanel
          rows={[
            { key: 'delivery', label: c.delivery, value: deliveryLabel(copy, view, locale) },
            { key: 'payment', label: c.payment, value: paymentLabel(copy, view) },
          ]}
          totalLabel={c.total}
          totalValue={formatPrice(view.totalCents, locale)}
        />
      </div>

      {view.placed && <p className="font-sans text-body-sm leading-[1.6] text-muted">{c.note}</p>}
      <NotifyInvite t={t} placed={view.placed} />
      {view.placed && view.neighborInvite && <NeighborInvite t={t} invite={view.neighborInvite} />}

      {phase === 'unpaid' ? (
        <PendingPayment {...props} />
      ) : (
        <div className="mt-2 flex w-full flex-col gap-2.5">
          {/* Olmadıysa çıkış sepete: iptal edilen siparişin kalemleri oraya döndü. */}
          {failed ? <PrimaryButton shape="block" label={c.retry} href="/cart" /> : <PrimaryButton shape="block" label={c.orders} href="/orders" />}
          <SecondaryButton label={c.home} href="/" />
        </div>
      )}
    </div>
  );
}

/** Teslimat satırı: rota-içinde gün, kargoda kargonun adı; gün yoksa yolun adı — uydurulmuş gün yazılmaz (native kuralı). */
function deliveryLabel(copy: CheckoutCopy, view: ConfirmationView, locale: Locale): string {
  if (view.pickup) return `${copy.confirmed.pickup} · ${view.pickup.warehouseName}`;
  if (!view.onRoute) return copy.confirmed.shipping;
  return view.deliveryDate ? formatDeliveryDate(view.deliveryDate, locale) : copy.delivery.door;
}

/**
 * Ödeme satırı: vadeli bir yöntem değil siparişin bayrağı; kart KAPIDA kullanılan bir araçtır (kurye kapanışta
 * yazar), müşterinin seçtiği yol kapıda ödemedir. Yöntem henüz seçilmemişse "bilinmiyor" — "kapıda" DEĞİL.
 */
function paymentLabel(copy: CheckoutCopy, view: ConfirmationView): string {
  if (view.onAccount) return copy.payment.credit;
  switch (view.paymentMethod) {
    case 'online':
      return copy.payment.online;
    case 'cash':
    case 'card':
      return copy.payment.onDelivery;
    case 'bank_transfer':
      return copy.payment.transfer;
    case null:
      return copy.confirmed.unknown;
  }
}

interface NotifyInviteProps {
  t: Messages;
  placed: boolean;
}

/** Komşu davetinin kutusu: haber yola çıkınca gelir, istek onu bekleyen müşterinin önünde durur. */
function NotifyInvite({ t, placed }: NotifyInviteProps) {
  const { state, busy, ask } = useNotifyAsk(placed);
  if (state === 'hidden') return null;
  return (
    <div className="flex w-full flex-col items-center gap-2 rounded-card bg-olive-bg px-4.5 py-3.5">
      <span className="flex items-center gap-1.5 font-sans text-body-sm font-semibold text-ink">
        <Icon name="bell" size={16} className="flex-none text-olive" />
        {t.notify.title}
      </span>
      <span className="font-sans text-note leading-[1.6] text-muted">{state === 'done' ? t.notify.done : t.notify.body}</span>
      {state === 'failed' && <span className="font-sans text-note font-semibold leading-[1.6] text-terracotta">{t.notify.failed}</span>}
      {state !== 'done' && <SecondaryButton shape="pill" tone="olive" label={t.notify.cta} disabled={busy} onClick={ask} />}
    </div>
  );
}

interface NeighborInviteProps {
  t: Messages;
  invite: NonNullable<ConfirmationView['neighborInvite']>;
}

/**
 * Komşunu bu güne çağır: native bandın yerleşimi, web'in metni. Dolmuş davet paylaşılmaz.
 */
function NeighborInvite({ t, invite }: NeighborInviteProps) {
  const { share, copied } = useShareLink();
  const full = invite.remainingUses === 0;
  return (
    <div className="flex w-full flex-col items-center gap-2 rounded-card bg-olive-bg px-4.5 py-3.5">
      <span className="flex items-center gap-1.5 font-sans text-body-sm font-semibold text-ink">
        <Icon name="truck" size={16} className="flex-none text-olive" />
        {t.neighbor.title}
      </span>
      <span className="font-sans text-note leading-[1.6] text-muted">{t.neighbor.body}</span>
      <span className="font-sans text-note font-semibold leading-[1.6] text-muted">
        {(full ? t.neighbor.full : t.neighbor.remaining).replace('{n}', String(invite.remainingUses)).replace('{max}', String(invite.maxUses))}
      </span>
      {!full && <SecondaryButton shape="pill" tone="olive" label={copied ? t.neighbor.copied : t.neighbor.cta} onClick={() => void share(invite.url)} />}
    </div>
  );
}
