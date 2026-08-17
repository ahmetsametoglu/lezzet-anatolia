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

  /**
   * Kayıtlar — depo, konum ve/veya tarih aralığıyla süzülür, en yeni önce (infinite scroll).
   *
   * `warehouseId`: hijyen denetimi TESİS bazındadır (DOMAIN §17) — denetmen bir depoya gelir ve o
   * deponun kayıtlarını ister. Süzgeçsiz okuma iki tesisin ölçümlerini karıştırır ve "bu dolabın
   * kaydı" sorusuna yanlış cevap verir; `location` (dolap adı) iki depoda aynı olabilir.
   */
  async list(
    opts: {
      warehouseId?: string;
      storageAreaId?: string;
      vehicleId?: string;
      from?: Date;
      to?: Date;
      cursor?: KeysetCursor;
      limit?: number;
    } = {},
  ): Promise<Page<TemperatureLog>> {
    const rangeFilters: Array<{ field: string; operator: 'gte' | 'lte'; value: string }> = [];
    if (opts.from) rangeFilters.push({ field: 'recorded_at', operator: 'gte', value: opts.from.toISOString() });
    if (opts.to) rangeFilters.push({ field: 'recorded_at', operator: 'lte', value: opts.to.toISOString() });

    const filters: Record<string, unknown> = {};
    if (opts.warehouseId) filters.warehouseId = opts.warehouseId;
    if (opts.storageAreaId) filters.storageAreaId = opts.storageAreaId;
    if (opts.vehicleId) filters.vehicleId = opts.vehicleId;

    return this.getPage(Object.keys(filters).length > 0 ? filters : undefined, {
      rangeFilters,
      orderBy: 'recordedAt',
      orderDirection: 'desc',
      keysetAfter: opts.cursor,
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
    });
  }
}

// ── `listLocations` SİLİNDİ (19.28) ───────────────────────────────────────────────────────────
// Kayıt girilmiş konumların BENZERSİZ kümesini döndürüyordu ve giriş formunun çip listesini
// besliyordu. Yani seçim listesi "daha önce birinin yazdığı metinler"di: ilk yazım hatası kalıcı
// bir seçenek hâline geliyor, ikinci kez tıklanıyor ve yanlış nokta kendini çoğaltıyordu.
// Noktalar artık tanımlı (`storage_area` · `vehicle`); liste tahminden değil kayıttan geliyor.

