'use server';

import { revalidatePath } from 'next/cache';
import { recordAdjustment, type WarehouseReason } from '@/lib/stock/adjustment';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireWarehouseScope } from '@/lib/guard';

/**
 * Stoktan düşme masasının yazma yolu (10.5).
 *
 * **Sebep tipi `return_restock`'u KABUL ETMEZ** (`WarehouseReason`) — teslim sonrası iadenin stoğa
 * dönmesi adminin sebep kayıtlı istisnasıdır. Arayüz disiplini olarak bırakılsaydı o seçenek er geç
 * bir ekranda belirirdi; tip sınırı olarak duruyor.
 */
const ADJ_PATH = '/operations/adjustments';

export async function recordAdjustmentAction(input: {
  lines: { stockId: string; qty: number }[];
  reason: WarehouseReason;
  note: string | null;
}): Promise<ActionResult<{ referenceNo: string | null; lines: number }>> {
  try {
    const { user } = await requireWarehouseScope();

    const result = await recordAdjustment({
      lines: input.lines,
      reason: input.reason,
      note: input.note,
      actorId: user.profileId,
    });

    if (result.status === 'empty') throw new Error('Düşülecek satır yok — parti ve adet seçin.');
    // **Fiziksel gerçeğin ihlali bir HATA değil, operatöre söylenecek cevaptır** ("partide 3 adet
    // var, 5 düşülemez"). Kapı mesajı taşıyor, ekran onu aynen gösteriyor: yeniden yazılmış bir
    // cümle, veritabanının söylediğinden sapardı.
    if (result.status === 'failed') throw new Error(result.message);

    revalidatePath(ADJ_PATH);
    // Stok ekranı da tazelenir: düşülen mal aynı anda oradan da eksilir.
    revalidatePath('/operations/stock');

    return { data: { referenceNo: result.result.referenceNo, lines: input.lines.length }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
