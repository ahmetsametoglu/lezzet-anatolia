import { MANUAL_TYPE_VIEW, type ManualMovementForm, type ManualType } from '@/components/operation/form/movement-form/schema';
import type { TransferForm } from '@/components/operation/form/transfer-form/schema';

/*
  "Yeni hareket" penceresinin kipleri: gider, sermaye, transfer ve sınıflandırılmamış para tek seçicide, iki gövde ayrı şemayla.
  Kip değişince ortak alanlar (tutar, gün, açıklama, hesap) taşınır ki yazılan kaybolmasın; taşıma saf ve burada sınanır.
*/

export type EntryMode = ManualType | 'transfer';

/** Seçicideki sıra: en sık iş başta, sebebi bilinmeyen para sonda. */
export const ENTRY_MODES = ['expense', 'capital', 'transfer', 'misc'] as const satisfies readonly EntryMode[];

export const ENTRY_MODE_VIEW: Record<EntryMode, { label: string; hint: string }> = {
  ...MANUAL_TYPE_VIEW,
  // İpucu tek satır: iki satıra taşan ipucu kipin bütün yuvalarını aşağı iter.
  transfer: { label: 'Transfer', hint: 'Hesaptan hesaba — kasadan bankaya ya da kart ödemeleri aktarımı.' },
};

/**
 * Elle hareketten transfere: hesap "Nereden" olur; "Nereye" hâlâ farklı bir hesapsa yerinde kalır,
 * değilse ilk FARKLI hesap seçilir (aynı hesaba transfer olmaz — `transferBlock`).
 */
export function carryToTransfer(movement: ManualMovementForm, transfer: TransferForm, accountIds: readonly string[]): TransferForm {
  const fromAccountId = movement.accountId || transfer.fromAccountId;
  const toAccountId =
    transfer.toAccountId && transfer.toAccountId !== fromAccountId ? transfer.toAccountId : (accountIds.find((id) => id !== fromAccountId) ?? '');
  return { ...transfer, fromAccountId, toAccountId, amount: movement.amount, valueDate: movement.valueDate, description: movement.description };
}

/** Transferden elle harekete: "Nereden" hesap olur; tür, cari ve etiket o kipte kaldığı yerden sürer. */
export function carryToMovement(transfer: TransferForm, movement: ManualMovementForm): ManualMovementForm {
  return {
    ...movement,
    accountId: transfer.fromAccountId || movement.accountId,
    amount: transfer.amount,
    valueDate: transfer.valueDate,
    description: transfer.description,
  };
}
