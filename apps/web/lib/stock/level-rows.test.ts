import { describe, expect, it } from 'vitest';
import type { AvailableStock, ProductStockRow } from '@lezzet/types';
import { toLevelRows } from './level-rows';

/** Depoya inen bakışta eşik o deponun istisnasıdır; ağ bakışında varsayılan eşik toplamla karşılaştırılır ve depo eşiği düzenlenmez. */
const STR = '00000000-0000-4000-8000-0000000000a1';
const KEHL = '00000000-0000-4000-8000-0000000000a2';
const VARIANT = '00000000-0000-4000-8000-0000000000b1';

const product: ProductStockRow = {
  id: '00000000-0000-4000-8000-0000000000c1',
  name: { tr: 'Börek' },
  categoryId: null,
  dateType: 'DLC',
  shelfLifeDays: null,
  status: 'active',
  imageKey: null,
  imageUpdatedAt: null,
  imageFocalX: 50,
  imageFocalY: 50,
  imageZoom: 100,
  imageWidth: null,
  imageHeight: null,
  variants: [{ id: VARIANT, label: { tr: '1 kg' }, isActive: true, minStockQty: 5, sku: null }],
};

const stockAt = (warehouseId: string, availableQty: number): AvailableStock => ({
  warehouseId,
  variantId: VARIANT,
  physicalQty: availableQty,
  reservedQty: 0,
  availableQty,
  expiredDlcQty: 0,
});

const base = {
  products: [product],
  batches: [],
  categoryNames: new Map<string, string>(),
  warehouseLabels: new Map([
    [STR, { id: STR, code: 'STR', name: 'Strasbourg' }],
    [KEHL, { id: KEHL, code: 'KEHL', name: 'Kehl' }],
  ]),
};

describe('seviye satırının eşiği', () => {
  it('depo bakışı o deponun istisnasını o deponun stoğuyla karşılaştırır', () => {
    const [row] = toLevelRows({
      ...base,
      available: [stockAt(STR, 8)],
      depot: { warehouseId: STR, thresholds: new Map([[VARIANT, { defaultQty: 5, overrideQty: 10, minStockQty: 10 }]]) },
    });
    expect(row).toMatchObject({ minStockQty: 10, belowMin: true });
    expect(row?.depotThreshold).toEqual({ warehouseId: STR, defaultQty: 5, overrideQty: 10, minStockQty: 10 });
  });

  it('ağ bakışında varsayılan eşik toplamla karşılaştırılır ve depo eşiği düzenlenmez', () => {
    const [row] = toLevelRows({ ...base, available: [stockAt(STR, 2), stockAt(KEHL, 30)] });
    expect(row).toMatchObject({ minStockQty: 5, belowMin: false, depotThreshold: null });
  });
});
