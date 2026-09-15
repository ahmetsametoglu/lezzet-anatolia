import { z } from 'zod';
import { SupplierInsertSchema } from '@lezzet/types';

/**
 * **TEDARİKÇİ FORMUNUN ŞEMASI** — Tedarik ekranının kartı ve asistan kuyruğunun tedarikçi önerisi
 * (22.44) aynı tanımı paylaşır; 22.44'e dek tedarik sayfasının `procurement-types`ındaydı ve kuyruk
 * kardeş sayfadan import edemezdi (`STACK §7`).
 *
 * **Varlık şemasından türetilir** (CLAUDE §1): `contact` serbest JSON'u formda üç adlı alana açılır —
 * telefon, e-posta, adres; birleştirme kapıda (`saveSupplierAction`). Serbest JSON'a bırakılsaydı her
 * kayıt farklı anahtar kullanır ve "WhatsApp'tan sipariş gönder" bağlantısı güvenle çalışmazdı.
 *
 * **Ülke formda gevşek** (12.26): kutu küçük harf de kabul eder ("be"), büyük harfe kapı çevirir;
 * boş = bilinmiyor. Varlığın katı ISO kalıbı (`[A-Z]{2}`) kapıdan sonra, kayıtta uygulanır.
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
