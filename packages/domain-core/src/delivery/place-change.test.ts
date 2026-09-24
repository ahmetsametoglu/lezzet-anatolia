import type { CartLineRoute, MeCartViewLine } from '@lezzet/types';
import { describe, expect, it } from 'vitest';
import { diffCartByPlace } from './place-change';

/* Yer değişince sepetin farkı: kalem silinmez ama her değişiklik söylenir; söylenmezse müşteri sepetini son gördüğü hâliyle hatırlar. */

type Line = Pick<MeCartViewLine, 'route' | 'name' | 'qty' | 'availableHere' | 'unitPriceCents'> & { key: string };

let counter = 0;

function line(over: Partial<Line> & { route: CartLineRoute | null }): Line {
  counter += 1;
  return { key: `v${counter}`, name: `Ürün ${counter}`, qty: 1, availableHere: null, unitPriceCents: 1_000, ...over };
}

const keyOf = (l: Line) => l.key;

describe('diffCartByPlace — sessiz daralma yok', () => {
  it('kapıdan kargoya düşen kalem bildirilir', () => {
    const before = line({ route: 'local', name: 'Baklava' });
    expect(diffCartByPlace([before], [{ ...before, route: 'shipping' }], keyOf)).toEqual([{ kind: 'to_shipping', name: 'Baklava' }]);
  });

  it('kargodan kapıya çıkan kalem de bildirilir — değişim tek yönlü değil', () => {
    const before = line({ route: 'shipping', name: 'Mantı' });
    expect(diffCartByPlace([before], [{ ...before, route: 'local' }], keyOf)).toEqual([{ kind: 'to_route', name: 'Mantı' }]);
  });

  it('yeni yerde karşılanamayan kalem "alınamıyor" olarak bildirilir', () => {
    const before = line({ route: 'local', name: 'İçli Köfte' });
    expect(diffCartByPlace([before], [{ ...before, route: 'not_shippable_here' }], keyOf)).toEqual([
      { kind: 'unavailable', name: 'İçli Köfte' },
    ]);
  });

  it('adet daralması "alınamıyor" DEĞİL kendi hâliyle bildirilir', () => {
    const before = line({ route: 'local', name: 'Mantı', qty: 5, availableHere: 9 });
    expect(diffCartByPlace([before], [{ ...before, availableHere: 2 }], keyOf)).toEqual([
      { kind: 'reduced', name: 'Mantı', qty: 5, availableHere: 2 },
    ]);
  });

  it('zaten tavanın üstündeyse yer değişimi bunu yeni haber gibi söylemez', () => {
    const before = line({ route: 'local', qty: 5, availableHere: 2 });
    expect(diffCartByPlace([before], [{ ...before, availableHere: 3 }], keyOf)).toEqual([]);
  });

  it('adet yetiyorsa sessiz kalınır — tavan var diye uyarı üretilmez', () => {
    const before = line({ route: 'local', qty: 2, availableHere: 9 });
    expect(diffCartByPlace([before], [{ ...before, availableHere: 4 }], keyOf)).toEqual([]);
  });

  it('teklif fiyatı yere bağlıdır: fiyat değişimi de bildirilir', () => {
    const before = line({ route: 'local', name: 'Gözleme', unitPriceCents: 590 });
    expect(diffCartByPlace([before], [{ ...before, unitPriceCents: 790 }], keyOf)).toEqual([
      { kind: 'price', name: 'Gözleme', fromCents: 590, toCents: 790 },
    ]);
  });

  it('yol değişimi fiyat farkını yutar — aynı olay iki satırda anlatılmaz', () => {
    const before = line({ route: 'local', name: 'Baklava', unitPriceCents: 590 });
    expect(diffCartByPlace([before], [{ ...before, route: 'shipping', unitPriceCents: 790 }], keyOf)).toEqual([
      { kind: 'to_shipping', name: 'Baklava' },
    ]);
  });

  it('fiyatı çözülemeyen satır "bedavaya düştü" diye okunmaz', () => {
    const before = line({ route: 'local', unitPriceCents: 1_000 });
    expect(diffCartByPlace([before], [{ ...before, unitPriceCents: null }], keyOf)).toEqual([]);
  });

  it('hiçbir şey değişmediyse fark boş — olmayan olay haber yapılmaz', () => {
    const same = line({ route: 'local' });
    expect(diffCartByPlace([same], [same], keyOf)).toEqual([]);
  });

  it('yeni eklenen satırın "değişimi" yoktur — kıyaslanacak önceki hâli yok', () => {
    const before = line({ route: 'local' });
    expect(diffCartByPlace([before], [before, line({ route: 'shipping' })], keyOf)).toEqual([]);
  });

  it('karşılanamayan adrese geçişte kalem "gönderilemiyor" diye bildirilir', () => {
    const before = line({ route: 'local', name: 'Baklava' });
    expect(diffCartByPlace([before], [{ ...before, route: null }], keyOf, { noDelivery: true })).toEqual([
      { kind: 'no_delivery', name: 'Baklava' },
    ]);
  });

  it('yer bilinmez hâle düştüyse "gönderemiyoruz" denmez — karşılanamama çağıranın bilgisi', () => {
    const before = line({ route: 'shipping', name: 'Mantı' });
    expect(diffCartByPlace([before], [{ ...before, route: null }], keyOf)).toEqual([]);
  });
});
