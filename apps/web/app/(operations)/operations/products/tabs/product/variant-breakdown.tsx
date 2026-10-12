'use client';

import { useState } from 'react';
import { vatBaseOf } from '@lezzet/domain-core';
import { COUNTRY_LABELS, SELLER_COUNTRY, type Channel, type Country } from '@lezzet/types';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Skeleton } from '@/components/operation/ui/skeleton';
import { vatRateLabel } from '@/components/operation/form/document-form/labels';
import { PriceDialog } from '@/components/operation/prices/price-dialog';
import { countryColumnLabel, FOREIGN_COUNTRIES, PRICE_CHANNELS, type CountryVat } from '@/components/operation/prices/country-prices';
import { setChannelPriceAction } from '@/lib/prices/price-actions';
import { expiryParts } from '@/lib/stock/batch-labels';
import type { PriceRow } from '@/lib/pricing/price-rows';
import { sizeLabel, type ProductView } from '../../products-types';
import { removeCountryPriceAction, setCountryPriceAction } from '@/app/(operations)/operations/country-price-actions';
import { PriceEditCell } from './price-edit-cell';
import { cellMargin, marginAt, marginForAmount } from './price-math';
import { PricePeekDialog } from './price-peek-dialog';
import type { ProductRowDetail, VariantDetail } from './row-detail-types';
import { StockPeekDialog } from './stock-peek-dialog';
import type { RowDetailState } from './use-row-detail.hook';
import { barcodeParts, netParts, packedParts, stockParts } from './variant-cells';

// Satırın altına açılan boy kırılımı: satılabilir birim boydur ve fiyat da buradan yazılır. İskelet yalnız sunucudan beklenen
// hücrelerdedir ve gelen hücreyle aynı yeri kaplar, veri düşünce satır oynamaz.

const PRICE_COLUMNS = PRICE_CHANNELS.length * (1 + FOREIGN_COUNTRIES.length);

/** Kolonlar sabit genişlikte, boşluk aralara dağılır: fiyat hücresi tutar kadar kalır ve kırılım dar ekranda kesilmez. */
const TRACKS = ['120px', '62px', '56px', '92px', '90px', '64px', '112px', ...Array.from({ length: PRICE_COLUMNS }, () => '88px')].join(' ');

const vatBaseHint = (channel: Channel) => (vatBaseOf(channel) === 'ttc' ? 'KDV dahil fiyat' : 'KDV hariç fiyat');

/** Başlık kısa kalır, ayrıntısı tarayıcı ipucundadır; ülke kolonu Fiyatlar'daki gibi tek satırdır. */
const HEADERS: Array<{ label: string; hint?: string; right?: boolean }> = [
  { label: 'Boy' },
  { label: 'SKU' },
  { label: 'Net', hint: 'Net miktar · porsiyon' },
  { label: 'Ambalaj', hint: 'Ambalajlı ağırlık · ölçü (mm)' },
  { label: 'Barkod' },
  { label: 'Stok', hint: 'Kullanılabilir adet · depo dağılımı sayının üzerinde', right: true },
  { label: 'Son tarih', hint: 'En yakın son tarihli parti', right: true },
  ...PRICE_CHANNELS.map((channel) => ({ label: channel.toUpperCase(), hint: vatBaseHint(channel), right: true })),
  ...FOREIGN_COUNTRIES.flatMap((country) =>
    PRICE_CHANNELS.map((channel) => ({
      label: countryColumnLabel(channel, country),
      hint: `${COUNTRY_LABELS[country]} fiyatı · ${vatBaseHint(channel)}; boşsa genel fiyat geçer`,
      right: true,
    })),
  ),
];

/** Okunmamış değer "—"dır: sıfır stok ile okunmamış stok aynı şey değildir (CLAUDE §1). */
function Unknown() {
  return <span className="font-ops-mono text-ops-xs text-ops-muted">—</span>;
}

interface TwoLineProps {
  top: string;
  bottom: string | null;
  right?: boolean;
  hint?: string;
}

function TwoLine({ top, bottom, right = false, hint }: TwoLineProps) {
  return (
    <span className={['flex min-w-0 flex-col', right ? 'items-end' : ''].join(' ')} title={hint}>
      <span className="truncate font-ops-mono text-ops-xs text-ops-strong">{top}</span>
      {bottom === null ? null : <span className="truncate font-ops-body text-ops-micro text-ops-muted">{bottom}</span>}
    </span>
  );
}

