import { Badge } from '@/components/operation/ui/badge';
import { ErrorState } from '@/components/operation/ui/error-state';
import { InfoIcon } from '@/components/operation/ui/icons';
import { money } from '@/components/operation/ui/format';
import type { SuggestionGroupView, SupplierCardView } from './procurement-types';

// İki cihaz görünümünün ORTAK içerik parçaları — masaüstü/mobil yalnız yerleşimi değiştirir
// (grid ↔ tek kolon); kart ve satırların kendisi tek nüsha.

/** Vade rozeti — kart ve grup başlığı aynı sözlüğü kullanır. */
function TermBadge({ days }: { days: number | null }) {
  return days ? <Badge tone="olive">{days} gün vade</Badge> : <Badge tone="neutral">Peşin</Badge>;
}

/** Tedarikçiye gruplu öneri kartı. Taslak düğmesi AKSİYON dilimiyle gelir (BEKLEYEN(09.14)). */
export function SuggestionGroupCard({ group }: { group: SuggestionGroupView }) {
  const unmapped = group.supplierId === null;
  return (
    <section className="overflow-hidden rounded-ops-card border border-ops-line">
      <header className="flex flex-wrap items-center gap-3 border-b border-ops-line bg-ops-subtle px-4 py-3">
        <div className="mr-auto flex min-w-0 flex-col gap-px">
          <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">{group.supplierName}</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            {group.lines.length} ürün eşikte
            {group.warehouseCount > 1 ? ` · ${group.warehouseCount} depo` : ''}
          </span>
        </div>
        {unmapped ? (
          // Sipariş açılamaz (motor reddeder: kime yazılacağı belli değil) — sebep rozette, sessiz değil.
          <Badge tone="amber">eşleme yok — sipariş açılamaz</Badge>
        ) : (
          <TermBadge days={group.paymentTermDays} />
        )}
      </header>
      <ul>
        {group.lines.map((line) => (
          <li
            key={`${line.variantId}·${line.warehouseCode}`}
            className="flex items-center gap-3 border-b border-ops-line-soft px-4 py-2.5 last:border-b-0"
          >
            <div className="mr-auto flex min-w-0 flex-col gap-px">
              <span className="truncate font-ops-body text-ops-base font-medium text-ops-ink">{line.title}</span>
              {line.supplierCode ? (
                <span className="font-ops-body text-ops-xs text-ops-muted">kod: {line.supplierCode}</span>
              ) : null}
            </div>
            {/* Satır DEPOSUNU söyler: eşik depo bazlı bir gerçek — aynı ürün iki depoda iki satırdır. */}
            <Badge tone="blue" outline className="font-ops-mono">
              {line.warehouseCode}
            </Badge>
            <span className="font-ops-mono text-ops-sm text-ops-red">{line.availableQty}</span>
            <span className="font-ops-mono text-ops-xs text-ops-faint">/ eşik {line.minStockQty}</span>
            <span className="w-20 text-right font-ops-mono text-ops-sm text-ops-muted">öneri {line.suggestedQty}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Boş kuyruk = temiz hâl — bir eksiklik gibi gösterilmez. */
export function SuggestionsEmpty() {
  return (
    <ErrorState
      tone="neutral"
      icon={<InfoIcon />}
      title="Eşik altına düşen ürün yok"
      description="Asgari stok eşiğinin altına inen ürün olduğunda burada tedarikçiye gruplu bir öneri listesi belirir."
    />
  );
}

/** Tedarikçi kartı — ad, vade, iletişim, türetilen borç. */
export function SupplierCard({ supplier }: { supplier: SupplierCardView }) {
  return (
    <section className="flex flex-col gap-2 rounded-ops-card border border-ops-line px-4 py-3.5">
      <header className="flex items-center justify-between gap-3">
        <span className="truncate font-ops-display text-ops-lead font-semibold text-ops-ink">{supplier.name}</span>
        {supplier.isActive ? <TermBadge days={supplier.paymentTermDays} /> : <Badge tone="slate">Pasif</Badge>}
      </header>
      {supplier.phone ? <span className="font-ops-body text-ops-sm text-ops-muted">{supplier.phone}</span> : null}
      <div className="flex gap-5 border-t border-ops-line-soft pt-2">
        <span className="flex flex-col">
          <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.05em] text-ops-muted">Borç</span>
          <span className={['font-ops-mono text-ops-lead', supplier.debtCents > 0 ? 'text-ops-red' : 'text-ops-ink'].join(' ')}>
            {money(supplier.debtCents)}
          </span>
        </span>
        <span className="flex flex-col">
          {/* Tasarım "Bu yıl" istiyor; dönemli toplam arka uç talebinde — o gelene dek dürüst etiket. */}
          <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.05em] text-ops-muted">
            Toplam alım
          </span>
          <span className="font-ops-mono text-ops-lead text-ops-ink">{money(supplier.intakeTotalCents)}</span>
        </span>
      </div>
    </section>
  );
}

