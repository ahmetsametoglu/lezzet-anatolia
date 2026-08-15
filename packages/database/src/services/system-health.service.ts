import type { SupabaseClient } from '@supabase/supabase-js';
import {
  HealthTrendPointSchema,
  SystemHealthSnapshotSchema,
  SystemHealthSnapshotInsertSchema,
  SystemHealthSnapshotUpdateSchema,
  type HealthTrendPoint,
  type SystemHealthMetrics,
  type SystemHealthSnapshot,
  type SystemHealthSnapshotInsert,
  type SystemHealthSnapshotUpdate,
  type HealthStatus,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Sistem sağlığı anlık görüntüleri (18.5) — `OBSERVABILITY §2`, tablo `0008_observability.sql`.
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

  /**
   * Trend penceresi — grafiğin okuduğu DAR biçim (`since`'in projeksiyonlu ikizi).
   *
   * Ekran tam görüntüyü yalnız EN SON satır için ister (`latest`); geçmişte üç eğri çiziliyor ve
   * onlar için beş alan yetiyor. jsonb yolları `select`'te açılınca 5.000 satırlık bir pencere
   * megabaytlardan kilobaytlara iner — aynı sorgu, aynı indeks, yüzde birlik yük.
   *
   * **Yollar camelCase (15.08'de değişti):** `metrics` jsonb'si artık **uygulamanın yazdığı gibi**
   * saklanıyor — dönüşüm satır düzeyinde kalıyor, değerin içine inmiyor (`case-transformers`
   * künyesi, kullanıcı kararı). Önceki hâlde diskte `disk_used_pct` duruyordu ve bu künye onu bir
   * mecburiyet olarak anlatıyordu (*"burada araya girdiğimiz için diskteki adı yazmak zorundayız"*);
   * mecburiyetin kaynağı kalktı, yol adları da yazıldıkları hâle döndü.
   *
   * **Bu satırlar değişikliğin sessiz kırılma noktasıydı:** yol eskisi gibi kalsaydı sorgu hata
   * vermez, yalnız `null` döndürürdü — grafik boş çizer, kimse sebebini aramazdı.
   */
  async trendSince(cutoff: string, limit = 6000): Promise<HealthTrendPoint[]> {
    return this.getAllAs(HealthTrendPointSchema, undefined, {
      select: [
        'at:created_at',
        'status',
        'disk:metrics->system->>diskUsedPct',
        'mem_used:metrics->system->>memUsedMb',
        'mem_total:metrics->system->>memTotalMb',
        'load1:metrics->system->loadAvg->>0',
        'cores:metrics->system->>cpuCount',
      ].join(','),
      rangeFilters: [{ field: 'createdAt', operator: 'gte', value: cutoff }],
      orderBy: 'createdAt',
      orderDirection: 'asc',
      limit,
    });
  }

  /**
   * Saklama süresi süpürmesi (14 gün) — kaç satır silindiğini döner, iş bunu izine yazar.
   *
   * **Ham `this.supabase` İKİ sebeple** (`STACK §6`: taban karşılamıyorsa ham + gerekçe):
   * `deleteWhere` yalnız `eq` süzgeçli — burada gereken `lt('created_at')`; ve `void` dönüyor —
   * burada gereken SAYI. İkincisi taban genişletilse bile ayrı bir imza isterdi.
   *
   * Tabana taşınMADI çünkü bugün tek tüketicisi var (YAGNI); ikinciye çıktığında taşınır.
   */
  async deleteBefore(cutoff: string): Promise<number> {
    const { data, error } = await this.supabase.from(this.tableName).delete().lt('created_at', cutoff).select('id');
    if (error) throw error;
    return data?.length ?? 0;
  }
}
