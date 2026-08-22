'use server';

import { serviceDb, VariantBarcodeService } from '@lezzet/database';
import type { VariantBarcode } from '@lezzet/types';
import { requireStaff } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';

/**
 * ÜRÜN BARKODU yönetimi (23.3) — öğrenen eşlemenin GERİ ALMA yeri.
 *
 * Kod tablosu mal kabulde kendini dolduruyor (karar §1.3, mobil); web'in işi TARAMA değil YÖNETİM
 * (karar §1.1): varyant editörü kodları listeler ve yanlış öğretilmişi SİLER. Düzeltme = sil +
 * kabulde yeniden öğret — kod güncellenmez (eşleme tarihçesiz bir kayıttır, 0047 künyesi).
 *
 * `lib/`te çünkü form ortak komponent (`components/operation/form/product-form`) ve components
 * bir sayfa klasöründen import edemez (`product-actions`ın aynı devri).
 */

export async function listVariantBarcodesAction(variantIds: string[]): Promise<ActionResult<VariantBarcode[]>> {
  try {
    await requireStaff();
    if (variantIds.length === 0) return { data: [], error: null };
    return { data: await new VariantBarcodeService(serviceDb()).listByVariants(variantIds), error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Kod eşlemesini geri alır. Silme ucuzdur ve onay sorulmaz: kaybolan şey bir beyan değil bir
 * EŞLEME — koli bir sonraki kabulde okutulunca "bu kod hangi ürün?" diye yeniden sorulur ve
 * doğrusu öğretilir. (Varyant silmenin iki adımlı onayı burada emsal DEĞİL: orada fiyat satırları
 * da gidiyor.)
 */
export async function deleteVariantBarcodeAction(barcodeId: string): Promise<ActionResult<true>> {
  try {
    await requireStaff();
    await new VariantBarcodeService(serviceDb()).delete(barcodeId);
    return { data: true, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}
