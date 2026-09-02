import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { RecordAdjustmentRequest, ResolvedBatchContract } from '@lezzet/types';

import { WriteOffScreen } from './write-off-screen';
import { resetWarehouseStatus } from './warehouse-status';

/*
  D4b · STOK DÜŞÜMÜ EKRAN TESTİ (02.09).

  Ekranın kimliği iki KURALDA duruyor ve ikisi de burada sınanıyor:
  1. **Süresi geçmiş mal buraya girmez** — sebep çekmecesinde `expired` YOK. Bir gün biri onu geri
     koyarsa bu test kırılır ve kırılması gerekir: o kararı D3 veriyor, sistem zaten biliyor.
  2. **Partiden fazlası düşülemez** — tavan sayaçta; kapının reddedeceği bir iş hiç yaptırılmıyor.

  Ayrıca ekranın dili: sayaç POZİTİF adet sayıyor, kapıya EKSİ gidiyor (`direction: 'out'`).

  **Adet ve sebep 02.09'da mal kabulün kalıbına geçti** (kullanıcı kararı): sayaç solda, sebep
  sağdaki alandan çekmeceyle. Testler o yüzden artık metin yazmıyor, SAYIYOR ve çekmeceden
  seçiyor — ekranın gerçek kullanımı bu.
*/

const mockBack = jest.fn();
jest.mock('expo-router', () => {
  const react = jest.requireActual<{ useEffect: (effect: () => void, deps: unknown[]) => void }>('react');
  return {
    useRouter: () => ({ navigate: jest.fn(), back: mockBack }),
    useFocusEffect: (callback: () => void) => react.useEffect(callback, [callback]),
  };
});

const mockFetchBatches = jest.fn<
  Promise<{ data: { batches: ResolvedBatchContract[]; truncated: boolean } | null; error: string | null }>,
  []
>();
const mockRecordAdjustment = jest.fn<Promise<{ data: unknown; error: string | null }>, [RecordAdjustmentRequest]>();

jest.mock('@/lib/api/warehouse', () => ({
  fetchWarehouseBatches: () => mockFetchBatches(),
  resolveBatchCode: jest.fn(),
  recordAdjustment: (body: RecordAdjustmentRequest) => mockRecordAdjustment(body),
}));

function batch(overrides: Partial<ResolvedBatchContract> = {}): ResolvedBatchContract {
  return {
    stockId: '00000000-0000-4000-8000-000000000401',
    variantId: '00000000-0000-4000-8000-000000000501',
    name: 'Su Böreği · tepsi',
    lotNumber: 'A227-05',
    expiryDate: '2027-04-20',
    dateType: 'DLC',
    physicalQty: 4,
    storageAreaName: 'Derin dondurucu 2',
    lifePercent: 64,
    variantWarehouseQty: 46,
    ...overrides,
  };
}

beforeEach(() => {
  resetWarehouseStatus();
  mockBack.mockReset();
  mockFetchBatches.mockReset();
  mockFetchBatches.mockResolvedValue({ data: { batches: [batch()], truncated: false }, error: null });
  mockRecordAdjustment.mockReset();
  mockRecordAdjustment.mockResolvedValue({
    data: {
      status: 'ok',
      result: { ok: true, referenceNo: 'IMH-STR-26-0003', lines: 1, outQty: 2, inQty: 0, outCostCents: 0, inCostCents: 0 },
      after: { batchQty: 2, variantWarehouseQty: 44 },
    },
    error: null,
  });
});

const OPTION_DAMAGED = 'warehouse-write-off-row-option-hasar / soğuk zincir';
const OPTION_LOST = 'warehouse-write-off-row-option-kayıp';

/** Sayacın artı hücresine N kez basar — adet artık yazılmıyor, SAYILIYOR (kalıp 02.09). */
async function bumpQty(times: number) {
  for (let i = 0; i < times; i += 1) {
    await fireEvent.press(screen.getByTestId('warehouse-write-off-row-qty-increase'));
  }
}

