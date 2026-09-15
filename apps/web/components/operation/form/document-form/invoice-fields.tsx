'use client';

import { DocumentVatRegimeEnum, type DocumentVatRegime } from '@lezzet/types';
import { DateField } from '@/components/operation/form/date-field';
import { FieldShell } from '@/components/operation/form/field-shell';
import { MoneyField } from '@/components/operation/form/money-input';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { VAT_REGIME_HINT, VAT_REGIME_LABEL } from './labels';
import type { InvoiceFields } from './schema';

/*
  FATURANIN PARA KÜNYESİ (12.26 · 22.44) — toplam, KDV, KDV rejimi, vade. Belge penceresi, asistanın
  belge, mal kabul ve faturalı sipariş gövdeleri aynı bloğu çizer (`schema.ts` künyesi).

  KONTROLLÜ ve form kütüphanesiz: mal kabul ve sipariş gövdeleri RHF kullanmıyor (satır editörleri
  kontrollü liste), belge penceresi kullanıyor — blok ikisine de `value`/`onChange` ile bağlanır.
  `fieldset` salt okunur hâlin tek anahtarı: rejim seçicisinin kendi `disabled`ı yok, alan kümesi
  içindeki bütün düğmeleri birlikte kapatır.
*/

interface InvoiceFieldsBlockProps {
  value: InvoiceFields;
  onChange: (next: InvoiceFields) => void;
  /**
   * Tedarikçinin ülkesinden önerilen rejim (`suggestVatRegime`) — seçiliyle farklıysa etiketin yanında
   * okunur. Öneri kilit değil: karar operatörün, ama önerinin ne olduğunu görmeden vermemeli.
   */
  suggestedRegime?: DocumentVatRegime | null;
  /** Toplamın etiketi — belgede "Belge toplamı", mal kabulde "Faturanın toplamı". */
  amountLabel?: string;
  /**
   * Toplam zorunlu mu — belgede evet; mal kabulde HAYIR: asistan faturanın toplamını okuyamadıysa kabul
   * yine yapılır, yalnız belge yazılmaz (boş toplam = "bu kabulle fatura kaydetme").
   */
  amountRequired?: boolean;
  disabled?: boolean;
}

export function InvoiceFieldsBlock({
  value,
  onChange,
  suggestedRegime = null,
  amountLabel = 'Belge toplamı',
  amountRequired = true,
  disabled = false,
}: InvoiceFieldsBlockProps) {
  const set = (patch: Partial<InvoiceFields>) => onChange({ ...value, ...patch });
  const differs = suggestedRegime !== null && suggestedRegime !== value.vatRegime;
  return (
    <fieldset disabled={disabled} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <div className="grid grid-cols-2 gap-3">
        <MoneyField
          label={amountLabel}
          labelAside={amountRequired ? 'KDV dâhil' : 'KDV dâhil · boşsa belge yazılmaz'}
          required={amountRequired}
          value={value.amount}
          onChange={(amount) => set({ amount })}
          placeholder="0,00"
        />
        <MoneyField label="KDV tutarı" labelAside="belgede yoksa boş" value={value.vatAmount} onChange={(vatAmount) => set({ vatAmount })} placeholder="0,00" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="KDV rejimi" labelAside={differs && suggestedRegime ? `öneri: ${VAT_REGIME_LABEL[suggestedRegime]}` : undefined}>
          <MultiToggle
            value={value.vatRegime}
            onChange={(vatRegime) => set({ vatRegime })}
            label="KDV rejimi"
            options={DocumentVatRegimeEnum.options.map((regime) => ({ key: regime, label: VAT_REGIME_LABEL[regime] }))}
          />
        </FieldShell>
        <DateField label="Vade" labelAside="belgede yazıyorsa" value={value.dueOn} onChange={(dueOn) => set({ dueOn })} clearable />
      </div>
      <span className="font-ops-body text-ops-micro text-ops-faint">{VAT_REGIME_HINT[value.vatRegime]}</span>
    </fieldset>
  );
}
