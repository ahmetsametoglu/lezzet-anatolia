import { serviceDb } from '@lezzet/database';
import { reconcileRecentPayouts, revolutClientFromSecrets } from '@lezzet/application';

export const PAYOUT_STATEMENT = 'payout_statement';

/** Kart aktarımlarının raporu: komisyon siparişe yazılır, defterin açıklayamadığı işlem yönetime bildirilir; anahtarsız ortamda atlanır. */
export async function payoutStatementJob(): Promise<Record<string, unknown>> {
  const db = serviceDb();
  const client = await revolutClientFromSecrets(db);
  if (!client) return { skipped: 'not_configured' };
  return reconcileRecentPayouts(db, client);
}
