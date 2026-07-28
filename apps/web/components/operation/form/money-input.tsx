'use client';

import { useState, type ReactNode } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { Input, InputField } from './input';

/**
 * Para girdisi — Komponent Envanteri O8'in para kipi. `MoneyInput` etiketsiz (tablo hücresi),
 * `MoneyField` etiketli, `FormMoney` bunun RHF adaptörü.
 *
 * NEDEN AYRI BİR KONTROL: aynı formda üç ayrı yazım görünüyordu — `34,9` (paket fiyatı, `type=number`
 * tarayıcı biçimi), `15.95` (kalem payı, ham sayı) ve `15,95` (hesaplanan sütun). Para iki ondalıklı ve
 * virgüllü TEK bir yazımla görünmeli; yoksa operatör aynı ekranda üç farklı dil okur.
 *
 * ODAK AYRIMI kasıtlı: yazarken serbest metin (yoksa "15," yazılamaz, ondalık hiç girilemez), odaktan
 * çıkınca daima iki hane. Dışarıdan gelen değişiklik (paket formunda payların otomatik dağıtımı) odakta
 * OLMAYAN hücrede anında görünür — o hâlde gösterim değerin kendisinden türüyor.
 */
const format = (value: number | null): string => (value == null ? '' : value.toFixed(2).replace('.', ','));

/** Serbest yazımı sayıya indirir: virgül/nokta ikisi de ondalık ayracı, boş → null. */
function parse(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  if (cleaned === '') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Yazarken izin verilen karakterler — harf ve İKİNCİ bir ayraç kutuya hiç girmez. */
const sanitize = (raw: string): string => raw.replace(/[^\d.,]/g, '').replace(/([.,])(?=.*[.,])/g, '');

interface MoneyTextOptions {
  value: number | null;
  onChange: (value: number | null) => void;
  onBlur?: () => void;
}

/** Odak durumuna göre gösterim + serbest yazım — etiketli ve etiketsiz sürümün paylaştığı davranış. */
function useMoneyText({ value, onChange, onBlur }: MoneyTextOptions) {
  // `null` = odakta değil → gösterim değerden türer (iki hane). Dolu = yazılmakta olan taslak.
  const [draft, setDraft] = useState<string | null>(null);
  return {
    value: draft ?? format(value),
    onFocus: () => setDraft(value == null ? '' : String(value).replace('.', ',')),
    onChange: (raw: string) => {
      const next = sanitize(raw);
      setDraft(next);
      onChange(parse(next));
    },
    onBlur: () => {
      setDraft(null);
      onBlur?.();
    },
  };
}

interface MoneyInputProps extends MoneyTextOptions {
  inputSize?: 'md' | 'sm';
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
  ariaLabel?: string;
}

export function MoneyInput({ inputSize = 'sm', className, disabled, placeholder, title, ariaLabel, ...core }: MoneyInputProps) {
  const text = useMoneyText(core);
  return (
    <Input
      inputSize={inputSize}
      mono
      inputMode="decimal"
      className={className}
      disabled={disabled}
      placeholder={placeholder}
      title={title}
      aria-label={ariaLabel}
      value={text.value}
      onFocus={text.onFocus}
      onChange={(e) => text.onChange(e.target.value)}
      onBlur={text.onBlur}
    />
  );
}

interface MoneyFieldProps extends MoneyTextOptions {
  label: ReactNode;
  required?: boolean;
  labelAside?: ReactNode;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  fieldClassName?: string;
  id?: string;
}

// Yalnız `FormMoney` sarar — dışa açık değil (ölü ihracat yok).
function MoneyField({ label, required, labelAside, error, placeholder, disabled, fieldClassName, id, ...core }: MoneyFieldProps) {
  const text = useMoneyText(core);
  return (
    <InputField
      label={label}
      required={required}
      labelAside={labelAside}
      error={error}
      mono
      inputMode="decimal"
      placeholder={placeholder}
      disabled={disabled}
      fieldClassName={fieldClassName}
      id={id}
      name={id}
      value={text.value}
      onFocus={text.onFocus}
      onChange={(e) => text.onChange(e.target.value)}
      onBlur={text.onBlur}
    />
  );
}

interface FormMoneyProps<T extends FieldValues> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<T, any, any>;
  name: FieldPath<T>;
  label: ReactNode;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  labelAside?: ReactNode;
  fieldClassName?: string;
}

export function FormMoney<T extends FieldValues>({ control, name, label, required, placeholder, disabled, labelAside, fieldClassName }: FormMoneyProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        // Kanca `MoneyField`'ın İÇİNDE çağrılır: `render` bir komponent sınırı değil, kancayı buraya
        // koymak onu Controller'ın kimliğine asardı (kancalar kuralı).
        <MoneyField
          label={label}
          required={required}
          labelAside={labelAside}
          error={fieldState.error?.message}
          placeholder={placeholder}
          disabled={disabled}
          fieldClassName={fieldClassName}
          id={field.name}
          value={field.value ?? null}
          onChange={field.onChange}
          onBlur={field.onBlur}
        />
      )}
    />
  );
}
