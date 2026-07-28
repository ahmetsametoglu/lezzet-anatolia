'use client';

import type { Locale } from '@lezzet/i18n';
import { formatPrice } from '@/lib/storefront/format';
import type { CartView } from '@/lib/cart/cart-types';
import type { Messages } from '../cart-types';
import { checkoutBlockReason } from './cart-summary';

/**
 * Mobil alt toplam çubuğu (tasarım: "alt toplam çubuğu ekrana sabitlenir").
 *
 * Sayfanın altında değil EKRANIN altında durur: sepet uzadıkça toplam ve tek aksiyon görüş
 * alanından çıkmamalı — mobilde listeyi sonuna kadar kaydırmak zaten en pahalı hareket.
 *
 * Tutar çubukta, tutar DÖKÜMÜ akıştaki özet kartında (`CartSummary`) durur. Çubuk kararı taşır
 * ("bu kadar tutuyor, devam et"), kartı taşımaz; ikisini birleştirmek çubuğu ekranın yarısı yapardı.
 *
 * Düğme bugün pasif — ödeme adımı 07.4/07.5 bekliyor. Yine de çizilir: aksiyonun NEREDE olduğunu
 * ve tutarın ne olduğunu göstermek, boş bir alt bant bırakmaktan dürüsttür.
 */
interface CartCheckoutBarProps {
  view: CartView;
  t: Messages;
  locale: Locale;
}

export function CartCheckoutBar({ view, t, locale }: CartCheckoutBarProps) {
  const reason = checkoutBlockReason(view, t, locale);

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-3">
      <div className="mx-auto max-w-[430px]">
        <div className="flex items-center justify-between gap-3 rounded-card bg-ink px-3.5 py-3">
          <span className="flex flex-col">
            <span className="font-sans text-body font-bold text-cream">{formatPrice(view.subtotalCents, locale)}</span>
            <span className="font-sans text-micro text-closed-line">{t.vatShort}</span>
          </span>
          <button
            type="button"
            disabled
            title={t.checkoutPending}
            className="cursor-not-allowed rounded-soft bg-disabled-fill px-5 py-3 font-sans text-body-sm font-bold text-white"
          >
            {t.checkout}
          </button>
        </div>
        {reason && <span className="mt-2 block text-center font-sans text-micro font-semibold text-terracotta">{reason}</span>}
      </div>
    </div>
  );
}