/** Tutar kutusu ve alt satırın iskeleti; alt satır görünmez metinle aynı yüksekliği tutar. */
function PriceSkeleton() {
  return (
    <span className="flex flex-col gap-0.5">
      <Skeleton className="h-[30px] w-full rounded-ops-btn" />
      <span className="invisible font-ops-body text-ops-micro">marj</span>
    </span>
  );
}

const EDIT_HINT = 'Tek tık: tutarı düzelt · Çift tık: tam form (hedef marj · otomatik · ileri tarih)';
const LOCKED_HINT = 'Otomatik fiyat açık — tutar hedef marjdan hesaplanıyor. Çift tık: hedef marjı düzenle.';

interface CountryCellProps {
  price: PriceRow;
  country: Country;
  channel: Channel;
  overrideCents: number | null;
  vat: CountryVat | undefined;
  sellerRate: number;
  onChange: (cents: number | null) => void;
}

/** Ülke hücresi: ülke fiyatı yoksa genel tutarı soluk gösterir; marj o ülkedeki tüketiciye bugün uygulanan oranla hesaplanır. */
function CountryCell({ price, country, channel, overrideCents, vat, sellerRate, onChange }: CountryCellProps) {
  const inherited = overrideCents === null;
  const shown = overrideCents ?? price[channel].amountCents;
  // KDV hariç kanalda oran marjı değiştirmez; dahil kanalda bilinmeyen oranla marj da bilinmez.
  const rate = vatBaseOf(channel) === 'ttc' ? (vat?.consumerRate ?? null) : sellerRate;
  const basis = rate === null ? null : { costCents: price.costCents, vatRate: rate };
  return (
    <PriceEditCell
      amountCents={shown}
      inherited={inherited}
      margin={basis === null ? null : marginAt(channel, shown, basis)}
      marginFor={(euros) => (basis === null ? null : marginForAmount(channel, euros, basis))}
      locked={price.autoPrice}
      blocked={channel === 'b2c' && vat?.sellableToConsumer === false ? 'satılmıyor' : null}
      hint={price.autoPrice ? LOCKED_HINT : `Tek tık: ${COUNTRY_LABELS[country]} fiyatını yaz · boşsa genel fiyat geçer`}
      write={(cents) => setCountryPriceAction(price.variantId, channel, country, cents).then((result) => result.error)}
      remove={inherited ? undefined : () => removeCountryPriceAction(price.variantId, channel, country).then((result) => result.error)}
      onChange={onChange}
    />
  );
}

interface DetailCellsProps {
  detail: VariantDetail | undefined;
  rates: Pick<ProductRowDetail, 'sellerRate' | 'countryVat'> | null;
  pending: boolean;
  onSaved: (channel: Channel, amountCents: number, row: PriceRow) => void;
  onCountrySaved: (country: Country, channel: Channel, amountCents: number | null) => void;
  onOpenForm: (row: PriceRow) => void;
}

