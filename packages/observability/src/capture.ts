// **ALT YOL İMPORT'U ŞART, barrel DEĞİL.** `@lezzet/database` kökü her servisi yeniden dışa açıyor ve
// içlerinden biri (`email-verification.service`) `node:crypto` kullanıyor. Bu paket Next'in
// `instrumentation.ts`'inden çağrılıyor, o dosya ise **edge çalışma zamanı için de derleniyor** —
// orada `node:` şemalı modül yok ve derleme "UnhandledSchemeError: node:crypto" ile kırılıyor.
// Yaşandı (30.07); referans projede aynı tuzak aynı gerekçeyle yazılıydı.
import { serviceDb } from '@lezzet/database/client';
import { scrubMessage } from './mask';
import { ErrorLogService } from '@lezzet/database/services/error-log.service';
import type { ErrorLogLevel } from '@lezzet/types';
import { logger } from './logger';

/**
 * Hatayı iki yere yazar: **önce stdout, sonra veritabanı** (`OBSERVABILITY §2`).
 *
 * Sıra rastgele değil, iki gerekçesi var ve her biri tek başına yeterli:
 *
 * 1. **Hata kaydının kendisi çökerse orijinal hatayı maskelememeli.** Teşhis edilecek şeyin üstüne
 *    teşhis edilemeyen bir şey koymak, elde hiç iz olmamasından kötüdür.
 * 2. **Veritabanına erişilemezken de iz kalmalı.** DB'nin düştüğü an, iz tutmanın en gerekli olduğu
 *    andır — o anda yalnız DB'ye yazan bir sistem sessiz kalır.
 *
 * Bu yüzden fonksiyon **asla fırlatmaz**. Çağıranın akışı hata kaydı yüzünden bozulamaz: mail
 * gitmese sipariş geri alınmıyor (14.5 kuralı), hata kaydı düşse de öyle.
 */

export interface CaptureContext {
  /** Nereden geldi: `SOURCES` sabitlerinden biri. */
  source: string;
  /** İstek yolu (varsa). */
  path?: string | null;
  /**
   * Ek bağlam. **KİMLİK yazılır, İÇERİK yazılmaz** (`OBSERVABILITY §5`): `orderId` evet, müşterinin
   * e-postası hayır. Teşhis için kimlik yeter — o kimlikle veritabanına bakılır; ham kopya taşımak
   * süresi olan bir tabloya kişisel veri taşımak ve kaydı okunmaz kılmaktır.
   */
  context?: Record<string, unknown>;
  level?: ErrorLogLevel;
}

/**
 * Hatanın geldiği yer. Serbest metin yerine sabit: ekran bu değere göre süzüyor ve elle yazılan
 * `'backend cron'` ile `'backend-cron'` iki ayrı kaynak gibi görünürdü.
 */
export const SOURCES = {
  /** Next sunucu tarafı: RSC render, route handler (`instrumentation.ts` yakalar). */
  webServer: 'web-server',
  /** Server action'ın normalize edilmiş hatası (`lib/error.ts` funnel'ı). */
  webAction: 'web-action',
  /** Backend HTTP isteği. */
  backendHttp: 'backend-http',
  /** Zamanlanmış iş (`runJob` kabuğu). */
  backendCron: 'backend-cron',
  /**
   * Backend SÜRECİNİN kendisi — hiçbir sarmala düşmeyen hata (`unhandledRejection` /
   * `uncaughtException`). Cron'dan ayrı tutulur: "bir iş düştü" ile "süreç öldü, tüm işler durdu"
   * aynı ekranda aynı renkte görünmemeli.
   */
  backendProcess: 'backend-process',
  /** Sağlayıcı bildirimi (Stripe, 360dialog). */
  webhook: 'webhook',
  /**
   * TARAYICIDA doğan hata (`reportClientErrorAction` kapısı). Sunucu kancaları bunu görmez —
   * hata sınırındaki render çökmesi buradan gelmezse hiçbir yerde iz bırakmaz (denetim G1).
   */
  webClient: 'web-client',
} as const;

export async function captureError(error: unknown, ctx: CaptureContext): Promise<void> {
  /**
   * Mesaj TEK KAPIDAN maskelenir (03.08). En tehlikeli sızıntı bizim yazdığımız bağlam değil,
   * veritabanının kendi hata gövdesidir: Postgres kısıt ihlalinde değeri metne gömüyor
   * (`Key (postal_code, email)=(75011, ahmet@example.com)`) ve o metin `error_log.message`'a
   * olduğu gibi düşüyordu. Her çağıranın hatırlaması gereken bir kural, bir gün hatırlanmaz —
   * bu yüzden kural çağıranda değil burada.
   */
  const message = scrubMessage(error instanceof Error ? error.message : String(error));
  /**
   * **Yığın izi de maskelenir** (05.08 · statik metin söz denetimi, ölçüm 4) ve bu bir düzeltme
   * değil bir DELİK KAPATMAsıdır: `error.stack`in ilk satırı `Error: <mesaj>`tır. Yani yukarıda
   * maskelediğimiz mesaj, bir kolon yanda **maskesiz** duruyordu — maskeleme fiilen boşa çıkıyordu.
   * Ölçülebilir bir örnek: kısıt ihlalinde `message` `Key (…)=(…)` olurken `stack` aynı satırda
   * e-postayı olduğu gibi taşıyordu.
   */
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
    // `capture` kendi içinde de yutuyor; buradaki ikinci kat istemci kurulumunun kendisi için
    // (env eksikse `serviceDb()` fırlatır). Log ZATEN yazıldı.
  }
}
