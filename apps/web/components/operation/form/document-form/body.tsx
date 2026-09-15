'use client';

import { Controller, type Control, type UseFormSetValue } from 'react-hook-form';
import { DocumentKindEnum, MovementDirectionEnum } from '@lezzet/types';
import { Combobox } from '@/components/operation/form/combobox';
import { DateField } from '@/components/operation/form/date-field';
import { FieldShell } from '@/components/operation/form/field-shell';
import { FormInput } from '@/components/operation/form/form-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { MultiSelect } from '@/components/operation/form/multi-select';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { naturesForDirection, type CounterpartyOption, type NatureOption, type TagOption } from '@/components/operation/form/movement-form/schema';
import { InvoiceFieldsBlock } from './invoice-fields';
import { DOCUMENT_DIRECTION_LABEL, DOCUMENT_KIND_LABEL } from './labels';
import { supplierSuggestion, type DocumentForm, type StockLinkOption, type SupplierOption } from './schema';

/*
  BELGE FORMUNUN GÖVDESİ (12.12 · 12.26 · 22.44) — Para ekranının "+ Belge" penceresi ve asistan
  kuyruğunun belge gövdesi aynı alanları çizer (`schema.ts` künyesi).

  ── KARŞI TARAF: CARİ YA DA TEDARİKÇİ (13.09 · ikinci karar) ─────────────────
  Karşı taraf sözlükten seçilir: kurum, hizmet veren, çalışan → CARİ; stok alımı → TEDARİKÇİ. İkisi
  birden olmaz (şema kısıtı `money_document_party`); biri seçilince öteki boşalır. Carinin varsayılan
  türü boş türe önerilir. Belgenin TÜRÜ ödemesine de geçer.

  ── TEDARİKÇİ SEÇİLİNCE (12.26) ────────────────────────────────────────────────
  Rejim tedarikçinin ülkesinden, vade kartın vadesinden önerilir (`supplierSuggestion`); "neyin
  faturası" seçicisi açılır — faturası girilmemiş kabuller ve açık siparişler. Seçilen alımın borcu
  artık bu belgeden türer.
*/

interface DocumentFormBodyProps {
  control: Control<DocumentForm>;
  setValue: UseFormSetValue<DocumentForm>;
  values: DocumentForm;
  supplierOptions: readonly SupplierOption[];
  counterpartyOptions: readonly CounterpartyOption[];
  natureOptions: readonly NatureOption[];
  tagOptions: readonly TagOption[];
  /** Etiket menüsünün "oluştur" satırı — verilmezse menü yalnız seçer. */
  onCreateTag?: (label: string) => void;
  /** "Neyin faturası" seçenekleri — seçili tedarikçinin; çağıran tedarikçi değişince yeniden okur. */
  stockLinkOptions: readonly StockLinkOption[];
  stockLinkLoading?: boolean;
  disabled?: boolean;
}

