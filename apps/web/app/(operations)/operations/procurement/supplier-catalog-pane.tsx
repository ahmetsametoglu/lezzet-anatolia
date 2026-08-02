'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { PlusIcon, StarIcon, TrashIcon } from '@/components/operation/ui/icons';
import { Skeleton } from '@/components/operation/ui/skeleton';
import { amount } from '@/components/operation/ui/format';
import { Combobox } from '@/components/operation/form/combobox';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import {
  deleteSupplierProductAction,
  loadSupplierProductsAction,
  saveSupplierProductAction,
  searchVariantsForMappingAction,
  setPreferredSupplierProductAction,
} from './actions';
import type { SupplierProductRowView, VariantPickOption } from './procurement-types';

/**
 * Tedarikçi kartının İKİNCİ bölmesi: **ürün–kod eşlemesi** (`DOMAIN §16`).
 *
 * Neden burada, ayrı bir sekmede değil: soru tedarikçiye aittir ("Metro'dan neyi hangi kodla
 * alıyorum"), okuması da tedarikçi başınadır (`listBySupplier`). Koleksiyon formundaki üyeler
 * bölmesinin aynı deseni.
 *
 * Neden tedarikçi formunun ALANI değil: eşleme tedarikçinin bir özelliği değil, varyantla kurduğu
 * BAĞ — bir tedarikçinin N eşlemesi var ve her biri kendi kodunu, adını, kolisini taşıyor.
 *
 * **Yalnız kayıtlı tedarikçide açılır:** eşleme satırı `supplier_id` istiyor, kart kaydedilmeden o
 * kimlik yok. Yeni kayıtta bölme yerine sebebi yazılır.
 */
interface SupplierCatalogPaneProps {
  supplierId: string;
}

