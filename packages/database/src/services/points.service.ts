import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_PAGE_SIZE,
  PointsBalanceSchema,
  PointsEntryInsertSchema,
  PointsEntrySchema,
  RedemptionResultSchema,
  type KeysetCursor,
  type Page,
  type PointsBalance,
  type PointsEntry,
  type PointsEntryInsert,
  type PointsReason,
  type RedemptionResult,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';

/**
 * Puan defteri (17.4) — **karar vermez, satır getirir/yazar** (STACK §4).
 *
 * "Kim kazanır, ne kadar kazanır, tavana takıldı mı" soruları motorda (`domain-core/feedback`);
 * servis yalnız defteri tutar. `update`/`delete` YOK ve olmayacak: defter satırı düzeltilmez,
 * karşı kayıt yazılır — muhasebenin en eski kuralı.
 */
export class PointsEntryService extends BaseDbService<PointsEntry, PointsEntryInsert, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'points_entry', PointsEntrySchema, PointsEntryInsertSchema, PointsEntrySchema as never, false);
  }

  /** Müşterinin puan geçmişi — yeniden eskiye, keyset sayfalı (defter veriyle büyür). */
  listByCustomer(customerId: string, cursor?: KeysetCursor, limit = DEFAULT_PAGE_SIZE): Promise<Page<PointsEntry>> {
    return this.getPage({ customerId }, { orderBy: 'createdAt', orderDirection: 'desc', limit, keysetAfter: cursor });
  }

  /**
   * Müşterinin **bugün** kazandığı puan — günlük tavanın ölçütü.
   *
   * Yalnız pozitifler sayılır: harcama tavanı serbest bırakmamalı, yoksa kupona çevirip yeniden
   * kazanmak sınırsız bir döngü olurdu.
   */
  async earnedToday(customerId: string, now: Date = new Date()): Promise<number> {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const rows = await this.getAll(
      { customerId },
      { rangeFilters: [{ field: 'createdAt', operator: 'gte', value: dayStart.toISOString() }] },
    );
    return rows.filter((r) => r.points > 0).reduce((sum, r) => sum + r.points, 0);
  }

  /** Bu kaynaktan zaten puan verilmiş mi — tekillik ihlaline düşmeden önce sorulur. */
  async hasEntryFor(customerId: string, reason: PointsReason, refId: string): Promise<boolean> {
    return (await this.getOneBy({ customerId, reason, refId })) !== null;
  }

  /**
   * **Puan → kişisel kupon** (`redeem_points`, 17.5). Puan düşümü ve kuponun doğuşu tek
   * transaction'da: ayrı olsalardı ikincisi düştüğünde müşterinin puanı gider, kuponu doğmazdı.
   *
   * `ok:false` bir hata değil bir gerçektir — yetersiz bakiye müşteriye söylenecek bir cümledir.
   */
  async redeem(input: {
    customerId: string;
    points: number;
    valueCents: number;
    minimum: number;
    code: string;
  }): Promise<RedemptionResult> {
    const raw = await this.executeRpc('redeem_points', {
      p_customer_id: input.customerId,
      p_points: input.points,
      p_value_cents: input.valueCents,
      p_minimum: input.minimum,
      p_code: input.code,
    });
    return RedemptionResultSchema.parse(dbToApp(raw));
  }
}

/**
 * `customer_points_balance` görünümü — defterden türetilen bakiye.
 *
 * Ayrı servis, çünkü görünüm yazılmaz. Bakiyeyi defter servisine metot olarak eklemek, bir gün
 * "bakiyeyi güncelle" diye bir yol açmanın davetiyesi olurdu.
 */
export class PointsBalanceService extends BaseDbService<PointsBalance, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'customer_points_balance',
      PointsBalanceSchema,
      PointsBalanceSchema as never,
      PointsBalanceSchema as never,
      false,
    );
  }

  /** Tek müşterinin bakiyesi; hiç hareketi yoksa `null` (satır yoktur). */
  async getByCustomer(customerId: string): Promise<PointsBalance | null> {
    const rows = await this.getAll({ customerId }, { limit: 1 });
    return rows[0] ?? null;
  }

  /**
   * Operasyon puan tablosu — en çok biriktirenler önce.
   *
   * "Kim ne kadar biriktirmiş" sorusu bir istisna avı değil genel resim çizer (tasarım §4); bu
   * yüzden sıralama bakiyeye göredir, son hareket tarihine göre değil.
   */
  listTop(limit = 50): Promise<PointsBalance[]> {
    return this.getAll(undefined, { orderBy: 'balance', orderDirection: 'desc', limit });
  }
}
