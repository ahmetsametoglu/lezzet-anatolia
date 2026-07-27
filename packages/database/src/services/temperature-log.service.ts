import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TemperatureLogSchema,
  TemperatureLogInsertSchema,
  TemperatureLogUpdateSchema,
  DEFAULT_PAGE_SIZE,
  type KeysetCursor,
  type Page,
  type TemperatureLog,
  type TemperatureLogInsert,
  type TemperatureLogUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Sıcaklık kaydı (06.7) — hijyen denetiminin ilk istediği veri. Sensör entegrasyonu yok; günde
 * bir-iki **elle** giriş yeter. Basit tutulur ki gerçekten girilsin (DOMAIN §4).
 */
export class TemperatureLogService extends BaseDbService<TemperatureLog, TemperatureLogInsert, TemperatureLogUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'temperature_log', TemperatureLogSchema, TemperatureLogInsertSchema, TemperatureLogUpdateSchema);
  }

  /** Kayıtlar — konum ve/veya tarih aralığıyla süzülür, en yeni önce (infinite scroll). */
  async list(opts: { location?: string; from?: Date; to?: Date; cursor?: KeysetCursor; limit?: number } = {}): Promise<Page<TemperatureLog>> {
    const rangeFilters: Array<{ field: string; operator: 'gte' | 'lte'; value: string }> = [];
    if (opts.from) rangeFilters.push({ field: 'recorded_at', operator: 'gte', value: opts.from.toISOString() });
    if (opts.to) rangeFilters.push({ field: 'recorded_at', operator: 'lte', value: opts.to.toISOString() });

    return this.getPage(opts.location ? { location: opts.location } : undefined, {
      rangeFilters,
      orderBy: 'recordedAt',
      orderDirection: 'desc',
      keysetAfter: opts.cursor,
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
    });
  }

  /** Kayıt girilen konumlar — giriş formunun seçim listesi (elle yazım yerine seçim). */
  async listLocations(): Promise<string[]> {
    const { data, error } = await this.supabase.from('temperature_log').select('location');
    if (error) throw error;
    return [...new Set((data ?? []).map((row) => (row as { location: string }).location))].sort();
  }
}