/** Sebep alanı → çekmece → seçim. Çipler kalktı; sebep sayacın yanındaki alandan seçiliyor. */
async function pickReason(label: string) {
  await fireEvent.press(screen.getByTestId('warehouse-write-off-row-reason'));
  const option = `warehouse-write-off-row-option-${label}`;
  await waitFor(() => expect(screen.getByTestId(option)).toBeOnTheScreen());
  await fireEvent.press(screen.getByTestId(option));
}

async function selectBatch() {
  await render(<WriteOffScreen />);
  const row = await screen.findByTestId('warehouse-write-off-picker-row-00000000-0000-4000-8000-000000000401');
  await fireEvent.press(row);
  return screen.findByTestId('warehouse-write-off-context');
}

describe('D4b · Stok düşümü', () => {
  it('boş hâl kendi kuralını yazar: süresi geçmiş mal buraya girmez', async () => {
    await render(<WriteOffScreen />);

    expect(await screen.findByTestId('warehouse-write-off-picker')).toBeTruthy();
    expect(screen.queryByTestId('warehouse-write-off-qty')).toBeNull();
  });

  it('SEBEP listesinde "süresi geçti" YOKTUR — o karar D3ün', async () => {
    await selectBatch();
    await pickReason('hasar / soğuk zincir');

    // Çekmece açıldığında iki sebep var; imha (süresi geçti) hiç listelenmiyor.
    await fireEvent.press(screen.getByTestId('warehouse-write-off-row-reason'));
    await waitFor(() => expect(screen.getByTestId(OPTION_DAMAGED)).toBeOnTheScreen());
    expect(screen.getByTestId(OPTION_LOST)).toBeTruthy();
    expect(screen.queryByTestId('warehouse-write-off-row-option-süresi geçti (imha)')).toBeNull();
  });

  it('pozitif adet yazılır, kapıya ÇIKIŞ olarak gider', async () => {
    await selectBatch();

    await bumpQty(2);
    await pickReason('hasar / soğuk zincir');
    await fireEvent.press(screen.getByTestId('warehouse-write-off-cta'));

    await waitFor(() => expect(mockRecordAdjustment).toHaveBeenCalledTimes(1));
    expect(mockRecordAdjustment).toHaveBeenCalledWith({
      lines: [{ stockId: '00000000-0000-4000-8000-000000000401', qty: 2, direction: 'out' }],
      reason: 'damaged',
      note: null,
    });
  });

  it('sebep seçilmeden yazılmaz', async () => {
    await selectBatch();

    await bumpQty(2);
    await fireEvent.press(screen.getByTestId('warehouse-write-off-cta'));

    expect(mockRecordAdjustment).not.toHaveBeenCalled();
  });

  it('partide olandan fazlası düşülemez — sayaç tavanda durur', async () => {
    await selectBatch();

    // Partide 4 var; altı kez artırmayı dene.
    await bumpQty(6);

    expect(screen.getByTestId('warehouse-write-off-limit')).toBeTruthy();
    await pickReason('kayıp');
    await fireEvent.press(screen.getByTestId('warehouse-write-off-cta'));

    await waitFor(() => expect(mockRecordAdjustment).toHaveBeenCalledTimes(1));
    expect(mockRecordAdjustment.mock.calls[0]?.[0].lines[0]?.qty).toBe(4);
  });

  it('sonuç kartı sebebi, referansı ve ölçülen yeni değerleri taşır', async () => {
    await selectBatch();

    await bumpQty(2);
    await pickReason('kayıp');
    await fireEvent.press(screen.getByTestId('warehouse-write-off-cta'));

    expect(await screen.findByTestId('warehouse-write-off-result-ref')).toHaveTextContent('IMH-STR-26-0003');
    expect(screen.getByTestId('warehouse-write-off-result-batch')).toHaveTextContent('4 → 2');
    expect(screen.getByTestId('warehouse-write-off-result-variant')).toHaveTextContent('46 → 44');
  });
});
