'use server';

import type { LocalizedText } from '@lezzet/types';
import { requireStaff } from '@/lib/guard';

// Sayfa geneli paylaşılan action — ürün formu ve katalog dialogu ikisi de kullanır, bu yüzden
// sekme klasörlerinden birine değil sayfa seviyesine konur (no-duplication).

/**
 * AI çeviri önerisi — TR metinden FR/DE önerir. UI hazır; arka uç (packages/ai) sonraki dilimde.
 * Bilinçli stub: throw eder (öneri akışı; mutasyon değil — FormLocalizedText try/catch ile gösterir).
 */
export async function suggestTranslationAction(_text: LocalizedText): Promise<LocalizedText> {
  await requireStaff();
  throw new Error('AI çeviri önerisi sonraki dilimde bağlanacak (packages/ai).');
}
