import { z } from 'zod';
import { SupplierInsertSchema } from '@lezzet/types';

/**
 * Tedarikçi formunun şeması; Tedarik ekranının kartı ve asistanın tedarikçi önerisi aynı tanımı paylaşır. `contact` formda üç adlı
 * alana açılır ve kapıda birleşir; ülke formda küçük harf de kabul eder, büyük harfe kapı çevirir ve boş bilinmiyor demektir.
 */
export const SupplierFormSchema = SupplierInsertSchema.omit({ contact: true, country: true }).extend({
  /** Boşsa yeni kayıt. */
  id: z.string().uuid().optional(),
  phone: z.string().nullish(),
  email: z.string().nullish(),
  address: z.string().nullish(),
  country: z
    .string()
    .regex(/^([A-Za-z]{2})?$/, 'Ülke iki harfli kod olmalı: FR, BE, TR…')
    .nullish(),
  isActive: z.boolean(),
});
export type SupplierFormInput = z.infer<typeof SupplierFormSchema>;

/** Formun düzenlenen alanları — `id` kaydın kimliğidir, formda düzenlenmez. */
export const SupplierFormValuesSchema = SupplierFormSchema.omit({ id: true });
export type SupplierFormValues = z.infer<typeof SupplierFormValuesSchema>;
