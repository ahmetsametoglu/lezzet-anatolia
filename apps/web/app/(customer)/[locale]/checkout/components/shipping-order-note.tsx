'use client';

import type { CheckoutViewProps } from '../checkout-types';

/**
 * "Bu bir KARGO siparişi" bandı (19.7) — yalnız `?group=shipping` ile açılan checkout'ta.
 *
 * **Neden gerekli:** iki checkout aynı akıştır ve ekran olarak birbirinin tıpatıp aynısı görünür.
 * Söylenmezse müşteri kapıya giden kalemlerinin siparişe girmediğini fark etmez; en iyi ihtimalle
 * "eksik sipariş verdim" der, muhtemelen "kalemlerim kayboldu" diye yazar. Oysa kaybolmadılar —
 * sepette bekliyorlar ve bu cümle onu söylüyor.
 *
 * **Bal tonu, terracotta değil:** müşteri bir hata yapmadı, bir bilgi alıyor. Kırmızı bir bant
 * ikinci siparişi bir sorun gibi gösterirdi; oysa o, sepetin en iyi hâlde tamamlanması.
 */
export function ShippingOrderNote({ t, shippingOrder, compact }: CheckoutViewProps) {
  if (!shippingOrder) return null;

  return (
    <div
      className={[
        'rounded-card border border-honey-line bg-honey-bg font-sans leading-relaxed text-honey',
        compact ? 'px-3.5 py-2.5 text-micro' : 'px-5 py-3.5 text-note',
      ].join(' ')}
    >
      {t.shippingNote}
    </div>
  );
}
