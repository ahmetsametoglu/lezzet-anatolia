import type { PaymentMethod, RegisterDayMovement } from '@lezzet/types';

/**
 * Kasanın gün sonu mutabakatı (docs/feature/kasa-muhasebe.md §7): ayna ↔ kasa yazımın kendisini oran, yöntem, satış ve nakit düzeyinde
 * sınar, kasada olup bizde olmayan satış kasa ekranından elle yapılmıştır. Defter ↔ ayna neyin yazılacağının kararını sınar, çünkü yanlış
 * plan iki tarafta da aynı göründüğü için ayna ↔ kasada fark çıkarmazdı.
 */

/** Bir tarafın günü; tutarlar **cent**, oran ve yöntem başına. */
export interface RegisterDaySide {
  vat: ReadonlyArray<{ vatRate: number; grossCents: number }>;
  payments: ReadonlyArray<{ method: PaymentMethod | null; amountCents: number }>;
  saleIds: readonly number[];
  /** Çekmecenin günlük net değişimi: nakit ödemeler ve fiş dışı nakit. */
  cashNetCents: number;
}

export type RegisterDayDifference =
  | { kind: 'vat'; vatRate: number; oursCents: number; registerCents: number }
  | { kind: 'payment'; method: PaymentMethod | null; oursCents: number; registerCents: number }
  | { kind: 'unknown_sale'; saleId: number }
  | { kind: 'missing_sale'; saleId: number }
  | { kind: 'cash'; oursCents: number; registerCents: number }
  | {
      kind: 'ledger';
      movementId: string;
      entry: RegisterDayMovement['kind'];
      method: PaymentMethod | null;
      expectedCents: number;
      writtenCents: number;
    };

/** Defter ↔ ayna: gün içinde açılmış hareketin kasada beklenen etkisi aynada yazılanla tutmalı. */
export function reconcileLedgerDay(rows: readonly RegisterDayMovement[]): RegisterDayDifference[] {
  return rows
    .filter((row) => row.expectedCents !== row.writtenCents)
    .map((row) => ({
      kind: 'ledger',
      movementId: row.movementId,
      entry: row.kind,
      method: row.method,
      expectedCents: row.expectedCents,
      writtenCents: row.writtenCents,
    }));
}

export function reconcileRegisterDay(ours: RegisterDaySide, register: RegisterDaySide): RegisterDayDifference[] {
  const differences: RegisterDayDifference[] = [];

  const vat = sumsBy(
    ours.vat,
    register.vat,
    (row) => row.vatRate,
    (row) => row.grossCents,
  );
  for (const [vatRate, [oursCents, registerCents]] of vat) {
    if (oursCents !== registerCents) differences.push({ kind: 'vat', vatRate, oursCents, registerCents });
  }
  const payments = sumsBy(
    ours.payments,
    register.payments,
    (row) => row.method,
    (row) => row.amountCents,
  );
  for (const [method, [oursCents, registerCents]] of payments) {
    if (oursCents !== registerCents) differences.push({ kind: 'payment', method, oursCents, registerCents });
  }

  const known = new Set(ours.saleIds);
  const reported = new Set(register.saleIds);
  for (const saleId of reported) if (!known.has(saleId)) differences.push({ kind: 'unknown_sale', saleId });
  for (const saleId of known) if (!reported.has(saleId)) differences.push({ kind: 'missing_sale', saleId });

  if (ours.cashNetCents !== register.cashNetCents) {
    differences.push({ kind: 'cash', oursCents: ours.cashNetCents, registerCents: register.cashNetCents });
  }
  return differences;
}

/** İki tarafın toplamı aynı anahtarda yan yana; bir tarafta hiç olmayan anahtar o tarafta sıfırdır. */
function sumsBy<T, K>(
  ours: readonly T[],
  register: readonly T[],
  keyOf: (row: T) => K,
  amountOf: (row: T) => number,
): Map<K, [number, number]> {
  const sums = new Map<K, [number, number]>();
  const add = (row: T, side: 0 | 1) => {
    const pair = sums.get(keyOf(row)) ?? [0, 0];
    pair[side] += amountOf(row);
    sums.set(keyOf(row), pair);
  };
  ours.forEach((row) => add(row, 0));
  register.forEach((row) => add(row, 1));
  return sums;
}
