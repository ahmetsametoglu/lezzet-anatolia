'use server';

import { revalidatePath } from 'next/cache';
import { recordAdjustment, type WarehouseReason } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireWarehouseScope } from '@/lib/guard';
import { readWorkWarehouse } from '@/lib/warehouse/context';

/**
 * Stoktan düşme masasının yazma yolu (10.5).
 *
 * **Sebep tipi `return_restock`'u KABUL ETMEZ** (`WarehouseReason`) — teslim sonrası iadenin stoğa
 * dönmesi adminin sebep kayıtlı istisnasıdır. Arayüz disiplini olarak bırakılsaydı o seçenek er geç
 * bir ekranda belirirdi; tip sınırı olarak duruyor.
 *
 * **Depo kimliği İSTEMCİDEN GELMEZ** (10.7): sunucuda bağlamdan çözülür. Parametre olsaydı, kapının
 * `out_of_scope` kontrolü kandırılabilirdi — ona verilen kimlik "operatörün deposu" diye geçer ve
 * gönderilen partilerle uyuştuğu sürece hiçbir şey itiraz etmezdi.
 */
const ADJ_PATH = '/operations/adjustments';

export async function recordAdjustmentAction(input: {
  lines: { stockId: string; qty: number }[];
  reason: WarehouseReason;
  note: string | null;
}): Promise<ActionResult<{ referenceNo: string | null; lines: number }>> {
  try {
    const { user } = await requireWarehouseScope();
    const workplace = await readWorkWarehouse();
    if (workplace.status !== 'ok') {
      throw new Error('Hangi depoda çalıştığınız belli değil — üst bardan depo seçip tekrar deneyin. Hiçbir kayıt yazılmadı.');
    }

    const result = await recordAdjustment(serviceDb(), {
      warehouseId: workplace.warehouseId,
      lines: input.lines,
      reason: input.reason,
      note: input.note,
      actorId: user.profileId,
    });

    if (result.status === 'empty') throw new Error('Düşülecek satır yok — parti ve adet seçin.');
    // **Başka deponun partisi: TEK SATIR BİLE yazılmadı.** Normal akışta olamaz (liste zaten bu
    // deponun partileriyle kuruldu); buraya düşmesi ya bayat bir sekmenin ya bağlam değişikliğinin
    // işaretidir. Kaç parti olduğu söyleniyor: "kapsam dışı" tek başına ekranda çözülemeyen bir
    // cümledir, operatör hangi satırı sileceğini bilmeli.
    if (result.status === 'forbidden') {
      throw new Error(
        `Seçili partilerden ${result.stockIds.length} tanesi ${workplace.name} deposunun değil. Hiçbir satır yazılmadı — sayfayı tazeleyip yeniden seçin.`,
      );
    }
    // Parti hiç yok: silinmiş ya da hiç var olmamış. "Başka deponun" ile aynı şey DEĞİL ve teşhisi
    // de farklı — ikisini tek cümleye katlamak, operatörü yanlış yere bakmaya gönderirdi.
    if (result.status === 'not_found') {
      throw new Error('Seçili partilerden biri artık kayıtlarda yok. Hiçbir satır yazılmadı — sayfayı tazeleyin.');
    }
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
