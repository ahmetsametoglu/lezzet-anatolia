import type { Db } from '@lezzet/database';
import { syncBankFeed } from './bank-feed';
import type { DocumentFileReader } from './documents';
import { syncPennylaneQueue } from './queue';
import type { PennylanePort } from './port';

/** Pennylane eşitlemesinin turu: önce banka hareketi ve eşleşmesi okunur, sonra yazım kuyruğu işlenir; okuma kapalıyken ikisi de durur. */
export async function syncPennylane(
  db: Db,
  pennylane: PennylanePort,
  opts: { now?: Date; files?: DocumentFileReader } = {},
): Promise<Record<string, unknown>> {
  const bank = await syncBankFeed(db, pennylane, { now: opts.now });
  if (bank['skipped']) return bank;
  return { ...bank, queue: await syncPennylaneQueue(db, pennylane, opts) };
}
