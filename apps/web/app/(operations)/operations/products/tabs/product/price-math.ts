import { markupPercent, tightestMargin, vatBaseOf } from '@lezzet/domain-core';
import { removeVat, toCents } from '@lezzet/helper';
import type { Channel } from '@lezzet/types';
import type { PriceRow } from '@/lib/pricing/price-rows';

/** Kanalın kendi tabanındaki tutarı KDV hariç gelire çevirir — marjın tek geçerli tabanı. */
function revenueHt(channel: Channel, amountCents: number, vatRate: number): number {
  return vatBaseOf(channel) === 'ttc' ? removeVat(amountCents, vatRate) : amountCents;
}

/**
 * Satır içi düzenlemede YAZILAN tutarın marjı — kutuya rakam girilirken canlı gösterilir.
 *
 * Taban farkı kritiktir: B2C tutarı KDV DAHİL, B2B hariçtir (DOMAIN §5). KDV düşülmeden hesaplanan
 * marj, oran kadar şişer ve zararına satışı kârlı gösterir. Kararın kendisi motordadır
 * (`markupPercent` · `vatBaseOf`); burada yalnız ikisi birleşir.
 *
 * `null` = maliyet bilinmiyor. Sıfır maliyet varsaymak marjı sonsuz gösterirdi.
 */
export function marginForAmount(channel: Channel, euros: number, row: Pick<PriceRow, 'costCents' | 'vatRate'>): number | null {
  if (row.costCents === null) return null;
  return markupPercent(revenueHt(channel, toCents(euros), row.vatRate), row.costCents);
}

/**
 * Fiyat YAZILDIKTAN sonra satırın yeni marjı — liste yeniden okunmadan yerinde düzeltilir.
 *
 * Satırın `marginPercent`i iki kanalın EN DARIDIR (`tightestMargin`): bir kanalı değiştirmek
 * ötekini de ilgilendirir, bu yüzden ikisi birden verilir. Kuralın kendisi motorda; burada yalnız
 * kanal tabanları hazırlanır.
 */
export function marginAfterWrite(row: PriceRow, channel: Channel, amountCents: number): number | null {
  const amounts = { b2c: row.b2c.amountCents, b2b: row.b2b.amountCents, [channel]: amountCents };
  const entries = (['b2c', 'b2b'] as const)
    .filter((key) => amounts[key] !== null)
    .map((key) => ({ channel: key, revenueHtCents: revenueHt(key, amounts[key] as number, row.vatRate) }));
  return tightestMargin(entries, row.costCents)?.percent ?? null;
}
