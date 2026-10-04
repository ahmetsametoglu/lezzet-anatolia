'use server';

import { revalidatePath } from 'next/cache';
import { SupplierService, serviceDb } from '@lezzet/database';
import { duplicateSupplierMessage, duplicateSupplierOf, supplierRowOf } from '@lezzet/application';
import { requireFinance } from '@/lib/guard';
import { withProposal } from '@/lib/assistant/handoff';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import type { SupplierFormInput } from '@/components/operation/form/supplier-form/schema';

/** Tedarik ekranının yolu — kayıt sonrası kartlar tazelensin. */
const PROCUREMENT_PATH = '/operations/procurement';

/**
 * Tedarikçi ekler ya da günceller (`id` varsa güncelleme); Tedarik ekranının kartı ve asistanın tedarikçi önerisi aynı kapıdan yazar, bu
 * yüzden eylem `lib/` altındadır. Öneriden gelindiyse ret fırlatılır, çünkü sessizce dönseydi satır "uygulandı" damgası yerdi.
 */
export async function saveSupplierAction(input: SupplierFormInput, proposalId?: string | null): Promise<ActionResult<{ id: string }>> {
  try {
    const staff = await requireFinance();
    // Alanların kuruluşu ve mükerrer yoklaması uygulama katmanındadır (`warehouse/supplier`), asistanın uygulayıcısıyla ortak.
    const fields = supplierRowOf(input);
    if (!fields.name) throw new Error('Tedarikçi adı gerekli.');

    // Yoklama kuyruk satırına dokunmadan ÖNCE: ret satırı "düştü"ye sokmasın, operatör adı ya da vergi
    // numarasını düzeltip yeniden kaydedebilsin. Güncellemede sorulmaz — kayıt zaten kendisidir.
    if (!input.id) {
      const duplicate = await duplicateSupplierOf(serviceDb(), input);
      if (duplicate) throw new Error(duplicateSupplierMessage(duplicate.existingName));
    }

    const svc = new SupplierService(serviceDb());
    const saved = await withProposal(
      proposalId,
      staff.profileId,
      () => (input.id ? svc.update({ id: input.id, ...fields }) : svc.insert(fields)),
      (supplier) => ({ supplierId: supplier.id }),
    );
    revalidatePath(PROCUREMENT_PATH);
    if (proposalId) revalidatePath('/operations/assistant');
    return { data: { id: saved.id }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}
