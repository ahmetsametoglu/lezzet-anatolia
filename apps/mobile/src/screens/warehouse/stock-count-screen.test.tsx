import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { RecordAdjustmentRequest, ResolvedBatchContract, WarehouseAreaContract } from '@lezzet/types';

import { resetActiveArea } from '@/lib/operations/area-choice';
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
const mockFetchAreas = jest.fn<Promise<{ data: { areas: WarehouseAreaContract[] } | null; error: string | null }>, []>();
const mockMarkSeen = jest.fn<Promise<{ data: unknown; error: string | null }>, [string, string]>();

jest.mock('@/lib/api/warehouse', () => ({
  fetchWarehouseBatches: () => mockFetchBatches(),
  fetchWarehouseAreas: () => mockFetchAreas(),
  markBatchSeen: (stockId: string, areaId: string) => mockMarkSeen(stockId, areaId),
  resolveBatchCode: jest.fn(),
  recordAdjustment: (body: RecordAdjustmentRequest) => mockRecordAdjustment(body),
}));

const FREEZER_1 = '00000000-0000-4000-8000-000000000601';
const FREEZER_2 = '00000000-0000-4000-8000-000000000602';

/** Kapı cevabının bir satırı — sözleşmenin şekli, ekranın değil. */
function batch(overrides: Partial<ResolvedBatchContract> = {}): ResolvedBatchContract {
  return {
    stockId: '00000000-0000-4000-8000-000000000401',
    variantId: '00000000-0000-4000-8000-000000000501',
    name: 'Su Böreği · tepsi',
    batchNo: 'PRT-STR-26-0401',
    lotNumber: 'A227-05',
    expiryDate: '2027-04-20',
    dateType: 'DLC',
    physicalQty: 12,
    storageAreaName: 'Derin dondurucu 2',
    imageUrl: null,
    storageAreaId: FREEZER_2,
    lifePercent: 64,
    variantWarehouseQty: 46,
    caseSizes: [],
    ...overrides,
  };
}

