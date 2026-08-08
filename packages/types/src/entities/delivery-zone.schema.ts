import { z } from 'zod';
import { CountryEnum } from '../primitives/enums.schema';

// DeliveryZone — rota bölgesi (DOMAIN §6/§17, ADR-002). Haftalık günler + bağlı depo;
// ikisi de admin-editable, kod sabiti değil.
//
// **Rota içi/dışı SAKLANMAZ, türetilir:** adresin posta kodu aktif bir bölgeye düşüyorsa rota içi.
// Saklansaydı bölge sınırı değişince ertesi gün yalan olurdu.

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
  weekdays: z.array(z.number().int().min(1).max(7)).optional(),
  isActive: z.boolean().optional(),
});
export type DeliveryZoneInsert = z.infer<typeof DeliveryZoneInsertSchema>;

export const DeliveryZoneUpdateSchema = DeliveryZoneSchema.partial().required({ id: true });
export type DeliveryZoneUpdate = z.infer<typeof DeliveryZoneUpdateSchema>;

// ── Posta kodu ↔ bölge (tekillik VERİDE) ────────────────────────────────────
// Kod kümesi `postalCodes` dizisiydi ve iki bölgeye aynı kodu yazmak serbestti; çözücü "ilki
// kazanır" diyerek sessizce birini seçiyordu. Tek depoda bu yalnız yanlış rota günü demekti,
// çok depoda **siparişin yanlış depoya düşmesi** demek. Küme kendi tablosuna taşındı.
//
// Anahtar `(country, postalCode)`: posta kodu ülkeler arası benzersiz DEĞİLDİR — `67000` hem
// Fransa'da hem Almanya'da geçerli. Yer çözümü daima bu ikilidir.
//
// Ülke BÖLGEDE değil burada durur: bir bölge sınır ötesi olabilir (ADR-002 — Strasbourg rotası
// Kehl'i kapsayabilir), bölgeye tek ülke yazmak onu bir devlete hapsederdi.

export const DeliveryZonePostalCodeSchema = z.object({
  country: CountryEnum,
  /** Normalize saklanır (boşluksuz, büyük harf); kısıt veritabanında da var. */
  postalCode: z.string(),
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
