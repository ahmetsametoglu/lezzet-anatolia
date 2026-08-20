import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PriceGroupInsertSchema,
  PriceGroupSchema,
  PriceGroupUpdateSchema,
  type PriceGroup,
  type PriceGroupInsert,
  type PriceGroupUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Müşteri fiyat grupları (`price_group`, 20.08) — B2B'nin alt kademeleri (market · restoran/pastane).
 *
 * Servis SAF I/O'dur: yüzdenin fiyata nasıl uygulandığı motorun işi
 * (`domain-core/resolve-price`, sıra: müşteriye özel → grup → liste). Üyelik satırı burada değil,
 * `user_profile.price_group_id`te durur — grup silinirken `restrict` FK'si üyeli grubu korur;
 * Supabase `delete()` hatayı fırlatmaz DÖNDÜRÜR, ekran onu okuyup söylemeli.
 */
export class PriceGroupService extends BaseDbService<PriceGroup, PriceGroupInsert, PriceGroupUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'price_group', PriceGroupSchema, PriceGroupInsertSchema, PriceGroupUpdateSchema);
  }

  /**
   * Tüm gruplar — operasyonun grup yönetimi ve müşteri kartındaki seçici.
   *
   * **Sayfalanmıyor ve doğru olan bu** (`CLAUDE §1`): küme veriyle değil operatörün elle kurduğu
   * kademe sayısıyla büyüyor — doğal tavanlı küme tek turda çekilir.
   */
  listAll(): Promise<PriceGroup[]> {
    return this.getAll({}, { orderBy: 'name' });
  }
}
