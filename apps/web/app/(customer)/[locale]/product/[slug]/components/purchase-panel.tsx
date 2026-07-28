'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { formatPrice } from '@/lib/storefront/format';
import type { StorefrontVariant } from '@/lib/storefront/storefront-types';
import { Badge } from '@/components/customer/ui/badge';
import { Price } from '@/components/customer/ui/price';
import { buttonClass } from '@/components/customer/ui/button';
import { useCart } from '@/components/customer/cart/cart-context';
import type { Messages } from '../product-types';

/**
 * Satın alma — İKİ parça: boy seçimi (`VariantPicker`, içerik akışında) ve adet + ana aksiyon
 * (`PurchaseBar`).
 *
 * Ayrı olmalarının sebebi mobil: tasarım adet+ekle çubuğunu EKRANIN ALTINA SABİTLER — "sayfa
 * kaydırılırken hep görünür, WhatsApp/sosyal medyadan gelen trafik için tek dokunuş mesafesinde".
 * Boy seçimi ise akışta kalır. Tek bileşen olsalardı çubuk boy kartlarını da aşağı taşırdı.
 * Masaüstünde ikisi arka arkaya, sağ sütunda akar.
 *
 * Seçim SAHİBİ burası değil (`product-client`): boy değişince başlıktaki stok rozeti ve besin
 * tablosundaki net ağırlık da değişir. Adet ise yalnız çubuğu ilgilendirir, orada durur.
 *
 * Sepete ekleme GERÇEKTİR (08.4): sepet servisi ve niyet deposu hazır. Ödeme adımı hâlâ yok
 * (07.4/07.5) ama o checkout'un işi — sepete atmak için ödemenin çalışması gerekmiyor. Buton
 * 1,5 sn "Eklendi ✓" olur ve sayfada kalınır (tasarım: alışveriş kesintisiz).
 */

/** Adet tavanı: teklifte partide kalan miktar, aksi halde makul bir üst sınır (B2B hacmi sığar). */
const MAX_QTY = 99;

const capOf = (v: StorefrontVariant) => (v.limitLabel ? Number(v.limitLabel) : MAX_QTY);

interface VariantPickerProps {
  t: Messages;
  locale: Locale;
  variants: StorefrontVariant[];
  selected: StorefrontVariant;
  onSelect: (variantId: string) => void;
  compact?: boolean;
}

/**
 * K22 · Boy seçimi. Fiyatın nerede gösterildiği varyant SAYISINA bağlıdır ve bu tasarımın kararıdır:
 *   çok boylu → fiyat her boy kartının içinde (kıyas kartlar arasında yapılır)
 *   tek boylu → seçilecek bir şey yok, fiyat tek başına durur ("7,50 € / 500 g · 15,00 €/kg")
 * İkisini birden göstermek fiyatı iki kez yazardı; hiçbirini göstermemek tek boylu ürünü fiyatsız
 * bırakırdı (ilk kodlamada bu oldu).
 */
