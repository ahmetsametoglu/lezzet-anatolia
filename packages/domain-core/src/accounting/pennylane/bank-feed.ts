import type { MovementDirection, PennylaneTransaction } from '@lezzet/types';

/**
 * Pennylane'den okunan banka hareketinin bizdeki banka satırına etkisi; saf karar. Banka hareketinin kaynağı Pennylane'dir ama izahlı
 * satır operatörün kararıdır: ona dokunulmaz, parası değişirse ya da silinirse muhasebe uyarılır.
 */

/** Bizdeki karşılık: aynanın son okunan hâli ve banka satırının izahı; satır hiç yazılmadıysa ya da silindiyse `movement` boştur. */
export interface BankFeedMirror {
  valueDate: string;
  direction: MovementDirection;
  amountCents: number;
  label: string | null;
  removed: boolean;
  movement: { explained: boolean } | null;
}

export type BankFeedAction =
  | { kind: 'insert' }
  | { kind: 'update' }
  | { kind: 'remove' }
  | { kind: 'alert'; change: 'changed' | 'removed' }
  | { kind: 'mirror' }
  | { kind: 'skip'; reason: 'before_live' | 'zero_amount' | 'unchanged' };

/**
 * Hareketin planı; `transaction` boşsa Pennylane'de silinmiştir, arşivlenen hareket de muhasebede yoktur. Canlıya geçiş günü yalnız
 * yeni satırı süzer, çünkü bizde duran satırın Pennylane'deki değişikliği her zaman bizi ilgilendirir.
 */
export function planBankFeed(input: {
  transaction: PennylaneTransaction | null;
  mirror: BankFeedMirror | null;
  liveFrom: string;
}): BankFeedAction {
  const { transaction, mirror } = input;
  if (transaction === null || transaction.archived) {
    if (!mirror || mirror.removed) return { kind: 'skip', reason: 'unchanged' };
    if (!mirror.movement) return { kind: 'mirror' };
    return mirror.movement.explained ? { kind: 'alert', change: 'removed' } : { kind: 'remove' };
  }

  const writable = transaction.amountCents > 0 && transaction.date >= input.liveFrom;
  if (!mirror || !mirror.movement) {
    if (writable) return { kind: 'insert' };
    if (mirror) return { kind: 'mirror' };
    return { kind: 'skip', reason: transaction.amountCents > 0 ? 'before_live' : 'zero_amount' };
  }

  const moneyChanged =
    transaction.date !== mirror.valueDate || transaction.direction !== mirror.direction || transaction.amountCents !== mirror.amountCents;
  if (!moneyChanged && transaction.label === mirror.label && !mirror.removed) return { kind: 'skip', reason: 'unchanged' };
  if (mirror.movement.explained) return moneyChanged ? { kind: 'alert', change: 'changed' } : { kind: 'mirror' };
  // Sıfıra inen hareket bilgi taşımaz, satır silinir; izahsız satır Pennylane'in hâline çekilir.
  return transaction.amountCents > 0 ? { kind: 'update' } : { kind: 'remove' };
}
