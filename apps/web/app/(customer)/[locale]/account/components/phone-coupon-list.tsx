'use client';

import { useState } from 'react';
import type { CustomerCoupon } from '@lezzet/application';
import type { Locale } from '@lezzet/i18n';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { formatPrice } from '@/lib/storefront/format';
import type { AccountCopy } from '../account-types';

/**
 * Puan kartının içindeki kuponlar, native kupon satırının ikizi. Boş liste hiçbir şey çizmez, çünkü puan kartında "kuponunuz yok"
 * cümlesi gürültü olur.
 */
interface PhoneCouponListProps {
  copy: AccountCopy['points'];
  locale: Locale;
  coupons: CustomerCoupon[];
}

export function PhoneCouponList({ copy, locale, coupons }: PhoneCouponListProps) {
  if (coupons.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {coupons.map((coupon) => (
        <CouponRow key={coupon.id} copy={copy} locale={locale} coupon={coupon} />
      ))}
    </div>
  );
}

interface CouponRowProps {
  copy: AccountCopy['points'];
  locale: Locale;
  coupon: CustomerCoupon;
}

function CouponRow({ copy, locale, coupon }: CouponRowProps) {
  const [copied, setCopied] = useState(false);
  const value =
    coupon.amountCents === null
      ? copy.couponPercent.replace('{n}', String(coupon.percent ?? 0))
      : copy.couponValue.replace('{value}', formatPrice(coupon.amountCents, locale));
  // Asgari sepet yazılır, çünkü sepette reddedilecek kuponu koşulsuz göstermek yanıltır.
  const minBasket =
    coupon.minBasketCents === null ? null : copy.couponMinBasket.replace('{amount}', formatPrice(coupon.minBasketCents, locale));

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Kod ekranda seçilebilir durduğu için hata cümlesi açılmaz; elle okunabilen işi arıza gibi göstermek olurdu.
      setCopied(false);
    }
  };

  return (
    <div className="flex items-center gap-2.5 rounded-badge border border-dashed border-olive-line bg-card px-3.5 py-2.5">
      <MobileIcon name="coupon" size={17} className="flex-none text-terracotta" />
      <span className="flex-none font-sans text-note font-bold text-terracotta">{coupon.code}</span>
      <span className="min-w-0 flex-1 font-sans text-helper text-muted">{minBasket === null ? value : `${value} · ${minBasket}`}</span>
      <TextAction label={copied ? copy.couponCopied : copy.couponCopy} onClick={() => void copyCode()} />
    </div>
  );
}
