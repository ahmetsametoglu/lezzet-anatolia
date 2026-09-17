'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { CustomerCoupon } from '@lezzet/application';
import { formatPrice } from '@/lib/storefront/format';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import type { AccountCopy, Messages } from '../account-types';

/**
 * Kod seçilebilir metin olarak durur ve ayrıca kopyalanabilir, çünkü panoya yazma her ortamda çalışmaz. Değer motordan gelir,
 * ekranda hesaplanmaz.
 */
interface CouponsCardProps {
  t: Messages;
  locale: Locale;
  coupons: CustomerCoupon[];
  /** Verilince boş liste hiçbir şey çizmez, çünkü puan kartının içinde "kuponunuz yok" cümlesi gürültü olur. */
  phoneCopy?: AccountCopy['points'];
}

export function CouponsCard({ t, locale, coupons, phoneCopy }: CouponsCardProps) {
  if (coupons.length === 0) {
    return phoneCopy ? null : <span className="font-sans text-note text-muted">{t.couponsEmpty}</span>;
  }

  return (
    <div className={['flex flex-col', phoneCopy ? 'gap-2' : 'gap-2.5'].join(' ')}>
      {coupons.map((coupon) => (
        <CouponRow key={coupon.id} t={t} locale={locale} coupon={coupon} phoneCopy={phoneCopy} />
      ))}
    </div>
  );
}

interface CouponRowProps {
  t: Messages;
  locale: Locale;
  coupon: CustomerCoupon;
  phoneCopy: AccountCopy['points'] | undefined;
}

function CouponRow({ t, locale, coupon, phoneCopy }: CouponRowProps) {
  const [copied, setCopied] = useState(false);

  // Asgari sepet koşulu ancak VARSA yazılır: "koşulsuz" diye bir satır eklemek, olmayan bir kuralı
  // müşterinin aklına sokardı.
  const minBasket = coupon.minBasketCents === null ? null : t.couponMinBasket.replace('{amount}', formatPrice(coupon.minBasketCents, locale));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sessiz DEĞİL, sonuçsuz: kod zaten ekranda ve seçilebilir. Burada bir hata cümlesi açmak,
      // müşterinin hâlâ yapabildiği bir işi (elle okumak) arıza gibi göstermek olurdu.
      setCopied(false);
    }
  };

  if (phoneCopy) {
    // Asgari sepet yazılır, çünkü sepette reddedilecek kuponu koşulsuz göstermek yanıltır.
    const phoneValue =
      coupon.amountCents !== null
        ? phoneCopy.couponValue.replace('{value}', formatPrice(coupon.amountCents, locale))
        : phoneCopy.couponPercent.replace('{n}', String(coupon.percent ?? 0));
    return (
      <div className="flex items-center gap-2.5 rounded-badge border border-dashed border-olive-line bg-card px-3.5 py-2.5">
        <MobileIcon name="coupon" size={17} className="text-terracotta" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-sans text-note font-bold text-terracotta">{coupon.code}</span>
          <span className="font-sans text-helper text-muted">{minBasket === null ? phoneValue : `${phoneValue} · ${minBasket}`}</span>
        </div>
        <TextAction label={copied ? t.couponCopied : t.couponCopy} onClick={() => void copy()} />
      </div>
    );
  }

  const value = coupon.amountCents !== null ? formatPrice(coupon.amountCents, locale) : `%${coupon.percent ?? 0}`;
  const lines = [t.couponValue.replace('{amount}', value)];
  if (minBasket !== null) lines.push(minBasket);

  return (
    <div className="flex items-center justify-between gap-3 rounded-soft border border-dashed border-olive bg-olive-bg px-4 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-sans text-body-sm font-bold text-olive">{coupon.code}</span>
        <span className="font-sans text-note text-body">{lines.join(' · ')}</span>
      </div>
      <button
        type="button"
        onClick={copy}
        className="flex-none cursor-pointer font-sans text-note font-bold text-olive transition-colors hover:text-olive-dark"
      >
        {copied ? t.couponCopied : t.couponCopy}
      </button>
    </div>
  );
}
