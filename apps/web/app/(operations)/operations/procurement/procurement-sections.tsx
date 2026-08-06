'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { ErrorState } from '@/components/operation/ui/error-state';
import { InfoIcon } from '@/components/operation/ui/icons';
import { money } from '@/components/operation/ui/format';
import type { SuggestionGroupView, SuggestionLineView, SupplierCardView } from './procurement-types';

// Ekranın ORTAK içerik parçaları — panolar yalnız yerleşimi değiştirir; kart ve satırların
// kendisi tek nüsha.

/** Vade rozeti — kart ve grup başlığı aynı sözlüğü kullanır. */
function TermBadge({ days }: { days: number | null }) {
  return days ? <Badge tone="olive">{days} gün vade</Badge> : <Badge tone="neutral">Peşin</Badge>;
}

interface SuggestionGroupCardProps {
  group: SuggestionGroupView;
  /** "Tek dokunuş taslak" — DOMAIN §16'nın ana vaadi. Sürerken düğme kilitlenir. */
  onCreateDraft: (supplierId: string) => void;
  creating: boolean;
}

/** Tedarikçiye gruplu öneri kartı — başlıkta tek dokunuşla taslak açan düğme. */
export function SuggestionGroupCard({ group, onCreateDraft, creating }: SuggestionGroupCardProps) {
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
          <>
            <TermBadge days={group.paymentTermDays} />
            <Button size="sm" variant="primary" disabled={creating} onClick={() => onCreateDraft(group.supplierId!)}>
              {creating ? 'Açılıyor…' : 'Sipariş taslağı oluştur →'}
            </Button>
          </>
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
              <span className="truncate font-ops-body text-ops-xs text-ops-muted">
                {line.supplierCode ? `kod: ${line.supplierCode}` : null}
                {line.supplierCode ? <LineHints line={line} lead=" · " /> : <LineHints line={line} lead="" />}
              </span>
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

/**
 * Satırın "neden hâlâ burada" ipuçları — üçü de AYRI, çünkü üçü ayrı şey (`ReorderLine` künyesi).
 *
 * - **yolda** — gönderilmiş sipariş. Öneri bunu zaten düşmüştür; satır duruyorsa yolda olan
 *   yetmiyor demektir. Yazılıyor ki operatör "ama ben sipariş vermiştim" diye ikincisini açmasın.
 * - **taslakta** — açılmış ama GÖNDERİLMEMİŞ. Eşiğe girmez ve girmemeli: göndermeyi unuttuğumuz
 *   bir taslağın eksiği kapatmış görünmesi, sessizce boş raf demekti. Uyarı tam da bu yüzden var.
 * - **hedefsiz** — açık siparişte var ama hangi depoya geleceği yazılmamış. Hiçbir depoya sayılmaz
 *   (varsaymak yasak, K6) ama gizlenmez de: ölçemediğimizi sıfır saymıyoruz (`CLAUDE.md §1`).
 * - **başka depoda** — sipariş yerine TRANSFER seçeneği. Yargı değil sayı: "şuradan çek" demiyoruz,
 *   öteki deponun kendi eşiğini bilmiyoruz. Kararı operatör verir, transferi Stok ekranı yazar.
 */
function LineHints({ line, lead }: { line: SuggestionLineView; lead: string }) {
  const parts: string[] = [];
  if (line.incomingQty > 0) parts.push(`${line.incomingQty} yolda`);
  if (line.draftQty > 0) parts.push(`${line.draftQty} taslakta`);
  if (line.unassignedQty > 0) parts.push(`${line.unassignedQty} hedefsiz siparişte`);
  if (line.elsewhere.length > 0) parts.push(`başka depoda ${line.elsewhere.map((w) => `${w.code} ${w.qty}`).join(', ')}`);
  if (parts.length === 0) return null;
  return <span className="text-ops-strong">{`${lead}${parts.join(' · ')}`}</span>;
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

/** Tedarikçi kartı — ad, vade, iletişim, türetilen borç, yoldaki sipariş. Tıklanınca kart açılır. */
export function SupplierCard({ supplier, onEdit }: { supplier: SupplierCardView; onEdit: (s: SupplierCardView) => void }) {
  return (
    <section
      onClick={() => onEdit(supplier)}
      className="flex cursor-pointer flex-col gap-2 rounded-ops-card border border-ops-line px-4 py-3.5 transition-colors hover:border-ops-olive"
    >
      <header className="flex items-center justify-between gap-3">
        <span className="truncate font-ops-display text-ops-lead font-semibold text-ops-ink">{supplier.name}</span>
        {supplier.isActive ? <TermBadge days={supplier.paymentTermDays} /> : <Badge tone="slate">Pasif</Badge>}
      </header>
      <div className="flex flex-wrap items-center gap-2 font-ops-body text-ops-sm text-ops-muted">
        {supplier.phone ? <span>{supplier.phone}</span> : <span className="text-ops-faint">telefon girilmemiş</span>}
        {/* "Bu firmadan yolda ne var" — kart tek başına okunabilsin diye burada. */}
        {supplier.pendingOrderCount > 0 ? <Badge tone="blue">{supplier.pendingOrderCount} sipariş yolda</Badge> : null}
      </div>
      <div className="flex gap-5 border-t border-ops-line-soft pt-2">
        <span className="flex flex-col">
          <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.05em] text-ops-muted">Borç</span>
          <span className={['font-ops-mono text-ops-lead', supplier.debtCents > 0 ? 'text-ops-red' : 'text-ops-ink'].join(' ')}>
            {money(supplier.debtCents)}
          </span>
        </span>
        <span className="flex flex-col">
          {/* "Bu yıl" — dönem süzgeci yılbaşından, okuma tarafında (`readSupplierCards`). Yanındaki
              borç bilerek DÖNEMSİZ: ikisi ayrı soru, aynı pencereye sokmak borcu yalancı yapardı. */}
          <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.05em] text-ops-muted">
            Bu yıl alım
          </span>
          <span className="font-ops-mono text-ops-lead text-ops-ink">{money(supplier.intakeTotalCents)}</span>
        </span>
      </div>
    </section>
  );
}

