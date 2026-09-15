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
 * **Tedarikçi ekler ya da günceller** (`id` varsa güncelleme) — Tedarik ekranının kartı ve asistan
 * kuyruğunun tedarikçi önerisi (22.44) aynı kapıdan yazar.
 *
 * ── NEDEN `lib/` ALTINDA (22.44) ────────────────────────────────────────────
 * Eylem tedarik sayfasının `actions.ts`indeydi. Asistanın faturadan tedarikçi önerisi ikinci bir sayfa
 * açtı ve kardeş sayfadan import yasak (`STACK §7`); ikinci bir yazma yolu yazmak da iki kural demekti.
 * `receiveIntakeFromProposalAction` ve `createDraftFromProposalAction` aynı sebeple `lib/` altında.
 *
 * İletişim JSON olarak durur (`contact`) ve **elle üç alandan kurulur**: telefon, e-posta, adres.
 * Serbest JSON'a bırakılsaydı her kayıt farklı anahtar kullanır ve "WhatsApp'tan sipariş gönder"
 * bağlantısı hiçbir kayıtta güvenle çalışmazdı — telefon o bağlantının anahtarıdır.
 *
 * ── YENİ KAYITTA NOKTA ATIŞI MÜKERRER YOKLAMASI (22.44 · kullanıcı kararı 14.09) ──
 * Aynı vergi numarası, telefon ya da tam adla ikinci bir tedarikçi açılmaz (`pinpointSupplier`):
 * faturadaki kimlik tek kayda gitmeli, yoksa asistanın nokta atışı araması "birden çok" der ve
 * tedarikçinin borcu iki karta bölünür. Güncellemede sorulmaz — kayıt zaten kendisidir.
 *
 * Öneriden gelindiyse kayıt ile kuyruk satırı BİRLİKTE koşar (`withProposal`); ret FIRLATILIR, çünkü
 * hiçbir şey yazılmadı demektir ve sessizce dönseydi satır "uygulandı" damgası yerdi.
 */
export async function saveSupplierAction(input: SupplierFormInput, proposalId?: string | null): Promise<ActionResult<{ id: string }>> {
  try {
    const staff = await requireFinance();
    // Alanların kuruluşu ve mükerrer yoklaması uygulama katmanında (`warehouse/supplier`, 22.44) — asistanın
    // tedarikçi önerisinin uygulayıcısıyla ORTAK; burada ikinci bir kopya yok.
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
