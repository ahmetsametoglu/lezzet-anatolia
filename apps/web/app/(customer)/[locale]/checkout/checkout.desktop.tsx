'use client';

import { Link } from '@/i18n/navigation';
import { Icon } from '@/components/customer/ui/icons';
import { AddressStep, DeliveryStep, OrderSummary, PaymentStep } from './components/checkout-steps';
import { CheckoutProgress } from './components/checkout-progress';
import { CheckoutStepsSkeleton } from './components/checkout-skeleton';
import { ShippingOrderNote } from './components/shipping-order-note';
import type { CheckoutViewProps } from './checkout-types';

/**
 * Ödeme · masaüstü: kimlik ve adres sepette çözülür, buraya girişli ve adresli müşteri gelir; üstteki yapışkan ilerleme çubuğu yolun tamamını
 * gösterir. Özet yapışkandır ve adımların hepsi açıktır, çünkü ödeme kararı tutara bakarak verilir ve akordeon müşteriye kendi
 * kararını görmek için geri tıklatırdı.
 */
export function CheckoutDesktop(props: CheckoutViewProps) {
  const { t } = props;

  return (
    <div className="mx-auto w-full max-w-[1180px]">
      {/* Tasarımda başlık bir çubuktur, sayfa boyu kahraman başlık değil: ödemede başlık yön bildirir, ağırlık adımlardadır.
          "← Sepete dön" tasarımdaki gibi sağa yaslı. */}
      <div className="flex flex-wrap items-center gap-x-9 gap-y-2 border-b border-sand-200 px-12 py-4.5">
        <h1 className="font-serif text-card-title text-ink">{t.title}</h1>
        {/* Sepetin bir PARÇASI olan kargo siparişinde üst satır KENDİNİ SÖYLER: iki checkout
            birbirinin aynısı görünürse müşteri hangisini verdiğini bilemez. */}
        <span className="font-sans text-micro font-semibold tracking-wide text-muted uppercase">
          {props.separateOrder ? t.shippingEyebrow : t.eyebrow}
        </span>
        <div className="ml-auto flex items-center gap-5">
          <span className="inline-flex items-center gap-1.5 font-sans text-micro font-semibold text-body">
            <Icon name="lock" size={13} />
            {t.secure}
          </span>
          <Link href="/cart" className="cursor-pointer font-sans text-body-sm font-bold text-olive hover:text-olive-dark">
            {t.backToCart}
          </Link>
        </div>
      </div>

      {/* Izgara tasarımdan: `1.5fr 1fr · gap 40 · ped 36/48/48`. Sağ sütun sabit genişlik DEĞİL —
          oranlı; dar ekranlarda özet kartı da adımlarla birlikte daralıyor. */}
      <div className="grid grid-cols-[1.5fr_1fr] items-start gap-10 px-12 pt-9 pb-12">
        <div className="flex min-w-0 flex-col gap-4">
          <ShippingOrderNote {...props} />
          <CheckoutProgress {...props} />
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
        </div>

        <div className="sticky top-6">
          <OrderSummary {...props} />
        </div>
      </div>
    </div>
  );
}
