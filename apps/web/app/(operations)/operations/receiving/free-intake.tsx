'use client';

import { useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Combobox } from '@/components/operation/form/combobox';
import { Input } from '@/components/operation/form/input';
import { num } from '@/components/operation/ui/format';
import { RECEIVING_NOTES } from './receiving-labels';
import { createSupplierAction, searchIntakeVariantsAction } from './receiving-actions';
import type { IntakeRow } from './receiving-types';

/**
 * **Siparişsiz kabul** (10.4, tasarımın 2. karesi) — boş form + yeni tedarikçi + dökme yardımcısı.
 *
 * ── SONRADAN EŞLEŞTİRME YOK ─────────────────────────────────────────────────
 * Tasarımın kuralı: *"Sipariş kaydı olmayan alım — kamyondan inen neyse o girilir; sonradan
 * siparişle eşleştirilmez."* Bu yolda **fark da üretilmez**: karşılaştırılacak bir sipariş yok ve
 * her satırı "beklenmedik" saymak gürültü olurdu (kapının kendi kuralı, testle yakalanmış).
 *
 * ── KATALOG DIŞI ÜRÜN GİRİLMEZ ──────────────────────────────────────────────
 * Ürün arama katalogdan; tanımı olmayan ürün buradan yaratılamaz. Ürün tanımı yöneticinin işi —
 * rampada açılan bir ürün kaydı, adı/beyanı/görseli eksik bir katalog satırı bırakırdı.
 */
interface FreeIntakeProps {
  suppliers: { id: string; name: string }[];
  rows: IntakeRow[];
  onAddRow: (variantId: string, title: string) => void;
  onRow: (variantId: string, patch: Partial<IntakeRow>) => void;
  onRemoveRow: (variantId: string) => void;
  supplierId: string;
  onSupplier: (supplierId: string) => void;
  busy: boolean;
  onFinish: () => void;
}

