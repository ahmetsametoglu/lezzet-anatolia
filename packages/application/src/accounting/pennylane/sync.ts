import type { Db } from '@lezzet/database';
import { syncBankFeed } from './bank-feed';
import type { DocumentFileReader } from './documents';
import { syncInvoiceFeed } from './invoice-feed';
import { syncPennylaneQueue } from './queue';
import type { PennylanePort } from './port';

/**
 * Pennylane eşitlemesinin turu: önce banka hareketi ve eşleşmesi okunur, sonra yazım kuyruğu işlenir, en son faturalarımızın açık
 * kalanı fatura akışından tazelenir, çünkü kuyruğun yazdığı eşleşme de o akışa düşer. Okuma kapalıyken hiçbiri koşmaz.
 */
export async function syncPennylane(
  db: Db,
  pennylane: PennylanePort,
  opts: { now?: Date; files?: DocumentFileReader } = {},
): Promise<Record<string, unknown>> {
  const bank = await syncBankFeed(db, pennylane, { now: opts.now });
  if (bank['skipped']) return bank;
  const queue = await syncPennylaneQueue(db, pennylane, opts);
  return { ...bank, queue, invoices: await syncInvoiceFeed(db, pennylane, { now: opts.now }) };
}
