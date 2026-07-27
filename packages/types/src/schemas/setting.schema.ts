import { z } from 'zod';

// Setting — işletme ayarı (DATA_MODEL, STACK §10). **Env'e veya koda gömülmez:** kesim saati,
// eşikler, tavanlar işin sahibinin kararıdır ve dağıtım beklemeden değişebilmelidir.
//
// KAPSAMLI (scoped): aynı anahtar kanala/bölgeye/ülkeye göre farklılaşabilir. Çözücü EN ÖZGÜL
// kapsamı seçer, yoksa global'e düşer.

export const SettingScopeEnum = z.enum(['global', 'channel', 'zone', 'country']);
export type SettingScope = z.infer<typeof SettingScopeEnum>;

export const SettingSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  scopeType: SettingScopeEnum,
  /** Kapsamın kimliği: kanal 'b2b'/'b2c', ülke 'FR'/'DE', bölge uuid. Global'de null. */
  scopeId: z.string().nullable(),
  value: z.unknown(),
  description: z.string().nullable(),
  updatedAt: z.string(),
});
export type Setting = z.infer<typeof SettingSchema>;

export const SettingInsertSchema = z.object({
  key: z.string().min(1),
  scopeType: SettingScopeEnum.optional(),
  scopeId: z.string().nullish(),
  value: z.unknown(),
  description: z.string().nullish(),
});
export type SettingInsert = z.infer<typeof SettingInsertSchema>;

export const SettingUpdateSchema = SettingSchema.partial().required({ id: true });
export type SettingUpdate = z.infer<typeof SettingUpdateSchema>;

/** Çözüm bağlamı — verilen eksenlerden en özgülü kazanır. */
export interface SettingScopeContext {
  channel?: string | null;
  zoneId?: string | null;
  country?: string | null;
}
