'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Skeleton } from '@/components/operation/ui/skeleton';
import { PriceDialog } from '@/components/operation/prices/price-dialog';
import { expiryLine } from '@/lib/stock/batch-labels';
import type { PriceRow } from '@/lib/pricing/price-rows';
import type { Channel, ProductVariant } from '@lezzet/types';
import { useState } from 'react';
import { sizeLabel, type ProductView, type VariantRowDetail } from '../../products-types';
import { PriceEditCell } from './price-edit-cell';
import type { RowDetailState } from './use-row-detail.hook';

// BOYLAR — seçili ürünün panelindeki kart listesi. Satılabilir birim boydur; boyun kimliği (SKU,
// net, porsiyon, ambalaj ölçüsü, barkod) ile stoğu, en yakın partisi ve kanal fiyatları burada
// yan yana durur.
//
// Liste SATIRININ ALTINDA açılmıyor (kullanıcı kararı): alt satır listeyi aşağı itiyor, göz
// hizasını bozuyordu. Panelde durunca liste hiç oynamaz ve satırın tek anlamı kalır: seçmek.
//
// Kartın sol yarısı (boy adı, SKU, net, porsiyon, ambalaj) listeyle ZATEN gelmiştir ve kart
// açılır açılmaz doludur; sunucudan beklenen dört şey vardır: barkod · depo dağılımı · en yakın
// parti · kanal fiyatları. İskelet yalnız onların yerinde durur.

function netLine(variant: ProductVariant): string {
  const net = variant.netQuantity != null && variant.netUnit ? `${variant.netQuantity} ${variant.netUnit}` : '—';
  if (variant.piecesCount == null) return net;
  const word = variant.portionKind === 'slice' ? 'dilim' : variant.portionKind === 'package' ? 'paket' : 'adet';
  return `${net} · ${variant.piecesCount} ${word}`;
}

function packedLine(variant: ProductVariant): string | null {
  const { packedWeightG, packedLengthMm, packedWidthMm, packedHeightMm } = variant;
  if (packedWeightG == null || packedLengthMm == null || packedWidthMm == null || packedHeightMm == null) return null;
  return `${packedWeightG} g · ${packedLengthMm}×${packedWidthMm}×${packedHeightMm} mm`;
}

/** Etiketli tek satır; değeri bekleyen alanlarda çubuk çizilir, yer DEĞİŞMEZ. */
function Line({ label, value, pending, tone }: { label: string; value: string | null; pending: boolean; tone?: 'amber' }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="font-ops-display text-ops-micro uppercase tracking-[0.06em] text-ops-muted">{label}</span>
      {pending ? (
        <Skeleton className="h-2.5 w-24" />
      ) : (
        <span className={['truncate font-ops-mono text-ops-xs', tone === 'amber' ? 'text-ops-amber' : 'text-ops-strong'].join(' ')}>
          {value ?? '—'}
        </span>
      )}
    </div>
  );
}

interface VariantCardProps {
  variant: ProductVariant;
  detail: VariantRowDetail | undefined;
  pending: boolean;
  primary: boolean;
  onSaved: (channel: Channel, amountCents: number, row: PriceRow) => void;
  onOpenForm: (row: PriceRow) => void;
}

function VariantCard({ variant, detail, pending, primary, onSaved, onOpenForm }: VariantCardProps) {
  const packed = packedLine(variant);
  const price = detail?.price ?? null;

  return (
    <div className="flex flex-col gap-2 rounded-ops-card border border-ops-line bg-ops-white px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col">
          <span className="flex items-baseline gap-1.5">
            <span className="truncate font-ops-display text-ops-base font-semibold text-ops-ink">{sizeLabel(variant)}</span>
            {primary ? <span className="font-ops-body text-ops-micro text-ops-muted">birincil</span> : null}
          </span>
          {/* Net ve porsiyon boyun ADININ altında: ikisi de "bu pakette ne kadar var" sorusunun parçası. */}
          <span className="truncate font-ops-mono text-ops-xs text-ops-body">{netLine(variant)}</span>
        </span>
        {variant.isActive ? <Badge tone="olive">aktif</Badge> : <Badge tone="neutral">kapalı</Badge>}
      </div>

      {/* Etiketler TEK SATIRA sığacak kadar kısa: dar panelde "SKU · net" iki satıra kırılıyordu. */}
      <div className="flex flex-col gap-1">
        <Line label="SKU" value={variant.sku ?? '—'} pending={false} />
        <Line label="Ambalaj" value={packed ?? 'ölçü girilmedi'} pending={false} tone={packed === null ? 'amber' : undefined} />
        <Line label="Barkod" value={detail ? (detail.barcodes[0]?.code ?? 'eşleme yok') : null} pending={pending} />
        <Line
          label="Stok"
          value={detail ? (detail.warehouses.map((w) => `${w.code} ${w.availableQty}`).join(' · ') || 'stok yok') : null}
          pending={pending}
        />
        {/* Parti NUMARASI burada yok: yalnız parti varken çizilseydi kart boy boy farklı yükseklikte
            olurdu. Numara partinin kendi ekranındadır; buradaki soru "ne zaman bitiyor". */}
        <Line label="Parti" value={detail ? (detail.nearest ? expiryLine(detail.nearest) : 'parti yok') : null} pending={pending} />
      </div>

      {/* Fiyat satırı HER ZAMAN aynı yüksekliktedir: kutu açılınca da, marj değişince de yerinden
          oynamaz. Marj burada sabit bir satırdır — düzenlerken yeni bir öğe belirmez. */}
      <div className="grid grid-cols-2 gap-2 border-t border-ops-line-soft pt-2">
        {(['b2c', 'b2b'] as const).map((channel) => (
          <div key={channel} className="flex flex-col gap-1">
            <span className="font-ops-display text-ops-micro uppercase tracking-[0.06em] text-ops-muted">
              {channel === 'b2c' ? 'B2C · KDV dahil' : 'B2B · KDV hariç'}
            </span>
            {pending || price === null ? (
              <Skeleton className="h-[30px] w-full rounded-ops-btn" />
            ) : (
              <PriceEditCell
                row={price}
                channel={channel}
                onSaved={(cents) => onSaved(channel, cents, price)}
                onOpenForm={() => onOpenForm(price)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface VariantCardsProps {
  product: ProductView;
  /** `undefined` → istek başlamadı; `rows: null` → sürüyor. */
  state: RowDetailState | undefined;
  onRefresh: () => void;
  onSaved: (variantId: string, channel: Channel, amountCents: number, row: PriceRow) => void;
}

export function VariantCards({ product, state, onRefresh, onSaved }: VariantCardsProps) {
  const [formRow, setFormRow] = useState<PriceRow | null>(null);
  const pending = state === undefined || (state.rows === null && state.error === null);
  const byVariant = new Map((state?.rows ?? []).map((row) => [row.variantId, row]));
  const primaryId = product.price?.variantId ?? null;

  return (
    <div className="flex flex-col gap-2">
      {product.variants.map((variant) => (
        <VariantCard
          key={variant.id}
          variant={variant}
          detail={byVariant.get(variant.id)}
          pending={pending}
          primary={variant.id === primaryId}
          onSaved={(channel, cents, row) => onSaved(variant.id, channel, cents, row)}
          onOpenForm={setFormRow}
        />
      ))}

      {state?.error ? (
        <div className="flex items-center gap-2 rounded-ops-card border border-ops-red-line bg-ops-red-bg px-3 py-2">
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
    </div>
  );
}
