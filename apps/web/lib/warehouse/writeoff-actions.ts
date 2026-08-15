'use server';

import { revalidatePath } from 'next/cache';
import { recordAdjustment, type WarehouseReason } from '@lezzet/application';
import { StockService, serviceDb } from '@lezzet/database';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireWarehouseScope } from '@/lib/guard';

/**
 * **STOKTAN DÜŞ** — Stok ekranının çıkış kapısı (22.26; eski `adjustments-actions.ts`).
 *
 * ── DEPO ARTIK PARTİDEN TÜRÜYOR, BAĞLAMDAN DEĞİL ────────────────────────────
 * Eski kapı depoyu `readWorkWarehouse()` ile bağlamdan alıyordu ve sayfa, depo seçilmeden listeyi
 * hiç kurmuyordu: *"imha tutanağı bir rafın tutanağıdır"*. Doğru bir cümle, ama yanlış yerden
 * çözülmüş bir soru — **parti zaten tek depodadır** (`DOMAIN §17`), yani hangi rafın tutanağı
 * olduğunu satırların kendisi söyler. Depo-üstü bakışta çalışan yönetici artık ayrıca bağlam
 * seçmek zorunda değil; seçtiği partiler zaten deposunu belirliyor.
 *
 * **Kimlik yine İSTEMCİDEN GELMİYOR:** partiler sunucuda okunuyor ve depoları oradan çıkıyor.
 * Parametre olsaydı kapının kapsam kontrolü kandırılabilirdi — verilen kimlik "operatörün deposu"
 * diye geçer ve gönderilen partilerle uyuştuğu sürece hiçbir şey itiraz etmezdi.
 *
 * ── İKİ DEPO KARIŞIRSA: HİÇBİRİ YAZILMAZ ────────────────────────────────────
 * Tek belge numarası tek kâğıda karşılık gelir; iki deponun partisi tek tutanağa girerse o kâğıt
 * hiçbir rafta doğru olmaz. Karışım bir hata değil bir SORU olduğu için cümlesi de açık.
 */
export async function recordWriteOffAction(input: {
  lines: { stockId: string; qty: number }[];
  reason: WarehouseReason;
  note: string | null;
}): Promise<ActionResult<{ referenceNo: string | null; lines: number }>> {
  try {
    if (input.lines.length === 0) throw new Error('Düşülecek satır yok — parti ve adet seçin.');

    const db = serviceDb();
    const stockIds = [...new Set(input.lines.map((line) => line.stockId))];
    const batches = await new StockService(db).listByIds(stockIds);

    // Parti hiç yok: silinmiş ya da hiç var olmamış. "Başka deponun" ile aynı şey DEĞİL ve teşhisi
    // de farklı — ikisini tek cümleye katlamak, operatörü yanlış yere bakmaya gönderirdi.
    if (batches.length !== stockIds.length) {
      throw new Error('Seçili partilerden biri artık kayıtlarda yok. Hiçbir satır yazılmadı — sayfayı tazeleyin.');
    }

    const warehouseIds = [...new Set(batches.map((batch) => batch.warehouseId))];
    if (warehouseIds.length > 1) {
      throw new Error(
        'Seçili partiler farklı depolarda — tek tutanak tek rafın kâğıdıdır. Hiçbir satır yazılmadı; depo başına ayrı kayıt girin.',
      );
    }

    const warehouseId = warehouseIds[0] as string;
    // Kapsam BU depo için doğrulanıyor: başka deponun malını buradan eksiltmek, olmayan bir rafı
    // saymak olurdu (`DOMAIN §17`).
    const { user } = await requireWarehouseScope(warehouseId);

    const result = await recordAdjustment(db, {
      warehouseId,
      lines: input.lines,
      reason: input.reason,
      note: input.note,
      actorId: user.profileId,
    });

    if (result.status === 'empty') throw new Error('Düşülecek satır yok — parti ve adet seçin.');
    if (result.status === 'forbidden') {
      throw new Error(
        `Seçili partilerden ${result.stockIds.length} tanesi kapsamınızın dışında. Hiçbir satır yazılmadı — sayfayı tazeleyip yeniden seçin.`,
      );
    }
    if (result.status === 'not_found') {
      throw new Error('Seçili partilerden biri artık kayıtlarda yok. Hiçbir satır yazılmadı — sayfayı tazeleyin.');
    }
    // **Fiziksel gerçeğin ihlali bir HATA değil, operatöre söylenecek cevaptır** ("partide 3 adet
    // var, 5 düşülemez"). Kapı mesajı taşıyor, ekran onu aynen gösteriyor: yeniden yazılmış bir
    // cümle, veritabanının söylediğinden sapardı.
    if (result.status === 'failed') throw new Error(result.message);

    revalidatePath('/operations/stock');

    return { data: { referenceNo: result.result.referenceNo, lines: input.lines.length }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
