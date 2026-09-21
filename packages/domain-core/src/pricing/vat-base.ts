import type { Channel } from '@lezzet/types';

/** Kanalın KDV tabanı: B2C dahil (TTC), B2B hariç (HT) — DOMAIN §5. */
export type VatBase = 'ttc' | 'ht';

export function vatBaseOf(channel: Channel): VatBase {
  return channel === 'b2c' ? 'ttc' : 'ht';
}
