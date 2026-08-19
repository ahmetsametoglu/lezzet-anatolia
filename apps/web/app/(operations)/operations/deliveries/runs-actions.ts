'use server';

import type { KeysetCursor } from '@lezzet/types';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireAdmin } from '@/lib/guard';
import { readRunsPage, type RunsPageView } from './runs-read';

// Geçmiş seferlerin "daha eski" kapısı (18.08) — guard ilk, `{ data, error }` döner. Yazma yok:
// sefer listesi salt-okunur bir arşivdir; kayıtları doğuran yer kuryenin start/kapanış akışıdır.

/** Sonraki sayfa — imleç istemciden gelir, doğrulaması `readRunsPage`in keyset sözleşmesinde. */
export async function loadMoreRunsAction(after: KeysetCursor): Promise<ActionResult<RunsPageView>> {
  try {
    await requireAdmin();
    return { data: await readRunsPage(after), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
