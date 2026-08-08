'use server';

import { revalidatePath } from 'next/cache';
import { ProductService, SupplierService, serviceDb } from '@lezzet/database';
import { resolveLocalizedText } from '@lezzet/types';
import { titleOf } from '@/lib/catalog/title';
import { OPERATIONS_LOCALE } from '@/components/operation/ui/labels';
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

/** Katalogdan varyant arama — siparişsiz kabulde satır eklemek için. */
export async function searchIntakeVariantsAction(term: string): Promise<ActionResult<{ variantId: string; label: string }[]>> {
  try {
    await requireWarehouseScope();
    const query = term.trim();
    if (!query) return { data: [], error: null };

    const db = serviceDb();
    const service = new ProductService(db);
    const page = await service.listPriceRows({ filters: { query }, limit: VARIANT_SEARCH_LIMIT });
    const pool = await service.listPool(VARIANT_SEARCH_LIMIT, page.rows.map((row) => row.id));

    return {
      data: pool.flatMap((product) => {
        const name = resolveLocalizedText(product.name, OPERATIONS_LOCALE) || 'Adsız ürün';
        return product.variants.map((variant) => ({
          variantId: variant.id,
          label: titleOf(name, resolveLocalizedText(variant.label, OPERATIONS_LOCALE)),
        }));
      }),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Aramanın tavanı — eşleşen ürün sayısı; her ürün birkaç varyant açar. */
const VARIANT_SEARCH_LIMIT = 20;

/**
 * **Yeni tedarikçi — hızlı ekleme** (tasarımın kuralı: *"ad + telefon yeter; vergi no, vade, adres
 * admin işi"*).
 *
 * Kamyon rampada beklerken ayrı bir sayfaya gitmek akışı kırar. Eksik alanlar sonradan yöneticinin
 * Tedarik ekranından tamamlanır — burada eksiksiz kayıt istemek, kabulü tedarikçi formuna rehin
 * vermek olurdu.
 */
export async function createSupplierAction(name: string, phone: string | null): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    await requireWarehouseScope();
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Tedarikçi adı girilmeli.');

    // Telefon `contact` bloğunda: tedarikçide ayrı bir `phone` kolonu YOK ve açmıyorum — iletişim
    // bilgisi zaten orada yaşıyor, ikinci bir yer iki gerçek demek olurdu.
    const telefon = phone?.trim();
    const supplier = await new SupplierService(serviceDb()).insert({
      name: trimmed,
      ...(telefon ? { contact: { phone: telefon } } : {}),
    });
    revalidatePath(RECEIVING_PATH);
    return { data: { id: supplier.id, name: supplier.name }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
