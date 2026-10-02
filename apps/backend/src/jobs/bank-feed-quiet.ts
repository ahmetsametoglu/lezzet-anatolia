import { serviceDb } from '@lezzet/database';
import { checkBankFeedQuiet, pennylaneFromEnv } from '@lezzet/application';

export const BANK_FEED_QUIET = 'bank_feed_quiet';

/** Günlük "hareket gelmiyor" denetimi; anahtarsız ortamda hiçbir hareket okunmadığı için her hesap sessiz görünürdü, tur atlanır. */
export async function bankFeedQuietJob(): Promise<Record<string, unknown>> {
  if (!pennylaneFromEnv()) return { skipped: 'not_configured' };
  return checkBankFeedQuiet(serviceDb());
}
