import { serviceDb } from '@lezzet/database';
import { pennylaneFromEnv, syncBankFeed } from '@lezzet/application';

export const PENNYLANE_SYNC = 'pennylane_sync';

/**
 * Banka hareketinin Pennylane'den okunması: eşlenen hesapların listesi ve değişiklik akışı. Anahtarsız ortamda tur kendini atlar ve
 * bunu söyler, sessiz bir no-op "banka okunuyor" diye okunurdu.
 */
export async function pennylaneSyncJob(): Promise<Record<string, unknown>> {
  const pennylane = pennylaneFromEnv();
  if (!pennylane) return { skipped: 'not_configured' };
  return syncBankFeed(serviceDb(), pennylane);
}
