import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { PreparationScreen } from './preparation-screen';
import { ITEM_A, ITEM_B, ORDER_ID, STOCK_A, STOCK_B, preparationLine, preparationOrder } from './warehouse-fixture';
import { resetWarehouseStatus } from './warehouse-status';

/*
  D1 EKRAN TESTİ — kuyruk/seçim, adet tavanı, "tamamı", eksik bildirimi, CTA'nın üç hâli, çıpalı
  kalem uyarısı ve kapının DÖRT cevabının ekrana çıkışı.

  En kritik iki iddia:
  · **gönderilen partiler motorun önerdiği partilerdir** — uydurulmuş bir `stockId`, geri çağırmanın
    dayandığı kaydı bozar;
  · **`pinned_violation` GÖSTERİLİR** — hiçbir şeyin yazılmadığını söyleyen tek cümle odur.

  23.6'DAN SONRA BU DOSYA ESKİ (KUTUSUZ) AKIŞI ÖLÇER: taze sipariş artık kutu moduyla açılıyor
  (`picking-box.test.tsx`), eski akış yalnız KUTUSUZ BAŞLANMIŞ işte yaşıyor — o yüzden onay/CTA
  testlerinin fikstürleri `pickedQty > 0` taşır (web masasından yarım gelmiş iş). Satır-düzeyi
  testler (tavan, çıpa) iki modda da aynı bileşeni kullandığından fikstürleri değişmedi.
*/

jest.mock('expo-router', () => {
  const react = jest.requireActual<{ useEffect: (effect: () => void, deps: unknown[]) => void }>('react');
  return {
    useRouter: () => ({ navigate: jest.fn(), back: jest.fn() }),
    useFocusEffect: (callback: () => void) => react.useEffect(callback, [callback]),
  };
});

const mockSession = { access_token: 'test-token' };
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
    },
  }),
}));

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

/** Son POST'un gövdesi — "ne gönderdik" sorusunun tek dürüst cevabı. */
function lastPostBody(): { picks: { orderItemId: string; batches: { stockId: string; qty: number }[] }[] } {
  const call = fetchMock.mock.calls.findLast((entry) => entry[1]?.method === 'POST');
  return JSON.parse(String(call?.[1]?.body ?? '{}'));
}

function withQueue(orders: unknown[], confirm?: unknown) {
  fetchMock.mockImplementation((_url, init) => {
    if (init?.method === 'POST') {
      return Promise.resolve(ok(confirm ?? { status: 'ok', items: 1, ready: true, shortfalls: [] }));
    }
    return Promise.resolve(ok({ date: null, orders }));
  });
}

async function renderPicking() {
  await render(<PreparationScreen />);
  await waitFor(() => expect(screen.queryByTestId('warehouse-picking-loading')).toBeNull());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  resetWarehouseStatus();
});

describe('D1 · kuyruk', () => {
  it('sipariş yoksa boş durum çıkar — form açılmaz', async () => {
    withQueue([]);

    await renderPicking();

    expect(screen.getByTestId('warehouse-picking-empty')).toBeOnTheScreen();
    expect(screen.queryByTestId('warehouse-picking-cta')).toBeNull();
  });

  it('TEK sipariş doğrudan açılır (tasarımın hâli)', async () => {
    withQueue([preparationOrder()]);

    await renderPicking();

    expect(screen.getByTestId(`warehouse-picking-line-${ITEM_A}`)).toBeOnTheScreen();
  });

  it('İKİ sipariş varsa önce SEÇİM sorulur — hangi koli olduğu uydurulmaz', async () => {
    withQueue([preparationOrder(), preparationOrder({ orderId: '00000000-0000-4000-8000-000000000002' })]);

    await renderPicking();

    expect(screen.getByTestId('warehouse-picking-queue')).toBeOnTheScreen();
    expect(screen.queryByTestId(`warehouse-picking-line-${ITEM_A}`)).toBeNull();

    await fireEvent.press(screen.getByTestId(`warehouse-picking-order-${ORDER_ID}`));
    expect(screen.getByTestId(`warehouse-picking-line-${ITEM_A}`)).toBeOnTheScreen();
  });
});

