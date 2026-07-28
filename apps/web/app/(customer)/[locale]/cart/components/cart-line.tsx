'use client';

import { RATIO_SOURCE } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { FramedImage } from '@/components/media/framed-image';
import { Badge } from '@/components/customer/ui/badge';
import { Link } from '@/i18n/navigation';
import { formatPrice } from '@/lib/storefront/format';
import { useCart } from '@/components/customer/cart/cart-context';
import type { CartLine as Line } from '@/lib/cart/cart-types';
import type { Messages } from '../cart-types';

/**
 * Sepet satırı — görsel, ad, birim fiyat, adet seçici, satır toplamı, çöp kutusu.
 *
 * Üç uyarı hâli vardır ve üçü de AYNI sonucu doğurur (satır çıkarılmadan devam edilemez), ama
 * sebepleri farklı olduğu için metinleri de farklıdır: tükendi · satışa kapandı · ürün kayboldu.
 * Tek bir "sorun var" cümlesi müşteriye ne yapacağını söylemez.
 *
 * Adet 0'a inince satır SİLİNİR (tasarım: "0'a inen kalem silinir, onay istenmez"). Onay kutusu
 * koymuyoruz çünkü işlem geri alınabilir — ürün katalogda duruyor.
 */
interface CartLineProps {
  line: Line;
  t: Messages;
  locale: Locale;
  compact?: boolean;
}

export function CartLineRow({ line, t, locale, compact = false }: CartLineProps) {
  const { setQty, pending } = useCart();
  const key = { variantId: line.variantId, stockId: line.stockId };
  const atCap = line.limitCap !== null && line.qty >= line.limitCap;

  // Engel sebebi metni belirler: hangisinin olduğunu müşteri anlamalı, "bir sorun var" yetmez.
  const blockedText = !line.blocked
    ? null
    : line.slug === ''
      ? t.gone
      : line.unitPriceCents === null
        ? t.closed
        : t.soldOut;

  return (
    <div
      className={[
        'flex gap-3 rounded-card border bg-card',
        compact ? 'p-3' : 'gap-4 p-4',
        line.blocked ? 'border-terracotta-line' : 'border-sand-200',
      ].join(' ')}
    >
      <div className={compact ? 'w-[72px] flex-none' : 'w-[96px] flex-none'}>
        <FramedImage src={line.image.url} alt={line.name} ratio={RATIO_SOURCE} crop={line.image.crop} className="!rounded-soft" />
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-2">
              {line.slug ? (
                <Link
                  href={{ pathname: '/product/[slug]', params: { slug: line.slug } }}
                  className="cursor-pointer font-sans text-body font-bold text-ink transition-colors hover:text-olive"
                >
                  {line.name}
                </Link>
              ) : (
                <span className="font-sans text-body font-bold text-muted">—</span>
              )}
              {line.wasCents !== undefined && <Badge tone="offer">{t.offerBadge}</Badge>}
            </span>
            {!line.blocked && (
              <span className="font-sans text-note text-muted">
                {[line.unitLabel, line.unitPriceCents !== null ? t.unitPrice.replace('{price}', formatPrice(line.unitPriceCents, locale)) : null]
                  .filter(Boolean)
                  .join(' · ')}
                {line.wasCents !== undefined && (
                  <span className="ml-2 text-sand-600 line-through">{formatPrice(line.wasCents, locale)}</span>
                )}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setQty(key, 0)}
            disabled={pending}
            aria-label={t.remove}
            title={t.remove}
            className="cursor-pointer font-sans text-icon-sm text-sand-600 transition-colors hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-40"
          >
            🗑
          </button>
        </div>

        {blockedText ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-sans text-note text-terracotta">{blockedText}</span>
            <button
              type="button"
              onClick={() => setQty(key, 0)}
              disabled={pending}
              className="cursor-pointer rounded-pill border-[1.5px] border-terracotta-line bg-terracotta-bg px-3.5 py-1.5 font-sans text-micro font-bold text-terracotta transition-colors hover:border-terracotta disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.removeShort}
            </button>
          </div>
        ) : (
          <>
            {/* Tavana ulaşıldığında sebep söylenir; "+" sessizce pasifleşirse müşteri arızalı sanır. */}
            {atCap && <span className="font-sans text-micro text-terracotta">{t.limitReached.replace('{n}', String(line.limitCap))}</span>}
            <div className="mt-0.5 flex items-center justify-between gap-3">
              <span className="inline-flex w-max items-center overflow-hidden rounded-pill border-[1.5px] border-olive bg-card">
                <button
                  type="button"
                  onClick={() => setQty(key, line.qty - 1)}
                  disabled={pending}
                  aria-label="−"
                  className="cursor-pointer px-3 py-1 font-sans text-body font-bold text-olive transition-colors hover:bg-olive-bg disabled:cursor-not-allowed disabled:opacity-40"
                >
                  −
                </button>
                {/* Elle giriş: B2B müşteri 10-50 koli girer, artı düğmesine 50 kez basmaz. */}
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={line.limitCap ?? undefined}
                  value={line.qty}
                  onChange={(e) => setQty(key, Math.max(0, Number(e.target.value) || 0))}
                  className="w-12 border-x border-sand-100 py-1 text-center font-sans text-body font-bold text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => setQty(key, line.qty + 1)}
                  disabled={pending || atCap}
                  aria-label="+"
                  className="cursor-pointer bg-olive px-3 py-1 font-sans text-body font-bold text-cream transition-colors hover:bg-olive-dark disabled:cursor-not-allowed disabled:opacity-40"
                >
                  +
                </button>
              </span>
              {line.lineTotalCents !== null && (
                <span className="font-sans text-card-title-sm font-bold text-ink">{formatPrice(line.lineTotalCents, locale)}</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