export function DocumentFormBody({
  control,
  setValue,
  values,
  supplierOptions,
  counterpartyOptions,
  natureOptions,
  tagOptions,
  onCreateTag,
  stockLinkOptions,
  stockLinkLoading = false,
  disabled = false,
}: DocumentFormBodyProps) {
  const natures = naturesForDirection(natureOptions, values.direction);
  const set = (name: 'counterpartyId' | 'supplierId' | 'nature' | 'stockLink', value: string) => setValue(name, value, { shouldValidate: true });
  const supplier = supplierOptions.find((option) => option.value === values.supplierId);
  const suggestion = supplier ? supplierSuggestion(supplier, values.invoice, values.issuedOn) : null;

  /** Cari seçilince tedarikçi ve alımın bağı boşalır (karşı taraf tektir); carinin varsayılan türü BOŞ türe konur. */
  const pickCounterparty = (id: string) => {
    set('counterpartyId', id);
    set('supplierId', '');
    set('stockLink', '');
    const preset = counterpartyOptions.find((option) => option.value === id)?.defaultNature;
    if (!values.nature && preset && natures.some((nature) => nature.value === preset)) set('nature', preset);
  };
  const pickSupplier = (id: string) => {
    set('supplierId', id);
    set('counterpartyId', '');
    set('stockLink', '');
    const picked = supplierOptions.find((option) => option.value === id);
    setValue('invoice', { ...values.invoice, ...supplierSuggestion(picked, values.invoice, values.issuedOn) }, { shouldValidate: true });
  };

  // Bağ yalnız tedarikçinin ÖDENECEK belgesinde anlamlı: bize ödenecek bir dekont bir alımın faturası değildir.
  const showStockLink = values.supplierId !== '' && values.direction === 'out';

  return (
    <fieldset disabled={disabled} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
      <div className="grid grid-cols-2 gap-3">
        <FormSelect
          control={control}
          name="kind"
          label="Belge türü"
          required
          options={DocumentKindEnum.options.map((kind) => ({ value: kind, label: DOCUMENT_KIND_LABEL[kind] }))}
        />
        <Controller
          control={control}
          name="issuedOn"
          render={({ field }) => <DateField label="Belge tarihi" required value={field.value} onChange={field.onChange} />}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormInput control={control} name="number" label="Belge numarası" labelAside="fişte olmayabilir" placeholder="FA-2026-0912" mono />
        <Controller
          control={control}
          name="direction"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">Yön</span>
              <MultiToggle
                value={field.value}
                onChange={(next) => {
                  field.onChange(next);
                  // Yön değişince uymayan tür boşalır — gider türü bize ödenecek belgeye konmaz.
                  if (!naturesForDirection(natureOptions, next).some((nature) => nature.value === values.nature)) set('nature', '');
                  if (next === 'in') set('stockLink', '');
                }}
                label="Belgenin yönü"
                options={MovementDirectionEnum.options.map((direction) => ({ key: direction, label: DOCUMENT_DIRECTION_LABEL[direction] }))}
              />
            </div>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="Cari" labelAside="kurum · hizmet veren · çalışan">
          <Combobox
            value={values.counterpartyId}
            onChange={pickCounterparty}
            options={counterpartyOptions.map(({ value, label }) => ({ value, label }))}
            placeholder="Cari seçin"
            searchPlaceholder="Cari ara…"
            emptyText="Cari yok — Sözlük penceresinden ekleyin"
            onClear={() => set('counterpartyId', '')}
            clearLabel="Cariyi kaldır"
          />
        </FieldShell>
        <FieldShell label="Tedarikçi" labelAside="stok alımıysa">
          <Combobox
            value={values.supplierId}
            onChange={pickSupplier}
            options={supplierOptions.map(({ value, label }) => ({ value, label }))}
            placeholder="Tedarikçi değil"
            searchPlaceholder="Tedarikçi ara…"
            emptyText="Aramaya uyan tedarikçi yok"
            onClear={() => {
              set('supplierId', '');
              set('stockLink', '');
            }}
            clearLabel="Tedarikçiyi kaldır"
          />
        </FieldShell>
      </div>

      {showStockLink ? (
        <FieldShell label="Neyin faturası" labelAside="mal kabul ya da sipariş · borç bu belgeden türer">
          <Combobox
            value={values.stockLink}
            onChange={(link) => set('stockLink', link)}
            options={stockLinkOptions.map(({ value, label }) => ({ value, label }))}
            loading={stockLinkLoading}
            placeholder="Bir alıma bağlı değil"
            searchPlaceholder="Kabul ya da sipariş ara…"
            emptyText="Faturası girilmemiş kabul ya da açık sipariş yok"
            onClear={() => set('stockLink', '')}
            clearLabel="Bağı kaldır"
          />
        </FieldShell>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="Türü" labelAside="ödemesine de geçer">
          <Combobox
            value={values.nature}
            onChange={(nature) => set('nature', nature)}
            options={natures.map(({ value, label }) => ({ value, label }))}
            placeholder="Tür seçin"
            searchPlaceholder="Tür ara…"
            emptyText="Bu yöne uyan tür yok"
            onClear={() => set('nature', '')}
            clearLabel="Türü kaldır"
          />
        </FieldShell>
        <FieldShell label="Etiketler" labelAside="isteğe bağlı">
          <MultiSelect
            options={[...tagOptions]}
            selected={values.tags}
            onChange={(next) => setValue('tags', next, { shouldValidate: true })}
            addLabel="+ etiket"
            searchPlaceholder="Etiket ara ya da yaz…"
            emptyText="Etiket yok"
            onCreate={onCreateTag}
          />
        </FieldShell>
      </div>

      <InvoiceFieldsBlock
        value={values.invoice}
        onChange={(invoice) => setValue('invoice', invoice, { shouldValidate: true })}
        suggestedRegime={suggestion?.vatRegime ?? null}
      />

      <FormInput control={control} name="note" label="Not" placeholder="Eylül kirası · 3 taksitin ilki" />
    </fieldset>
  );
}
