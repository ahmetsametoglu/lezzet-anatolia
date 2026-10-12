import { isRestorable, readPendingSale, type PendingSale } from './pending-sale';

/* Cihaz deposu bellek içinde: okuma ve silme gerçek koddan geçer, yalnız SecureStore sahtedir. */
const mockStore = new Map<string, string>();
jest.mock('@lezzet/mobile-kit/src/lib/storage/device-store', () => ({
  DEVICE_STORE_KEYS: { pendingSale: 'lezzet.sale.pending' },
  deviceStore: {
    getItem: async (key: string) => mockStore.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStore.set(key, value);
    },
    removeItem: async (key: string) => {
      mockStore.delete(key);
    },
  },
}));

beforeEach(() => mockStore.clear());

const sale: PendingSale = {
  key: 'sale-1',
  account: 'depo@example.test',
  place: 'facility',
  warehouseId: 'depo-1',
  createdAt: new Date('2026-10-12T08:00:00').toISOString(),
  payment: 'cash',
  lines: [
    {
      variantId: 'v-1',
      name: 'Simit',
      qty: 1,
      listPriceCents: 450,
      negotiatedCents: null,
      availableHere: 4,
      image: { url: null, crop: { x: 50, y: 50, zoom: 100 }, frames: null },
    },
  ],
};

describe('bekleyen satışın geri yüklenmesi', () => {
  it('yalnız aynı hesap, yer, depo ve günde geri yüklenir — başkasında sunucuya hiç ulaşmamış satış yanlış yere yazılırdı', () => {
    const now = new Date('2026-10-12T18:30:00');
    const at = { account: 'depo@example.test', place: 'facility' as const, warehouseId: 'depo-1', now };

    expect(isRestorable(sale, at)).toBe(true);
    expect(isRestorable(sale, { ...at, account: 'kurye@example.test' })).toBe(false);
    expect(isRestorable(sale, { ...at, place: 'van' })).toBe(false);
    expect(isRestorable(sale, { ...at, warehouseId: 'depo-2' })).toBe(false);
    expect(isRestorable(sale, { ...at, now: new Date('2026-10-13T07:00:00') })).toBe(false);
  });

  it('bozuk kayıt satış ekranını kilitlemez — okunmaz ve silinir', async () => {
    mockStore.set('lezzet.sale.pending', '{"key": "sale-1"');

    expect(await readPendingSale()).toBeNull();
    expect(mockStore.has('lezzet.sale.pending')).toBe(false);
  });
});
