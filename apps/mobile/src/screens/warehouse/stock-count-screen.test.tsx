import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { RecordAdjustmentRequest, ResolvedBatchContract } from '@lezzet/types';

import { StockCountScreen } from './stock-count-screen';
import { resetWarehouseStatus } from './warehouse-status';

/*
  D4 · SAYIM EKRAN TESTİ (02.09) — ekranın YENİ sorusunun kanıtı.

  Sınanan şey ekranın tasarım gereği yaptığı ÜÇ dönüşüm:
  1. Depocu MUTLAK adet yazıyor (rafta 9), kapıya FARK gidiyor (−3, `direction: 'out'`).
     Aritmetiği insan yapsaydı yanlışı sessizce stoğa geçerdi — testin asıl konusu bu.
  2. Fark yoksa yazım YOK: düğme kapalı ve ne eksik olduğunu söylüyor.
  3. Fark varsa sebep ZORUNLU; seçilmeden düğme açılmıyor.

  Kapı mock'lanıyor, `fetch` değil (D3 testiyle aynı gerekçe): sınanan ekranın çizimi ve çevirisi,
  taşıma katmanı değil.
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
const mockRecordAdjustment = jest.fn<
  Promise<{ data: unknown; error: string | null }>,
  [RecordAdjustmentRequest]
>();

jest.mock('@/lib/api/warehouse', () => ({
  fetchWarehouseBatches: () => mockFetchBatches(),
  resolveBatchCode: jest.fn(),
  recordAdjustment: (body: RecordAdjustmentRequest) => mockRecordAdjustment(body),
}));

/** Kapı cevabının bir satırı — sözleşmenin şekli, ekranın değil. */
function batch(overrides: Partial<ResolvedBatchContract> = {}): ResolvedBatchContract {
  return {
    stockId: '00000000-0000-4000-8000-000000000401',
    variantId: '00000000-0000-4000-8000-000000000501',
    name: 'Su Böreği · tepsi',
    lotNumber: 'A227-05',
    expiryDate: '2027-04-20',
    dateType: 'DLC',
    physicalQty: 12,
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
      result: { ok: true, referenceNo: 'SAY-STR-26-0007', lines: 1, outQty: 3, inQty: 0, outCostCents: 0, inCostCents: 0 },
      after: { batchQty: 9, variantWarehouseQty: 43 },
    },
    error: null,
  });
});

/** Ekranı açar ve raf listesinden partiyi seçer — her testin ortak başlangıcı. */
async function selectBatch() {
  await render(<StockCountScreen />);
  const row = await screen.findByTestId('warehouse-stock-count-picker-row-00000000-0000-4000-8000-000000000401');
  await fireEvent.press(row);
  return screen.findByTestId('warehouse-stock-count-context');
}

