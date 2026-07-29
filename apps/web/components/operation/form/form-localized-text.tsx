'use client';

import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import type { LocalizedText } from '@lezzet/types';
import { LocalizedTextField, type LocalizedTextFieldProps } from './localized-text-field';

/**
 * RHF çok dilli metin alanı — `LocalizedTextField`'in react-hook-form sarmalayıcısı.
 *
 * Alanın kendisi (dil sekmeleri, "✦ AI çeviri", düzenler, vurgu) çekirdekte yaşar; burada yalnız
 * RHF bağı var. Ayrımın sebebi: aynı alan RHF kullanmayan diyaloglarda da gerekiyor (indirim
 * formu) ve orada ham `Input`'la yeniden kurulmuştu — etiketsiz, çeviri düğmesiz, hata yolsuz.
 */
interface FormLocalizedTextProps<T extends FieldValues>
  extends Omit<LocalizedTextFieldProps, 'value' | 'onChange' | 'error' | 'onBlur'> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<T, any, any>;
  name: FieldPath<T>;
}

export function FormLocalizedText<T extends FieldValues>({ control, name, ...field }: FormLocalizedTextProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: rhf, fieldState }) => (
        <LocalizedTextField
          {...field}
          value={(rhf.value as LocalizedText | undefined) ?? {}}
          onChange={rhf.onChange}
          onBlur={rhf.onBlur}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}
