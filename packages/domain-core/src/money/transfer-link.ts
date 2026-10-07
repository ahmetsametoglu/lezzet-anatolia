import { daysBetween } from '@lezzet/helper';
import type { MoneyMovement } from '@lezzet/types';
import { counterDirectionOf } from './movement';

/**
 * Ekstre satırının kendiliğinden bağlandığı transfer (20. karar): kasadan yatırma ya da kart ödemeleri aktarımı gibi bizim yazdığımız
 * transferin bankadaki karşılığı. Bağlanınca transferin bankadaki aynası susar, para bir kez sayılır. Tahmin yapılmaz: yön ve tutar
 * birebir, gün penceredeyse ve satır da transfer de birbirinin tek adayıysa bağlanır; değilse satır öneri olarak bekler.
 */

/** Banka satırının günü transferinkinden en çok bu kadar sapar; yatırma ve aktarım bankaya birkaç günde düşer. */
export const TRANSFER_LINK_WINDOW_DAYS = 7;

type StatementRow = Pick<MoneyMovement, 'id' | 'direction' | 'amountCents' | 'valueDate'>;
type TransferLeg = Pick<MoneyMovement, 'id' | 'direction' | 'amountCents' | 'valueDate'>;

const fits = (row: StatementRow, leg: TransferLeg): boolean =>
  counterDirectionOf(leg.direction) === row.direction &&
  leg.amountCents === row.amountCents &&
  Math.abs(daysBetween(leg.valueDate, row.valueDate)) <= TRANSFER_LINK_WINDOW_DAYS;

/** Bağlanacak çiftler: satırın tek adayı o transfer, transferin tek adayı o satır. */
export function pairStatementsWithTransfers(
  rows: readonly StatementRow[],
  legs: readonly TransferLeg[],
): Array<{ rowId: string; legId: string }> {
  return legs.flatMap((leg) => {
    const rowsOfLeg = rows.filter((row) => fits(row, leg));
    if (rowsOfLeg.length !== 1) return [];
    const row = rowsOfLeg[0]!;
    return legs.filter((candidate) => fits(row, candidate)).length === 1 ? [{ rowId: row.id, legId: leg.id }] : [];
  });
}
