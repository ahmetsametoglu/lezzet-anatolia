import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SystemHealthSnapshotSchema,
  SystemHealthSnapshotInsertSchema,
  SystemHealthSnapshotUpdateSchema,
  type SystemHealthMetrics,
  type SystemHealthSnapshot,
  type SystemHealthSnapshotInsert,
  type SystemHealthSnapshotUpdate,
  type HealthStatus,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Sistem sağlığı anlık görüntüleri (18.5) — `OBSERVABILITY §2`, tablo `0040_system_health.sql`.
 * Backend cron'u yazar, operasyon sistem sayfası okur.
 */
export class SystemHealthService extends BaseDbService<
  SystemHealthSnapshot,
  SystemHealthSnapshotInsert,
  SystemHealthSnapshotUpdate
> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'system_health_snapshot', SystemHealthSnapshotSchema, SystemHealthSnapshotInsertSchema, SystemHealthSnapshotUpdateSchema);
  }

  async record(status: HealthStatus, metrics: SystemHealthMetrics): Promise<SystemHealthSnapshot> {
    return this.insert({ status, metrics });
  }

  /**
   * Ekranın kartı: EN SON görüntü. `null` = hiç toplanmamış — ekran bunu "yeni kurulmuş" diye
   * gösterir, "sağlıklı" diye göstermez.
   */
  async latest(): Promise<SystemHealthSnapshot | null> {
    const rows = await this.getAll(undefined, { orderBy: 'createdAt', orderDirection: 'desc', limit: 1 });
    return rows[0] ?? null;
  }

  /**
   * Trend penceresi. **Tavan zorunlu** ve bu bir sayfalama tercihi değil: küme veriyle büyümüyor,
   * pencereyle büyüyor (7 gün ≈ 5.000 satır) ve ekran grafik çiziyor — sınırsız okuma, çizilemeyecek
   * kadar noktayı boşuna taşırdı (CLAUDE.md §1: editoryal seçkinin sabit sınırı olur).
   */
  async since(cutoff: string, limit = 6000): Promise<SystemHealthSnapshot[]> {
    return this.getAll(undefined, {
      rangeFilters: [{ field: 'createdAt', operator: 'gte', value: cutoff }],
      orderBy: 'createdAt',
      orderDirection: 'asc',
      limit,
    });
  }

  /** Saklama süresi süpürmesi (14 gün) — kaç satır silindiğini döner, iş bunu izine yazar. */
  async deleteBefore(cutoff: string): Promise<number> {
    const { data, error } = await this.supabase.from(this.tableName).delete().lt('created_at', cutoff).select('id');
    if (error) throw error;
    return data?.length ?? 0;
  }
}
