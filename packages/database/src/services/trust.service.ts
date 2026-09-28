import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CustomerTrustScoreSchema,
  DEFAULT_PAGE_SIZE,
  TrustEntryInsertSchema,
  TrustEntrySchema,
  TrustFactSchema,
  type CustomerTrustScore,
  type KeysetCursor,
  type Page,
  type TrustEntry,
  type TrustEntryInsert,
  type TrustFact,
  type TrustReason,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/** Güven defteri — satır yazar ve okur; puanı ve ağırlığı motor verir. */
export class TrustEntryService extends BaseDbService<TrustEntry, TrustEntryInsert, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'trust_entry', TrustEntrySchema, TrustEntryInsertSchema, TrustEntrySchema as never, false);
  }

  /** Aynı kaynaktan ikinci satırı veritabanı yutar, ki iki tarama aynı olayı iki kez saymasın. */
  record(rows: TrustEntryInsert[]): Promise<TrustEntry[]> {
    return this.bulkUpsertIgnoring(rows, 'customer_id,reason,ref_id');
  }

  /** Müşterinin güven geçmişi — olay anına göre yeniden eskiye, keyset sayfalı (defter veriyle büyür). */
  listByCustomer(customerId: string, cursor?: KeysetCursor, limit = DEFAULT_PAGE_SIZE): Promise<Page<TrustEntry>> {
    return this.getPage({ customerId }, { orderBy: 'occurredAt', orderDirection: 'desc', limit, keysetAfter: cursor });
  }
}

/** `trust_fact` görünümü — deftere henüz yazılmamış olaylar; yazıldıkça küme küçülür. */
export class TrustFactService extends BaseDbService<TrustFact, never, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'trust_fact', TrustFactSchema, TrustFactSchema as never, TrustFactSchema as never, false);
  }

  /**
   * Bekleyen olaylar, en eski önce. Yalnız verilen sebepler okunur: ağırlığı sıfır olan sebebin olayı hiç yazılmaz ve süzülmezse
   * pencereyi doldurup yenilerini bekletirdi.
   */
  listPending(reasons: readonly TrustReason[], limit = 500, customerIds?: readonly string[]): Promise<TrustFact[]> {
    if (reasons.length === 0 || customerIds?.length === 0) return Promise.resolve([]);
    return this.getAll(
      { reason: [...reasons], ...(customerIds ? { customerId: [...customerIds] } : {}) },
      { orderBy: 'occurredAt', orderDirection: 'asc', limit },
    );
  }
}

/** `customer_trust_score` görünümü — defterden türeyen puan. */
export class CustomerTrustScoreService extends BaseDbService<CustomerTrustScore, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'customer_trust_score',
      CustomerTrustScoreSchema,
      CustomerTrustScoreSchema as never,
      CustomerTrustScoreSchema as never,
      false,
    );
  }

  /** `null` = müşterinin defterde hiç hareketi yok; sıfır puanla karışmasın diye ayrı döner. */
  async scoreOf(customerId: string): Promise<CustomerTrustScore | null> {
    const [row] = await this.getAll({ customerId }, { limit: 1 });
    return row ?? null;
  }
}