describe('D4 · Sayım', () => {
  it('konu seçilmeden form çizilmez; raf listesi seçiciden gelir', async () => {
    await render(<StockCountScreen />);

    expect(await screen.findByTestId('warehouse-stock-count-picker')).toBeTruthy();
    expect(screen.queryByTestId('warehouse-stock-count-qty')).toBeNull();
  });

  it('bağlam kartı İKİ sayıyı birden gösterir — partide kayıtlı ve ürünün depodaki toplamı', async () => {
    await selectBatch();

    expect(screen.getByTestId('warehouse-stock-count-context-batch-qty')).toHaveTextContent('12');
    expect(screen.getByTestId('warehouse-stock-count-context-variant-qty')).toHaveTextContent('46');
  });

  it('MUTLAK adet yazılır, kapıya FARK gider (9 sayıldı → 3 adet çıkış)', async () => {
    await selectBatch();

    await fireEvent.changeText(screen.getByTestId('warehouse-stock-count-qty'), '9');
    await fireEvent.press(screen.getByTestId('warehouse-stock-count-note-yanlış sayılmıştı'));
    await fireEvent.press(screen.getByTestId('warehouse-stock-count-cta'));

    await waitFor(() => expect(mockRecordAdjustment).toHaveBeenCalledTimes(1));
    expect(mockRecordAdjustment).toHaveBeenCalledWith({
      lines: [{ stockId: '00000000-0000-4000-8000-000000000401', qty: 3, direction: 'out' }],
      reason: 'count_diff',
      note: 'yanlış sayılmıştı',
    });
  });

  it('sayım FAZLASI stoğa ekleme olarak gider (15 sayıldı → 3 adet giriş)', async () => {
    await selectBatch();

    await fireEvent.changeText(screen.getByTestId('warehouse-stock-count-qty'), '15');
    await fireEvent.press(screen.getByTestId('warehouse-stock-count-note-kayıt hatası'));
    await fireEvent.press(screen.getByTestId('warehouse-stock-count-cta'));

    await waitFor(() => expect(mockRecordAdjustment).toHaveBeenCalledTimes(1));
    expect(mockRecordAdjustment.mock.calls[0]?.[0].lines[0]).toEqual({
      stockId: '00000000-0000-4000-8000-000000000401',
      qty: 3,
      direction: 'in',
    });
  });

  it('fark yoksa yazım yok — düğme kapalı ve sebep bloğu hiç açılmıyor', async () => {
    await selectBatch();

    await fireEvent.changeText(screen.getByTestId('warehouse-stock-count-qty'), '12');

    expect(screen.queryByTestId('warehouse-stock-count-note-block')).toBeNull();
    await fireEvent.press(screen.getByTestId('warehouse-stock-count-cta'));
    expect(mockRecordAdjustment).not.toHaveBeenCalled();
  });

  it('fark varken SEBEP zorunlu — seçilmeden yazılmaz', async () => {
    await selectBatch();

    await fireEvent.changeText(screen.getByTestId('warehouse-stock-count-qty'), '9');

    expect(screen.getByTestId('warehouse-stock-count-note-block')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('warehouse-stock-count-cta'));
    expect(mockRecordAdjustment).not.toHaveBeenCalled();
  });

  it('sonuç kartı ÖLÇÜLEN iki sayıyı yazar ve olay referansını taşır', async () => {
    await selectBatch();

    await fireEvent.changeText(screen.getByTestId('warehouse-stock-count-qty'), '9');
    await fireEvent.press(screen.getByTestId('warehouse-stock-count-note-kayıt hatası'));
    await fireEvent.press(screen.getByTestId('warehouse-stock-count-cta'));

    expect(await screen.findByTestId('warehouse-stock-count-result-ref')).toHaveTextContent('SAY-STR-26-0007');
    expect(screen.getByTestId('warehouse-stock-count-result-batch')).toHaveTextContent('12 → 9');
    expect(screen.getByTestId('warehouse-stock-count-result-variant')).toHaveTextContent('46 → 43');
  });

  it('yeni değer ÖLÇÜLEMEDİYSE sayı uydurulmaz', async () => {
    mockRecordAdjustment.mockResolvedValue({
      data: {
        status: 'ok',
        result: {
          ok: true,
          referenceNo: 'SAY-STR-26-0008',
          lines: 1,
          outQty: 3,
          inQty: 0,
          outCostCents: 0,
          inCostCents: 0,
        },
        after: null,
      },
      error: null,
    });
    await selectBatch();

    await fireEvent.changeText(screen.getByTestId('warehouse-stock-count-qty'), '9');
    await fireEvent.press(screen.getByTestId('warehouse-stock-count-note-kayıt hatası'));
    await fireEvent.press(screen.getByTestId('warehouse-stock-count-cta'));

    const row = await screen.findByTestId('warehouse-stock-count-result-batch');
    expect(row).toHaveTextContent('yeni değer okunamadı');
  });

  it('konu değişince sayılan adet SIFIRLANIR — yanlış partiye tek dokunuşla yazılamaz', async () => {
    await selectBatch();

    await fireEvent.changeText(screen.getByTestId('warehouse-stock-count-qty'), '9');
    await fireEvent.press(screen.getByTestId('warehouse-stock-count-context-change'));

    const row = await screen.findByTestId('warehouse-stock-count-picker-row-00000000-0000-4000-8000-000000000401');
    await fireEvent.press(row);

    await waitFor(() => expect(screen.getByTestId('warehouse-stock-count-qty').props.value).toBe(''));
  });
});
