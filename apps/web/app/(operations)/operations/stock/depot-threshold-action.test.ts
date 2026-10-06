import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Database from '@lezzet/database';

type DatabaseModule = typeof Database;

/** Depo eşiği yalnız personelin kapsamındaki depoya yazılır; eylem kapıya hedef depoyu geçirmezse kapsam dışı depoya yazardı. */
const OWN = '00000000-0000-4000-8000-0000000000d1';
const OTHER = '00000000-0000-4000-8000-0000000000d2';
const VARIANT = '00000000-0000-4000-8000-0000000000d3';
const writes: string[] = [];

vi.mock('@/lib/guard', () => ({
  requireStaff: async () => ({}),
  requireWarehouseScope: async (warehouseId?: string) => {
    if (warehouseId !== OWN) throw new Error('forbidden');
    return { user: {}, scope: { kind: 'limited', warehouseIds: [OWN] } };
  },
}));
vi.mock('@lezzet/database', async (importOriginal) => ({
  ...(await importOriginal<DatabaseModule>()),
  serviceDb: () => ({}),
  WarehouseVariantThresholdService: class {
    async set(row: { warehouseId: string; minStockQty: number }) {
      writes.push(`set:${row.warehouseId}:${row.minStockQty}`);
    }
    async clear(warehouseId: string) {
      writes.push(`clear:${warehouseId}`);
    }
  },
}));

const { setDepotThresholdAction } = await import('./actions');

beforeEach(() => {
  writes.length = 0;
});

describe('depo eşiği eylemi', () => {
  it('kapsam dışı depoya yazmaz', async () => {
    const result = await setDepotThresholdAction({ warehouseId: OTHER, variantId: VARIANT, minStockQty: 7 });
    expect(result.error).not.toBeNull();
    expect(writes).toEqual([]);
  });

  it('kapsamdaki depoda istisnayı yazar, boş değerle kaldırır', async () => {
    expect((await setDepotThresholdAction({ warehouseId: OWN, variantId: VARIANT, minStockQty: 7 })).error).toBeNull();
    expect((await setDepotThresholdAction({ warehouseId: OWN, variantId: VARIANT, minStockQty: null })).error).toBeNull();
    expect(writes).toEqual([`set:${OWN}:7`, `clear:${OWN}`]);
  });
});
