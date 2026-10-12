'use client';

import { useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Skeleton } from '@/components/operation/ui/skeleton';
import { PriceDialog } from '@/components/operation/prices/price-dialog';
import { expiryLine } from '@/lib/stock/batch-labels';
import type { PriceRow } from '@/lib/pricing/price-rows';
import type { Channel, ProductVariant } from '@lezzet/types';
import { sizeLabel, type ProductView, type VariantRowDetail } from '../../products-types';
import { PriceEditCell } from './price-edit-cell';
import { PricePeekDialog } from './price-peek-dialog';
import { StockPeekDialog } from './stock-peek-dialog';
import type { RowDetailState } from './use-row-detail.hook';

// SATIRIN ALTINA AÇILAN BOY KIRILIMI — satılabilir birim boydur, oysa liste ürün seviyesinde durur.
// Boyun kimliği (SKU, net, porsiyon, ambalaj ölçüsü, barkod) ile stoğu, en yakın partisi ve kanal
// fiyatları burada yan yana görünür; fiyat da buradan yazılır.
//
// Satırın kendisi açar/kapatır (ayrı düğme yok), çift tık ürün formunu açar — tıklama haritası
// kullanıcı kararıdır.
//
// İSKELET YALNIZ BEKLEYEN HÜCRELERDE: sol taraf (boy, SKU, net, porsiyon, ambalaj) liste
// sorgusuyla zaten gelmiştir ve açılır açılmaz doludur. Sunucudan beklenen dört hücre vardır:
// barkod · stok/depo · en yakın son tarih · fiyatlar. Satır sayısı da boy sayısı kadardır, yani
// veri düşünce hiçbir şey zıplamaz.

const TRACKS =
  'minmax(96px,1.1fr) minmax(78px,.9fr) minmax(96px,1.05fr) minmax(104px,1.15fr) minmax(86px,.95fr) minmax(104px,1.1fr) minmax(118px,1.25fr) 112px 112px';

function netLine(variant: ProductVariant): string {
  const net = variant.netQuantity != null && variant.netUnit ? `${variant.netQuantity} ${variant.netUnit}` : '—';
  if (variant.piecesCount == null) return net;
  const word = variant.portionKind === 'slice' ? 'dilim' : variant.portionKind === 'package' ? 'paket' : 'adet';
  return `${net} · ${variant.piecesCount} ${word}`;
}

function packedLine(variant: ProductVariant): string | null {
  const { packedWeightG, packedLengthMm, packedWidthMm, packedHeightMm } = variant;
  if (packedWeightG == null || packedLengthMm == null || packedWidthMm == null || packedHeightMm == null) return null;
  return `${packedWeightG} · ${packedLengthMm}×${packedWidthMm}×${packedHeightMm}`;
}

/** Okunmamış değer "—"dır: sıfır stok ile okunmamış stok aynı şey değildir (CLAUDE §1). */
function Unknown() {
  return <span className="font-ops-mono text-ops-xs text-ops-muted">—</span>;
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
        <Skeleton className="h-2.5 w-16" />
        <div className="flex justify-end">
          <Skeleton className="h-2.5 w-20" />
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-2.5 w-24" />
        </div>
        <Skeleton className="h-[30px] w-full rounded-ops-btn" />
        <Skeleton className="h-[30px] w-full rounded-ops-btn" />
      </>
    );
  }

  if (!detail) {
    return (
      <>
        <Unknown />
        <div className="text-right">
          <Unknown />
        </div>
        <div className="text-right">
          <Unknown />
        </div>
        <div className="text-right">
          <Unknown />
        </div>
        <div className="text-right">
          <Unknown />
        </div>
      </>
    );
  }

  const [first, ...rest] = detail.barcodes;
  return (
    <>
      <span className="truncate font-ops-mono text-ops-xs text-ops-strong">
        {first ? first.code : '—'}
        {rest.length > 0 ? <span className="text-ops-muted">{` +${rest.length}`}</span> : null}
      </span>

      <span className="truncate text-right font-ops-mono text-ops-xs text-ops-strong">
        {detail.warehouses.length === 0 ? 'stok yok' : detail.warehouses.map((w) => `${w.code} ${w.availableQty}`).join(' · ')}
      </span>

      <span className="truncate text-right font-ops-mono text-ops-xs text-ops-strong">
        {detail.nearest === null ? 'parti yok' : expiryLine(detail.nearest)}
      </span>

      {detail.price === null ? (
        <>
          <Unknown />
          <Unknown />
        </>
      ) : (
        <>
          <PriceEditCell
            row={detail.price}
            channel="b2c"
            onSaved={(cents) => onSaved('b2c', cents, detail.price as PriceRow)}
            onOpenForm={() => onOpenForm(detail.price as PriceRow)}
          />
          <PriceEditCell
            row={detail.price}
            channel="b2b"
            onSaved={(cents) => onSaved('b2b', cents, detail.price as PriceRow)}
            onOpenForm={() => onOpenForm(detail.price as PriceRow)}
          />
        </>
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
  // Derin bakışlar (parti geçmişi · fiyat satırları) kırılımın içinden açılır: operatör ürünün
  // yanından ayrılmadan bakar, tam ekrana köprü diyaloğun başlığında durur.
  const [peek, setPeek] = useState<'stock' | 'prices' | null>(null);
  const pending = state === undefined || (state.rows === null && state.error === null);
  const byVariant = new Map((state?.rows ?? []).map((row) => [row.variantId, row]));
  const primaryId = product.price?.variantId ?? null;

  return (
    <div className="border-b border-ops-line bg-ops-subtle py-1.5 pl-[60px] pr-6" onDoubleClick={(event) => event.stopPropagation()}>
      <div
        className="grid items-center gap-2.5 py-1.5 font-ops-display text-ops-micro font-semibold uppercase tracking-[0.07em] text-ops-muted"
        style={{ gridTemplateColumns: TRACKS }}
      >
        <span>Boy</span>
        <span>SKU</span>
        <span>Net · porsiyon</span>
        <span>Ambalaj (g · mm)</span>
        <span>Barkod</span>
        <span className="text-right">Stok · depo</span>
        <span className="text-right">En yakın son tarih</span>
        <span className="text-right">B2C · KDV dahil</span>
        <span className="text-right">B2B · KDV hariç</span>
      </div>

      {product.variants.map((variant) => {
        const packed = packedLine(variant);
        return (
          <div
            key={variant.id}
            className="grid min-h-[52px] items-center gap-2.5 border-t border-ops-line py-1.5 font-ops-body text-ops-sm text-ops-strong"
            style={{ gridTemplateColumns: TRACKS }}
          >
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate font-ops-display text-ops-sm font-semibold text-ops-ink">{sizeLabel(variant)}</span>
              {variant.id === primaryId ? <span className="font-ops-body text-ops-micro text-ops-muted">birincil</span> : null}
              {variant.isActive ? null : <Badge tone="neutral">kapalı</Badge>}
            </span>
            <span className="truncate font-ops-mono text-ops-xs">{variant.sku ?? '—'}</span>
            <span className="truncate font-ops-mono text-ops-xs">{netLine(variant)}</span>
            {packed === null ? (
              <Badge tone="amber">ölçü yok</Badge>
            ) : (
              <span className="truncate font-ops-mono text-ops-xs">{packed}</span>
            )}
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
        <span className="cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-olive" onClick={() => setPeek('stock')}>
          Partileri aç
        </span>
        <span className="font-ops-body text-ops-micro text-ops-muted">·</span>
        <span className="cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-olive" onClick={() => setPeek('prices')}>
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
