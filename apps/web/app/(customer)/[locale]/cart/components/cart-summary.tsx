'use client';

import type { Locale } from '@lezzet/i18n';
import { buttonClass } from '@/components/customer/ui/button';
import { formatPrice } from '@/lib/storefront/format';
import type { CartView } from '@/lib/cart/cart-types';
import type { Messages } from '../cart-types';

/**
 * Sepet özeti — ara toplam, genel toplam ve checkout düğmesi.
 *
 * **Kargo satırı YOK ve bu bilinçli.** Ücret teslimat türüne bağlı (rota içi ücretsiz, kargoda
 * eşiğe bakılır), teslimat türü ise ADRESTEN çıkar — adres checkout'ta sorulur. Sepette "Teslimat:
 * Ücretsiz" yazıp checkout'ta 6,90 € çıkarmak tutulmayan bir sözdür; satır orada, bilgi kesinken
 * gösterilir. Bu yüzden bugün ara toplam ile genel toplam aynıdır.
 *
 * **Kupon alanı da yok:** indirim/kupon motoru henüz kurulmadı (`BACKLOG §15`). Çalışmayan bir
 * kupon kutusu, denemesi başarısız olan müşteriyi kendinde hata aramaya iter.
 *
 * Checkout düğmesinin iki ayrı engeli vardır ve ikisi de SEBEBİYLE söylenir: çıkarılmamış engelli
 * satır ve asgari sepet. Sessizce pasif bir düğme, müşteriye ne yapacağını söylemez.
 */
interface CartSummaryProps {
  view: CartView;
  t: Messages;
  locale: Locale;
  compact?: boolean;
}

export function CartSummary({ view, t, locale, compact = false }: CartSummaryProps) {
  const blocked = view.hasBlocked || !view.minBasketOk;
  const reason = view.hasBlocked
    ? t.checkoutBlocked
    : !view.minBasketOk
      ? t.minBasket.replace('{min}', formatPrice(view.minBasketCents, locale)).replace('{missing}', formatPrice(view.missingForMinBasketCents, locale))
      : null;

  return (
    <div className={['flex flex-col gap-3 rounded-card border border-sand-200 bg-card', compact ? 'p-4' : 'p-6'].join(' ')}>
      {!compact && <h2 className="font-serif text-card-title text-ink">{t.summary}</h2>}

      <div className="flex items-center justify-between font-sans text-body text-body">
        <span>{t.subtotal}</span>
        <span className="text-ink">{formatPrice(view.subtotalCents, locale)}</span>
      </div>

      <div className="flex items-center justify-between border-t border-sand-100 pt-3 font-sans text-card-title-sm font-bold text-ink">
        <span>{t.total}</span>
        <span>{formatPrice(view.subtotalCents, locale)}</span>
      </div>
      <span className="font-sans text-micro text-muted">{t.vatIncluded}</span>

      {/* Ödeme adımı 07.4/07.5 bekliyor: düğme TAM görünür ama pasif. Sahte bir akış başlatmak,
          müşteriyi ödeme yapamayacağı bir yola sokmaktır. */}
      <button
        type="button"
        disabled
        title={t.checkoutPending}
        className={buttonClass({ variant: 'primary', size: compact ? 'md' : 'lg', fullWidth: true, className: 'disabled:cursor-not-allowed disabled:opacity-50' })}
      >
        {t.checkout}
      </button>
      {reason && <span className="text-center font-sans text-micro text-terracotta">{reason}</span>}
      {!blocked && <span className="text-center font-sans text-micro text-muted">{t.checkoutPending}</span>}
    </div>
  );
}
