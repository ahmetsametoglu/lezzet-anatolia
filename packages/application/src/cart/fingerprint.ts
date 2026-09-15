import { createHash } from 'node:crypto';

import type { CartEntry } from './cart-types';

/*
  Ayrı dosyada, çünkü `cart-types` tarayıcıya da giden ortak modül ve `node:crypto` onu Node'a bağlardı. İstemcinin okuduğu modül
  node-only hiçbir şey içe aktarmaz.
*/

/**
 * Sepet iki yüzeyde paylaşıldığı için ödeme ekranı açıkken altından değişebilir; parmak izi, müşterinin gördüğü liste yerine başka
 * bir sepeti onaylamasını engeller. Zaman damgası değil içerik özeti, sıra önemsiz; fiyat girmez, çünkü onun kapısı `price_changed`.
 */
export function cartFingerprint(entries: readonly CartEntry[]): string {
  const parts = entries
    .map((e) => (e.kind === 'bundle' ? `b:${e.bundleId}:${e.qty}` : `v:${e.variantId}:${e.stockId ?? '-'}:${e.qty}`))
    .sort();
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}
