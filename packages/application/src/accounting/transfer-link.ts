import { MoneyMovementService, type Db } from '@lezzet/database';
import { pairStatementsWithTransfers, TRANSFER_LINK_WINDOW_DAYS } from '@lezzet/domain-core';
import { addDays, parisDateOf } from '@lezzet/helper';

/** Bağlama yalnız yakın transferlere bakar; eski transferin satırı ya bağlanmıştır ya da elle izah bekler. */
const RECENT_DAYS = 30;

/**
 * Banka hesabındaki izah bekleyen ekstre satırlarını, karşı ucunu bekleyen transferlere bağlar (20. karar). Satır gelince de transfer
 * yazılınca da çağrılır, çünkü hangisinin önce geldiği belli değildir: Pennylane satırı yatırma transferinden önce düşebilir. Bağlanan
 * satır sayısını döner.
 */
export async function linkAwaitingTransfers(db: Db, accountId: string, now = new Date()): Promise<number> {
  const movements = new MoneyMovementService(db);
  const since = addDays(parisDateOf(now), -RECENT_DAYS);
  const legs = (await movements.listTransferLegsAwaiting(accountId)).filter((leg) => leg.valueDate >= since);
  if (legs.length === 0) return 0;
  const dates = legs.map((leg) => leg.valueDate).sort();
  const rows = await movements.listUnlinkedStatementRows(
    accountId,
    addDays(dates[0]!, -TRANSFER_LINK_WINDOW_DAYS),
    addDays(dates[dates.length - 1]!, TRANSFER_LINK_WINDOW_DAYS),
  );
  const legOf = new Map(legs.map((leg) => [leg.id, leg]));
  const pairs = pairStatementsWithTransfers(rows, legs);
  for (const pair of pairs) await movements.linkToTransferLeg(pair.rowId, legOf.get(pair.legId)!);
  return pairs.length;
}
