'use client';

import {
  CelebrationBand,
  DeliveryCard,
  HelpBand,
  NeighborBand,
  PaymentCard,
  SummaryCard,
  TimelineCard,
  shellClass,
} from './components/confirmation-sections';
import type { ConfirmationViewProps } from './confirmation-types';

/**
 * Sipariş alındı — mobil.
 *
 * **Masaüstünün dar hâli değil, tek sütun** (Sapma 3): iki sütunlu ızgara ve yapışık özet dar
 * ekranda anlamsız — kartlar okuma sırasına dizilir. Sıra masaüstüyle AYNI ve bu bilinçli: müşteri
 * önce "ne zaman gelecek", sonra "ne ödedim", sonra "nerede" sorar; özet en sonda, çünkü çıkış
 * düğmelerini (takip · alışverişe devam) taşıyan blok o ve başparmağın yeri ekranın altı.
 *
 * Zaman çizgisi bloğun kendi içinde dikeye döner; yardım şeridinde düğme çizilmez (tasarım).
 */
export function ConfirmationMobile(props: ConfirmationViewProps) {
  return (
    <>
      <CelebrationBand {...props} />

      <div className={[shellClass(true), 'flex flex-col gap-3 py-4'].join(' ')}>
        <DeliveryCard {...props} />
        <PaymentCard {...props} />
        <TimelineCard {...props} />
        {/* Sıra masaüstüyle AYNI (gerekçe orada): eylem şeridi zaman çizgisinin ardında. */}
        <NeighborBand t={props.t} compact view={props.view} />
        <HelpBand t={props.t} compact referenceNo={props.view.referenceNo} />
        <SummaryCard {...props} />
      </div>
    </>
  );
}
