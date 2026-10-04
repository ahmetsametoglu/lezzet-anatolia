'use client';

import {
  CelebrationBand,
  DeliveryCard,
  HelpBand,
  NeighborBand,
  NotifyBand,
  PaymentCard,
  SummaryCard,
  TimelineCard,
  shellClass,
} from './components/confirmation-sections';
import { PendingPayment } from './components/pending-payment';
import { confirmationPhaseOf, isRefundedCancellation } from '@lezzet/domain-core';
import type { ConfirmationViewProps } from './confirmation-types';

/**
 * Sipariş alındı, masaüstü: kutlama bandı tam genişlikte, altında 1.5/1 iki sütun; solda teslimat ve ödeme kartları, zaman çizgisi
 * ve bantlar, sağda yapışık sipariş özeti, ki uzun sayfada ne ödendiği gözden kaybolmasın.
 */
export function ConfirmationDesktop(props: ConfirmationViewProps) {
  // Ödemesi gerçekleşmeyen sipariş sol sütunun başında ödenir ya da iptal edilir; zaman çizgisi ancak ödenince anlam taşır.
  const unpaid = confirmationPhaseOf({ ...props.view, refunded: isRefundedCancellation(props.view) }) === 'unpaid';
  return (
    <>
      <CelebrationBand {...props} />

      <div className={[shellClass(false), 'grid grid-cols-[1.5fr_1fr] items-start gap-10 py-9'].join(' ')}>
        <div className="flex flex-col gap-5.5">
          {unpaid && <PendingPayment {...props} />}
          {/* Teslimat ve ödeme YAN YANA: ikisi de "sipariş ne oldu" sorusunun yarısı, alt alta
              dizildiklerinde biri diğerinin altında kalıp gözden kaçıyordu. */}
          <div className="grid grid-cols-2 gap-4.5">
            <DeliveryCard {...props} />
            <PaymentCard {...props} />
          </div>

          {!unpaid && <TimelineCard {...props} />}
          <NotifyBand t={props.t} compact={false} view={props.view} />
          {/* Komşu daveti yardımın üstünde: eylem bandı "ne zaman gelecek" okunduğu anda anlamlıdır. */}
          <NeighborBand t={props.t} locale={props.locale} compact={false} view={props.view} />
          <HelpBand t={props.t} compact={false} referenceNo={props.view.referenceNo} />
        </div>

        <div className="sticky top-5">
          <SummaryCard {...props} />
        </div>
      </div>
    </>
  );
}
