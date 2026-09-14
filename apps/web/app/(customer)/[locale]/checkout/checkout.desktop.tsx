'use client';

import { Link } from '@/i18n/navigation';
import { Icon } from '@/components/customer/ui/icons';
import { AccountLine, AddressStep, DeliveryStep, OrderSummary, PaymentStep } from './components/checkout-steps';
import { CheckoutProgress } from './components/checkout-progress';
import { CheckoutStepsSkeleton } from './components/checkout-skeleton';
import { ShippingOrderNote } from './components/shipping-order-note';
import type { CheckoutViewProps } from './checkout-types';

/**
 * Checkout · masaüstü.
 *
 * **Sıra: kim olduğum → nereye (salt okunur) → ne zaman → nasıl ödüyorum.** Kimlik ve adres
 * SEPETTE çözülüyor (13.09); buraya gelen müşteri girişli ve adresli — sayfa girişsizi sepete
 * çeviriyor. Üstte yapışkan şerit yolun tamamını gösterir.
 *
 * Özet YAPIŞKAN: müşteri gün seçerken toplamın gözden kaybolmaması gerekiyor — ödeme kararı tutara
 * bakarak veriliyor. Adımlar tek sütunda ve HEPSİ görünür: akordeon yapmak, müşteriye kendi verdiği
 * kararı görmek için geri tıklatmak olurdu (tasarım sözleşmesi).
 */
export function CheckoutDesktop(props: CheckoutViewProps) {
  const { t } = props;

  return (
    <div className="mx-auto w-full max-w-[1180px]">
      {/* Tasarımda başlık bir ÇUBUK: `ped 18/48 · alt ayraç 1px` ve başlık `600 22px Lora` —
          sayfa boyu bir kahraman başlık değil. Checkout'ta başlık yön bildirir, sahne kurmaz;
          asıl ağırlık adımlarda olmalı. "← Sepete dön" sağa yaslı (tasarım: `margin-left:auto`). */}
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
        </div>

        <div className="sticky top-6">
          <OrderSummary {...props} />
        </div>
      </div>
    </div>
  );
}
