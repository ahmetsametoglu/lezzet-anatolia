// Alt yol içe aktarımı: `@lezzet/database` kökü `node:crypto` kullanan servisi de açar ve bu paket edge'de de derlenen
// `instrumentation.ts`ten çağrılır; edge'de `node:` şeması yoktur.
import { serviceDb } from '@lezzet/database/client';
import { errorMessageOf } from './error-message';
import { scrubMessage } from './mask';
import { ErrorLogService } from '@lezzet/database/services/error-log.service';
import type { ErrorLogLevel } from '@lezzet/types';
import { logger } from './logger';

/**
 * Hatayı önce stdout'a, sonra veritabanına yazar: hata kaydının çökmesi asıl hatayı gizlemesin ve veritabanı düşmüşken de iz kalsın.
 * Fonksiyon fırlatmaz, çünkü çağıranın akışı hata kaydı yüzünden bozulmamalı.
 */

export interface CaptureContext {
  /** Nereden geldi: `SOURCES` sabitlerinden biri. */
  source: string;
  /** İstek yolu (varsa). */
  path?: string | null;
  /** Ek bağlam: kimlik yazılır, içerik yazılmaz (`OBSERVABILITY §5`); teşhis kimlikle veritabanına bakılarak yapılır. */
  context?: Record<string, unknown>;
  level?: ErrorLogLevel;
}

/** Hatanın geldiği yer; ekran bu değere göre süzer ve serbest metin aynı kaynağı iki farklı yazımla bölerdi. */
export const SOURCES = {
  /** Next sunucu tarafı: RSC render, route handler (`instrumentation.ts` yakalar). */
  webServer: 'web-server',
  /** Server action'ın normalize edilmiş hatası (`lib/error.ts` funnel'ı). */
  webAction: 'web-action',
  /** Backend HTTP isteği. */
  backendHttp: 'backend-http',
  /** Zamanlanmış iş (`runJob` kabuğu). */
  backendCron: 'backend-cron',
  /** Hiçbir sarmala düşmeyen süreç hatası; "bir iş düştü" ile "süreç öldü" aynı görünmesin diye cron'dan ayrı. */
  backendProcess: 'backend-process',
  /** Sağlayıcı bildirimi (ödeme, mesajlaşma, kargo). */
  webhook: 'webhook',
  /** MCP yönetici asistanı; asistanın "sistem hatalarını raporla" aracı kendi hatalarını bu etiketle görür. */
  mcp: 'mcp',
  /** Tarayıcıda doğan hata (`reportClientErrorAction`); sunucu kancaları bunu görmez. */
  webClient: 'web-client',
  /** Mobil API HTTP isteği; iki yüzeyin arızası aynı kovaya düşmesin diye web'den ayrı. */
  mobileApiHttp: 'mobile-api-http',
  /** Mobil API sürecinin kendisi; `backendProcess` ile aynı ayrım. */
  mobileApiProcess: 'mobile-api-process',
  /**
   * Paylaşılan akışların kaynağı çağırana değil akışa bağlıdır: web ve mobil aynı kapıyı çağırır ve akıştaki arıza iki yüzeyde aynı
   * adla görünmeli, yoksa iki kovaya bölünüp ikisi de eşiğin altında kalır. Auth: OTP isteme ve doğrulama.
   */
  applicationAuth: 'application-auth',
  /** Sipariş açma zinciri. */
  applicationOrder: 'application-order',
  /** Yapay zekâ kullanım kaydı; koşu etkilenmez, kova "harcama kaydı eksik kaldı" der. */
  applicationAi: 'application-ai',
  /** B2B başvurusu; tipik arıza dış kayıt servisinin düşmesidir. */
  applicationB2b: 'application-b2b',
  /** Talep bildirimi ve yapay zekâ destek çekirdeği. */
  applicationTicket: 'application-ticket',
  /** Taşıyıcı uzlaştırması; webhook da nöbet cron'u da çağırır. */
  applicationShipping: 'application-shipping',
  /** Bildirimin tek kapısı ve teslim defteri. */
  applicationNotification: 'application-notification',
  /** Kurye durak sırası; hesap düşse de kurye günü görür ve duraklar numarasız kalır, arızanın tek izi bu kovadır. */
  applicationCourier: 'application-courier',
  /** Adres doğrulaması; kapı düşünce sipariş yine geçtiği için arızanın tek izi bu kovadır. */
  applicationDelivery: 'application-delivery',
} as const;

export async function captureError(error: unknown, ctx: CaptureContext): Promise<void> {
  /** Mesaj burada maskelenir, çünkü Postgres kısıt ihlalinde değeri metne gömer; kural çağıranda olsa bir gün unutulur. */
  const message = scrubMessage(errorMessageOf(error));
  /** Yığın izinin ilk satırı mesajın kendisidir; maskelenmezse mesajın maskesi boşa çıkar. */
  const stack = error instanceof Error && error.stack ? scrubMessage(error.stack) : null;

  logger.error({ source: ctx.source, path: ctx.path, ctx: ctx.context, err: { message, stack } }, message);

  try {
    await new ErrorLogService(serviceDb()).capture({
      source: ctx.source,
      message,
      stack,
      level: ctx.level ?? 'error',
      path: ctx.path ?? null,
      context: ctx.context ?? {},
    });
  } catch {
    // Env eksikse `serviceDb()` fırlatır; log zaten yazıldı ve fonksiyon fırlatmamalı.
  }
}
