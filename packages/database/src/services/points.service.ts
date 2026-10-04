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
import { parisDateOf, parisDayRange } from '@lezzet/helper';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';

/** İşletme gününün başlangıcı (Paris'te gece yarısı), ISO an olarak; sunucu UTC'de koştuğu için gün açıkça Paris'ten kurulur. */
const businessDayStart = (now: Date): string => parisDayRange(parisDateOf(now)).from;

/**
 * Puan defteri karar vermez, satır getirir ve yazar; kazanma ve tavan kuralı motordadır (`domain-core/feedback`). `update`/`delete`
 * yoktur, çünkü defter satırı düzeltilmez, karşı kayıt yazılır.
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
   * İşletmenin bugününde kazanılan puan, günlük tavanın ölçütü; yalnız pozitifler sayılır, yoksa kupona çevirip yeniden kazanmak
   * sınırsız bir döngü olurdu. `reasons` verilirse yalnız tavana tabi sebepler sayılır, ki tavan dışı bir ödül tavanın içini yemesin.
   */
  async earnedToday(customerId: string, reasons?: readonly PointsReason[], now: Date = new Date()): Promise<number> {
    const rows = await this.getAll(
      reasons ? { customerId, reason: [...reasons] } : { customerId },
      { rangeFilters: [{ field: 'createdAt', operator: 'gte', value: businessDayStart(now) }] },
    );
    return rows.filter((r) => r.points > 0).reduce((sum, r) => sum + r.points, 0);
  }

  /** Bu kaynaktan zaten puan verilmiş mi — tekillik ihlaline düşmeden önce sorulur. */
  async hasEntryFor(customerId: string, reason: PointsReason, refId: string): Promise<boolean> {
    return (await this.getOneBy({ customerId, reason, refId })) !== null;
  }

  /**
   * Bu kaynaktan yazılmış ödül satırı; işaret süzgeci şart, çünkü aynı üçlüde ödül ve geri alma birlikte bulunabilir. Geri alınacak
   * tutar o gün yazılandır, bugünkü ayar değil, yoksa defter kendi geçmişiyle çelişirdi.
   */
  async findAwardFor(customerId: string, reason: PointsReason, refId: string): Promise<PointsEntry | null> {
    const rows = await this.getAll(
      { customerId, reason, refId },
      { rangeFilters: [{ field: 'points', operator: 'gt', value: 0 }], limit: 1 },
    );
    return rows[0] ?? null;
  }

  /** Bu kaynağın ödülü zaten geri alınmış mı — asıl güvence `points_entry_reversal_key`te. */
  async hasReversalFor(customerId: string, reason: PointsReason, refId: string): Promise<boolean> {
    const rows = await this.getAll(
      { customerId, reason, refId },
      { rangeFilters: [{ field: 'points', operator: 'lt', value: 0 }], limit: 1 },
    );
    return rows.length > 0;
  }

  /**
   * Kaynaksız sebeplerin günlük tekillik nezaketi; gün `earnedToday` ve `points_entry_visit_day` indeksiyle aynı işletme günüdür, yoksa
   * uygulama "kazanabilirsin" der, veritabanı reddederdi. Asıl güvence indekstedir.
   */
  async hasEntryOnBusinessDay(customerId: string, reason: PointsReason, now: Date = new Date()): Promise<boolean> {
    const rows = await this.getAll(
      { customerId, reason },
      { rangeFilters: [{ field: 'createdAt', operator: 'gte', value: businessDayStart(now) }], limit: 1 },
    );
    return rows.length > 0;
  }

  /**
   * Puan kişisel kupona çevrilir; düşüm ve kuponun doğuşu tek transaction'dadır, yoksa ikincisi düşünce puan gider kupon doğmazdı.
   * `ok:false` hata değil, müşteriye söylenecek bir gerçektir (yetersiz bakiye).
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
 * Defterden türetilen bakiye görünümü (`customer_points_balance`); ayrı servistir, çünkü defter servisine eklenen bir bakiye metodu bir
 * gün "bakiyeyi güncelle" yolunu açardı.
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
   * Operasyon puan tablosu bakiyeye göre sıralıdır ve RPC'den okunur, çünkü dönem seçicisi parametre ister ve görünüm parametre alamaz.
   * `since` verildiğinde `balance` dönemin farkıdır, cüzdan bakiyesi değil.
   */
  async listTop(limit = 50, since?: string): Promise<PointsBalance[]> {
    const rows = await this.executeRpc<unknown[]>('points_leaderboard', { p_since: since ?? null, p_limit: limit });
    return this.parseRows(rows);
  }
}
