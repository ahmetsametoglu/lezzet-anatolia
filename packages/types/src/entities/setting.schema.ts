import { z } from 'zod';

// Setting — işletme ayarı (DATA_MODEL, STACK §10). **Env'e veya koda gömülmez:** kesim saati,
// eşikler, tavanlar işin sahibinin kararıdır ve dağıtım beklemeden değişebilmelidir.
//
// KAPSAMLI (scoped): aynı anahtar depoya/bölgeye/kanala/ülkeye göre farklılaşabilir. Çözücü EN
// ÖZGÜL kapsamı seçer, yoksa global'e düşer.
//
// `warehouse` KAPSAMI (03.08, operasyon şeridinin talebi): migration (`0016`) bu değeri baştan
// taşıyordu, Zod taşımıyordu — yani kapı veritabanında açık, uygulamada kapalıydı ve depo kapsamlı
// bir satır yazılsa okuma tarafında `SettingSchema.parse`a takılırdı. Üç kaynağın (migration · Zod ·
// veri modeli) ikisi dört, biri beş diyordu; hizalandı ve **migration haklı sayıldı**.
//
// Gerekçe bir şema ayrıntısı değil, ÖLÇÜM DOĞRULUĞU: `0016`'nın künyesi depo bazlı olmaya aday
// ayarları adıyla sayıyor — kesim saati, rota teslimat birim maliyeti, paketleme maliyeti, minimum
// sepet — ve *"kâr hesabına girer, global kalırsa kâr sessizce yanlışlaşır"* diyor. İki depo varken
// tek bir "rota teslimat birim maliyeti" iki farklı gerçeği tek sayıya indirir. Depo bu projede bir
// boyut değil DEĞİŞMEZ (CLAUDE.md §1); ayar ekseninde de öyle olmalı.
export const SettingScopeEnum = z.enum(['global', 'channel', 'zone', 'country', 'warehouse']);
export type SettingScope = z.infer<typeof SettingScopeEnum>;

export const SettingSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  scopeType: SettingScopeEnum,
  /** Kapsamın kimliği: kanal 'b2b'/'b2c', ülke 'FR'/'DE', bölge ve depo uuid. Global'de null. */
  scopeId: z.string().nullable(),
  value: z.unknown(),
  description: z.string().nullable(),
  updatedAt: z.string(),
  /**
   * Değişikliği yapan personel (09.16). **`null` = "sistem kurdu", "bilinmiyor" değil** — tohum
   * satırları kimse tarafından değiştirilmemiştir; ekran boş aktörü "sistem varsayılanı" diye
   * okur, uydurma bir isim yazmaz.
   */
  updatedBy: z.string().uuid().nullable(),
});
export type Setting = z.infer<typeof SettingSchema>;

export const SettingInsertSchema = z.object({
  key: z.string().min(1),
  scopeType: SettingScopeEnum.optional(),
  scopeId: z.string().nullish(),
  value: z.unknown(),
  description: z.string().nullish(),
  updatedBy: z.string().uuid().nullish(),
});
export type SettingInsert = z.infer<typeof SettingInsertSchema>;

export const SettingUpdateSchema = SettingSchema.partial().required({ id: true });
export type SettingUpdate = z.infer<typeof SettingUpdateSchema>;

/** Çözüm bağlamı — verilen eksenlerden en özgülü kazanır (sıra `SCOPE_PRIORITY`'de). */
export interface SettingScopeContext {
  /** Depo — en özgül eksen; rota/paketleme maliyeti ve kesim saati depo başına farklılaşabilir. */
  warehouseId?: string | null;
  channel?: string | null;
  zoneId?: string | null;
  country?: string | null;
}
