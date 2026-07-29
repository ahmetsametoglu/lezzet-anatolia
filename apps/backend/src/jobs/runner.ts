import { JobRunService, serviceDb } from '@lezzet/database';
import { captureError, logger, SOURCES } from '@lezzet/observability';

/**
 * Zamanlanmış işlerin ortak kabuğu (STACK §13 cron disiplini). Her iş **taramalı ve idempotent**
 * yazılır; bu kabuk dört şeyi tek yerde halleder:
 *
 * 1. **Üst üste binme koruması:** önceki tur bitmediyse yeni tik atlanır. Tek instance'ta bile
 *    yavaş bir tur ikinci tikle çakışırsa aynı satırlar iki kez işlenir.
 * 2. **Hata yutulmaz ama süreç düşmez:** cron geri çağrısında atılan hata sessizce kaybolur;
 *    burada yakalanıp ize yazılır ve loglanır.
 * 3. **`last_run` izi:** başarıda sonuç özeti, hatada mesaj. "Koştu ama düştü" ile "hiç koşmadı"
 *    ayrımı korunur — sağlık görüntüsü ve gecikme alarmı (18.6) bu satırı okur.
 * 4. **Hata KAYDI:** düşen tur `error_log`'a da gider (18.5). İkisi ayrı soruyu yanıtlıyor ve
 *    ikisi de gerekli: `job_run` "koştu mu"yu, `error_log` "NEDEN koşamadı"yı (stack + bağlam).
 *    `job_run` iş başına tek satır tuttuğu için ikinci bir düşüş birincinin mesajını ezer; hata
 *    kaydı ise gruplayıp sayar — "üç gündür her turda düşüyor" ancak orada görünür.
 */
const running = new Set<string>();

export async function runJob(name: string, job: () => Promise<Record<string, unknown>>): Promise<void> {
  if (running.has(name)) {
    logger.warn({ job: name }, 'önceki tur sürüyor, bu tik atlandı');
    return;
  }
  running.add(name);

  const jobRuns = new JobRunService(serviceDb());
  try {
    const result = await job();
    await jobRuns.recordSuccess(name, result);
    // Sessiz tur gürültü yapmasın: yalnız bir şey yaptıysa log.
    if (Object.values(result).some((v) => typeof v === 'number' && v > 0)) {
      logger.info({ job: name, ...result }, 'cron turu');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Kayıt (stdout + `error_log`) ve iz (`job_run`) birbirini beklemez; ikisi de en iyi çabadır.
    // İzin kendisi düşerse (DB erişilemiyor) süreç yine ayakta kalmalı.
    await Promise.all([
      captureError(error, { source: SOURCES.backendCron, context: { job: name } }),
      jobRuns.recordFailure(name, message).catch(() => undefined),
    ]);
  } finally {
    running.delete(name);
  }
}
