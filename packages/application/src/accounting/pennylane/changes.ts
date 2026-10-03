import type { PennylaneChangePage } from '@lezzet/types';

/** Akış dört haftayı tutar; sınıra yaklaşan anla sorulmaz, kaçan boşluk baştan okunur. */
export const STREAM_RETENTION_MS = 27 * 86_400_000;

type ChangeReader = (input: { since: string; cursor: null } | { since: null; cursor: string }) => Promise<PennylaneChangePage>;

/** Akışın `since` anından sonraki olayları; aynı kaydın olayları tek okumaya iner, son hâli Pennylane'den okunur. */
export async function readChanges(
  read: ChangeReader,
  since: string,
): Promise<{ ids: Map<number, 'delete' | 'upsert'>; last: string | null }> {
  const ids = new Map<number, 'delete' | 'upsert'>();
  let last: string | null = null;
  let page = await read({ since, cursor: null });
  for (;;) {
    for (const change of page.items) {
      ids.set(change.id, change.operation === 'delete' ? 'delete' : 'upsert');
      if (last === null || Date.parse(change.processedAt) > Date.parse(last)) last = change.processedAt;
    }
    if (!page.nextCursor) return { ids, last };
    page = await read({ since: null, cursor: page.nextCursor });
  }
}
