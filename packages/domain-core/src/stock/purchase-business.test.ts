import { describe, expect, it } from 'vitest';
import { purchaseOrderBusinessOf } from './purchase-business';

describe('tedarik siparişinin işi', () => {
  it('kalemlerin hedef depoları tek işe aitse sipariş o işindir; tedarikçinin varsayılanı hedefi ezmez', () => {
    expect(purchaseOrderBusinessOf({ targetBusinesses: ['qualite', 'qualite'], supplierDefault: 'lezzet' })).toEqual({
      business: 'qualite',
    });
  });

  it('iki işin deposuna giden kalemler tek siparişte durmaz', () => {
    expect(purchaseOrderBusinessOf({ targetBusinesses: ['qualite', 'lezzet'], supplierDefault: 'qualite' })).toEqual({
      problem: 'mixed_business',
    });
  });

  it('hedef yoksa tedarikçinin varsayılan işi, o da yoksa Lezzet', () => {
    expect(purchaseOrderBusinessOf({ targetBusinesses: [], supplierDefault: 'qualite' })).toEqual({ business: 'qualite' });
    expect(purchaseOrderBusinessOf({ targetBusinesses: [], supplierDefault: null })).toEqual({ business: 'lezzet' });
  });
});
