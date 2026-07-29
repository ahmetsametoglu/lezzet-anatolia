'use server';

import type { LocalizedText } from '@lezzet/types';
import { requireStaff } from '@/lib/guard';

/**
 * AI çeviri önerisi — TR metinden FR/DE önerir.
 *
 * **Yeri `lib/`, bir sayfa klasörü değil** (CLAUDE.md §2): ürün formu, katalog dialogu, paket
 * dialogu ve indirim dialogu — dördü de aynı öneriyi istiyor. Sayfa altında kalsaydı ikinci sayfa
 * ya import sınırını aşar ya kendi kopyasını yazardı.
 *
 * BEKLEYEN(09.4): çevirinin arka ucu (`packages/ai`). Bugün THROW eder ve bu bilinçli — öneri
 * akışıdır, mutasyon değil: alan sessizce boş kalmaz, çağıran hatayı kendi yanında gösterir
 * (`LocalizedTextField` amber not satırı). Sessiz bir `{}` dönseydi operatör düğmenin çalıştığını
 * ama modelin cevap vermediğini sanırdı.
 */
export async function suggestTranslationAction(_text: LocalizedText): Promise<LocalizedText> {
  await requireStaff();
  throw new Error('AI çeviri önerisi sonraki dilimde bağlanacak (packages/ai).');
}
