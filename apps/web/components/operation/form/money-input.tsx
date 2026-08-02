'use client';

import type { ReactNode } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { decimal } from '@/components/operation/ui/format';
import { Input, InputField } from './input';
import { useNumericDraft } from './use-numeric-draft.hook';

/**
 * Para girdisi — Komponent Envanteri O8'in para kipi. `MoneyInput` etiketsiz (tablo hücresi),
 * `MoneyField` etiketli, `FormMoney` bunun RHF adaptörü.
 *
 * NEDEN AYRI BİR KONTROL: aynı formda üç ayrı yazım görünüyordu — `34,9` (type=number tarayıcı
 * biçimi), `15.95` (ham sayı) ve `15,95` (hesaplanan sütun). Para iki ondalıklı ve virgüllü TEK bir
 * yazımla görünmeli; yoksa operatör aynı ekranda üç farklı dil okur.
 *
 * Odak-taslak davranışı ortak kancada (`useNumericDraft`) — yüzde girdisi de aynı davranışı kullanır.
 */
// Yazım kararı ORTAK (`ui/format.ts`): sütundaki tutar ile kutudaki tutar aynı dili konuşmalı.
// Boş hâl burada `''` — sütunun "—"si bir kutuya yazılamaz; fark budur, biçim değil.
const format = (value: number | null): string => (value == null ? '' : decimal(value));
const toDraft = (value: number | null): string => (value == null ? '' : String(value).replace('.', ','));

/** Serbest yazımı sayıya indirir: virgül/nokta ikisi de ondalık ayracı, boş → null. */
function parse(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  if (cleaned === '') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Yazarken izin verilen karakterler — harf ve İKİNCİ bir ayraç kutuya hiç girmez. */
const sanitize = (raw: string): string => raw.replace(/[^\d.,]/g, '').replace(/([.,])(?=.*[.,])/g, '');

/**
 * İşaretli kip — yalnız yüzde alanları için. Eksi marj GERÇEK bir karardır (zararına satış) ve
 * ekran onu gösteriyordu ama KUTUYA YAZILAMIYORDU: eksi işareti süzülüyor, operatör gösterilen
 * değeri geri yazamıyordu. Para alanları bu kipe girmez — negatif fiyat diye bir şey yok.
 */
const sanitizeSigned = (raw: string): string => `${raw.startsWith('-') ? '-' : ''}${sanitize(raw)}`;

interface MoneyCoreProps {
  value: number | null;
  onChange: (value: number | null) => void;
  onBlur?: () => void;
}

const draftOptions = (core: MoneyCoreProps) => ({ ...core, format, toDraft, sanitize, parse });

interface MoneyInputProps extends MoneyCoreProps {
  inputSize?: 'md' | 'sm';
  className?: string;
  /** `Input.fullWidth` ile aynı — satır içine giren kutu kabuğun `w-full`'ünü kapatır. */
  fullWidth?: boolean;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
  ariaLabel?: string;
}

export function MoneyInput({ inputSize = 'sm', className, fullWidth, disabled, placeholder, title, ariaLabel, ...core }: MoneyInputProps) {
  const text = useNumericDraft(draftOptions(core));
  return (
    <Input
      inputSize={inputSize}
      mono
      inputMode="decimal"
      className={className}
      fullWidth={fullWidth}
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

interface MoneyFieldProps extends MoneyCoreProps {
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
export function MoneyField({ label, required, labelAside, error, placeholder, disabled, fieldClassName, id, ...core }: MoneyFieldProps) {
  const text = useNumericDraft(draftOptions(core));
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

/**
 * Yüzde girdisi (etiketli) — para alanıyla AYNI odak-taslak davranışı, farklı biçim: tek ondalık,
 * `%` işareti etikette. Formda saklanan bir alan değil de türetilmiş bir değer olabilir (paket
 * formunda indirim yüzdesi fiyatın ikinci yazımıdır), o yüzden RHF adaptörü yok — değer ve yazıcı
 * dışarıdan verilir.
 */
const formatPercent = (value: number | null): string => (value == null ? '' : decimal(value, 1));
// Yüzde TÜRETİLMİŞ bir değer olabilir (fiyattan hesaplanır) ve ham hâli `4.255319148936170` gibi
// gelir; odaklanınca düzenlenecek metin de yuvarlanmış olmalı, yoksa kutuya on beş hane dökülür.
const toPercentDraft = (value: number | null): string =>
  value == null ? '' : String(Number(value.toFixed(1))).replace('.', ',');

interface PercentFieldProps extends MoneyCoreProps {
  label: ReactNode;
  labelAside?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  fieldClassName?: string;
  id?: string;
  /** Eksi değer yazılabilir mi — zararına satış / listenin üstünde fiyat gibi bilinçli kararlar için. */
  signed?: boolean;
}

export function PercentField({ label, labelAside, placeholder, disabled, fieldClassName, id, signed, ...core }: PercentFieldProps) {
  const text = useNumericDraft({
    ...core,
    format: formatPercent,
    toDraft: toPercentDraft,
    sanitize: signed ? sanitizeSigned : sanitize,
    parse,
  });
  return (
    <InputField
      label={label}
      labelAside={labelAside}
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
