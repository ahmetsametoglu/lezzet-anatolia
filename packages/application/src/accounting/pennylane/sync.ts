import type { Db } from '@lezzet/database';
import { syncBankFeed } from './bank-feed';
import { syncTransactionCategories } from './category';
import type { DocumentFileReader } from './documents';
import { syncInvoiceFeed } from './invoice-feed';
import { syncPennylaneQueue } from './queue';
import type { PennylanePort } from './port';

/**
 * Pennylane eşitlemesinin turu: banka hareketi ve eşleşmesi okunur, yazım kuyruğu işlenir, işlem kategorileri hareketin son işinden
 * yazılır, en son faturalarımızın açık kalanı fatura akışından tazelenir, çünkü kuyruğun yazdığı eşleşme de o akışa düşer.
 */
export async function syncPennylane(
  db: Db,
  pennylane: PennylanePort,
  opts: { now?: Date; files?: DocumentFileReader } = {},
): Promise<Record<string, unknown>> {
  const bank = await syncBankFeed(db, pennylane, { now: opts.now });
  if (bank['skipped']) return bank;
  const queue = await syncPennylaneQueue(db, pennylane, opts);
  const categories = await syncTransactionCategories(db, pennylane);
  return { ...bank, queue, categories, invoices: await syncInvoiceFeed(db, pennylane, { now: opts.now }) };
}
