'use client';

import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { NutritionField } from './nutrition-field';

/**
 * Besin değerlerinin RHF sarmalayıcısı — çizim `NutritionField`ta.
 *
 * Alanın kendisi form kütüphanesinden bağımsız bir çekirdek (`nutrition-field`, künyesi orada):
 * RHF formu bunu kullanır, `useState` ile çalışan ekran çekirdeği doğrudan kullanır. Sarmalayıcı
 * yalnız `Controller`ın değerini çekirdeğe bağlar — burada tek satır bile çizim mantığı olmamalı,
 * yoksa iki yüzey aynı alanı iki farklı davranışla gösterir (`LocalizedTextField` ile aynı desen).
 */

interface FormNutritionProps<T extends FieldValues> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<T, any, any>;
  name: FieldPath<T>;
}

export function FormNutrition<T extends FieldValues>({ control, name }: FormNutritionProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => <NutritionField value={field.value ?? null} onChange={field.onChange} onBlur={field.onBlur} />}
    />
  );
}
