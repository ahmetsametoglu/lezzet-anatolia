import { markupPercent, vatBaseOf } from '@lezzet/domain-core';
import { removeVat, toCents } from '@lezzet/helper';
import type { Channel } from '@lezzet/types';
import type { PriceRow } from '@/lib/pricing/price-rows';

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
  const cents = toCents(euros);
  const ht = vatBaseOf(channel) === 'ttc' ? removeVat(cents, row.vatRate) : cents;
  return markupPercent(ht, row.costCents);
}
