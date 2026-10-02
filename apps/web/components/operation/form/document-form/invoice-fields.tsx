'use client';

import { fromCents } from '@lezzet/helper';
import { DOCUMENT_VAT_RATES, DocumentVatRateSchema, DocumentVatRegimeEnum, type DocumentVatRegime } from '@lezzet/types';
import { DateField } from '@/components/operation/form/date-field';
import { FieldShell } from '@/components/operation/form/field-shell';
import { MoneyField, MoneyInput } from '@/components/operation/form/money-input';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { Select } from '@/components/operation/form/select';
import { Button } from '@/components/operation/ui/button';
import { PlusIcon, TrashIcon } from '@/components/operation/ui/icons';
import { VAT_REGIME_HINT, VAT_REGIME_LABEL, vatRateLabel } from './labels';
import {
  invoiceTotalCents,
  nextVatLine,
  settled,
  vatLinesOf,
  withRegime,
  withVatFromRate,
  type InvoiceFields,
  type InvoiceVatLine,
} from './schema';

/*
  Faturanın para künyesi (rejim, vade, KDV kırılımı, toplam); belge penceresi ile asistanın belge, mal kabul ve sipariş
  gövdeleri aynı bloğu çizer. Kontrollü ve form kütüphanesiz çünkü mal kabul ve sipariş gövdeleri RHF kullanmaz; `fieldset`
  salt okunur hâlin tek anahtarıdır, rejim seçicisinin kendi `disabled`ı yok.
*/

const VAT_LINE_GRID = 'grid grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)_26px] items-center gap-2';

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
  const differs = suggestedRegime !== null && suggestedRegime !== value.vatRegime;
  const fromLines = vatLinesOf(value).length > 0;
  const total = invoiceTotalCents(value);
  const next = nextVatLine(value.vatLines);
  const setLines = (vatLines: InvoiceVatLine[]) => onChange(settled({ ...value, vatLines }));
  // KDV hariç tutar ya da oran değişince KDV orandan yeniden yazılır; KDV'nin kendisi elle düzeltilir.
  const patchLine = (index: number, patch: Partial<InvoiceVatLine>) =>
    setLines(
      value.vatLines.map((line, i) => {
        if (i !== index) return line;
        const patched = { ...line, ...patch };
        return 'vat' in patch ? patched : withVatFromRate(patched);
      }),
    );

  return (
    <fieldset disabled={disabled} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="KDV rejimi" labelAside={differs && suggestedRegime ? `öneri: ${VAT_REGIME_LABEL[suggestedRegime]}` : undefined}>
          <MultiToggle
            value={value.vatRegime}
            onChange={(vatRegime) => onChange(withRegime(value, vatRegime))}
            label="KDV rejimi"
            options={DocumentVatRegimeEnum.options.map((regime) => ({ key: regime, label: VAT_REGIME_LABEL[regime] }))}
          />
        </FieldShell>
        <DateField
          label="Vade"
          labelAside="belgede yazıyorsa"
          value={value.dueOn}
          onChange={(dueOn) => onChange({ ...value, dueOn })}
          clearable
        />
      </div>
      <span className="font-ops-body text-ops-micro text-ops-faint">{VAT_REGIME_HINT[value.vatRegime]}</span>

      {value.vatRegime === 'exempt' ? null : (
        <section className="flex flex-col gap-2">
          <header className="flex items-center justify-between gap-3">
            <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">KDV kırılımı</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled || next === null}
              onClick={() => (next ? setLines([...value.vatLines, next]) : undefined)}
            >
              <PlusIcon /> Oran ekle
            </Button>
          </header>
          {value.vatLines.length === 0 ? (
            <p className="rounded-ops-card border border-dashed border-ops-line-strong px-3.5 py-3 text-center font-ops-body text-ops-sm text-ops-muted">
              Kırılım yok — “Oran ekle” ile oran başına KDV hariç tutarı ve KDV’yi girin.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              <li className={`${VAT_LINE_GRID} font-ops-body text-ops-xs text-ops-muted`}>
                <span>Oran</span>
                <span className="text-right">KDV hariç</span>
                <span className="text-right">{value.vatRegime === 'reverse_charge' ? 'KDV · beyanda' : 'KDV'}</span>
                <span />
              </li>
              {value.vatLines.map((line, index) => (
                <li key={`${line.vatRate}-${index}`} className={VAT_LINE_GRID}>
                  <Select
                    size="sm"
                    value={String(line.vatRate)}
                    onChange={(rate) => patchLine(index, { vatRate: DocumentVatRateSchema.parse(Number(rate)) })}
                    // Başka satırın oranı seçilemez: kırılımda oran tekrar etmez.
                    options={DOCUMENT_VAT_RATES.filter(
                      (rate) => rate === line.vatRate || !value.vatLines.some((other) => other.vatRate === rate),
                    ).map((rate) => ({ value: String(rate), label: vatRateLabel(rate) }))}
                    ariaLabel="KDV oranı"
                    disabled={disabled}
                  />
                  <MoneyInput
                    value={line.net}
                    onChange={(net) => patchLine(index, { net })}
                    ariaLabel="KDV hariç tutar"
                    className="text-right"
                    fullWidth
                    placeholder="0,00"
                    disabled={disabled}
                  />
                  <MoneyInput
                    // Ters yüklemede KDV beyanda hesaplanır, kapıya sıfır gider; kutudaki değer standarda dönüş için saklanır.
                    value={value.vatRegime === 'reverse_charge' ? 0 : line.vat}
                    onChange={(vat) => patchLine(index, { vat })}
                    ariaLabel="KDV tutarı"
                    className="text-right"
                    fullWidth
                    placeholder="0,00"
                    disabled={disabled || value.vatRegime === 'reverse_charge'}
                  />
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setLines(value.vatLines.filter((_, i) => i !== index))}
                    title="Oranı çıkar"
                    className="cursor-pointer rounded-ops-btn p-1.5 text-ops-faint transition-colors hover:bg-ops-red-bg hover:text-ops-red disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <MoneyField
        label={amountLabel}
        labelAside={fromLines ? 'KDV dâhil · kırılımdan' : amountRequired ? 'KDV dâhil' : 'KDV dâhil · boşsa belge yazılmaz'}
        required={amountRequired}
        // Kırılım doluysa toplam satırlardan türer ve kutu kilitlenir: iki ayrı sayı ayrışamaz.
        value={fromLines && total !== null ? fromCents(total) : value.amount}
        onChange={(amount) => onChange({ ...value, amount })}
        disabled={fromLines}
        placeholder="0,00"
      />
    </fieldset>
  );
}
