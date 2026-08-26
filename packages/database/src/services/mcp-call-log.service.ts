import type { SupabaseClient } from '@supabase/supabase-js';
import {
  McpCallLogSchema,
  McpCallLogInsertSchema,
  McpCallLogUpdateSchema,
  type McpCallLog,
  type McpCallLogInsert,
  type McpCallLogUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * MCP çağrı izi (22.4 · `AI_ADMIN_ASSISTANT §8`) — "zincirleme kötüye kullanım tek tek görünsün".
 *
 * Yazım FIRE-AND-FORGET: çağıran cevabı bekletmez ve bu satırın düşmesi araç çağrısını düşürmez.
 * Gerekçe `capture_error`ınkiyle aynı — iz tutma yolunda fırlayan bir hata, izi tutulan asıl işi
 * maskeler. Ama sessiz de değil: hata `captureError`a gider (kaynak `mcp`).
 */
export class McpCallLogService extends BaseDbService<McpCallLog, McpCallLogInsert, McpCallLogUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'mcp_call_log', McpCallLogSchema, McpCallLogInsertSchema, McpCallLogUpdateSchema);
  }

  /** Tek çağrı satırı — dönüş beklenmez (`insertWithoutReturn`: bir tur daha az gidiş-dönüş). */
  async record(row: McpCallLogInsert): Promise<void> {
    await this.insertWithoutReturn(row);
  }

  /**
   * Panelin listesi — en yeni üstte. Çağrı izi VERİYLE BÜYÜYEN bir kümedir, tavanlı okunur;
   * ekranın sorusu "son ne oldu"dur, tarihin tamamı değil. Anahtar verilirse o anahtarın izi.
   */
  async listRecent(opts: { connectionKeyId?: string; limit?: number } = {}): Promise<McpCallLog[]> {
    const filters = opts.connectionKeyId ? { connectionKeyId: opts.connectionKeyId } : undefined;
    return this.getAll(filters, {
      orderBy: 'createdAt',
      orderDirection: 'desc',
      limit: Math.max(1, Math.min(200, opts.limit ?? 50)),
    });
  }

  /** Verilen andan sonraki çağrı sayısı — panelin "son 24 saatte N çağrı" özeti. */
  async countSince(since: string, opts: { ok?: boolean } = {}): Promise<number> {
    return this.count(opts.ok === undefined ? undefined : { ok: opts.ok }, {
      rangeFilters: [{ field: 'createdAt', operator: 'gte', value: since }],
    });
  }

  /** Saklama süpürmesi (`purge_observability`) — iz gözlem verisidir, süresizce birikmez. */
  async deleteBefore(cutoff: string): Promise<number> {
    return this.deleteOlderThan('createdAt', cutoff);
  }
}
