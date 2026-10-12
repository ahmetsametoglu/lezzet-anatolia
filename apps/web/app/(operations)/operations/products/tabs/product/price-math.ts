import { markupPercent, revenueHtOf, tightestMargin } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import type { Channel } from '@lezzet/types';
import type { PriceRow } from '@/lib/pricing/price-rows';

type MarginBasis = Pick<PriceRow, 'costCents' | 'vatRate'>;

/** Maliyet bilinmiyorsa `null`, çünkü sıfır maliyet varsaymak marjı sonsuz gösterirdi. */
function marginOfCents(channel: Channel, amountCents: number, row: MarginBasis): number | null {
  if (row.costCents === null) return null;
  return markupPercent(revenueHtOf(channel, amountCents, row.vatRate), row.costCents);
}

/** Kutuya yazılan tutarın marjı; B2C KDV dahil girildiği için KDV düşülmeden hesaplansa marj oran kadar şişerdi. */
export function marginForAmount(channel: Channel, euros: number, row: MarginBasis): number | null {
  return marginOfCents(channel, toCents(euros), row);
}

/** Hücrenin kendi marjı; satırın en dar marjını yazmak B2C'nin altına B2B'nin marjını yazmak olurdu. */
export function cellMargin(row: MarginBasis & Pick<PriceRow, 'b2c' | 'b2b'>, channel: Channel): number | null {
  const amountCents = row[channel].amountCents;
  return amountCents === null ? null : marginOfCents(channel, amountCents, row);
}

/** Yazımdan sonra satırın en dar marjı; liste yeniden okunmadan yerinde düzelir, kural motorda (`tightestMargin`). */
export function marginAfterWrite(row: PriceRow, channel: Channel, amountCents: number): number | null {
  const amounts = { b2c: row.b2c.amountCents, b2b: row.b2b.amountCents, [channel]: amountCents };
  const entries = (['b2c', 'b2b'] as const)
    .filter((key) => amounts[key] !== null)
    .map((key) => ({ channel: key, revenueHtCents: revenueHtOf(key, amounts[key] as number, row.vatRate) }));
  return tightestMargin(entries, row.costCents)?.percent ?? null;
}
