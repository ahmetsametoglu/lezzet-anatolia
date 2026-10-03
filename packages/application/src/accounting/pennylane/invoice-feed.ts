import { PennylaneCursorService, PennylaneDocumentService, type Db } from '@lezzet/database';
import { readChanges, STREAM_RETENTION_MS } from './changes';
import { PennylaneError } from './errors';
import { refreshMirrors } from './matches';
import type { PennylanePort } from './port';

/**
 * Faturalarımızın Pennylane'deki açık kalanı, Pennylane'in fatura değişiklik akışından (docs/feature/kasa-muhasebe.md §8). Toptan
 * operasyonunun ya da muhasebecinin Pennylane'de yaptığı eşleşme bizim yazımımızdan geçmediği için ancak buradan görünür.
 */

const STREAM = 'supplier_invoices';
/** Akış şirketin bütün faturalarını getirir; bizimkiler kimlik listesiyle parça parça sorulur ki sorgu adresi taşmasın. */
const LOOKUP_CHUNK = 200;

export async function syncInvoiceFeed(db: Db, pennylane: PennylanePort, opts: { now?: Date } = {}): Promise<Record<string, unknown>> {
  const now = opts.now ?? new Date();
  const cursors = new PennylaneCursorService(db);
  const since = (await cursors.find(STREAM))?.processedAt ?? null;
  if (!since || now.getTime() - Date.parse(since) > STREAM_RETENTION_MS) return refreshAll(db, pennylane, cursors, now);

  let changes: Awaited<ReturnType<typeof readChanges>>;
  try {
    changes = await readChanges((input) => pennylane.invoiceChanges(input), since);
  } catch (err) {
    // Akış, kapsamadığı anla sorulunca 422 döner.
    if (!(err instanceof PennylaneError) || err.code !== 'validation') throw err;
    return refreshAll(db, pennylane, cursors, now);
  }
  const ids = [...changes.ids.keys()];
  const mirrors = new PennylaneDocumentService(db);
  let refreshed = 0;
  for (let start = 0; start < ids.length; start += LOOKUP_CHUNK) {
    const ours = await mirrors.listByInvoices(ids.slice(start, start + LOOKUP_CHUNK));
    await refreshMirrors(db, pennylane, ours);
    refreshed += ours.length;
  }
  await cursors.save(STREAM, changes.last ?? since);
  return { changes: ids.length, refreshed };
}

/**
 * Akışın kapsamadığı boşlukta (ilk tur ya da uzun kesinti) bütün faturalarımızın kalanı okunur. İmleç okumanın başladığı anı alır ve
 * okuma bitince yazılır: okuma sırasında gelen değişiklik kaçmaz, yarıda kalan okuma sonraki turda baştan yapılır.
 */
async function refreshAll(db: Db, pennylane: PennylanePort, cursors: PennylaneCursorService, now: Date): Promise<Record<string, unknown>> {
  const all = await new PennylaneDocumentService(db).listAll();
  await refreshMirrors(db, pennylane, all);
  await cursors.save(STREAM, now.toISOString());
  return { relist: true, refreshed: all.length };
}
