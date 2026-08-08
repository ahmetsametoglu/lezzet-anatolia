import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { TransferScreen } from './transfer-screen';
import { inboundTransfer } from './warehouse-fixture';
import { resetWarehouseStatus } from './warehouse-status';

/*
  D5 EKRAN TESTİ — ekranın TAMAMI tek bir ayrımın üstünde duruyor: **boş ≠ 0**.

  · boş satır kabulü BLOKLAR (v2:474),
  · `0` geçerli bir beyandır ve gönderilir ("geldi ama kayıp"),
  · kapının `incomplete` cevabı hangi satırın sayılmadığını EKRANDA gösterir,
  · `stale` ve `failed` yutulmaz.
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
const TRANSFER = inboundTransfer();
const LINE_A = TRANSFER.lines[0]!.lineId;
const LINE_B = TRANSFER.lines[1]!.lineId;

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

function lastPostBody(): { lines: { lineId: string; receivedQty: number }[] } {
  const call = fetchMock.mock.calls.findLast((entry) => entry[1]?.method === 'POST');
  return JSON.parse(String(call?.[1]?.body ?? '{}'));
}

function withTransfers(transfers: unknown[], receive?: unknown) {
  fetchMock.mockImplementation((_url, init) => {
    if (init?.method === 'POST') {
      return Promise.resolve(ok(receive ?? { status: 'ok', transferId: TRANSFER.transferId, createdBatches: 2 }));
    }
    return Promise.resolve(ok({ transfers }));
  });
}

async function renderTransfer() {
  await render(<TransferScreen />);
  await waitFor(() => expect(screen.queryByTestId('warehouse-transfer-loading')).toBeNull());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  resetWarehouseStatus();
});

describe('D5 · rampada sayım', () => {
  it('yolda transfer yoksa boş durum çıkar', async () => {
    withTransfers([]);

    await renderTransfer();

    expect(screen.getByTestId('warehouse-transfer-empty')).toBeOnTheScreen();
  });

  it('BOŞ satır kabulü bloklar — CTA kapalı ve sebebini söyler', async () => {
    withTransfers([TRANSFER]);

    await renderTransfer();
    await fireEvent.changeText(screen.getByTestId(`warehouse-transfer-qty-${LINE_A}`), '4');

    expect(screen.getByTestId('warehouse-transfer-cta')).toHaveTextContent(/boş satır kabulü bloklar/);
    expect(screen.getByTestId('warehouse-transfer-cta')).toBeDisabled();
  });

  it('SIFIR geçerli bir beyandır: satır sayılmış sayılır ve 0 olarak GÖNDERİLİR', async () => {
    withTransfers([TRANSFER]);

    await renderTransfer();
    await fireEvent.changeText(screen.getByTestId(`warehouse-transfer-qty-${LINE_A}`), '4');
    await fireEvent.changeText(screen.getByTestId(`warehouse-transfer-qty-${LINE_B}`), '0');

    expect(screen.getByTestId('warehouse-transfer-cta')).toHaveTextContent(/Kabulü kaydet/);

    await fireEvent.press(screen.getByTestId('warehouse-transfer-cta'));
    await waitFor(() => expect(screen.getByTestId('warehouse-transfer-notice')).toBeOnTheScreen());

    expect(lastPostBody().lines).toEqual([
      { lineId: LINE_A, receivedQty: 4 },
      { lineId: LINE_B, receivedQty: 0 },
    ]);
  });

  it('kapının `incomplete` cevabı HANGİ satır olduğunu ekranda gösterir', async () => {
    withTransfers([TRANSFER], { status: 'incomplete', missingLineIds: [LINE_B], unknownLineIds: [] });

    await renderTransfer();
    await fireEvent.changeText(screen.getByTestId(`warehouse-transfer-qty-${LINE_A}`), '4');
    await fireEvent.changeText(screen.getByTestId(`warehouse-transfer-qty-${LINE_B}`), '2');
    await fireEvent.press(screen.getByTestId('warehouse-transfer-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('warehouse-transfer-notice')).toHaveTextContent(/1 satır sayılmamış/),
    );
    expect(screen.getByTestId(`warehouse-transfer-line-${LINE_B}`)).toHaveTextContent(/sayılmadı/);
  });

  it('`stale` YUTULMAZ: transferin artık hangi durumda olduğu yazılır', async () => {
    withTransfers([TRANSFER], { status: 'stale', currentStatus: 'received' });

    await renderTransfer();
    await fireEvent.changeText(screen.getByTestId(`warehouse-transfer-qty-${LINE_A}`), '4');
    await fireEvent.changeText(screen.getByTestId(`warehouse-transfer-qty-${LINE_B}`), '2');
    await fireEvent.press(screen.getByTestId('warehouse-transfer-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('warehouse-transfer-notice')).toHaveTextContent(/artık yolda değil \(kabul edildi\)/),
    );
  });

  it('RPC reddi AYNEN gösterilir — sabit bir metne indirgenmez', async () => {
    withTransfers([TRANSFER], { status: 'failed', message: 'receive_transfer: partide 3 var, 5 kabul edilemez' });

    await renderTransfer();
    await fireEvent.changeText(screen.getByTestId(`warehouse-transfer-qty-${LINE_A}`), '4');
    await fireEvent.changeText(screen.getByTestId(`warehouse-transfer-qty-${LINE_B}`), '2');
    await fireEvent.press(screen.getByTestId('warehouse-transfer-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('warehouse-transfer-notice')).toHaveTextContent(/partide 3 var, 5 kabul edilemez/),
    );
  });
});
