import { z } from 'zod';

// Personel rolleri (admin/depo/kurye) — DOMAIN §2. Müşteri rolü örtük, Customer'dan gelir.
// staff_role tablosu bileşik PK (user_id, role); id yoktur → base'in id-merkezli metodları
// (getById/update/delete) kullanılmaz, getAll/upsert/deleteWhere kullanılır.

export const StaffRoleEnum = z.enum(['admin', 'warehouse', 'courier']);
export type StaffRole = z.infer<typeof StaffRoleEnum>;

export const StaffRoleRowSchema = z.object({
  userId: z.string().uuid(),
  role: StaffRoleEnum,
  createdAt: z.string(),
});
export type StaffRoleRow = z.infer<typeof StaffRoleRowSchema>;

export const StaffRoleInsertSchema = StaffRoleRowSchema.omit({ createdAt: true });
export type StaffRoleInsert = z.infer<typeof StaffRoleInsertSchema>;

// staff_role'de anlamlı güncelleme yok (bileşik anahtar) — base sözleşmesi için placeholder.
export const StaffRoleUpdateSchema = StaffRoleRowSchema.partial();
export type StaffRoleUpdate = z.infer<typeof StaffRoleUpdateSchema>;
