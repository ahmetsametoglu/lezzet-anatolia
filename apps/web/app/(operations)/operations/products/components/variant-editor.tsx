'use client';

import { Controller, useFieldArray, type Control } from 'react-hook-form';
import { Input } from '@/components/operation/form/input';
import { Toggle } from '@/components/operation/form/toggle';
import type { ProductFormValues } from './product-form-schema';

// Varyant editörü — ürün formunun RHF field-array'i (ekle/sil/düzenle). Sayfaya özel (products/
// components). Satır içi girdiler operasyon form kontrolleri (Input/Toggle); ham <input> yok. Son
// varyant silinemez (ürün her zaman ≥1 varyant; syncVariants boş listede dokunmaz).

// Sütun düzeni: SKU (en başta, en geniş — kodlar uzun) · Etiket (dar) · Net · Aktif · sil.
const CELL = 'grid grid-cols-[minmax(0,1fr)_120px_84px_48px_32px] items-center gap-x-2';

export function VariantEditor({ control }: { control: Control<ProductFormValues> }) {
  const { fields, append, remove } = useFieldArray({ control, name: 'variants' });

  return (
    <section className="flex flex-col gap-[11px]">
      <div className="flex items-center justify-between border-b border-ops-line-soft pb-[7px]">
        <span className="font-ops-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ops-muted">Varyantlar</span>
        <button
          type="button"
          onClick={() => append({ label: '', netWeightG: null, sku: null, isActive: true })}
          className="cursor-pointer font-ops-body text-[11px] font-semibold text-ops-olive"
        >
          + varyant
        </button>
      </div>
      <div className="overflow-hidden rounded-[9px] border border-ops-line">
        <div className={`${CELL} border-b border-ops-line bg-ops-subtle px-[13px] py-2 font-ops-display text-[10px] font-medium uppercase tracking-[0.05em] text-ops-muted`}>
          <span>SKU</span>
          <span>Etiket</span>
          <span>Net (g)</span>
          <span className="text-center">Aktif</span>
          <span />
        </div>
        {fields.map((f, i) => (
          <div key={f.id} className={`${CELL} border-b border-ops-line-soft px-[13px] py-2 last:border-b-0`}>
            <Controller
              control={control}
              name={`variants.${i}.sku`}
              render={({ field }) => (
                <Input inputSize="sm" mono value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value || null)} onBlur={field.onBlur} placeholder="ör. BAK-500" />
              )}
            />
            <Controller
              control={control}
              name={`variants.${i}.label`}
              render={({ field }) => <Input inputSize="sm" value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} placeholder="ör. 500 g" />}
            />
            <Controller
              control={control}
              name={`variants.${i}.netWeightG`}
              render={({ field }) => (
                <Input
                  inputSize="sm"
                  mono
                  inputMode="numeric"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                  onBlur={field.onBlur}
                  placeholder="—"
                />
              )}
            />
            <span className="justify-self-center">
              <Controller control={control} name={`variants.${i}.isActive`} render={({ field }) => <Toggle on={Boolean(field.value)} size="sm" onChange={field.onChange} />} />
            </span>
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={fields.length === 1}
              className="cursor-pointer justify-self-center text-ops-faint hover:text-ops-red disabled:opacity-30"
              aria-label="Varyantı sil"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