function DetailCells({ detail, rates, pending, onSaved, onCountrySaved, onOpenForm }: DetailCellsProps) {
  if (pending) {
    return (
      <>
        <Skeleton className="h-2.5 w-14" />
        <span className="flex flex-col items-end gap-1">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-2.5 w-12" />
        </span>
        <span className="flex flex-col items-end gap-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-2.5 w-16" />
        </span>
        {Array.from({ length: PRICE_COLUMNS }, (_, i) => (
          <PriceSkeleton key={i} />
        ))}
      </>
    );
  }

  if (!detail || rates === null) {
    return (
      <>
        <Unknown />
        {Array.from({ length: 2 + PRICE_COLUMNS }, (_, i) => (
          <span key={i} className="text-right">
            <Unknown />
          </span>
        ))}
      </>
    );
  }

  const barcode = barcodeParts(detail.barcodes);
  const stock = stockParts(detail.availableQty, detail.warehouses);
  const expiry = detail.nearest === null ? null : expiryParts(detail.nearest);
  const price = detail.price;
  return (
    <>
      {barcode === null ? (
        <Unknown />
      ) : (
        <span className="truncate font-ops-mono text-ops-xs text-ops-strong" title={barcode.hint}>
          {barcode.label}
        </span>
      )}

      <span className="flex flex-col items-end" title={stock.hint ?? undefined}>
        <span className={['font-ops-mono text-ops-sm font-semibold', stock.total === 0 ? 'text-ops-red' : 'text-ops-ink'].join(' ')}>
          {stock.total}
        </span>
        <span className={['font-ops-body text-ops-micro', stock.hint === null ? 'text-ops-amber' : 'text-ops-muted'].join(' ')}>
          {stock.note}
        </span>
      </span>

      {expiry === null ? (
        <span className="text-right font-ops-body text-ops-micro text-ops-muted">parti yok</span>
      ) : (
        <TwoLine top={expiry.date} bottom={expiry.note} right />
      )}

      {price === null
        ? Array.from({ length: PRICE_COLUMNS }, (_, i) => (
            <span key={i} className="text-right">
              <Unknown />
            </span>
          ))
        : [
            ...PRICE_CHANNELS.map((channel) => (
              <PriceEditCell
                key={channel}
                amountCents={price[channel].amountCents}
                margin={cellMargin(price, channel)}
                marginFor={(euros) => marginForAmount(channel, euros, price)}
                locked={price.autoPrice}
                hint={price.autoPrice ? LOCKED_HINT : EDIT_HINT}
                write={(cents) => setChannelPriceAction(price.variantId, channel, cents).then((result) => result.error)}
                onChange={(cents) => {
                  if (cents !== null) onSaved(channel, cents, price);
                }}
                onOpenForm={() => onOpenForm(price)}
              />
            )),
            ...FOREIGN_COUNTRIES.flatMap((country) =>
              PRICE_CHANNELS.map((channel) => (
                <CountryCell
                  key={`${country}-${channel}`}
                  price={price}
                  country={country}
                  channel={channel}
                  overrideCents={detail.countryPrices[country]?.[channel].amountCents ?? null}
                  vat={rates.countryVat[country]}
                  sellerRate={rates.sellerRate}
                  onChange={(cents) => onCountrySaved(country, channel, cents)}
                />
              )),
            ),
          ]}
    </>
  );
}

interface RatesLineProps {
  rates: Pick<ProductRowDetail, 'sellerRate' | 'countryVat'>;
}

/** Ürünün oranları; ülkenin oranı girilmemişse o ülkenin tüketicisine satılmadığı için satır amber yazar. */
function RatesLine({ rates }: RatesLineProps) {
  const missing = FOREIGN_COUNTRIES.some((country) => (rates.countryVat[country]?.rate ?? null) === null);
  const parts = [
    `${COUNTRY_LABELS[SELLER_COUNTRY]} ${vatRateLabel(rates.sellerRate)}`,
    ...FOREIGN_COUNTRIES.map((country) => {
      const rate = rates.countryVat[country]?.rate ?? null;
      return `${COUNTRY_LABELS[country]} ${rate === null ? 'oranı yok' : vatRateLabel(rate)}`;
    }),
  ];
  return (
    <span
      className={[
        'whitespace-nowrap rounded-ops-btn border px-2 py-0.5 font-ops-body text-ops-micro',
        missing ? 'border-ops-amber-line bg-ops-amber-bg text-ops-amber' : 'border-ops-line bg-ops-white text-ops-strong',
      ].join(' ')}
    >
      {`KDV · ${parts.join(' · ')}`}
    </span>
  );
}

interface VariantBreakdownProps {
  product: ProductView;
  /** `undefined` → istek başlamadı; `detail: null` → sürüyor. */
  state: RowDetailState | undefined;
  onRefresh: () => void;
  onSaved: (variantId: string, channel: Channel, amountCents: number, row: PriceRow) => void;
  onCountrySaved: (variantId: string, country: Country, channel: Channel, amountCents: number | null) => void;
}

