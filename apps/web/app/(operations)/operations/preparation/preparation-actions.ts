'use server';

import { revalidatePath } from 'next/cache';
import type { PreparationPick } from '@lezzet/types';
import { confirmPreparation } from '@/lib/order/preparation';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireWarehouseScope } from '@/lib/guard';

/**
 * Hazırlık masasının tek yazma yolu (10.1–10.3).
 *
 * **Kural yazmıyor, kapıya devrediyor.** Kilitli parti kontrolü, parti kaydı, sipariş durumu ve
 * eksik tavsiyesi `confirmPreparation`'ın içinde; burada yalnız kimlik soruluyor ve cevap Türkçeye
 * çevriliyor. Ekranın karar sandığı her satır bir gün kapıyla ayrışırdı.
 */
const PREP_PATH = '/operations/preparation';

interface ConfirmResult {
  /** Yazılan kalem sayısı. */
  items: number;
  /** Sipariş "hazır"a geçti mi — tüm kalemler toplandıysa. */
  ready: boolean;
  /** Eksik kalan kalemler ve motorun tavsiyesi — **karar depocunun**, kapı onun yerine vermez. */
  shortfalls: { itemId: string; suggestion: { action: string; reason: string; missingQty: number } }[];
}

export async function confirmPreparationAction(
  orderId: string,
  picks: PreparationPick[],
): Promise<ActionResult<ConfirmResult>> {
  try {
    // Depo kapsamı SORULUYOR ama depo kimliği kapıya geçilmiyor: onay siparişin kendi deposundan
    // yazılır (partiler oradan seçildi). Buradaki soru "bu kişi depoda mı" — fail-closed.
    const { user } = await requireWarehouseScope();

    const result = await confirmPreparation({ orderId, picks, actorId: user.profileId });

    if (result.status === 'not_found') throw new Error('Sipariş bulunamadı.');
    // **Kilitli kalem ihlali: HİÇBİR yazım yapılmadı.** Cümle bunu açıkça söylüyor — "olmadı" ile
    // "yarısı oldu" arasındaki farkı depocu bilmek zorunda, yoksa kalemi ikinci kez toplar.
    if (result.status === 'pinned_violation') {
      throw new Error(
        'Bu kalem belirli bir partiye kilitli (indirimli teklif) ve başka partiden verilemez. Hiçbir kayıt yazılmadı — satırdaki partiyi kullanın.',
      );
    }

    revalidatePath(PREP_PATH);
    return {
      data: { items: result.items, ready: result.ready, shortfalls: result.shortfalls },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
