'use client';

import { useState } from 'react';
import { Button } from '@/components/operation/ui/button';
import { Combobox } from '@/components/operation/form/combobox';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { Select } from '@/components/operation/form/select';
import { money, num } from '@/components/operation/ui/format';
import { PlusIcon, TrashIcon } from '@/components/operation/ui/icons';
import {
  emptyPurchaseOrderLine,
  purchaseOrderEstimate,
  type PurchaseOrderFormLine,
  type PurchaseOrderFormValues,
} from './schema';

/**
 * **TEDARİK SİPARİŞİ FORMUNUN GÖVDESİ** — iki yüzey paylaşır (22.33).
 *
 * Tedarik ekranının "elle sipariş" penceresi ve asistan kuyruğunun `purchase_order` gövdesi aynı
 * satır editörünü açar. Şema künyesinde gerekçe var; buradaki tek not şekle dair.
 *
 * ── RHF YOK ve bu bilinçli ──────────────────────────────────────────────────
 * `IntakeFormBody` ile aynı karar: satır editörü kontrollü bir liste (ekle/çıkar/hücre yaz) ve
 * gerçeğin sahibi zaten çağıran. Kuyruk gövdesi değerleri çerçeveden alıyor (`draft`/`onDraft`),
 * araya bir form kütüphanesi koymak tek yaptığı şey aynı diziyi ileri geri kopyalamak olurdu.
 * Bu yüzden elle sipariş penceresi de RHF'ten çıkarıldı — iki yüzey aynı gövdeyi ancak aynı
 * sözleşmeyle paylaşabilir.
 */

/** Kalem satırının şeridi — başlıklar ve kutular AYNI dizeyi okur, hiza elle tutulmaz. */
const LINE_GRID = 'grid grid-cols-[minmax(0,1fr)_72px_104px_26px] items-center gap-2';

interface PurchaseOrderFormBodyProps {
  values: PurchaseOrderFormValues;
  onChange: (next: PurchaseOrderFormValues) => void;
  /** Ürün arama — SUNUCUDA; katalog forma indirilmez. */
  onSearch: (term: string) => Promise<Array<{ variantId: string; label: string }>>;
  suppliers: Array<{ id: string; name: string }>;
  /** Seçilebilecek depolar. Boş seçim geçerli — şemadaki `targetWarehouseId` künyesi. */
  warehouses: Array<{ id: string; name: string }>;
  disabled?: boolean;
}

export function PurchaseOrderFormBody({ values, onChange, onSearch, suppliers, warehouses, disabled }: PurchaseOrderFormBodyProps) {
  // Seçici UZAK kipte: katalogun tamamını forma indirmenin karşılığı yok (eşleme şeridinin deseni).
  const [options, setOptions] = useState<Array<{ variantId: string; label: string }>>([]);
  const [searching, setSearching] = useState(false);

  const search = (term: string) => {
    setSearching(true);
    void onSearch(term).then((found) => {
      setOptions(found);
      setSearching(false);
    });
  };

  const patchLine = (index: number, patch: Partial<PurchaseOrderFormLine>) =>
    onChange({ ...values, lines: values.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) });

  const estimate = purchaseOrderEstimate(values);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="Tedarikçi" required>
          <Select
            value={values.supplierId}
            onChange={(supplierId) => onChange({ ...values, supplierId })}
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            placeholder="Kimden alınacak"
            disabled={disabled}
          />
        </FieldShell>
        <FieldShell label="Hangi depo için" labelAside="boş = belli değil">
          <Select
            value={values.targetWarehouseId}
            onChange={(targetWarehouseId) => onChange({ ...values, targetWarehouseId })}
            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            placeholder="Seçilmedi"
            disabled={disabled}
          />
        </FieldShell>
      </div>

      <section className="flex flex-col gap-2">
        <header className="flex items-center gap-2">
          <span className="mr-auto font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
            Kalemler
          </span>
          {/* Tahmini tutar BAŞLIKTA: adet değiştikçe canlı oynar ve kararın yanında durur. Bir kalemin
              bile fiyatı yoksa sayı hiç yazılmaz, kaç kalemin eksik olduğu yazılır (şema künyesi). */}
          {values.lines.length > 0 ? (
            <span className="font-ops-body text-ops-xs text-ops-muted">
              {estimate.totalCents === null ? (
                `${num(estimate.unpricedCount)} kalemde fiyat yok`
              ) : (
                <>
                  ~<span className="font-ops-mono text-ops-sm text-ops-body">{money(estimate.totalCents)}</span>
                </>
              )}
            </span>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => onChange({ ...values, lines: [...values.lines, emptyPurchaseOrderLine()] })}
          >
            <PlusIcon /> Kalem ekle
          </Button>
        </header>

        {values.lines.length === 0 ? (
          <p className="rounded-ops-card border border-dashed border-ops-line-strong px-3.5 py-4 text-center font-ops-body text-ops-sm text-ops-muted">
            Henüz kalem yok — “Kalem ekle” ile başlayın.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {/* Etiketler satır BAŞINA değil bir kez, kutuların üstünde (paket kalem düzenleyicisinin
                deseni): her satıra etiket koymak listeyi okunmaz eder. Alan hatası da satır satır
                yazılmıyor — engel alt barda tek cümlede söyleniyor (`purchaseOrderBlock`). */}
            <li className={`${LINE_GRID} font-ops-body text-ops-xs text-ops-muted`}>
              <span>Ürün</span>
              <span className="text-right">Adet</span>
              <span className="text-right">Son alış</span>
              <span />
            </li>
            {values.lines.map((line, index) => (
              <li key={`${line.variantId || 'bos'}-${index}`} className={LINE_GRID}>
                <Combobox
                  value={line.variantId}
                  onChange={(variantId) =>
                    patchLine(index, { variantId, title: options.find((o) => o.variantId === variantId)?.label ?? line.title })
                  }
                  options={options.map((o) => ({ value: o.variantId, label: o.label }))}
                  // Uzak kipte seçilen etiket sonuç listesinden düşebilir; son bulunanı tutuyoruz.
                  selectedLabel={line.title || undefined}
                  onSearch={search}
                  loading={searching}
                  placeholder="Ürün seç"
                  searchPlaceholder="Ürün adı yazın…"
                  emptyText="Eşleşen ürün yok — ürün adının bir parçasını yazın."
                  disabled={disabled}
                />
                <Input
                  mono
                  inputMode="numeric"
                  className="text-right"
                  aria-label="Adet"
                  disabled={disabled}
                  value={String(line.qty ?? '')}
                  onChange={(e) => patchLine(index, { qty: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                />
                {/* Fiyat SALT OKUNUR: alış mal kabulde kesinleşir (şema künyesi). Bilinmiyorsa "—",
                    sıfır değil — bedava alınmış gibi okunurdu (`CLAUDE §1`). */}
                <span className="text-right font-ops-mono text-ops-sm text-ops-muted">
                  {line.lastPurchasePriceCents === null ? '—' : money(line.lastPurchasePriceCents)}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ ...values, lines: values.lines.filter((_, i) => i !== index) })}
                  title="Kalemi çıkar"
                  className="cursor-pointer rounded-ops-btn p-1.5 text-ops-faint transition-colors hover:bg-ops-red-bg hover:text-ops-red disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <FieldShell label="Not">
        <Input
          value={values.note ?? ''}
          onChange={(e) => onChange({ ...values, note: e.target.value })}
          placeholder="Teslim günü, özel istek…"
          disabled={disabled}
        />
      </FieldShell>
    </div>
  );
}
