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
 * Sipariş alındı — masaüstü (tasarım: `Musteri - Checkout.dc.html` · "Sipariş Alındı").
 *
 * Düzen tasarımın kendisi: kutlama bandı tam genişlikte, altında **1.5/1 iki sütun** — solda yan
 * yana teslimat + ödeme kartı, altında yatay zaman çizgisi ve yardım şeridi; sağda görselli sipariş
 * özeti. Önce hepsi tek sütuna dizilmişti ve sayfa bir onay ekranından çok bir liste gibi
 * okunuyordu (29.07 kullanıcı geri bildirimi).
 *
 * Özet YAPIŞIK: uzun sayfada aşağı inerken ne sipariş ettiği ve ne ödediği gözden kaybolmamalı.
 */
export function ConfirmationDesktop(props: ConfirmationViewProps) {
  return (
    <>
      <CelebrationBand {...props} />

      <div className={[shellClass(false), 'grid grid-cols-[1.5fr_1fr] items-start gap-10 py-9'].join(' ')}>
        <div className="flex flex-col gap-5.5">
          {/* Teslimat ve ödeme YAN YANA: ikisi de "sipariş ne oldu" sorusunun yarısı, alt alta
              dizildiklerinde biri diğerinin altında kalıp gözden kaçıyordu. */}
          <div className="grid grid-cols-2 gap-4.5">
            <DeliveryCard {...props} />
            <PaymentCard {...props} />
          </div>

          <TimelineCard {...props} />
          {/* Komşu daveti YARDIMIN ÜSTÜNDE (17.10): ikisi de şerit ama biri eylem, öteki güvence.
              Eylem şeridi zaman çizgisinin hemen ardında duruyor — müşteri "ne zaman gelecek"i
              okuduğu anda "komşunu da bu güne çağır" cümlesi anlamlı; en altta sorulsa geç kalırdı.
              Bağlantı yoksa hiç çizilmiyor, sıra da bozulmuyor. */}
          <NeighborBand t={props.t} compact={false} view={props.view} />
          <HelpBand t={props.t} compact={false} />
        </div>

        <div className="sticky top-5">
          <SummaryCard {...props} />
        </div>
      </div>
    </>
  );
}
