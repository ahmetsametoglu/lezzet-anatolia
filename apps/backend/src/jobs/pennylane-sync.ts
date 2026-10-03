import { serviceDb } from '@lezzet/database';
import { pennylaneFromEnv, syncPennylane } from '@lezzet/application';

/**
 * Pennylane eşitlemesi: eşlenen hesapların banka hareketi okunur, alış belgesi kuyruğu yazılır. Anahtarsız ortamda tur kendini atlar ve
 * bunu söyler, sessiz bir no-op "banka okunuyor" diye okunurdu.
 */
export async function pennylaneSyncJob(): Promise<Record<string, unknown>> {
  const pennylane = pennylaneFromEnv();
  if (!pennylane) return { skipped: 'not_configured' };
  return syncPennylane(serviceDb(), pennylane);
}
