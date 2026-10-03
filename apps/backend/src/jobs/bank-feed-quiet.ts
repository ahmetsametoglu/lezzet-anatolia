import { serviceDb } from '@lezzet/database';
import { checkBankFeedQuiet, pennylaneFromEnv } from '@lezzet/application';

/** Günlük "hareket gelmiyor" denetimi; anahtarsız ortamda hiçbir hareket okunmadığı için her hesap sessiz görünürdü, tur atlanır. */
export async function bankFeedQuietJob(): Promise<Record<string, unknown>> {
  if (!pennylaneFromEnv()) return { skipped: 'not_configured' };
  return checkBankFeedQuiet(serviceDb());
}
