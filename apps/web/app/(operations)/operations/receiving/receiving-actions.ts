'use server';

import { revalidatePath } from 'next/cache';
import { openIntakeForm, receiveGoods, type IntakeFormLine, type IntakeFormRow } from '@/lib/stock/intake';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireWarehouseScope } from '@/lib/guard';
import type { ReceiveOutcome } from './receiving-types';

/**
 * Mal kabulün yazma ve okuma yolları (10.4).
 *
 * **Depocu yolu FİYAT KABUL ETMEZ** ve bu bir ekran kuralı değil: `receiveGoods`'un satır tipinde
 * (`IntakeFormLine`) maliyet alanı YOKTUR. Fiyatlı giriş admin'in ayrı kapısıdır (`receivePurchase`,
 * 09.14). İki ayrı tip, iki ayrı kapı — depo ekranı fiyat gönderemez, gönderse tip tutmaz.
 */
const RECEIVING_PATH = '/operations/receiving';

/** Seçilen tedarik siparişinin kalemleri — beklenen adetlerle dolu form. */
export async function openIntakeFormAction(purchaseOrderId: string): Promise<ActionResult<IntakeFormRow[]>> {
  try {
    await requireWarehouseScope();
    return { data: await openIntakeForm(purchaseOrderId), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * **Kabulü tamamla.** Fark ve uyarı GERİ DÖNER, iş DURMAZ.
 *
 * Uyarı (kısa raf ömrü) ve fark (eksik/fazla) birer red değil, birer bilgidir: malı kabul edip
 * etmemek sahadaki insanın kararı (DOMAIN §4), tedarikçinin eksik göndermesi de bizim hatamız
 * değil. Ekran ikisini de gösteriyor ama hiçbiri kaydı geri almıyor.
 */
export async function receiveGoodsAction(input: {
  warehouseId: string;
  purchaseOrderId: string | null;
  supplierId: string | null;
  note: string | null;
  lines: IntakeFormLine[];
}): Promise<ActionResult<ReceiveOutcome>> {
  try {
    // Depo kapsamı BU depo için doğrulanıyor: yöneticinin açık seçimi de, depocunun kimliğinden
    // geleni de aynı kapıdan geçer. Kapsamı olmayan personel hiçbir depoya kabul yazamaz.
    await requireWarehouseScope(input.warehouseId);

    if (input.lines.length === 0) throw new Error('Kabul edilecek satır yok — en az bir kaleme adet girin.');

    const result = await receiveGoods({
      warehouseId: input.warehouseId,
      purchaseOrderId: input.purchaseOrderId,
      supplierId: input.supplierId,
      note: input.note,
      lines: input.lines,
    });

    if (result.status === 'empty') throw new Error('Kabul edilecek satır yok — en az bir kaleme adet girin.');

    revalidatePath(RECEIVING_PATH);
    // Stok ekranı da tazelenir: kabul edilen mal aynı anda satılabilir hâle geliyor ve o ekran
    // aynı gerçeği gösteriyor.
    revalidatePath('/operations/stock');

    // **Kapının sonucu OLDUĞU GİBİ geçirilmiyor, süzülüyor:** `ReceiveIntakeResult` içinde
    // `totalAmountCents` var (girişin parasal toplamı). Sonucu yayarak döndürmek, depocunun
    // ekranına para taşımanın en sessiz yolu olurdu — rol duvarı tam burada delinirdi.
    // Ekrana giden tek sayı yazılan parti ADEDİ.
    return {
      data: { warnings: result.warnings, differences: result.differences, batches: result.result.stockIds.length },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
