'use client';

import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
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
  /**
   * Çubuğun taşıdığı kalemler (19.7). Sepet iki gruba bölündüyse yalnız **kapıya giden** grup
   * gelir: çubuk bir karar taşıyor ("bu kadar tutuyor, devam et") ve o karar rota siparişinindir.
   * İki grubun tutarını toplamak, tek ödemeyle ikisini birden aldığını sandırırdı.
   */
  lines: CartView['lines'];
}

export function CartCheckoutBar({ view, t, locale, lines }: CartCheckoutBarProps) {
  const reason = checkoutBlockReason(view, t, locale);
  const blocked = view.hasBlocked || !view.minBasketOk;
  const totalCents = lines.reduce((sum, l) => sum + (l.lineTotalCents ?? 0), 0);
  // Koyu çubuğun içindeki aksiyon: dolgu açık yeşile, metin antrasite döner (envanter §2 —
  // koyu zemin varyantı). Pasifken kum dolgu; ikisi de aynı kutuyu verir, zıplama olmaz.
  const actionClass = 'rounded-soft px-5 py-3 font-sans text-body-sm font-bold transition-colors';

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-3">
      <div className="mx-auto max-w-[430px]">
        <div className="flex items-center justify-between gap-3 rounded-card bg-ink px-3.5 py-3">
          <span className="flex flex-col">
            <span className="font-sans text-body font-bold text-cream">{formatPrice(totalCents, locale)}</span>
            <span className="font-sans text-micro text-closed-line">{t.vatShort}</span>
          </span>
          {blocked ? (
            <button type="button" disabled title={reason ?? undefined} className={`${actionClass} cursor-not-allowed bg-disabled-fill text-white`}>
              {t.checkout}
            </button>
          ) : (
            /* Sepetin tamamı kargodaysa açılacak taslak da KARGO taslağıdır (19.15) — özet
               kartıyla aynı karar, iki yerde ayrı yazılmasın diye aynı koşul. */
            <Link
              href={view.shippingOnly ? { pathname: '/checkout', query: { group: 'shipping' } } : '/checkout'}
              className={`${actionClass} cursor-pointer bg-olive-light text-ink hover:bg-olive-light/90`}
            >
              {t.checkout}
            </Link>
          )}
        </div>
        {reason && <span className="mt-2 block text-center font-sans text-micro font-semibold text-terracotta">{reason}</span>}
      </div>
    </div>
  );
}