export function SupplierCatalogPane({ supplierId }: SupplierCatalogPaneProps) {
  const [rows, setRows] = useState<SupplierProductRowView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = () => {
    void loadSupplierProductsAction(supplierId).then((result) => {
      if (result.error) setError(result.error);
      else setRows(result.data ?? []);
    });
  };
  useEffect(reload, [supplierId]);

  const onRemove = (id: string) => {
    void deleteSupplierProductAction(id).then((result) => (result.error ? setError(result.error) : reload()));
  };
  const onPrefer = (id: string) => {
    void setPreferredSupplierProductAction(id).then((result) => (result.error ? setError(result.error) : reload()));
  };

  return (
    <section className="flex min-h-0 flex-col gap-2.5">
      <header className="flex items-center gap-2">
        <span className="mr-auto font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
          Tedarikçideki karşılıkları
        </span>
        {!adding ? (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            <PlusIcon /> Ürün ekle
          </Button>
        ) : null}
      </header>

      <p className="font-ops-body text-ops-xs leading-relaxed text-ops-muted">
        Sipariş listesi bu satırlardan kurulur: tedarikçi kendi kodunu ve kendi ürün adını görür.
        Eşlemesi olmayan ürün siparişe bizim adımızla yazılır.
      </p>

      {error ? <p className="font-ops-body text-ops-xs font-semibold text-ops-red">{error}</p> : null}

      {adding ? (
        <MappingForm
          supplierId={supplierId}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            reload();
          }}
        />
      ) : null}

      {rows === null ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-ops-card border border-dashed border-ops-line-strong px-3.5 py-4 text-center font-ops-body text-ops-sm text-ops-muted">
          Henüz eşleme yok — siparişler bu tedarikçiye bizim ürün adlarımızla gider.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <MappingRow key={row.id} row={row} onRemove={onRemove} onPrefer={onPrefer} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Tek eşleme satırı — bizim adımız üstte, ONUN kodu ve adı altta. */
function MappingRow({
  row,
  onRemove,
  onPrefer,
}: {
  row: SupplierProductRowView;
  onRemove: (id: string) => void;
  onPrefer: (id: string) => void;
}) {
  return (
    <li className="flex items-center gap-2.5 rounded-ops-card border border-ops-line px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate font-ops-body text-ops-sm font-medium text-ops-ink">{row.title}</span>
        <span className="truncate font-ops-mono text-ops-xs text-ops-muted">
          {row.supplierCode}
          {row.nameAtSupplier ? ` · ${row.nameAtSupplier}` : ''}
          {row.packQty ? ` · ${row.packQty}'li koli` : ''}
        </span>
      </div>
      {/* Son alış ELLE girilmez: mal kabulde ölçülür. Gösterilir ki zam fark edilsin. */}
      {row.lastPurchaseCents !== null ? (
        <span className="font-ops-mono text-ops-xs text-ops-muted" title="Son alış — mal kabulde güncellenir">
          {amount(row.lastPurchaseCents)}
        </span>
      ) : null}
      {row.isPreferred ? (
        <Badge tone="olive">tercihli</Badge>
      ) : (
        <button
          type="button"
          onClick={() => onPrefer(row.id)}
          title="Bu kaynağı tercihli yap — sipariş önerisi bunu seçer"
          className="cursor-pointer rounded-ops-btn p-1.5 text-ops-faint transition-colors hover:bg-ops-line hover:text-ops-olive"
        >
          <StarIcon />
        </button>
      )}
      <button
        type="button"
        onClick={() => onRemove(row.id)}
        title="Eşlemeyi kaldır"
        className="cursor-pointer rounded-ops-btn p-1.5 text-ops-faint transition-colors hover:bg-ops-red-bg hover:text-ops-red"
      >
        <TrashIcon />
      </button>
    </li>
  );
}

/**
 * Yeni eşleme satırı. Üç alan: hangi ürün · onun kodu · onun adı (+ koli).
 *
 * RHF KULLANILMIYOR ve bu bilinçli: bu bir varlık formu değil, listeye satır ekleyen bir şerit
 * (paket kalem düzenleyicisinin deseni) — açılır, yazılır, kapanır. `zodResolver`'lı bir form
 * kurmak burada bir kaydın değil, bir satırın etrafına form kurmak olurdu.
 */
function MappingForm({
  supplierId,
  onCancel,
  onSaved,
}: {
  supplierId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [variantId, setVariantId] = useState('');
  const [variantLabel, setVariantLabel] = useState('');
  const [options, setOptions] = useState<VariantPickOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [code, setCode] = useState('');
  const [nameAtSupplier, setNameAtSupplier] = useState('');
  const [packQty, setPackQty] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seçici UZAK kipte: katalogun tamamını forma taşımanın karşılığı yok (paket formunun deseni).
  const onSearch = (term: string) => {
    setSearching(true);
    void searchVariantsForMappingAction(term).then((result) => {
      setOptions(result.data ?? []);
      setSearching(false);
    });
  };

  const onSave = () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    void saveSupplierProductAction({
      supplierId,
      variantId,
      supplierCode: code,
      nameAtSupplier,
      packQty: packQty.trim() === '' ? null : Number(packQty),
    })
      .then((result) => (result.error ? setError(result.error) : onSaved()))
      .finally(() => setSaving(false));
  };

  return (
    <div className="flex flex-col gap-3 rounded-ops-card border border-ops-olive-line bg-ops-olive-bg/40 px-3.5 py-3">
      <FieldShell label="Hangi ürün" required>
        <Combobox
          value={variantId}
          onChange={(id) => {
            setVariantId(id);
            setVariantLabel(options.find((o) => o.variantId === id)?.title ?? '');
          }}
          options={options.map((o) => ({ value: o.variantId, label: o.title }))}
          selectedLabel={variantLabel}
          onSearch={onSearch}
          loading={searching}
          placeholder="Ürün seç"
          searchPlaceholder="Ürün adı yazın…"
          emptyText="Eşleşen ürün yok — ürün adının bir parçasını yazın."
        />
      </FieldShell>

      <div className="grid grid-cols-[1fr_1fr_90px] gap-2.5">
        <FieldShell label="Onun kodu" required>
          <Input mono value={code} onChange={(e) => setCode(e.target.value)} placeholder="GZT-1001" />
        </FieldShell>
        <FieldShell label="Onun ürün adı" labelAside="listede görünür">
          <Input
            value={nameAtSupplier}
            onChange={(e) => setNameAtSupplier(e.target.value)}
            placeholder="Fıstıklı Baklava 500g"
          />
        </FieldShell>
        <FieldShell label="Koli içi" labelAside="adet">
          <Input
            mono
            inputMode="numeric"
            value={packQty}
            onChange={(e) => setPackQty(e.target.value.replace(/\D/g, ''))}
            placeholder="12"
          />
        </FieldShell>
      </div>

      {/* Onun adı boyu AYIRT ETMELİ: aynı ürünün iki boyu aynı adla yazılırsa tedarikçi listede
          neyin hangisi olduğunu yalnız koddan çıkarabilir. */}
      <p className="font-ops-body text-ops-xs text-ops-muted">
        Ürün adını onun kataloğundaki gibi yazın ve boyu da içersin — aynı ürünün iki boyu aynı adla
        yazılırsa liste okunmaz olur.
      </p>

      {error ? <p className="font-ops-body text-ops-xs font-semibold text-ops-red">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>
          Vazgeç
        </Button>
        <Button variant="primary" size="sm" onClick={onSave} disabled={saving || !variantId || code.trim() === ''}>
          {saving ? 'Ekleniyor…' : 'Ekle'}
        </Button>
      </div>
    </div>
  );
}
