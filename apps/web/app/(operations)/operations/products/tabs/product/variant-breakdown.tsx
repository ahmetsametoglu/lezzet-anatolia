'use client';

import { useState } from 'react';
import { vatBaseOf } from '@lezzet/domain-core';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Skeleton } from '@/components/operation/ui/skeleton';
import { PriceDialog } from '@/components/operation/prices/price-dialog';
import { expiryParts } from '@/lib/stock/batch-labels';
import type { PriceRow } from '@/lib/pricing/price-rows';
import type { Channel } from '@lezzet/types';
import { sizeLabel, type ProductView, type VariantRowDetail } from '../../products-types';
import { PriceEditCell } from './price-edit-cell';
import { PricePeekDialog } from './price-peek-dialog';
import { StockPeekDialog } from './stock-peek-dialog';
import type { RowDetailState } from './use-row-detail.hook';
import { barcodeParts, netParts, packedParts, stockParts } from './variant-cells';

// Satırın altına açılan boy kırılımı: satılabilir birim boydur ve fiyat da buradan yazılır. İskelet yalnız sunucudan beklenen
// hücrelerdedir ve gelen hücreyle aynı yeri kaplar, veri düşünce satır oynamaz.

const PRICE_CHANNELS: Channel[] = ['b2c', 'b2b'];

/** Kolonlar sabit genişlikte, boşluk aralara dağılır: fiyat hücresi tutar kadar kalır ve kırılım dar ekranda kesilmez. */
const TRACKS = ['120px', '62px', '56px', '92px', '90px', '64px', '112px', ...PRICE_CHANNELS.map(() => '88px')].join(' ');

/** Başlık kısa kalır, ayrıntısı tarayıcı ipucundadır. */
const HEADERS: Array<{ label: string; hint?: string; right?: boolean }> = [
  { label: 'Boy' },
  { label: 'SKU' },
  { label: 'Net', hint: 'Net miktar · porsiyon' },
  { label: 'Ambalaj', hint: 'Ambalajlı ağırlık · ölçü (mm)' },
  { label: 'Barkod' },
  { label: 'Stok', hint: 'Kullanılabilir adet · depo dağılımı sayının üzerinde', right: true },
  { label: 'Son tarih', hint: 'En yakın son tarihli parti', right: true },
  ...PRICE_CHANNELS.map((channel) => ({
    label: channel.toUpperCase(),
    hint: vatBaseOf(channel) === 'ttc' ? 'KDV dahil fiyat' : 'KDV hariç fiyat',
    right: true,
  })),
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

/** Tutar kutusu ve marj satırının iskeleti; marj satırı görünmez metinle aynı yüksekliği tutar. */
function PriceSkeleton() {
  return (
    <span className="flex flex-col gap-0.5">
      <Skeleton className="h-[30px] w-full rounded-ops-btn" />
      <span className="invisible font-ops-body text-ops-micro">marj</span>
    </span>
  );
}

interface DetailCellsProps {
  detail: VariantRowDetail | undefined;
  pending: boolean;
  onSaved: (channel: Channel, amountCents: number, row: PriceRow) => void;
  onOpenForm: (row: PriceRow) => void;
}

function DetailCells({ detail, pending, onSaved, onOpenForm }: DetailCellsProps) {
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
        {PRICE_CHANNELS.map((channel) => (
          <PriceSkeleton key={channel} />
        ))}
      </>
    );
  }

  if (!detail) {
    return (
      <>
        <Unknown />
        <span className="text-right">
          <Unknown />
        </span>
        <span className="text-right">
          <Unknown />
        </span>
        {PRICE_CHANNELS.map((channel) => (
          <span key={channel} className="text-right">
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

      {PRICE_CHANNELS.map((channel) =>
        price === null ? (
          <span key={channel} className="text-right">
            <Unknown />
          </span>
        ) : (
          <PriceEditCell
            key={channel}
            row={price}
            channel={channel}
            onSaved={(cents) => onSaved(channel, cents, price)}
            onOpenForm={() => onOpenForm(price)}
          />
        ),
      )}
    </>
  );
}

interface VariantBreakdownProps {
  product: ProductView;
  /** `undefined` → istek başlamadı; `rows: null` → sürüyor. */
  state: RowDetailState | undefined;
  onRefresh: () => void;
  onSaved: (variantId: string, channel: Channel, amountCents: number, row: PriceRow) => void;
}

export function VariantBreakdown({ product, state, onRefresh, onSaved }: VariantBreakdownProps) {
  const [formRow, setFormRow] = useState<PriceRow | null>(null);
  // Derin bakışlar (parti geçmişi · fiyat satırları) kırılımın içinden açılır: operatör ürünün yanından ayrılmadan bakar.
  const [peek, setPeek] = useState<'stock' | 'prices' | null>(null);
  const pending = state === undefined || (state.rows === null && state.error === null);
  const byVariant = new Map((state?.rows ?? []).map((row) => [row.variantId, row]));
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
              pending={pending}
              onSaved={(channel, cents, row) => onSaved(variant.id, channel, cents, row)}
              onOpenForm={setFormRow}
            />
          </div>
        );
      })}

      <div className="mt-2 flex items-center gap-2.5">
        <span className="cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-olive hover:text-ops-olive-dark" onClick={() => setPeek('stock')}>
          Partileri aç
        </span>
        <span className="font-ops-body text-ops-micro text-ops-muted">·</span>
        <span className="cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-olive hover:text-ops-olive-dark" onClick={() => setPeek('prices')}>
          Fiyat bakışı
        </span>
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

      {formRow === null ? null : (
        <PriceDialog
          row={formRow}
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
