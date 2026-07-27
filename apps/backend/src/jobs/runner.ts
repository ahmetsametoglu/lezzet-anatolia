import { JobRunService, serviceDb } from '@lezzet/database';

/**
 * Zamanlanmış işlerin ortak kabuğu (STACK §13 cron disiplini). Her iş **taramalı ve idempotent**
 * yazılır; bu kabuk üç şeyi tek yerde halleder:
 *
 * 1. **Üst üste binme koruması:** önceki tur bitmediyse yeni tik atlanır. Tek instance'ta bile
 *    yavaş bir tur ikinci tikle çakışırsa aynı satırlar iki kez işlenir.
 * 2. **Hata yutulmaz ama süreç düşmez:** cron geri çağrısında atılan hata sessizce kaybolur;
 *    burada yakalanıp ize yazılır ve loglanır.
 * 3. **`last_run` izi:** başarıda sonuç özeti, hatada mesaj. "Koştu ama düştü" ile "hiç koşmadı"
 *    ayrımı korunur — gecikme alarmı (18.6) bu satırı okuyacak.
 */
const running = new Set<string>();

export async function runJob(name: string, job: () => Promise<Record<string, unknown>>): Promise<void> {
  if (running.has(name)) {
    console.warn(`[cron] ${name}: önceki tur sürüyor, bu tik atlandı`);
    return;
  }
  running.add(name);

  const jobRuns = new JobRunService(serviceDb());
  try {
    const result = await job();
    await jobRuns.recordSuccess(name, result);
    // Sessiz tur gürültü yapmasın: yalnız bir şey yaptıysa log.
    if (Object.values(result).some((v) => typeof v === 'number' && v > 0)) {
      console.warn(`[cron] ${name}`, JSON.stringify(result));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[cron] ${name} HATA: ${message}`);
    // İzin kendisi düşerse (DB erişilemiyor) süreç yine ayakta kalmalı.
    await jobRuns.recordFailure(name, message).catch(() => undefined);
  } finally {
    running.delete(name);
  }
}
