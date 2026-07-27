'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { formatPrice } from '@/lib/storefront/format';
import type { StorefrontVariant } from '@/lib/storefront/storefront-types';
import { Badge } from '@/components/customer/ui/badge';
import { Price } from '@/components/customer/ui/price';
import { buttonClass } from '@/components/customer/ui/button';
import type { Messages } from '../product-types';

/**
 * Satın alma paneli — boy seçimi + adet + ana aksiyon.
 *
 * Seçim SAHİBİ burası değil (`product-client`): boy değişince başlıktaki stok rozeti ve besin
 * tablosundaki net ağırlık da değişir. Panel yalnız adet tutar.
 *
 * Fiyatın nerede gösterildiği varyant SAYISINA bağlıdır ve bu tasarımın kararıdır:
 *   çok boylu → fiyat her boy kartının içinde (kıyas kartlar arasında yapılır)
 *   tek boylu → seçilecek bir şey yok, fiyat panelde tek başına durur ("7,50 € / 500 g · 15,00 €/kg")
 * İkisini birden göstermek fiyatı iki kez yazardı; hiçbirini göstermemek tek boylu ürünü fiyatsız
 * bırakırdı (ilk kodlamada bu oldu).
 *
 * Sepete ekleme henüz YOK (07-siparis). Buton sahte "eklendi" göstermez — çalışıyor izlenimi vermek,
 * hiç çalışmamaktan kötüdür; aksiyon pasif ve gerekçesi başlıkta yazılı.
 */
interface PurchasePanelProps {
  t: Messages;
  locale: Locale;
  variants: StorefrontVariant[];
  selected: StorefrontVariant;
  onSelect: (variantId: string) => void;
  compact?: boolean;
}

/** Adet tavanı: teklifte partide kalan miktar, aksi halde makul bir üst sınır (B2B hacmi sığar). */
const MAX_QTY = 99;

const capOf = (v: StorefrontVariant) => (v.limitLabel ? Number(v.limitLabel) : MAX_QTY);

export function PurchasePanel({ t, locale, variants, selected, onSelect, compact = false }: PurchasePanelProps) {
  const [qty, setQty] = useState(1);

  const cap = capOf(selected);
  const sellable = selected.priceCents !== null && !selected.soldOut;
  const totalCents = selected.priceCents !== null ? selected.priceCents * qty : null;
  const multi = variants.length > 1;

  /** Boy değişince adet tavanı da değişir — eski adet yeni tavanı aşıyorsa aşağı çekilir. */
  const selectVariant = (v: StorefrontVariant) => {
    onSelect(v.id);
    setQty((q) => Math.min(q, capOf(v)));
  };

  /** "500 g · 15,00 €/kg" — boy adı ve kıyas fiyatı; ikisi de yoksa satır hiç çizilmez. */
  const unitLine = [selected.label, selected.comparisonCents !== null ? `${formatPrice(selected.comparisonCents, locale)}/kg` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-4.5">
      {/* Tek boylu üründe seçim adımı HİÇ gösterilmez (`musteri-urun-detay.md §2`) — yerine fiyat. */}
      {multi ? (
        <div className="flex flex-col gap-2.5">
          <span className="font-sans text-body font-bold text-ink">{t.chooseSize}</span>
          <div className={['flex gap-3', compact ? 'flex-col' : 'flex-wrap'].join(' ')}>
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => selectVariant(v)}
                aria-pressed={v.id === selected.id}
                className={[
                  'flex min-w-[150px] cursor-pointer flex-col gap-0.5 rounded-card bg-card px-5 py-3.5 text-left transition-colors',
                  v.id === selected.id ? 'border-2 border-olive' : 'border-2 border-sand-200 hover:border-sand-400',
                  v.soldOut ? 'opacity-55' : '',
                ].join(' ')}
              >
                <span className="font-sans text-body font-bold text-ink">{v.label}</span>
                <Price cents={v.priceCents} wasCents={v.wasCents} locale={locale} size="sm" />
                {v.comparisonCents !== null && (
                  <span className="font-sans text-micro text-muted">{formatPrice(v.comparisonCents, locale)}/kg</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          <Price cents={selected.priceCents} wasCents={selected.wasCents} locale={locale} size="lg" />
          {unitLine && <span className="font-sans text-micro text-muted">{unitLine}</span>}
        </div>
      )}

      {(selected.wasCents !== undefined || selected.limitLabel) && (
        <div className="flex items-center gap-2.5">
          {selected.wasCents !== undefined && <Badge tone="offer">{t.offer}</Badge>}
          {selected.limitLabel && <Badge tone="offer">{t.limit.replace('{n}', selected.limitLabel)}</Badge>}
        </div>
      )}

      <div className={['flex gap-3.5', compact ? 'flex-col' : 'items-center'].join(' ')}>
        {/* Tükendide adet seçici GİZLENİR — seçilecek bir şey yokken sayı sormak anlamsızdır. */}
        {sellable && (
          <span className="inline-flex w-max items-center overflow-hidden rounded-pill border-2 border-olive bg-card">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              aria-label="−"
              className="cursor-pointer px-4.5 py-2.5 font-sans text-lead font-bold text-olive transition-colors hover:bg-olive-bg disabled:cursor-not-allowed disabled:opacity-40"
            >
              −
            </button>
            {/* Elle giriş: B2B müşteri 10-50 koli girer, artı düğmesine 50 kez basmaz. */}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={cap}
              value={qty}
              onChange={(e) => setQty(Math.min(cap, Math.max(1, Number(e.target.value) || 1)))}
              className="w-14 border-x border-sand-100 py-2.5 text-center font-sans text-card-title-sm font-bold text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(cap, q + 1))}
              disabled={qty >= cap}
              aria-label="+"
              className="cursor-pointer bg-olive px-4.5 py-2.5 font-sans text-lead font-bold text-cream transition-colors hover:bg-olive-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>
          </span>
        )}
        <button
          type="button"
          disabled
          title={t.cart.pending}
          className={buttonClass({ variant: 'primary', size: 'lg', fullWidth: true, className: 'flex-1 disabled:cursor-not-allowed disabled:opacity-50' })}
        >
          {!sellable
            ? (selected.priceCents === null ? t.closed : t.soldOut)
            : totalCents !== null
              ? t.addToCartTotal.replace('{total}', formatPrice(totalCents, locale))
              : t.addToCart}
        </button>
      </div>
    </div>
  );
}
