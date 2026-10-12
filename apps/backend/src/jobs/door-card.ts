import { serviceDb } from '@lezzet/database';
import { readDoorAccountId, reconcileDoorCardPayments, revolutClientFromSecrets } from '@lezzet/application';

export const DOOR_CARD_MATCH = 'door_card_match';

/** Kapıda kart ödemelerinin Revolut eşleştirmesi; Revolut anahtarı ya da kapıda kart hesabı yoksa atlanır. */
export async function doorCardMatchJob(): Promise<Record<string, unknown>> {
  const db = serviceDb();
  const client = await revolutClientFromSecrets(db);
  if (!client) return { skipped: 'not_configured' };
  const accountId = await readDoorAccountId(db, 'card');
  if (!accountId) return { skipped: 'no_card_account' };
  return reconcileDoorCardPayments(db, client, { accountId });
}
