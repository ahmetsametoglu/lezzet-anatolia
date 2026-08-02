'use client';

import { useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/operation/ui/button';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { PlusIcon, TrashIcon } from '@/components/operation/ui/icons';
import { Combobox } from '@/components/operation/form/combobox';
import { FormInput } from '@/components/operation/form/form-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { Input } from '@/components/operation/form/input';
import { createManualDraftAction, searchVariantsForMappingAction } from './actions';
import { ManualOrderSchema, type ManualOrderInput, type SupplierOption, type VariantPickOption, type WarehouseOption } from './procurement-types';

// **Elle sipariş** (sayfa sözleşmesi §3) — öneriden bağımsız tedarik siparişi.
//
// Öneri yalnız eşik altına düşeni yakalar; gerçek hayatta sipariş bundan ibaret değil: kampanya için
// fazladan mal, yeni ürün denemesi, tedarikçinin "bu hafta şu var" demesi. Öneriyi bekleyen bir ekran
// üçünü de imkânsız kılardı.
//
// Form standardı (`catalog-form-dialog` kanonik): RHF + `zodResolver` + varlık şemasından türetilmiş
// tip + `Form*` adaptörleri + `DialogFooter(formId)`. Kalem dizisi `useFieldArray` ile — paket kalem
// düzenleyicisinin deseni.

const FORM_ID = 'manual-order-form';

/** Kalem satırının şeridi — başlıklar ve kutular AYNI dizeyi okur, hiza elle tutulmaz. */
const LINE_GRID = 'grid grid-cols-[minmax(0,1fr)_72px_26px] gap-2';

/**
 * Kaydetmenin ENGELİ, tek cümlede (`DialogFooter.blockedReason`).
 *
 * Alan alan kırmızı yazı yerine bu: satırların altına hata metni koymak listeyi zıplatıyordu ve
 * "ürün seçilmemiş" gibi bir eksik zaten satıra bakınca görülüyor. Engel yoksa `null` — düğme açık.
 */
function blockedReasonOf(values: ManualOrderInput): string | null {
  if (!values.supplierId) return 'Önce tedarikçiyi seçin.';
  if (values.lines.length === 0) return 'En az bir kalem ekleyin.';
  if (values.lines.some((line) => !line.variantId)) return 'Her kalemde bir ürün seçin.';
  if (values.lines.some((line) => !Number.isInteger(line.qty) || line.qty <= 0)) return 'Adet en az 1 olmalı.';
  return null;
}

interface ManualOrderDialogProps {
  suppliers: SupplierOption[];
  warehouses: WarehouseOption[];
  onClose: () => void;
  onCreated: (orderId: string) => void;
}

export function ManualOrderDialog({ suppliers, warehouses, onClose, onCreated }: ManualOrderDialogProps) {
  const [error, setError] = useState<string | null>(null);
  // Seçici UZAK kipte: katalogun tamamını forma indirmenin karşılığı yok (eşleme şeridinin deseni).
  const [options, setOptions] = useState<VariantPickOption[]>([]);
  const [searching, setSearching] = useState(false);

  const form = useForm<ManualOrderInput>({
    resolver: zodResolver(ManualOrderSchema),
    defaultValues: { supplierId: '', targetWarehouseId: '', note: '', lines: [] },
    mode: 'onChange',
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });
  // Canlı değerler: engel cümlesi her tuş vuruşunda yeniden hesaplanmalı — `fields` yalnız dizi
  // YAPISI değişince yenilenir ve yazılanı geride bırakır (paket düzenleyicisinin dersi).
  const watched = useWatch({ control: form.control }) as ManualOrderInput;

  const onSearch = (term: string) => {
    setSearching(true);
    void searchVariantsForMappingAction(term).then((result) => {
      setOptions(result.data ?? []);
      setSearching(false);
    });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const { data, error: actionError } = await createManualDraftAction({
      supplierId: values.supplierId,
      note: values.note,
      lines: values.lines.map((line) => ({
        variantId: line.variantId,
        qty: line.qty,
        // Hedef depo SİPARİŞİN tamamına verilir, kalem kalem değil: elle sipariş çoğu zaman tek
        // adrese gelir ve satır başına depo sormak, cevabı hep aynı olan bir soruyu N kez sormaktı.
        // Boş bırakılabilir — o zaman hedefi kabul eden depo söyler (K6: niyet beyanı, kısıt değil).
        targetWarehouseId: values.targetWarehouseId || null,
      })),
    });
    if (actionError || !data) {
      setError(actionError ?? 'Sipariş oluşturulamadı.');
      return;
    }
    onCreated(data.orderId);
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Yeni tedarik siparişi"
      subtitle="Öneriden bağımsız — kalemleri siz seçersiniz"
      maxWidth={640}
      footer={
        <DialogFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitting={form.formState.isSubmitting}
          error={error}
          submitLabel="Taslağı oluştur"
          blockedReason={blockedReasonOf(watched)}
        />
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <FormSelect
            control={form.control}
            name="supplierId"
            label="Tedarikçi"
            required
            placeholder="Kimden alınacak"
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          />
          <FormSelect
            control={form.control}
            name="targetWarehouseId"
            label="Hangi depo için"
            // Boş bırakmak GEÇERLİ ve anlamlı: hedefi bilinmeyen sipariş hiçbir deponun eksiğini
            // kapatmış sayılmaz ve öneri motoru onu ayrıca gösterir — sessizce bir depoya yazmaktan
            // iyidir (`ReorderLine.unassignedQty`).
            labelAside="boş = belli değil"
            placeholder="Seçilmedi"
            options={warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))}
          />
        </div>

        <section className="flex flex-col gap-2">
          <header className="flex items-center gap-2">
            <span className="mr-auto font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
              Kalemler
            </span>
            <Button type="button" variant="secondary" size="sm" onClick={() => append({ variantId: '', qty: 1 })}>
              <PlusIcon /> Kalem ekle
            </Button>
          </header>

          {fields.length === 0 ? (
            <p className="rounded-ops-card border border-dashed border-ops-line-strong px-3.5 py-4 text-center font-ops-body text-ops-sm text-ops-muted">
              Henüz kalem yok — “Kalem ekle” ile başlayın.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {/* Etiketler satır BAŞINA değil bir kez, kutuların üstünde (paket kalem düzenleyicisinin
                  deseni): her satıra etiket koymak listeyi okunmaz eder. Alan hatası da satır satır
                  yazılmıyor — engel alt barda tek cümlede söyleniyor (`blockedReason`). */}
              <li className={`${LINE_GRID} font-ops-body text-ops-xs text-ops-muted`}>
                <span>Ürün</span>
                <span className="text-right">Adet</span>
                <span />
              </li>
              {fields.map((field, index) => (
                <li key={field.id} className={`${LINE_GRID} items-center`}>
                  <Controller
                    control={form.control}
                    name={`lines.${index}.variantId`}
                    render={({ field: line }) => (
                      <Combobox
                        value={line.value}
                        onChange={line.onChange}
                        options={options.map((o) => ({ value: o.variantId, label: o.title }))}
                        // Uzak kipte seçilen etiket sonuç listesinden düşebilir; son bulunanı tutuyoruz.
                        selectedLabel={options.find((o) => o.variantId === line.value)?.title}
                        onSearch={onSearch}
                        loading={searching}
                        placeholder="Ürün seç"
                        searchPlaceholder="Ürün adı yazın…"
                        emptyText="Eşleşen ürün yok — ürün adının bir parçasını yazın."
                      />
                    )}
                  />
                  <Controller
                    control={form.control}
                    name={`lines.${index}.qty`}
                    render={({ field: qty }) => (
                      <Input
                        mono
                        inputMode="numeric"
                        className="text-right"
                        aria-label="Adet"
                        value={String(qty.value ?? '')}
                        onChange={(e) => qty.onChange(Number(e.target.value.replace(/\D/g, '')) || 0)}
                      />
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    title="Kalemi çıkar"
                    className="cursor-pointer rounded-ops-btn p-1.5 text-ops-faint transition-colors hover:bg-ops-red-bg hover:text-ops-red"
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <FormInput control={form.control} name="note" label="Not" placeholder="Teslim günü, özel istek…" />

        {/* Fiyat BURADA sorulmuyor: taslak açılınca beklenen alış son alıştan geliyor (servisin
            kuralı) ve gerekirse sipariş penceresinde düzeltiliyor. Aynı sayıyı iki yerde sormak,
            operatöre bildiği bir şeyi yeniden yazdırmak olurdu. */}
      </form>
    </Dialog>
  );
}
