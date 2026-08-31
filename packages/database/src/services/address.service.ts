import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AddressSchema,
  AddressInsertSchema,
  AddressUpdateSchema,
  type Address,
  type AddressInsert,
  type AddressUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Adres servisi (04.4). `customerId` müşteri rolüyle davranan profili işaret eder
 * (`user_profiles.id`) — ayrı müşteri tablosu yoktur.
 *
 * `inRoute` **saklanmaz**: posta kodunun aktif bir teslimat bölgesine düşmesinden türetilir
 * (modül 07); adres tablosu o kararı taşımaz.
 */
export class AddressService extends BaseDbService<Address, AddressInsert, AddressUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'address', AddressSchema, AddressInsertSchema, AddressUpdateSchema);
  }

  /** Müşterinin adresleri — varsayılan başta. */
  async listByCustomer(customerId: string): Promise<Address[]> {
    return this.getAll({ customerId }, { orderBy: 'isDefault', orderDirection: 'desc' });
  }

  /**
   * Varsayılan adresi değiştirir — müşterinin diğer adresleri düşürülür. "İki varsayılan"
   * checkout'ta hangisinin seçileceğini belirsiz bırakır.
   */
  async setDefault(id: string): Promise<Address> {
    return this.setExclusiveFlag(id, 'isDefault', 'customerId');
  }

  /** İlk adres otomatik varsayılandır — müşteriye "varsayılan yap" dedirtmeye gerek yok. */
  async addForCustomer(input: AddressInsert): Promise<Address> {
    const existing = await this.listByCustomer(input.customerId);
    return this.insert({ ...input, isDefault: input.isDefault ?? existing.length === 0 });
  }

  /** Kimlik kümesiyle okuma — sipariş snapshot'ında koordinat yoksa adres kaydından çözmek için. */
  async listByIds(ids: readonly string[]): Promise<Address[]> {
    if (ids.length === 0) return [];
    return this.getAll({ id: [...ids] });
  }

  /**
   * **Koordinatı çözülmemiş adresler** — tarama işinin kuyruğu (11.9). Karar vermez, satır getirir.
   *
   * Sıra `geoCheckedAt` artan — PostgREST varsayılanında **boşlar önce** gelir ve istenen tam bu:
   * hiç denenmemiş satır, bir kez denenip başarısız olandan önce sıralanır (`address_geo_pending_idx`
   * de bu sıraya göre kurulu). Deneme eşiği burada SÜZGEÇ olarak veriliyor, indeks yükleminde
   * değil — indeks yüklemi değişmez olmak zorunda ve eşik parametrik kalmalı.
   */
  listMissingGeo(input: { limit: number; maxAttempts: number }): Promise<Address[]> {
    return this.getAll(undefined, {
      isNullFields: ['lat'],
      rangeFilters: [{ field: 'geoAttempts', operator: 'lt', value: input.maxAttempts }],
      orderBy: 'geoCheckedAt',
      limit: input.limit,
    });
  }
}
