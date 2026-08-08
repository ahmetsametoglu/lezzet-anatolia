import { z } from 'zod';
import { ErrorLogLevelEnum } from '../primitives/enums.schema';

// ErrorLog — sunucu tarafı hataların gruplanmış kaydı (18.5). Kararlar `OBSERVABILITY §2`,
// alanlar `data-model/operasyon.md`, tablo `0008_observability.sql`.
//
// **İş kaydı DEĞİL:** saklama süresi var, şeması bilerek gevşek (`context`). "Sipariş ne zaman
// teslim oldu" `order_status_log`'da; "checkout neden 500 döndü" burada (`OBSERVABILITY §1`).
//
// `fingerprint` DB'de değil SERVİSTE hesaplanır (`ErrorLogService`): normalize etme kuralı
// (UUID/sayı/hex sabitleme + ilk kendi-kod stack karesi) TypeScript'te testlenebilir, SQL'de olmaz.

export const ErrorLogSchema = z.object({
  id: z.string().uuid(),
  /** Gruplama anahtarı — aynı parmak izli AKTİF hata tek satırda toplanır. */
  fingerprint: z.string(),
  level: ErrorLogLevelEnum,
  /** 'web-server' · 'web-action' · 'backend-http' · 'backend-cron' · 'backend-webhook' — serbest metin. */
  source: z.string(),
  message: z.string(),
  stack: z.string().nullable(),
  /**
   * Ek bağlam. **KİMLİK taşır, İÇERİK taşımaz** (`OBSERVABILITY §5`): sipariş kimliği yazılır,
   * müşterinin e-postası yazılmaz. Teşhis için kimlik yeter — o kimlikle veritabanına bakılır.
   */
  context: z.record(z.unknown()),
  path: z.string().nullable(),
  /** Aynı AKTİF parmak izi kaç kez görüldü. */
  count: z.number().int().positive(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  /** Operatör "çözüldü" işaretlediyse dolu. Sonra aynı hata gelirse YENİ satır doğar (regresyon görünür). */
  resolvedAt: z.string().nullable(),
  resolvedBy: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type ErrorLog = z.infer<typeof ErrorLogSchema>;

/**
 * Yazım pratikte `capture_error` RPC'sinden geçer (atomik ekle-ya-da-say). Insert şeması yine de
 * tanımlı: `BaseDbService` alt sınıfının sözleşmesi bunu istiyor ve testin doğrudan satır kurması
 * gerekebilir.
 */
export const ErrorLogInsertSchema = z.object({
  fingerprint: z.string().min(1),
  level: ErrorLogLevelEnum.optional(),
  source: z.string().min(1),
  message: z.string().min(1),
  stack: z.string().nullish(),
  context: z.record(z.unknown()).optional(),
  path: z.string().nullish(),
});
export type ErrorLogInsert = z.infer<typeof ErrorLogInsertSchema>;

export const ErrorLogUpdateSchema = ErrorLogSchema.partial().required({ id: true });
export type ErrorLogUpdate = z.infer<typeof ErrorLogUpdateSchema>;

/** Kaydın oluşturulmasında çağıranın verdiği girdi — parmak izi burada YOK, servis hesaplar. */
export interface CaptureErrorInput {
  source: string;
  message: string;
  level?: z.infer<typeof ErrorLogLevelEnum>;
  stack?: string | null;
  context?: Record<string, unknown>;
  path?: string | null;
}
