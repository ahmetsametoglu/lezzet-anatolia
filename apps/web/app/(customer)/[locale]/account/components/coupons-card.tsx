'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { CustomerCoupon } from '@/lib/account/coupons';
import { formatPrice } from '@/lib/storefront/format';
import type { Messages } from '../account-types';

/**
 * "Kuponlarım" listesi (17.5) — puan çeviriminin VARIŞ noktası.
 *
 * Tasarımda satır kesikli zeytin çerçeveli ve zeytin zeminli: bir bilgi kartı değil, **elle
 * taşınacak bir kod**. Kesikli çerçeve bunu söylüyor — koparılıp kullanılan bir şey.
 *
 * Kod SEÇİLEBİLİR metin olarak duruyor ve ayrıca kopyalanabiliyor. İkisi birden, çünkü panoya
 * yazma her ortamda çalışmaz (güvensiz köken, izin reddi, eski tarayıcı); kopyalama düşerse
 * müşteri kodu yine de gözüyle okuyup elle yazabilmeli. Düğme sessizce başarısız olsaydı müşteri
 * boş bir panoyla sepete giderdi.
 *
 * **Değer motordan geliyor, ekranda HESAPLANMIYOR.** Kupon tutar ya da yüzde olabilir (indirim
 * motorunun iki tipi); ekran hangisi doluysa onu yazıyor. Puan kuponu bugün hep tutardır ama bunu
 * ekranın varsayması, tipi bir gün değişince sessizce boş bir satır çizmek olurdu.
 */
interface CouponsCardProps {
  t: Messages;
  locale: Locale;
  coupons: CustomerCoupon[];
}

export function CouponsCard({ t, locale, coupons }: CouponsCardProps) {
  if (coupons.length === 0) {
    return <span className="font-sans text-note text-muted">{t.couponsEmpty}</span>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {coupons.map((coupon) => (
        <CouponRow key={coupon.id} t={t} locale={locale} coupon={coupon} />
      ))}
    </div>
  );
}

function CouponRow({ t, locale, coupon }: { t: Messages; locale: Locale; coupon: CustomerCoupon }) {
  const [copied, setCopied] = useState(false);

  const value = coupon.amountCents !== null ? formatPrice(coupon.amountCents, locale) : `%${coupon.percent ?? 0}`;
  const lines = [t.couponValue.replace('{amount}', value)];
  // Asgari sepet koşulu ancak VARSA yazılır: "koşulsuz" diye bir satır eklemek, olmayan bir kuralı
  // müşterinin aklına sokardı.
  if (coupon.minBasketCents !== null) lines.push(t.couponMinBasket.replace('{amount}', formatPrice(coupon.minBasketCents, locale)));

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
