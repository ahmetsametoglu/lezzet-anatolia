import { serviceDb } from '@lezzet/database';
import { checkBankFeedQuiet, pennylaneFromSecrets } from '@lezzet/application';

/** Günlük "hareket gelmiyor" denetimi; anahtarsız ortamda hiçbir hareket okunmadığı için her hesap sessiz görünürdü, tur atlanır. */
export async function bankFeedQuietJob(): Promise<Record<string, unknown>> {
  const db = serviceDb();
  if (!(await pennylaneFromSecrets(db))) return { skipped: 'not_configured' };
  return checkBankFeedQuiet(db);
}
