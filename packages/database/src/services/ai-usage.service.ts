import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AiUsageDailyRowSchema,
  AiUsageEntryInsertSchema,
  AiUsageEntrySchema,
  type AiUsageDailyRow,
  type AiUsageEntry,
  type AiUsageEntryInsert,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * AI kullanım defteri (15.27) — **karar vermez**: satırı yazar. Maliyet uygulamada hesaplanır
 * (`aiUsageRecorder` → `estimateCost`), tarife ayardadır (`ai_model_prices_usd`).
 *
 * Defter: yazılır, güncellenmez — güncelleme tipi `never`, silme kapalı (test temizliği `purgeTestData`).
 */
export class AiUsageService extends BaseDbService<AiUsageEntry, AiUsageEntryInsert, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'ai_usage', AiUsageEntrySchema, AiUsageEntryInsertSchema, AiUsageEntrySchema as never, false);
  }
}

/**
 * `ai_usage_daily` görünümü — Paris günü × görev × model. Ayrı servis, çünkü görünüm YAZILMAZ
 * (`ConversationInboxService` emsali).
 */
export class AiUsageDailyService extends BaseDbService<AiUsageDailyRow, never, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'ai_usage_daily', AiUsageDailyRowSchema, AiUsageDailyRowSchema as never, AiUsageDailyRowSchema as never, false);
  }

  /**
   * `from` gününden (Paris, `YYYY-MM-DD`) bugüne, yeniden eskiye. Sayfalama YOK ve doğru: küme gün ×
   * görev × model — doksan günde birkaç yüz satır, veriyle değil takvimle büyüyor (`CLAUDE §1` ölçütü).
   */
  listSince(from: string): Promise<AiUsageDailyRow[]> {
    return this.getAll(undefined, { rangeFilters: [{ field: 'day', operator: 'gte', value: from }], orderBy: 'day', orderDirection: 'desc' });
  }
}
