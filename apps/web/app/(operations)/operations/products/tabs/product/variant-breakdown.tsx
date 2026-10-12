'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Skeleton } from '@/components/operation/ui/skeleton';
import { PriceDialog } from '@/components/operation/prices/price-dialog';
import { expiryLine } from '@/lib/stock/batch-labels';
import type { PriceRow } from '@/lib/pricing/price-rows';
import type { ProductVariant } from '@lezzet/types';
import { sizeLabel, type ProductView, type VariantRowDetail } from '../../products-types';
import { PriceEditCell } from './price-edit-cell';
import type { RowDetailState } from './use-row-detail.hook';

// SATIRIN ALTINA AÇILAN BOY KIRILIMI — satılabilir birim boydur, oysa liste ürün seviyesinde durur.
// Burada boyun kimliği (SKU, net, porsiyon, ambalaj ölçüsü, barkod) ile o boyun stoğu, en yakın
// partisi ve kanal fiyatları yan yana görünür.
//
// İSKELET YALNIZ BEKLEYEN HÜCRELERDE: sol taraf (boy, SKU, net, porsiyon, ambalaj, aktiflik) liste
// sorgusuyla zaten gelmiştir ve açılır açılmaz dolu çizilir. Sunucudan beklenen dört hücre vardır:
// barkod · stok/depo · en yakın son tarih · fiyatlar. Satır sayısı da boy sayısı kadardır (o da
// biliniyor), böylece veri düşünce hiçbir şey zıplamaz.

/**
 * Dokuz sütun, ikisi SABİT: fiyat hücreleri düzenlenebilir kutudur ve daraldıkça rakam kırpılırdı.
 * Gerisi ESNER, çünkü sabit şerit 1512 px'lik ekranda tablo alanından taşıyor ve tabloyu yatay
 * kaydırıyordu — ürün adları soldan kesiliyordu (dev modda ölçüldü). Sıkışan metin `truncate` ile
 * kırpılır; tam değeri hücrenin başlığı (title) ve ürün formu söyler.
 *
 * Net ile porsiyon tek hücrede ("810 g · 9 adet") ve aktiflik boy adının yanında — ikisi de ayrı
 * sütunken şerit 200 px daha genişti.
 */
const TRACKS =
  'minmax(92px,1.1fr) minmax(74px,0.85fr) minmax(86px,1fr) minmax(88px,1.05fr) minmax(78px,0.9fr) minmax(90px,1fr) minmax(108px,1.3fr) 104px 104px';

function netLabel(variant: ProductVariant): string {
  return variant.netQuantity != null && variant.netUnit ? `${variant.netQuantity} ${variant.netUnit}` : '—';
}

/** "12 dilim" · "4 adet" — `portionKind` "neyin kaçı" sorusunun cevabı; adet tek başına yetmez. */
const PORTION_WORD = { item: 'adet', slice: 'dilim', package: 'paket' } as const;
function portionLabel(variant: ProductVariant): string {
  if (variant.piecesCount == null) return '—';
  return variant.portionKind ? `${variant.piecesCount} ${PORTION_WORD[variant.portionKind]}` : `${variant.piecesCount}`;
}

function PackedCell({ variant }: { variant: ProductVariant }) {
  const { packedWeightG, packedLengthMm, packedWidthMm, packedHeightMm } = variant;
  if (packedWeightG == null || packedLengthMm == null || packedWidthMm == null || packedHeightMm == null) {
    return <Badge tone="amber">ölçü yok</Badge>;
  }
  return (
    <span className="truncate font-ops-mono text-ops-xs text-ops-strong">
      {`${packedWeightG} · ${packedLengthMm}×${packedWidthMm}×${packedHeightMm}`}
    </span>
  );
}

/** Okunmamış hücrenin çubuğu — ürünün kendi iskelet token'ları (`skeleton` · `skeleton-soft`). */
function Pending({ width }: { width: string }) {
  return <Skeleton className={`h-2.5 ${width}`} />;
}

/** Okuma düştüğünde: boş değil BİLİNMİYOR — "—" bunu söyler, sıfır yazmak yalan olurdu. */
function Unknown() {
  return <span className="font-ops-mono text-ops-sm text-ops-muted">—</span>;
}

interface DetailCellsProps {
  detail: VariantRowDetail | undefined;
  pending: boolean;
  onSaved: () => void;
  onOpenForm: (row: PriceRow) => void;
}

