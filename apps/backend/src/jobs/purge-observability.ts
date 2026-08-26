import { ErrorLogService, McpCallLogService, SystemHealthService, serviceDb } from '@lezzet/database';

export const PURGE_OBSERVABILITY = 'purge_observability';

/**
 * Gözlemleme verisinin saklama süpürmesi (18.5) — `OBSERVABILITY §4.2`.
 *
 * **Neden süre var:** bu veri iş kaydı değil (`OBSERVABILITY §1`). `order_status_log` denetim malıdır
 * ve silinmez; hata kaydının `context` alanı ise sipariş kimliği taşıyan bir TEŞHİS verisidir — süresiz
 * tutulacak kişisel veri değil (KVKK/GDPR veri minimizasyonu). Sağlık görüntüsü de öyle: iki dakikalık
 * çözünürlük sonsuza kadar birikmemeli.
 *
 * **Çözülmemiş hata SÜPÜRÜLMEZ.** Açık bir sorun silinince kaybolmaz, yalnız görünmez olur — ve
 * görünmeyen sorun, olmayan sorun sanılır. Süre yalnız kapatılmış kayıtlar için işler.
 *
 * Taramalı ve idempotent: "eşikten eski olan her şey" silinir → kaçan gün ertesi turda telafi olur,
 * ikinci tur no-op'tur.
 */

/** Çözülmüş hata kaydı (gün). `feedback_request.expires_at` ile aynı sayı — ikinci bir eşik uydurmanın gerekçesi yok. */
const RESOLVED_ERROR_RETENTION_DAYS = 90;

/** Sağlık görüntüsü (gün). Ekranın en geniş penceresi 7 gün; iki katı bir haftalık geriye bakışı her koşulda garanti eder. */
const HEALTH_RETENTION_DAYS = 14;

/**
 * MCP çağrı izi (gün) — 22.4.
 *
 * Çözülmüş hata kaydıyla AYNI süre ve gerekçesi aynı: iz bir teşhis verisidir, iş kaydı değil
 * (`OBSERVABILITY §1`). Sorduğu soru "bu anahtar ne yaptı" — üç ay geriye bakmak kötüye kullanımı
 * görmeye fazlasıyla yeter; daha uzunu, süresiz tutulan bir davranış geçmişi olurdu.
 */
const MCP_CALL_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function purgeObservabilityJob(): Promise<Record<string, unknown>> {
  const db = serviceDb();
  const cutoff = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

  const [errors, snapshots, mcpCalls] = await Promise.all([
    new ErrorLogService(db).deleteResolvedBefore(cutoff(RESOLVED_ERROR_RETENTION_DAYS)),
    new SystemHealthService(db).deleteBefore(cutoff(HEALTH_RETENTION_DAYS)),
    new McpCallLogService(db).deleteBefore(cutoff(MCP_CALL_RETENTION_DAYS)),
  ]);

  return { errors, snapshots, mcpCalls };
}
