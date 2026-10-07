import { serviceDb } from '@lezzet/database';
import { pennylaneFromSecrets, syncPennylane } from '@lezzet/application';

/**
 * Pennylane eşitlemesi: eşlenen hesapların banka hareketi okunur, alış belgesi kuyruğu yazılır. Anahtarsız ortamda tur kendini atlar ve
 * bunu söyler, sessiz bir no-op "banka okunuyor" diye okunurdu.
 */
export async function pennylaneSyncJob(): Promise<Record<string, unknown>> {
  const db = serviceDb();
  const pennylane = await pennylaneFromSecrets(db);
  if (!pennylane) return { skipped: 'not_configured' };
  return syncPennylane(db, pennylane);
}
