import { serviceDb } from '@lezzet/database';
import { hiboutikFromEnv, syncRegisterQueue } from '@lezzet/application';

export const REGISTER_SYNC = 'register_sync';

/**
 * Sertifikalı kasa eşitlemesi: kuyruktaki sipariş ve fiş dışı nakit Hiboutik'e yazılır. Anahtarsız ortamda tur kendini atlar ve bunu
 * söyler, sessiz bir no-op "kasa eşitleniyor" diye okunurdu.
 */
export async function registerSyncJob(): Promise<Record<string, unknown>> {
  const register = hiboutikFromEnv();
  if (!register) return { skipped: 'not_configured' };
  return syncRegisterQueue(serviceDb(), register);
}
