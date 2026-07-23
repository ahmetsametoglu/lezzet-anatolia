import type { SupabaseClient } from '@supabase/supabase-js';
import {
  StaffRoleInsertSchema,
  StaffRoleRowSchema,
  StaffRoleUpdateSchema,
  type StaffRole,
  type StaffRoleInsert,
  type StaffRoleRow,
  type StaffRoleUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Personel rolleri (admin/depo/kurye). `staff_role` bileşik PK (user_id, role) — id yok;
 * base'in getAll/upsert/deleteWhere metodlarını kullanır (id-merkezli getById/update/delete değil).
 * Enjekte edilen istemci ile çalışır (guard/script service-role verir).
 */
export class StaffRoleService extends BaseDbService<StaffRoleRow, StaffRoleInsert, StaffRoleUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'staff_role', StaffRoleRowSchema, StaffRoleInsertSchema, StaffRoleUpdateSchema);
  }

  /** Kullanıcının tüm personel rolleri. Müşteri rolü bu tabloda yoktur. */
  async getRoles(userId: string): Promise<StaffRole[]> {
    const rows = await this.getAll({ userId });
    return rows.map((r) => r.role);
  }

  async hasRole(userId: string, role: StaffRole): Promise<boolean> {
    return (await this.getRoles(userId)).includes(role);
  }

  /** Rol atar (idempotent — zaten varsa dokunmaz). Admin işlemi; ekranı modül 09. */
  async assign(userId: string, role: StaffRole): Promise<void> {
    await this.upsert({ userId, role }, 'user_id,role');
  }

  async remove(userId: string, role: StaffRole): Promise<void> {
    await this.deleteWhere({ userId, role });
  }
}