beforeEach(() => {
  resetWarehouseStatus();
  resetActiveArea();
  mockBack.mockReset();
  mockFetchBatches.mockReset();
  mockFetchBatches.mockResolvedValue({ data: { batches: [batch()], truncated: false }, error: null });
  mockFetchAreas.mockReset();
  mockFetchAreas.mockResolvedValue({
    data: {
      areas: [
        { id: FREEZER_1, name: 'Derin dondurucu 1', kind: 'frozen', sortOrder: 0 },
        { id: FREEZER_2, name: 'Derin dondurucu 2', kind: 'frozen', sortOrder: 1 },
      ],
    },
    error: null,
  });
  mockMarkSeen.mockReset();
  mockMarkSeen.mockResolvedValue({ data: { status: 'ok', changed: true, storageAreaName: 'Derin dondurucu 1' }, error: null });
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

/**
 * Raftaki adedi ÇEKMECEDEN girer (kullanıcı kararı 02.09): büyük rakam artık bir düğme, klavye
 * değil adet çekmecesini açıyor — mal kabuldeki cetvelin aynısı. Test de gerçek kullanımı izliyor.
 */
async function countOnShelf(qty: number) {
  await fireEvent.press(screen.getByTestId('warehouse-stock-count-qty-value-hit'));
  const cell = `warehouse-stock-count-qty-sheet-ruler-${qty}`;
  await waitFor(() => expect(screen.getByTestId(cell)).toBeOnTheScreen());
  await fireEvent.press(screen.getByTestId(cell));
  await fireEvent.press(screen.getByTestId('warehouse-stock-count-qty-sheet-confirm'));
}

/** Ekranı açar ve raf listesinden partiyi seçer — her testin ortak başlangıcı. */
async function selectBatch() {
  await render(<StockCountScreen />);
  const row = await screen.findByTestId('warehouse-stock-count-picker-row-00000000-0000-4000-8000-000000000401');
  await fireEvent.press(row);
  return screen.findByTestId('warehouse-stock-count-context');
}

describe('D4 · Sayım', () => {
  it('BÜYÜK SAYI için rakamla giriş var — cetvel 24te bitiyor, tuş takımı bitmiyor', async () => {
    /*
      Kullanıcının sorusundan doğdu (02.09): *"ortaya tıklandığında doğrudan sayı klavyesi açılsa
      daha mı hızlı olur?"* Ölçüm ikisini de haklı buldu — cetvel 0–24'ü tek dokunuşla veriyor ama
      orada bitiyor; ötesi yalnız ±1. Bu test o kapının açık olduğunu çiviliyor.
    */
    await selectBatch();

    await fireEvent.press(screen.getByTestId('warehouse-stock-count-qty-value-hit'));
    await waitFor(() => expect(screen.getByTestId('warehouse-stock-count-qty-sheet-keypad-open')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('warehouse-stock-count-qty-sheet-keypad-open'));

    await fireEvent.press(screen.getByTestId('warehouse-stock-count-qty-sheet-keypad-key-4'));
    await fireEvent.press(screen.getByTestId('warehouse-stock-count-qty-sheet-keypad-key-0'));
    await fireEvent.press(screen.getByTestId('warehouse-stock-count-qty-sheet-keypad-confirm'));

    // Sayı ekrana geçti ve fark cümlesi onu okudu (sistemde 12 vardı).
    expect(screen.getByTestId('warehouse-stock-count-qty-value')).toHaveTextContent('40');
  });

  /* İSKELETİN ALTINDA BAYAT SATIR YOK (kullanıcı bulgusu 03.09): arama turu sürerken önceki
     turun satırları çizilmez — depocu yükleniyor görünen bir listede eski satıra basamaz. */
  it('arama turu sürerken yalnız iskelet çizilir, önceki satırlar gizlenir', async () => {
    await render(<StockCountScreen />);
    await screen.findByTestId('warehouse-stock-count-picker-row-00000000-0000-4000-8000-000000000401');

    // İkinci tur hiç dönmesin: yükleme hâli açıkta kalsın.
    mockFetchBatches.mockReturnValue(new Promise(() => undefined));
    await fireEvent.changeText(screen.getByTestId('warehouse-stock-count-picker-search'), 'bakl');

    await waitFor(() => expect(screen.getByTestId('warehouse-stock-count-picker-loading')).toBeOnTheScreen());
    expect(screen.queryByTestId('warehouse-stock-count-picker-row-00000000-0000-4000-8000-000000000401')).toBeNull();
  });

  it('satırın solunda ürün karesi var — kapaksız üründe monogram', async () => {
    await render(<StockCountScreen />);
    // Kare SÜSTÜR (adı satır zaten okuyor) ve erişilebilirlikten gizli; sorgu onu bilerek dahil ediyor.
    expect(
      await screen.findByTestId('warehouse-stock-count-picker-row-thumb-00000000-0000-4000-8000-000000000401', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
  });

  /* PARTİ ≠ LOT (kullanıcı kararı 03.09): satır PARTİ NUMARASIYLA anılır, lot rozette ve yalnız
     varsa. Lotsuz parti "lot yazılmamış" değil, numarasıyla listelenir. */
  it('satır parti numarasını yazar, lotu rozette gösterir; lotsuz partide rozet yok', async () => {
    mockFetchBatches.mockResolvedValue({
      data: {
        batches: [batch(), batch({ stockId: '00000000-0000-4000-8000-000000000402', batchNo: 'PRT-STR-26-0402', lotNumber: null })],
        truncated: false,
      },
      error: null,
    });
    await render(<StockCountScreen />);

    const withLot = await screen.findByTestId('warehouse-stock-count-picker-row-00000000-0000-4000-8000-000000000401');
    expect(withLot).toHaveTextContent(/PRT-STR-26-0401/);
    expect(screen.getByTestId('warehouse-stock-count-picker-row-lot-00000000-0000-4000-8000-000000000401')).toHaveTextContent('lot A227-05');

    const withoutLot = screen.getByTestId('warehouse-stock-count-picker-row-00000000-0000-4000-8000-000000000402');
    expect(withoutLot).toHaveTextContent(/PRT-STR-26-0402/);
    expect(screen.queryByTestId('warehouse-stock-count-picker-row-lot-00000000-0000-4000-8000-000000000402')).toBeNull();
    expect(withoutLot).not.toHaveTextContent(/lot yazılmamış/);
  });

  it('bağlam kartı parti numarasıyla açılır, lot ikinci satırda', async () => {
    await selectBatch();

    expect(screen.getByTestId('warehouse-stock-count-context')).toHaveTextContent(/PRT-STR-26-0401/);
    expect(screen.getByTestId('warehouse-stock-count-context-lot')).toHaveTextContent('lot A227-05');
  });

  it('konu seçilmeden form çizilmez; raf listesi seçiciden gelir', async () => {
    await render(<StockCountScreen />);

    expect(await screen.findByTestId('warehouse-stock-count-picker')).toBeTruthy();
    expect(screen.queryByTestId('warehouse-stock-count-qty-value')).toBeNull();
  });

  it('bağlam kartı İKİ sayıyı birden gösterir — partide kayıtlı ve ürünün depodaki toplamı', async () => {
    await selectBatch();

    expect(screen.getByTestId('warehouse-stock-count-context-batch-qty')).toHaveTextContent('12');
    expect(screen.getByTestId('warehouse-stock-count-context-variant-qty')).toHaveTextContent('46');
  });

  it('MUTLAK adet yazılır, kapıya FARK gider (9 sayıldı → 3 adet çıkış)', async () => {
    await selectBatch();

    await countOnShelf(9);
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

    await countOnShelf(15);
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

    await countOnShelf(12);

    expect(screen.queryByTestId('warehouse-stock-count-note-block')).toBeNull();
    await fireEvent.press(screen.getByTestId('warehouse-stock-count-cta'));
    expect(mockRecordAdjustment).not.toHaveBeenCalled();
  });

  it('fark varken SEBEP zorunlu — seçilmeden yazılmaz', async () => {
    await selectBatch();

    await countOnShelf(9);

    expect(screen.getByTestId('warehouse-stock-count-note-block')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('warehouse-stock-count-cta'));
    expect(mockRecordAdjustment).not.toHaveBeenCalled();
  });

  it('sonuç kartı ÖLÇÜLEN iki sayıyı yazar ve olay referansını taşır', async () => {
    await selectBatch();

    await countOnShelf(9);
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

    await countOnShelf(9);
    await fireEvent.press(screen.getByTestId('warehouse-stock-count-note-kayıt hatası'));
    await fireEvent.press(screen.getByTestId('warehouse-stock-count-cta'));

    const row = await screen.findByTestId('warehouse-stock-count-result-batch');
    expect(row).toHaveTextContent('yeni değer okunamadı');
  });

  /*
    "HANGİ DOLABIN ÖNÜNDESİN" (kullanıcı kararı 03.09): partinin alanı son görüldüğü yerdir ve
    taşıma kaydı YOK. Üç iddia: aktif dolap seçilip başka dolabın partisi seçilince adres yazılır ve
    kart yeni adresi gösterir · parti zaten o dolaptaysa tel açılmaz · dolap seçilmemişse hiç yazım
    yok (seçim isteğe bağlı, yokluğu sayımı değiştirmez).
  */
  it('aktif dolap seçiliyken başka dolabın partisi seçilince ADRES yazılır ve kart yeni adresi okur', async () => {
    await render(<StockCountScreen />);
    await fireEvent.press(await screen.findByTestId(`warehouse-stock-count-picker-area-${FREEZER_1}`));
    await fireEvent.press(await screen.findByTestId('warehouse-stock-count-picker-row-00000000-0000-4000-8000-000000000401'));

    await waitFor(() => expect(mockMarkSeen).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000401', FREEZER_1));
    await waitFor(() => expect(screen.getByTestId('warehouse-stock-count-context')).toHaveTextContent(/Derin dondurucu 1/));
  });

  it('parti zaten seçili dolaptaysa adres YAZILMAZ', async () => {
    await render(<StockCountScreen />);
    await fireEvent.press(await screen.findByTestId(`warehouse-stock-count-picker-area-${FREEZER_2}`));
    await fireEvent.press(await screen.findByTestId('warehouse-stock-count-picker-row-00000000-0000-4000-8000-000000000401'));

    await screen.findByTestId('warehouse-stock-count-context');
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it('dolap seçilmemişse adres yazımı yok — seçim isteğe bağlı', async () => {
    await selectBatch();
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it('konu değişince sayılan adet SIFIRLANIR — yanlış partiye tek dokunuşla yazılamaz', async () => {
    await selectBatch();

    await countOnShelf(9);
    await fireEvent.press(screen.getByTestId('warehouse-stock-count-context-change'));

    const row = await screen.findByTestId('warehouse-stock-count-picker-row-00000000-0000-4000-8000-000000000401');
    await fireEvent.press(row);

    await waitFor(() => expect(screen.getByTestId('warehouse-stock-count-qty-value')).toHaveTextContent('—'));
  });
});
