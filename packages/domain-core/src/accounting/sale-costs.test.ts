import { describe, expect, it } from 'vitest';
import { costsAtSale } from './sale-costs';

const UNIT = { routeDeliveryCents: 250, packagingCents: 120, doorPackagingCents: 0 };

describe('sipariş anındaki doğrudan maliyetler', () => {
  it('rota siparişi rota birim maliyetini ve paketlemeyi alır', () => {
    expect(costsAtSale('route', UNIT)).toEqual({ deliveryCostCents: 250, packagingCostCents: 120 });
  });

  it('kargo siparişinin teslimat maliyeti bilinmiyor kalır, sıfır yazılmaz', () => {
    expect(costsAtSale('shipping', UNIT).deliveryCostCents).toBeNull();
  });

  it('yerinde satışta mal gitmez, paketleme kapı maliyetidir', () => {
    expect(costsAtSale('pickup', UNIT)).toEqual({ deliveryCostCents: 0, packagingCostCents: 0 });
  });
});
