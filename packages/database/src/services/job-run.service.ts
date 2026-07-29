import type { SupabaseClient } from '@supabase/supabase-js';
import { JobRunSchema, JobRunInsertSchema, JobRunUpdateSchema, type JobRun, type JobRunInsert, type JobRunUpdate } from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Zamanlanmış iş izi (06.4) — "en son ne zaman koştu, ne oldu". STACK §13 cron disiplini.
 * Tarihçe tutmaz: iş başına tek satır üzerine yazılır. Gecikme alarmı bu satırı okuyacak (18.6).
 */
export class JobRunService extends BaseDbService<JobRun, JobRunInsert, JobRunUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'job_run', JobRunSchema, JobRunInsertSchema, JobRunUpdateSchema);
  }

  /** Başarılı tur — hata izi temizlenir (sağlıklı hâl tek bakışta görünsün). */
  async recordSuccess(name: string, result: Record<string, unknown> = {}): Promise<JobRun> {
    return this.upsert({ name, lastRunAt: new Date().toISOString(), lastResult: result, lastError: null }, 'name');
  }

  /** Hatalı tur — `lastRunAt` yine yazılır: iş koştu ama düştü; hiç koşmamakla karıştırılmamalı. */
  async recordFailure(name: string, error: string): Promise<JobRun> {
    return this.upsert({ name, lastRunAt: new Date().toISOString(), lastError: error }, 'name');
  }

  async findByName(name: string): Promise<JobRun | null> {
    return this.getOneBy({ name });
  }

  /**
   * Son turu HATALI olan ve o turu verilen andan sonra koşan işlerin sayısı — sağlık görüntüsünün
   * "son bir saatte düşen iş" alanı (18.5).
   *
   * Tarihçe tutulmadığı için bu "kaç tur düştü" değil, **"şu an hatalı duran kaç iş var"**. Soru
   * yine yanıtlanıyor: bir şey düşmüş mü. Zaman koşulu şart — aylar önce düşüp bir daha koşmamış bir
   * iş, bugünün sağlığı hakkında bir şey söylemez.
   */
  async countFailedSince(since: string): Promise<number> {
    return this.count(undefined, {
      isNotNullFields: ['lastError'],
      rangeFilters: [{ field: 'lastRunAt', operator: 'gte', value: since }],
    });
  }
}