export function FreeIntake({ suppliers, rows, onAddRow, onRow, onRemoveRow, supplierId, onSupplier, busy, onFinish }: FreeIntakeProps) {
  const [options, setOptions] = useState<{ variantId: string; label: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [newSupplier, setNewSupplier] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [adding, setAdding] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const onSearch = (term: string) => {
    setSearching(true);
    void searchIntakeVariantsAction(term)
      .then(({ data }) => setOptions(data ?? []))
      .finally(() => setSearching(false));
  };

  const addSupplier = () => {
    setLocalError(null);
    setAdding(true);
    void createSupplierAction(newSupplier, newPhone || null)
      .then(({ data, error }) => {
        if (error || !data) {
          setLocalError(error ?? 'Tedarikçi eklenemedi.');
          return;
        }
        onSupplier(data.id);
        setNewSupplier('');
        setNewPhone('');
      })
      .finally(() => setAdding(false));
  };

  const girilen = rows.filter((row) => row.receivedQty !== null && row.receivedQty > 0);

  return (
    <div className="flex flex-col gap-4 px-6 py-5">
      <div className="flex flex-col gap-1">
        <span className="font-ops-display text-ops-lg font-semibold text-ops-ink">Siparişsiz kabul</span>
        <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">{RECEIVING_NOTES.freeForm}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-ops-display text-ops-xs font-semibold text-ops-ink">Tedarikçi</span>
        <Combobox
          value={supplierId}
          onChange={onSupplier}
          options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
          placeholder="Tedarikçi seçin…"
          searchPlaceholder="Tedarikçi adı"
          emptyText="Eşleşen tedarikçi yok — aşağıdan ekleyebilirsiniz."
        />
        {/* Yeni tedarikçi AKIŞI KIRMADAN: ad + telefon yeter, gerisi admin işi. Kamyon rampada
            beklerken ayrı sayfaya gitmek kabulü tedarikçi formuna rehin vermek olurdu. */}
        <div className="mt-1 flex flex-wrap items-end gap-2 rounded-ops-card border border-ops-line bg-ops-subtle px-3 py-2.5">
          <label className="flex min-w-[180px] flex-1 flex-col gap-1">
            <span className="font-ops-body text-ops-micro text-ops-muted">Yeni tedarikçi adı</span>
            <Input value={newSupplier} onChange={(event) => setNewSupplier(event.target.value)} disabled={busy || adding} />
          </label>
          <label className="flex w-[160px] flex-col gap-1">
            <span className="font-ops-body text-ops-micro text-ops-muted">Telefon</span>
            <Input value={newPhone} onChange={(event) => setNewPhone(event.target.value)} disabled={busy || adding} placeholder="+33 6 …" />
          </label>
          <Button variant="secondary" size="sm" disabled={busy || adding || !newSupplier.trim()} onClick={addSupplier}>
            {adding ? 'Ekleniyor…' : '+ Ekle'}
          </Button>
          <span className="w-full font-ops-body text-ops-micro text-ops-faint">
            Ad + telefon yeter; vergi no, vade ve adres yöneticinin işi.
          </span>
        </div>
        {localError ? (
          <p className="font-ops-body text-ops-xs font-semibold text-ops-red">{localError}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-ops-display text-ops-xs font-semibold text-ops-ink">Kalemler</span>
        {rows.map((row) => (
          <div key={row.variantId} className="grid grid-cols-[1.6fr_88px_128px_104px_96px_40px] items-center gap-x-2">
            <span className="truncate font-ops-body text-ops-sm text-ops-ink">{row.title}</span>
            <Input
              type="number"
              min={1}
              fullWidth={false}
              className="w-full text-center"
              placeholder="adet"
              value={row.receivedQty === null ? '' : String(row.receivedQty)}
              onChange={(event) => onRow(row.variantId, { receivedQty: event.target.value === '' ? null : Math.max(0, Number(event.target.value) || 0) })}
              disabled={busy}
            />
            <Input type="date" fullWidth={false} className="w-full" value={row.expiryDate} onChange={(event) => onRow(row.variantId, { expiryDate: event.target.value })} disabled={busy} />
            <Input fullWidth={false} className="w-full" placeholder="lot" value={row.lotNumber} onChange={(event) => onRow(row.variantId, { lotNumber: event.target.value })} disabled={busy} />
            <Input fullWidth={false} className="w-full" placeholder="raf" value={row.location} onChange={(event) => onRow(row.variantId, { location: event.target.value })} disabled={busy} />
            <button
              type="button"
              onClick={() => onRemoveRow(row.variantId)}
              disabled={busy}
              aria-label="Satırı çıkar"
              className="cursor-pointer rounded-ops-btn border border-ops-line px-1.5 py-1 font-ops-body text-ops-micro text-ops-muted transition-colors hover:border-ops-red-line hover:text-ops-red disabled:cursor-not-allowed disabled:opacity-50"
            >
              ✕
            </button>
          </div>
        ))}

        <div className="flex items-center gap-2">
          <Combobox
            value=""
            onChange={(variantId) => {
              const found = options.find((option) => option.variantId === variantId);
              if (found) onAddRow(variantId, found.label);
            }}
            options={options.map((option) => ({ value: option.variantId, label: option.label }))}
            selectedLabel={undefined}
            onSearch={onSearch}
            loading={searching}
            placeholder="+ satır — ürün ara…"
            searchPlaceholder="Ürün adının bir parçasını yazın"
            emptyText={RECEIVING_NOTES.catalogOnly}
            className="min-w-0 flex-1"
          />
        </div>
        <span className="font-ops-body text-ops-micro text-ops-faint">{RECEIVING_NOTES.catalogOnly}</span>
      </div>

      <BulkHelper />

      <div className="flex items-center justify-between gap-3 border-t border-ops-line pt-3">
        <span className="font-ops-body text-ops-xs text-ops-muted">{RECEIVING_NOTES.noPrice}</span>
        <Button variant="primary" disabled={busy || girilen.length === 0} onClick={onFinish}>
          {busy ? 'Kaydediliyor…' : 'Girişi kaydet'}
        </Button>
      </div>
    </div>
  );
}

/**
 * **Dökme yardımcısı** — 10 kg ÷ 100 g = 100 paket.
 *
 * Yalnız HESAP yapar, kayda hiçbir şey yazmaz: tasarımın kuralı *"kayda giren tek şey paket
 * adedidir"*. Sonucu depocu okuyup adet hanesine kendisi yazar — otomatik doldursaydık, bölme
 * tutmadığında (7 kg ÷ 300 g) yanlış bir sayı sessizce satıra düşerdi.
 */
function BulkHelper() {
  const [bulk, setBulk] = useState('');
  const [pack, setPack] = useState('');

  const bulkGrams = Number(bulk) * 1000;
  const packGrams = Number(pack);
  const packs = packGrams > 0 && bulkGrams > 0 ? Math.floor(bulkGrams / packGrams) : null;

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-ops-card border border-ops-line bg-ops-surface-sunken px-3 py-2.5">
      <span className="w-full font-ops-display text-ops-xs font-semibold text-ops-ink">Dökme yardımcısı</span>
      <label className="flex w-[120px] flex-col gap-1">
        <span className="font-ops-body text-ops-micro text-ops-muted">Dökme (kg)</span>
        <Input type="number" min={0} value={bulk} onChange={(event) => setBulk(event.target.value)} />
      </label>
      <label className="flex w-[130px] flex-col gap-1">
        <span className="font-ops-body text-ops-micro text-ops-muted">Paket boyu (g)</span>
        <Input type="number" min={0} value={pack} onChange={(event) => setPack(event.target.value)} />
      </label>
      {packs !== null ? (
        <Badge tone="olive">= {num(packs)} paket</Badge>
      ) : (
        <span className="font-ops-body text-ops-xs text-ops-faint">iki değeri girin</span>
      )}
      <span className="w-full font-ops-body text-ops-micro leading-[1.5] text-ops-faint">
        {RECEIVING_NOTES.packageUnit} Sonucu adet hanesine siz yazarsınız — otomatik doldurulmaz.
      </span>
    </div>
  );
}
