import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ErrorLogSchema,
  ErrorLogInsertSchema,
  ErrorLogUpdateSchema,
  type CaptureErrorInput,
  type ErrorLog,
  type ErrorLogInsert,
  type ErrorLogUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Hata kaydı (18.5) — `OBSERVABILITY §2`, tablo `0039_error_log.sql`.
 *
 * Servis SAF I/O'dur (STACK §4) ama **parmak izi hesabı burada**, çünkü o bir depolama kararıdır,
 * iş kuralı değil: hangi hataların "aynı hata" sayıldığını gruplama anahtarı tanımlar. SQL'de
 * yazılsaydı test edilemezdi; motorda yazılsaydı `domain-core` bir depolama detayını bilmiş olurdu.
 */

/** Kaydın kırpma sınırları — parmak izi ilk stack karesinden kurulduğu için kırpma gruplamayı bozmaz. */
const MESSAGE_MAX = 2000;
const STACK_MAX = 8000;
const FINGERPRINT_MAX = 500;

/**
 * Mesajdaki DEĞİŞKEN parçaları sabitler: "Order abc-123 not found" ile "Order def-456 not found"
 * aynı gruba düşsün. Bu olmadan her sipariş kendi satırını açar ve liste kendi kendini gömer —
 * gruplamanın bütün değeri buradan gelir.
 *
 * Sıra önemli: UUID önce (içinde hex ve rakam var), sonra uzun hex, en sonra çıplak sayı. Ters sırada
 * UUID'nin parçaları ayrı ayrı yakalanır ve anahtar yine kayar.
 */
function normalizeMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hex>')
    // SON sınır YOK (`\b\d{4,}\b` değil): "timeout after 30000ms" gibi birime yapışık sayılarda
    // rakam ile harf arasında kelime sınırı OLUŞMAZ ve sayı sabitlenmeden kalırdı — her zaman aşımı
    // kendi satırını açardı. Test bunu yakaladı.
    .replace(/\b\d{4,}/g, '<num>')
    .slice(0, 300);
}

/**
 * Stack'in ilk KENDİ KODUMUZA ait karesi. `node_modules` satırları atlanır: aynı hata farklı
 * kütüphane sürümlerinde farklı satır numaraları gösterir ve grup her dağıtımda bölünürdü.
 * Satır/kolon numarası da atılır — bir satır eklemek hatayı "yeni" yapmamalı.
 */
function topFrame(stack?: string | null): string {
  if (!stack) return '';
  const lines = stack.split('\n').slice(1);
  const frame = lines.find((line) => line.includes('/') && !line.includes('node_modules')) ?? lines[0] ?? '';
  return frame
    .trim()
    .replace(/:\d+:\d+\)?$/, '')
    .slice(0, 200);
}

/** Gruplama anahtarı — `dışa açık` çünkü testi bunu doğrudan sınıyor (davranışın sözleşmesi burada). */
export function errorFingerprint(source: string, message: string, stack?: string | null): string {
  return `${source}::${normalizeMessage(message)}::${topFrame(stack)}`.slice(0, FINGERPRINT_MAX);
}

export interface ListErrorLogsOptions {
  /** `true` = çözülmüşler · `false` = açık olanlar · verilmezse hepsi. */
  resolved?: boolean;
  limit?: number;
  offset?: number;
  /** `message` / `source` / `path` üzerinde arama. */
  search?: string;
}

/**
 * Arama grubu. Virgül ve parantez TEMİZLENİR: PostgREST `or=(…)` sözdiziminde ayraçtır, kullanıcının
 * yazdığı bir virgül sorguyu ikiye bölerdi.
 */
function searchGroup(search?: string): string | undefined {
  const q = search?.trim().replace(/[,()]/g, ' ').trim();
  return q ? `message.ilike.%${q}%,source.ilike.%${q}%,path.ilike.%${q}%` : undefined;
}

export class ErrorLogService extends BaseDbService<ErrorLog, ErrorLogInsert, ErrorLogUpdate> {
  constructor(supabase: SupabaseClient) {
    // Hard delete AÇIK: süpürme işi (18.5) saklama süresi dolanları siler. Elle silme yok — ekran
    // yalnız "çözüldü" işaretler; silme kararı sürenin, elin değil.
    super(supabase, 'error_log', ErrorLogSchema, ErrorLogInsertSchema, ErrorLogUpdateSchema);
  }

