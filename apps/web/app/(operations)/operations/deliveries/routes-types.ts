import { z } from 'zod';
import { CountryEnum, DeliveryZoneInsertSchema, type DeliveryZonePostalCode } from '@lezzet/types';

// Rota kurulumunun tipleri (19.20).
//
// **Kardeş sayfadan ithal EDİLMİYOR** (STACK §7): `warehouses-types` de aynı şekli tanımlıyor ama
// ikisi de ORTAK ŞEMADAN türüyor (`packages/types`), yani kopya değil iki türetim — tek kaynak
// pakette. Kardeşten ithal etmek iki sayfayı birbirine bağlar ve biri taşındığında öteki kırılır.

/** Rotaya eklenen kod: `(ülke, kod)`. `67000` iki ülkede geçerli — ülkesiz anahtar eksik bir sorudur. */
const PostalCodePickSchema = z.object({ country: CountryEnum, postalCode: z.string().min(1) });
export type PostalCodePick = Pick<DeliveryZonePostalCode, 'country' | 'postalCode'>;

/** Rota formunun şeması — yazma eyleminin (`saveZoneAction`) girdisi. */
export const ZoneFormSchema = DeliveryZoneInsertSchema.pick({ name: true, weekdays: true, isActive: true })
  .partial({ isActive: true })
  .extend({ postalCodes: z.array(PostalCodePickSchema) });
