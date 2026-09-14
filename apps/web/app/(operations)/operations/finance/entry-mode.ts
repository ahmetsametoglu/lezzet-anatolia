import { MANUAL_TYPE_VIEW, type ManualMovementForm, type ManualType } from '@/components/operation/form/movement-form/schema';
import type { TransferForm } from '@/components/operation/form/transfer-form/schema';

/*
  "YENİ HAREKET" PENCERESİNİN KİPLERİ (12.24 · kullanıcı isteği: "transferi de doğrudan bu diyaloğun
  içinde yapabiliriz" · seçim: "sabit yuvalar") — gider, sermaye, transfer ve sınıflandırılmamış para
  tek pencerede, tek seçicide. İki gövde ayrı kalır (şema ve kaydeden kapı ayrı); kip değişince ORTAK
  alanlar taşınır: yazılan tutar, gün ve açıklama kaybolmaz, elle hareketin hesabı transferin "Nereden"i
  olur. Taşıma saf ve burada — pencere yalnız çağırır, kural sınanır (`entry-mode.test.ts`).
*/

export type EntryMode = ManualType | 'transfer';

/** Seçicideki sıra: en sık iş başta, sebebi bilinmeyen para sonda. */
export const ENTRY_MODES = ['expense', 'capital', 'transfer', 'misc'] as const satisfies readonly EntryMode[];

export const ENTRY_MODE_VIEW: Record<EntryMode, { label: string; hint: string }> = {
  ...MANUAL_TYPE_VIEW,
  // İpucu TEK satır (12.24 turu ölçtü: iki satıra taşan ipucu bu kipin bütün yuvalarını 19px aşağı itiyordu).
  transfer: { label: 'Transfer', hint: 'Hesaptan hesaba — kasadan bankaya ya da Stripe payout.' },
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