  /**
   * Hatayı kaydeder — atomik "ekle ya da say" (`capture_error` RPC).
   *
   * **ASLA FIRLATMAZ.** Hata kaydetme yolunda fırlayan bir istisna, kaydedilmeye çalışılan asıl
   * hatayı maskeler; teşhis edilecek şeyin üstüne teşhis edilemeyen bir şey koyar. `service_role`
   * istemcisiyle çağrılmalı (RPC yalnız ona açık).
   */
  async capture(input: CaptureErrorInput): Promise<void> {
    try {
      await this.executeRpc('capture_error', {
        p_fingerprint: errorFingerprint(input.source, input.message, input.stack),
        p_level: input.level ?? 'error',
        p_source: input.source,
        p_message: input.message.slice(0, MESSAGE_MAX),
        p_stack: input.stack ? input.stack.slice(0, STACK_MAX) : null,
        p_context: input.context ?? {},
        p_path: input.path ?? null,
      });
    } catch {
      // Sessizce yutulur. Çağıran (`captureError` köprüsü) stdout'a ZATEN yazdı — iz kayıp değil.
    }
  }

  /** Ekranın listesi. Sıra SON GÖRÜLMEYE göre: taze bir uyarı, üç gün önceki bir hatadan çok şey söyler. */
  async listRecent(options: ListErrorLogsOptions = {}): Promise<{ rows: ErrorLog[]; total: number }> {
    const { resolved, limit = 50, offset = 0, search } = options;
    const statusFilter =
      resolved === undefined ? {} : resolved ? { isNotNullFields: ['resolvedAt'] } : { isNullFields: ['resolvedAt'] };
    const group = searchGroup(search);
    const filters = { ...statusFilter, ...(group ? { orFilters: [group] } : {}) };

    const [rows, total] = await Promise.all([
      this.getAll(undefined, { ...filters, orderBy: 'lastSeenAt', orderDirection: 'desc', limit, offset }),
      this.count(undefined, filters),
    ]);
    return { rows, total };
  }

  /** Sekme sayaçları — arama süzgeciyle TUTARLI: etiketler listenin söylediğinden başkasını dememeli. */
  async statusCounts(search?: string): Promise<{ open: number; resolved: number }> {
    const group = searchGroup(search);
    const extra = group ? { orFilters: [group] } : {};
    const [open, resolved] = await Promise.all([
      this.count(undefined, { isNullFields: ['resolvedAt'], ...extra }),
      this.count(undefined, { isNotNullFields: ['resolvedAt'], ...extra }),
    ]);
    return { open, resolved };
  }

  /** Panel rozeti — alarm olmadığı için bu sayacın görünürlüğü zorunlu (`OBSERVABILITY §4.1`). */
  async countOpen(): Promise<number> {
    return this.count(undefined, { isNullFields: ['resolvedAt'] });
  }

  /** Sağlık görüntüsünün "son bir saatte kaç hata" alanı — uyarı seviyesi sayılmaz (o gürültü değil, bilgi). */
  async countSince(since: string): Promise<number> {
    return this.count({ level: 'error' }, { rangeFilters: [{ field: 'lastSeenAt', operator: 'gte', value: since }] });
  }

  /**
   * "Çözüldü" işareti. Satır SİLİNMEZ — odaktan çıkar. Aynı hata sonra tekrar gelirse kısmi unique
   * indeks yeni satır açar ve regresyon görünür olur (`0039`).
   */
  async resolve(id: string, staffId: string): Promise<ErrorLog> {
    return this.update({ id, resolvedAt: new Date().toISOString(), resolvedBy: staffId });
  }

  /**
   * Saklama süresi süpürmesi — YALNIZ ÇÖZÜLMÜŞ kayıtlar. Çözülmemiş hata hâlâ açık bir sorundur;
   * süpürülürse sorun kaybolmaz, yalnız görünmez olur (`OBSERVABILITY §4.2`).
   */
  async deleteResolvedBefore(cutoff: string): Promise<number> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .delete()
      .not('resolved_at', 'is', null)
      .lt('resolved_at', cutoff)
      .select('id');
    if (error) throw error;
    return data?.length ?? 0;
  }
}