function DetailCells({ detail, pending, onSaved, onOpenForm }: DetailCellsProps) {
  if (pending) {
    return (
      <>
        <Pending width="w-16" />
        <div className="flex justify-end">
          <Pending width="w-20" />
        </div>
        <div className="flex justify-end">
          <Pending width="w-24" />
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-6 w-full rounded-ops-btn" />
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-6 w-full rounded-ops-btn" />
        </div>
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

      <div className="flex flex-wrap justify-end gap-1">
        {detail.warehouses.length === 0 ? (
          <span className="font-ops-body text-ops-xs text-ops-muted">stok yok</span>
        ) : (
          detail.warehouses.map((split) => (
            <span key={split.warehouseId} className="rounded-md bg-ops-surface-sunken px-1.5 py-0.5 font-ops-body text-ops-xs text-ops-strong">
              {split.code} <b className="font-ops-mono font-semibold">{split.availableQty}</b>
            </span>
          ))
        )}
      </div>

      <div className="flex flex-col items-end gap-0.5">
        {detail.nearest === null ? (
          <span className="font-ops-body text-ops-xs text-ops-muted">parti yok</span>
        ) : (
          <>
            <span className="font-ops-mono text-ops-xs text-ops-ink">{expiryLine(detail.nearest)}</span>
            <span className="font-ops-body text-ops-micro text-ops-muted">{detail.nearest.batchNo}</span>
          </>
        )}
      </div>

      {detail.price === null ? (
        <>
          <Unknown />
          <Unknown />
        </>
      ) : (
        <>
          <PriceEditCell row={detail.price} channel="b2c" onSaved={onSaved} onOpenForm={() => onOpenForm(detail.price!)} />
          <PriceEditCell row={detail.price} channel="b2b" onSaved={onSaved} onOpenForm={() => onOpenForm(detail.price!)} />
        </>
      )}
    </>
  );
}

interface VariantBreakdownProps {
  product: ProductView;
  /** `undefined` → istek daha başlamadı; `rows: null` → sürüyor. */
  state: RowDetailState | undefined;
  /** Kırılımı yeniden okutur: düşen istek için de, yazdıktan sonra bayat kaydı atmak için de. */
  onRefresh: () => void;
}

export function VariantBreakdown({ product, state, onRefresh }: VariantBreakdownProps) {
  const router = useRouter();
  // Tam form kırılımın İÇİNDEN açılır: hangi boyun düzenlendiği sorusu zaten burada yanıtlı.
  const [formRow, setFormRow] = useState<PriceRow | null>(null);
  const pending = state === undefined || (state.rows === null && state.error === null);
  const byVariant = new Map((state?.rows ?? []).map((row) => [row.variantId, row]));

  // Fiyat yazıldı: kırılımın kendi satırı da, listenin özet kolonu da bayat. İkisi birden tazelenir.
  const refreshAll = () => {
    onRefresh();
    router.refresh();
  };

  // On bir sütunlu kırılım tablo alanından geniş olabilir: dar ekranda kendi içinde kaydırılır,
  // satırları sıkıştırıp okunmaz hâle getirmez.
  return (
    <div className="w-full min-w-0 max-w-full overflow-x-auto border-b border-ops-line bg-ops-subtle py-1.5 pl-7 pr-4">
      <div className="grid items-center gap-2.5 py-1.5 font-ops-display text-ops-micro font-semibold uppercase tracking-[0.07em] text-ops-muted" style={{ gridTemplateColumns: TRACKS }}>
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

      {product.variants.map((variant) => (
        <div
          key={variant.id}
          className="grid min-h-[46px] items-center gap-2.5 border-t border-ops-line py-1.5 font-ops-body text-ops-sm text-ops-strong"
          style={{ gridTemplateColumns: TRACKS }}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-ops-display text-ops-sm font-semibold text-ops-ink">{sizeLabel(variant)}</span>
            {variant.isActive ? null : <Badge tone="neutral">kapalı</Badge>}
          </span>
          <span className="truncate font-ops-mono text-ops-xs">{variant.sku ?? '—'}</span>
          {/* Net ile porsiyon aynı hücrede: ikisi de "bu pakette ne kadar var" sorusunun parçası. */}
          <span className="truncate font-ops-body text-ops-xs">
            <span className="font-ops-mono">{netLabel(variant)}</span>
            {variant.piecesCount == null ? null : ` · ${portionLabel(variant)}`}
          </span>
          <PackedCell variant={variant} />
          <DetailCells detail={byVariant.get(variant.id)} pending={pending} onSaved={refreshAll} onOpenForm={setFormRow} />
        </div>
      ))}

      {state?.error ? (
        <div className="mt-2.5 flex items-center gap-2.5 rounded-ops-card border border-ops-red-line bg-ops-red-bg px-3 py-2">
          <span className="font-ops-body text-ops-xs text-ops-red-dark">
            Boy ayrıntısı okunamadı — barkod, depo dağılımı, son tarih ve fiyat <b>bilinmiyor</b>. {state.error}
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
    </div>
  );
}
