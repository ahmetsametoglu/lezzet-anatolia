import type { SupabaseClient } from '@supabase/supabase-js';
import {
  McpConnectionKeySchema,
  McpConnectionKeyInsertSchema,
  McpConnectionKeyUpdateSchema,
  type McpConnectionKey,
  type McpConnectionKeyInsert,
  type McpConnectionKeyUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * MCP bağlantı anahtarı (22.4) — asistanın kapısındaki kimlik.
 *
 * Servis DÜZ METİN GÖRMEZ ve göremez: hash'i çağıran hesaplar, buraya yalnız hash gelir. Ayrım
 * bilinçli — anahtarın düz hâlinin ömrü "üretildiği HTTP cevabı" kadardır; bir katmanın daha
 * içinden geçmesi, o katmanın loguna düşme ihtimalini doğururdu.
 */
export class McpConnectionKeyService extends BaseDbService<McpConnectionKey, McpConnectionKeyInsert, McpConnectionKeyUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'mcp_connection_key', McpConnectionKeySchema, McpConnectionKeyInsertSchema, McpConnectionKeyUpdateSchema);
  }

  /** Doğrulama yolu — hash ile tek satır. Geçerlilik (iptal/süre) kararı KAPIDA verilir, burada değil. */
  async findByTokenHash(tokenHash: string): Promise<McpConnectionKey | null> {
    return this.getOneBy({ tokenHash });
  }

  /**
   * Panel listesi — en yeni üstte, doğal tavanı olan bir küme (operatörün elle ürettiği anahtarlar),
   * bu yüzden tek turda (CLAUDE.md §1 sayfalama ölçütü). İptal edilmişler de gelir: iptal bir
   * geçmiştir, listeden silinmesi "hiç var olmadı" demek olurdu.
   */
  async list(): Promise<McpConnectionKey[]> {
    return this.getAll(undefined, { orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /** İptal — satır SİLİNMEZ (çağrı geçmişi sahipsiz kalmasın). İkinci kez iptal ilk damgayı korur. */
  async revoke(id: string): Promise<McpConnectionKey | null> {
    return this.updateIfNull(id, 'revokedAt', { revokedAt: new Date().toISOString() });
  }

  /** Telemetri — best-effort; çağıran beklemez, hatası yutulur (kapı bu yüzden düşmemeli). */
  async touch(id: string): Promise<void> {
    await this.update({ id, lastUsedAt: new Date().toISOString() });
  }
}
