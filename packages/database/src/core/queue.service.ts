import type { SupabaseClient } from '@supabase/supabase-js';
import type { ZodType, ZodTypeDef } from 'zod';
import { QueueRowUpdateSchema, type QueueRow, type QueueRowUpdate } from '@lezzet/types';
import { BaseDbService } from './base.service';

/**
 * Dış sisteme yazım kuyruğunun ortak okuma ve yazımı; kasa ve muhasebe kuyruğu aynı satır biçimini taşır, hedef kolonları alt
 * sınıftadır. Satır işlenince silinir, bu yüzden küme kısa kalır.
 */
export abstract class QueueDbService<TRow extends QueueRow, TInsert> extends BaseDbService<TRow, TInsert, QueueRowUpdate> {
  protected constructor(
    supabase: SupabaseClient,
    table: string,
    rowSchema: ZodType<TRow, ZodTypeDef, unknown>,
    insertSchema: ZodType<TInsert, ZodTypeDef, unknown>,
  ) {
    super(supabase, table, rowSchema, insertSchema, QueueRowUpdateSchema);
  }

  /** Bu sebeple duran satırları hemen yeniden denemeye açar; sebebi kaldıran değişiklik (eşleme) bekleme süresini beklemesin. */
  async retryBlocked(reason: string, now: string): Promise<void> {
    const rows = await this.getAll({ lastError: `blocked:${reason}` });
    await this.updateWhereIn(
      'id',
      rows.map((row) => row.id),
      { nextAttemptAt: now },
    );
  }

  /** Vakti gelen satırlar, işaretlenme sırasıyla ve sınırlı sayıda; dış sistem istek yağmuruna tutulmasın. */
  listDue(now: string, limit: number): Promise<TRow[]> {
    return this.getAll(undefined, {
      rangeFilters: [{ field: 'nextAttemptAt', operator: 'lte', value: now }],
      orderBy: 'markedAt',
      limit,
    });
  }

  /** Kuyrukta bekleyen satırlar; ertelenmiş ve durmuş satırlar da sayılır. */
  countWaiting(): Promise<number> {
    return this.count();
  }

  /** Duran satırlar (`blocked:<sebep>`); çözümleri bir veri değişikliğidir, sebep ekrana gider. */
  listBlocked(limit = 500): Promise<TRow[]> {
    return this.getAll(undefined, { prefixFilters: [{ field: 'lastError', value: 'blocked:' }], limit });
  }

  /** Dış sisteme ulaşamayıp yeniden denenen satırlar; duran satır önceki deneme sayısını korur, o yüzden ayrılır. */
  countFailing(): Promise<number> {
    return this.count(undefined, {
      rangeFilters: [{ field: 'attempts', operator: 'gt', value: 0 }],
      orFilters: ['last_error.is.null,last_error.not.like.blocked:*'],
    });
  }

  /** İşlenen satırı siler; işlem sürerken yeniden işaretlendiyse (`markedAt` değiştiyse) satır kalır ve sonraki eşitleme yine işler. */
  async complete(id: string, markedAt: string): Promise<void> {
    await this.deleteWhere({ id, markedAt });
  }

  /** Satırı erteler; işlem sürerken yeniden işaretlendiyse vakit hemen geri çekilir ki yeni değişiklik ertelemeyi beklemesin. */
  async defer(row: Pick<TRow, 'id' | 'markedAt'>, change: { attempts: number; nextAttemptAt: string; lastError: string }): Promise<void> {
    const deferred = await this.update({ id: row.id, ...change });
    if (deferred.markedAt !== row.markedAt) await this.update({ id: row.id, nextAttemptAt: deferred.markedAt });
  }
}
