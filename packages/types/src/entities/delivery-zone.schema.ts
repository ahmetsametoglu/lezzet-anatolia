import { z } from 'zod';
import { CountryEnum } from '../primitives/enums.schema';
import { PostalCodeSchema } from '../primitives/postal-code.schema';

// Rota bölgesi: haftalık günler ve bağlı depo, ikisi de yönetimden düzenlenir. Rota içi/dışı saklanmaz, türetilir: saklansaydı
// bölge sınırı değişince ertesi gün yanlış olurdu.

export const DeliveryZoneSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  /**
   * Bölge TEK depoya bağlıdır (DOMAIN §17): posta kodu → bölge → depo zincirinin orta halkası.
   * Zincir bu yüzden tekil çözülür; "hangi depo bakar" sorusunun ikinci cevabı yoktur.
   */
  warehouseId: z.string().uuid(),
  /** Haftalık teslimat günleri, ISO: 1=Pazartesi … 7=Pazar. */
  weekdays: z.array(z.number().int().min(1).max(7)),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type DeliveryZone = z.infer<typeof DeliveryZoneSchema>;

export const DeliveryZoneInsertSchema = z.object({
  name: z.string().min(1),
  warehouseId: z.string().uuid(),
  /** En az bir gün: günü olmayan rota hiçbir sefere düşmez (veride de `check`). */
  weekdays: z.array(z.number().int().min(1).max(7)).min(1),
  isActive: z.boolean().optional(),
});
export type DeliveryZoneInsert = z.infer<typeof DeliveryZoneInsertSchema>;

export const DeliveryZoneUpdateSchema = DeliveryZoneSchema.partial().required({ id: true });
export type DeliveryZoneUpdate = z.infer<typeof DeliveryZoneUpdateSchema>;

// ── Posta kodu ↔ bölge ─────────────────────────────────────────────────────────
// Küme kendi tablosunda ve anahtarı `(country, postalCode)`, çünkü iki bölgeye aynı kod yazılabilseydi çok depoda sipariş yanlış
// depoya düşerdi ve posta kodu ülkeler arası benzersiz değildir (`67000` hem Fransa'da hem Almanya'da var). Ülke bölgede değil
// burada durur: bölge sınır ötesi olabilir (Strasbourg rotası Kehl'i kapsayabilir).

export const DeliveryZonePostalCodeSchema = z.object({
  country: CountryEnum,
  /** Beş rakam; okuma ve yazma aynı şekil, servis yazmadan önce boşlukları siler. */
  postalCode: PostalCodeSchema,
  zoneId: z.string().uuid(),
});
export type DeliveryZonePostalCode = z.infer<typeof DeliveryZonePostalCodeSchema>;

// Ayrı bir `Insert` şeması YOK: her alan zorunlu, yazım ile okuma aynı şekil. İkinci bir tip
// vermek onların ayrışabileceğini ima ederdi.

/**
 * Bölge + kodları — ekranın ve motorun birlikte okuduğu hâl. Kodlar ayrı tabloda durduğu için
 * varlık şeması onları taşımaz; bu tip "bölgeyi kodlarıyla göster" sorusunun cevabıdır.
 */
export const DeliveryZoneWithCodesSchema = DeliveryZoneSchema.extend({
  postalCodes: z.array(DeliveryZonePostalCodeSchema.omit({ zoneId: true })),
});
export type DeliveryZoneWithCodes = z.infer<typeof DeliveryZoneWithCodesSchema>;
