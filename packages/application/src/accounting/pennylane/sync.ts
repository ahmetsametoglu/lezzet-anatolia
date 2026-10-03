import type { Db } from '@lezzet/database';
import { syncBankFeed } from './bank-feed';
import { syncPennylaneDocuments, type DocumentFileReader } from './documents';
import type { PennylanePort } from './port';

/** Pennylane eşitlemesinin turu: önce banka hareketi okunur, sonra belge kuyruğu yazılır; okuma kapalıyken ikisi de durur. */
export async function syncPennylane(
  db: Db,
  pennylane: PennylanePort,
  opts: { now?: Date; files?: DocumentFileReader } = {},
): Promise<Record<string, unknown>> {
  const bank = await syncBankFeed(db, pennylane, { now: opts.now });
  if (bank['skipped']) return bank;
  return { ...bank, documents: await syncPennylaneDocuments(db, pennylane, opts) };
}