export function VariantBreakdown({ product, state, onRefresh, onSaved, onCountrySaved }: VariantBreakdownProps) {
  const [formRow, setFormRow] = useState<PriceRow | null>(null);
  // Derin bakışlar (parti geçmişi · fiyat satırları) kırılımın içinden açılır: operatör ürünün yanından ayrılmadan bakar.
  const [peek, setPeek] = useState<'stock' | 'prices' | null>(null);
  const pending = state === undefined || (state.detail === null && state.error === null);
  const detail = state?.detail ?? null;
  const byVariant = new Map((detail?.variants ?? []).map((row) => [row.variantId, row]));
  const primaryId = product.price?.variantId ?? null;

  return (
    <div className="border-b border-ops-line bg-ops-subtle py-1.5 pl-[60px] pr-6" onDoubleClick={(event) => event.stopPropagation()}>
      <div
        className="grid items-center justify-between gap-2.5 py-1.5 font-ops-display text-ops-micro font-semibold uppercase tracking-[0.07em] text-ops-muted"
        style={{ gridTemplateColumns: TRACKS }}
      >
        {HEADERS.map((header) => (
          <span key={header.label} title={header.hint} className={header.right ? 'text-right' : undefined}>
            {header.label}
          </span>
        ))}
      </div>

      {product.variants.map((variant) => {
        const net = netParts(variant);
        const packed = packedParts(variant);
        return (
          <div
            key={variant.id}
            className="grid min-h-[52px] items-center justify-between gap-2.5 border-t border-ops-line py-1.5 font-ops-body text-ops-sm text-ops-strong"
            style={{ gridTemplateColumns: TRACKS }}
          >
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate font-ops-display text-ops-sm font-semibold text-ops-ink">{sizeLabel(variant)}</span>
              {variant.id === primaryId ? <span className="font-ops-body text-ops-micro text-ops-muted">birincil</span> : null}
              {variant.isActive ? null : <Badge tone="neutral">kapalı</Badge>}
            </span>
            <span className="truncate font-ops-mono text-ops-xs">{variant.sku ?? '—'}</span>
            <TwoLine top={net.net} bottom={net.portion} />
            {packed === null ? <Badge tone="amber">ölçü yok</Badge> : <TwoLine top={packed.weight} bottom={packed.size} />}
            <DetailCells
              detail={byVariant.get(variant.id)}
              rates={detail}
              pending={pending}
              onSaved={(channel, cents, row) => onSaved(variant.id, channel, cents, row)}
              onCountrySaved={(country, channel, cents) => onCountrySaved(variant.id, country, channel, cents)}
              onOpenForm={setFormRow}
            />
          </div>
        );
      })}

      <div className="mt-2 flex items-center gap-2.5">
        <span
          className="cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-olive hover:text-ops-olive-dark"
          onClick={() => setPeek('stock')}
        >
          Partileri aç
        </span>
        <span className="font-ops-body text-ops-micro text-ops-muted">·</span>
        <span
          className="cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-olive hover:text-ops-olive-dark"
          onClick={() => setPeek('prices')}
        >
          Fiyat bakışı
        </span>
        {detail === null ? null : (
          <span className="ml-3">
            <RatesLine rates={detail} />
          </span>
        )}
        <span className="ml-auto font-ops-body text-ops-micro text-ops-muted">
          Satıra tekrar tıklamak kapatır · çift tık ürün formunu açar
        </span>
      </div>

      {state?.error ? (
        <div className="mt-2 flex items-center gap-2.5 rounded-ops-card border border-ops-red-line bg-ops-red-bg px-3 py-2">
          <span className="font-ops-body text-ops-xs text-ops-red-dark">
            Boy ayrıntısı okunamadı — barkod, stok, son tarih ve fiyat <b>bilinmiyor</b>.
          </span>
          <Button variant="secondary" size="sm" className="ml-auto" onClick={onRefresh}>
            Yeniden dene
          </Button>
        </div>
      ) : null}

      {formRow === null || detail === null ? null : (
        <PriceDialog
          row={formRow}
          countries={{ prices: byVariant.get(formRow.variantId)?.countryPrices ?? {}, vat: detail.countryVat }}
          stepCents={detail.autoPriceStepCents}
          onClose={() => {
            setFormRow(null);
            onRefresh();
          }}
        />
      )}
      {peek === 'stock' ? (
        <StockPeekDialog
          key={`stock-${product.id}`}
          productId={product.id}
          productName={product.slug}
          variantCount={product.variants.length}
          onClose={() => setPeek(null)}
        />
      ) : null}
      {peek === 'prices' ? (
        <PricePeekDialog
          key={`prices-${product.id}`}
          productId={product.id}
          productName={product.slug}
          variantCount={product.variants.length}
          onClose={() => setPeek(null)}
        />
      ) : null}
    </div>
  );
}
