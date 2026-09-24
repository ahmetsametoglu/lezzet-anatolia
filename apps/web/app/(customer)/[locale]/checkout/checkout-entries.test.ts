import { describe, expect, it } from 'vitest';
import type { CartLine } from '@/lib/cart/cart-types';
import { checkoutEntriesOf } from './checkout-types';

/* İstemci kalemleri siparişin grubuna göre önceden süzerse sunucu bu adrese gelemeyen kalemi hiç görmez ve ödeme özeti onu üstü
   çizili gösteremez. */

function line(variantId: string, route: CartLine['route']): CartLine {
  // Grup yoldan, niyet kimlikten türer; gerisi bu kararın konusu değil.
  return { kind: 'variant', variantId, stockId: null, qty: 1, route } as CartLine;
}

describe('checkoutEntriesOf', () => {
  it('kapı, kargo ve bu adrese gelemeyen kalem birlikte gider', () => {
    const lines = [line('kapi', 'local'), line('kargo', 'shipping'), line('soguk', 'not_shippable_here')];
    expect(checkoutEntriesOf(lines).map((entry) => (entry.kind === 'variant' ? entry.variantId : entry.bundleId))).toEqual([
      'kapi',
      'kargo',
      'soguk',
    ]);
  });
});