export function VariantPicker({ t, locale, variants, selected, onSelect, compact = false }: VariantPickerProps) {
  const multi = variants.length > 1;

  /** "500 g · 15,00 €/kg" — boy adı ve kıyas fiyatı; ikisi de yoksa satır hiç çizilmez. */
  const unitLine = [selected.label, selected.comparisonCents !== null ? `${formatPrice(selected.comparisonCents, locale)}/kg` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-3">
      {/* Tek boylu üründe seçim adımı HİÇ gösterilmez (`musteri-urun-detay.md §2`) — yerine fiyat. */}
      {multi ? (
        <div className="flex flex-col gap-2.5">
          <span className={['font-sans font-bold text-ink', compact ? 'text-body-sm' : 'text-body'].join(' ')}>{t.chooseSize}</span>
          {/* Mobilde kartlar YAN YANA ve eşit paylı (tasarım `flex:1`) — alt alta dizmek boy
              karşılaştırmasını bozar, kıyas ancak yan yana yapılır. */}
          <div className={['flex gap-2.5', compact ? '' : 'flex-wrap'].join(' ')}>
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelect(v.id)}
                aria-pressed={v.id === selected.id}
                className={[
                  'flex cursor-pointer flex-col gap-0.5 bg-card text-left transition-colors',
                  compact ? 'flex-1 rounded-soft px-3.5 py-2.5' : 'min-w-[150px] rounded-card px-5 py-3.5',
                  v.id === selected.id ? 'border-2 border-olive' : 'border-2 border-sand-200 hover:border-sand-400',
                  v.soldOut ? 'opacity-55' : '',
                ].join(' ')}
              >
                <span className={['font-sans font-bold text-ink', compact ? 'text-note' : 'text-body'].join(' ')}>{v.label}</span>
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
    </div>
  );
}

interface PurchaseBarProps {
  t: Messages;
  locale: Locale;
  selected: StorefrontVariant;
  /** Mobil: ekranın altına SABİT koyu çubuk. Masaüstü: sağ sütunda akan açık satır. */
  fixed?: boolean;
}

export function PurchaseBar({ t, locale, selected, fixed = false }: PurchaseBarProps) {
  const { add, pending } = useCart();
  const [added, setAdded] = useState(false);
  const [wanted, setWanted] = useState(1);
  const cap = capOf(selected);
  // Boy değişince tavan da değişir. İstenen adet SAKLANIR, gösterilen adet tavana KIRPILIR: tavanı
  // 5 olan bir teklife geçip geri dönen müşteri eski adedini kaybetmez, ama tavanı da aşamaz.
  const qty = Math.min(wanted, cap);
  const setQty = setWanted;
  const sellable = selected.priceCents !== null && !selected.soldOut;
  const totalCents = selected.priceCents !== null ? selected.priceCents * qty : null;

  const onAdd = () => {
    add({ variantId: selected.id, qty, stockId: selected.stockId });
    // Onay butonun ÜSTÜNDE verilir, sayfa değişmez — tasarım: "ekler, buton 1,5 sn 'Eklendi ✓'
    // olur, sayfada kalınır". Sepete zıplatmak alışverişi böler.
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1500);
  };

  const label = !sellable
    ? selected.priceCents === null
      ? t.closed
      : t.soldOut
    : added
      ? t.added
      : totalCents !== null
        ? t.addToCartTotal.replace('{total}', formatPrice(totalCents, locale))
        : t.addToCart;

  const stepper = (
    <span
      className={[
        'inline-flex w-max items-center overflow-hidden',
        fixed ? 'rounded-soft border-[1.5px] border-olive-light' : 'rounded-pill border-2 border-olive bg-card',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => setQty((q) => Math.max(1, q - 1))}
        disabled={qty <= 1}
        aria-label="−"
        className={[
          'cursor-pointer font-sans font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
          fixed ? 'px-3 py-1.5 text-card-title-sm text-olive-light' : 'px-4.5 py-2.5 text-lead text-olive hover:bg-olive-bg',
        ].join(' ')}
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
        className={[
          'text-center font-sans font-bold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none',
          fixed ? 'w-10 bg-transparent py-1.5 text-body text-cream' : 'w-14 border-x border-sand-100 py-2.5 text-card-title-sm text-ink',
        ].join(' ')}
      />
      <button
        type="button"
        onClick={() => setQty((q) => Math.min(cap, q + 1))}
        disabled={qty >= cap}
        aria-label="+"
        className={[
          'cursor-pointer font-sans font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
          fixed ? 'bg-olive-light px-3 py-1.5 text-card-title-sm text-ink' : 'bg-olive px-4.5 py-2.5 text-lead text-cream hover:bg-olive-dark',
        ].join(' ')}
      >
        +
      </button>
    </span>
  );

  const action = (
    <button
      type="button"
      onClick={onAdd}
      disabled={!sellable || pending}
      className={
        fixed
          ? 'flex-1 cursor-not-allowed rounded-soft bg-olive-light px-3 py-3 font-sans text-body-sm font-bold text-ink disabled:opacity-50'
          : buttonClass({ variant: 'primary', size: 'lg', fullWidth: true, className: 'flex-1 disabled:cursor-not-allowed disabled:opacity-50' })
      }
    >
      {label}
    </button>
  );

  if (!fixed) {
    return (
      <div className="flex items-center gap-3.5">
        {/* Tükendide adet seçici GİZLENİR — seçilecek bir şey yokken sayı sormak anlamsızdır. */}
        {sellable && stepper}
        {action}
      </div>
    );
  }

  // Sabit çubuk: sayfanın en altında DEĞİL, EKRANIN altında durur. Kaydırma boyunca yerinde kalır;
  // sayfanın alt boşluğu (`product.mobile`) çubuğun footer'ı örtmesini engeller.
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-3">
      <div className="mx-auto flex max-w-[430px] items-center gap-3 rounded-card bg-ink px-3.5 py-3">
        {sellable && stepper}
        {action}
      </div>
    </div>
  );
}