describe('D1 · sayım', () => {
  it('CTA sayım bitmeden KAPALIDIR', async () => {
    withQueue([preparationOrder({ lines: [preparationLine({ pickedQty: 1 })] })]);

    await renderPicking();

    expect(screen.getByTestId('warehouse-picking-cta')).toHaveTextContent(/Kalem kalem say/);
    expect(screen.getByTestId('warehouse-picking-cta')).toBeDisabled();
  });

  it('"tamamı" motorun kapasitesine kadar doldurur ve CTA "Sipariş HAZIR"a döner', async () => {
    withQueue([preparationOrder({ lines: [preparationLine({ pickedQty: 1 })] })]);

    await renderPicking();
    await fireEvent.press(screen.getByTestId(`warehouse-picking-all-${ITEM_A}`));

    expect(screen.getByTestId(`warehouse-picking-qty-${ITEM_A}`).props.value).toBe('2');
    expect(screen.getByTestId('warehouse-picking-cta')).toHaveTextContent(/Sipariş HAZIR/);
  });

  it('adet MOTORUN kapasitesini aşamaz — rafta olmayan mal yazılamaz', async () => {
    withQueue([preparationOrder({ lines: [preparationLine({ orderedQty: 5, shortfallQty: 3 })] })]);

    await renderPicking();
    await fireEvent.changeText(screen.getByTestId(`warehouse-picking-qty-${ITEM_A}`), '5');

    // Öneri 2 adet taşıyor; 5 yazılsa da tavan 2'dir.
    expect(screen.getByTestId(`warehouse-picking-qty-${ITEM_A}`).props.value).toBe('2');
    expect(screen.getByTestId(`warehouse-picking-line-${ITEM_A}`)).toHaveTextContent(/raf eksiği: 3/);
  });

  it('"eksik bildir" CTA kapısını açar ama cümlesini DEĞİŞTİRİR — sipariş hazır olmaz', async () => {
    withQueue([preparationOrder({ lines: [preparationLine({ pickedQty: 1 })] })]);

    await renderPicking();
    await fireEvent.press(screen.getByTestId(`warehouse-picking-short-${ITEM_A}`));

    expect(screen.getByTestId('warehouse-picking-cta')).toHaveTextContent(/Hazırlanıyor/);
  });

  it('çıpalı kalem UYARIYI taşır — indirimli teklifin partisi bellidir', async () => {
    withQueue([preparationOrder({ lines: [preparationLine({ pinnedStockId: STOCK_A })] })]);

    await renderPicking();

    expect(screen.getByTestId(`warehouse-picking-pinned-${ITEM_A}`)).toBeOnTheScreen();
  });

  it('daha önce yazılmış adet SÖYLENİR — yeni kayıt onun yerine geçer', async () => {
    withQueue([preparationOrder({ lines: [preparationLine({ pickedQty: 1 })] })]);

    await renderPicking();

    expect(screen.getByTestId(`warehouse-picking-previous-${ITEM_A}`)).toHaveTextContent(/önceden 1 yazılmış/);
  });
});

describe('D1 · gönderim', () => {
  it('gönderilen partiler MOTORUN önerdiği partilerdir, sırasıyla', async () => {
    withQueue([
      preparationOrder({
        lines: [
          preparationLine({
            orderedQty: 3,
            pickedQty: 1,
            suggestion: [
              { stockId: STOCK_A, qty: 2, expiryDate: '2026-08-12', areaName: null },
              { stockId: STOCK_B, qty: 1, expiryDate: '2026-08-18', areaName: null },
            ],
          }),
        ],
      }),
    ]);

    await renderPicking();
    await fireEvent.press(screen.getByTestId(`warehouse-picking-all-${ITEM_A}`));
    await fireEvent.press(screen.getByTestId('warehouse-picking-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-picking-notice')).toBeOnTheScreen());
    expect(lastPostBody().picks).toEqual([
      { orderItemId: ITEM_A, batches: [{ stockId: STOCK_A, qty: 2 }, { stockId: STOCK_B, qty: 1 }] },
    ]);
  });

  it('yarım iş HATA DEĞİL: `ready:false` "sürüyor" der ve eksik tavsiyesi yazılır', async () => {
    withQueue([preparationOrder({ lines: [preparationLine({ pickedQty: 1 }), preparationLine({ itemId: ITEM_B })] })], {
      status: 'ok',
      items: 2,
      ready: false,
      shortfalls: [{ itemId: ITEM_B, suggestion: { action: 'ask_customer', reason: 'high_value', missingQty: 1 } }],
    });

    await renderPicking();
    await fireEvent.press(screen.getByTestId(`warehouse-picking-all-${ITEM_A}`));
    await fireEvent.press(screen.getByTestId(`warehouse-picking-all-${ITEM_B}`));
    await fireEvent.press(screen.getByTestId('warehouse-picking-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-picking-notice')).toBeOnTheScreen());
    const notice = screen.getByTestId('warehouse-picking-notice');
    expect(notice).toHaveTextContent(/Hazırlanıyor.*sürüyor/);
    expect(notice).toHaveTextContent(/1 adet eksik — değerli kalem; öneri: müşteriye sorulsun/);
  });

  it('`pinned_violation` GÖSTERİLİR — hiçbir satır yazılmadı', async () => {
    withQueue([preparationOrder({ lines: [preparationLine({ pickedQty: 1 })] })], { status: 'pinned_violation', itemId: ITEM_A, requiredStockId: STOCK_B });

    await renderPicking();
    await fireEvent.press(screen.getByTestId(`warehouse-picking-all-${ITEM_A}`));
    await fireEvent.press(screen.getByTestId('warehouse-picking-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('warehouse-picking-notice')).toHaveTextContent(/çıpalı partiden verilmeli/),
    );
  });

  it('kapsam dışı sipariş 200 ile gelir ve EKRANDA görünür', async () => {
    withQueue([preparationOrder({ lines: [preparationLine({ pickedQty: 1 })] })], { status: 'forbidden', reason: 'out_of_scope' });

    await renderPicking();
    await fireEvent.press(screen.getByTestId(`warehouse-picking-all-${ITEM_A}`));
    await fireEvent.press(screen.getByTestId('warehouse-picking-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('warehouse-picking-notice')).toHaveTextContent(/başka deponun/),
    );
  });
});
