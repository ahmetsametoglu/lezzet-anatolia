import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AdjustmentScreen } from './adjustment-screen';
import { toRequestQty } from './use-adjustment.hook';
import { STOCK_A } from './warehouse-fixture';
import { resetWarehouseStatus } from './warehouse-status';

/*
  D4 EKRAN TESTİ — bu ekranın EN KRİTİK iddiası işaretin ters çevrilmesidir.

  Ekranda eksi "stoktan düştü"dür (operatörün dili), kayıtta düşüm ARTI yazılır (`stock_adjustment.qty`
  bir KAYIP sütunudur). Sessiz bir işaret hatası burada stoğu düşürmek yerine ARTIRIR ve kimse fark
  etmez — o yüzden hem saf çevirinin hem gönderilen gövdenin testi var.

  Diğer iddialar: `return_restock` seçeneğinin HİÇ ÇİZİLMEMESİ, fazlanın yalnız sayım farkında ve
  NOTLA yazılabilmesi, belge numarasının kayıttan ÖNCE uydurulmaması ve RPC reddinin aynen gösterimi.
*/

const mockParams: Record<string, string> = { stockId: STOCK_A, code: 'P-0641', name: 'Kaymaklı Baklava · 1 kg' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

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

function lastPostBody(): { lines: { stockId: string; qty: number }[]; reason: string; note: string | null } {
  const call = fetchMock.mock.calls.findLast((entry) => entry[1]?.method === 'POST');
  return JSON.parse(String(call?.[1]?.body ?? '{}'));
}

function withResult(result?: unknown) {
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      ok(
        result ?? {
          status: 'ok',
          result: { ok: true, referenceNo: 'IMH-STR-26-0004', lines: 1, totalQty: 4, costTotalCents: 1600 },
        },
      ),
    ),
  );
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  resetWarehouseStatus();
  mockParams.stockId = STOCK_A;
});

describe('D4 · işaret çevrimi', () => {
  it('ekranın eksisi kayıtta ARTI olur (düşüm), artısı EKSİ (geri ekleme)', () => {
    expect(toRequestQty(-4)).toBe(4);
    expect(toRequestQty(2)).toBe(-2);
  });
});

describe('D4 · sayım / düzeltme', () => {
  it('partisiz açılırsa form ÇİZİLMEZ — neyin düşeceği belirsiz bir kayıt yazılmaz', async () => {
    mockParams.stockId = '';
    withResult();

    await render(<AdjustmentScreen />);

    expect(screen.getByTestId('warehouse-adjustment-no-subject')).toBeOnTheScreen();
    expect(screen.queryByTestId('warehouse-adjustment-cta')).toBeNull();
  });

  it('DÖRT sebep çizilir; "iade stoğa döndü" depocuya AÇILMAZ', async () => {
    withResult();

    await render(<AdjustmentScreen />);

    for (const reason of ['expired', 'damaged', 'count_diff', 'lost']) {
      expect(screen.getByTestId(`warehouse-adjustment-reason-${reason}`)).toBeOnTheScreen();
    }
    expect(screen.queryByTestId('warehouse-adjustment-reason-return_restock')).toBeNull();
  });

  it('belge numarası kayıttan ÖNCE uydurulmaz, SONRA gerçeği yazılır', async () => {
    withResult();

    await render(<AdjustmentScreen />);
    expect(screen.getByTestId('warehouse-adjustment-ref')).toHaveTextContent(/kayıttan sonra verilir/);

    await fireEvent.press(screen.getByTestId('warehouse-adjustment-reason-expired'));
    await fireEvent.changeText(screen.getByTestId('warehouse-adjustment-qty'), '-4');
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-adjustment-ref')).toHaveTextContent('IMH-STR-26-0004'));
  });

  it('DÜŞÜM gövdeye ters işaretle gider', async () => {
    withResult();

    await render(<AdjustmentScreen />);
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-reason-expired'));
    await fireEvent.changeText(screen.getByTestId('warehouse-adjustment-qty'), '-4');
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-adjustment-notice')).toBeOnTheScreen());
    expect(lastPostBody()).toEqual({ lines: [{ stockId: STOCK_A, qty: 4 }], reason: 'expired', note: null });
  });

  it('FAZLA yalnız sayım farkında yazılabilir — başka sebeple uyarı çıkar ve CTA kapalı kalır', async () => {
    withResult();

    await render(<AdjustmentScreen />);
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-reason-lost'));
    await fireEvent.changeText(screen.getByTestId('warehouse-adjustment-qty'), '2');

    expect(screen.getByTestId('warehouse-adjustment-surplus-warning')).toBeOnTheScreen();
    expect(screen.getByTestId('warehouse-adjustment-cta')).toBeDisabled();
  });

  it('FAZLA sayım farkında NOTLA yazılır; not boşken CTA kapalıdır', async () => {
    withResult();

    await render(<AdjustmentScreen />);
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-reason-count_diff'));
    await fireEvent.changeText(screen.getByTestId('warehouse-adjustment-qty'), '2');

    expect(screen.getByTestId('warehouse-adjustment-note-block')).toBeOnTheScreen();
    expect(screen.getByTestId('warehouse-adjustment-cta')).toBeDisabled();

    await fireEvent.changeText(screen.getByTestId('warehouse-adjustment-note'), 'sayımda 2 adet fazla çıktı');
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-adjustment-notice')).toBeOnTheScreen());
    expect(lastPostBody()).toEqual({
      lines: [{ stockId: STOCK_A, qty: -2 }],
      reason: 'count_diff',
      note: 'sayımda 2 adet fazla çıktı',
    });
  });

  it('RPC reddi AYNEN gösterilir — "partide 3 var, 5 düşülemez" (21.11c)', async () => {
    withResult({ status: 'failed', message: 'adjust_stock_batch: partide 3 adet var, 5 adet düşülemez' });

    await render(<AdjustmentScreen />);
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-reason-expired'));
    await fireEvent.changeText(screen.getByTestId('warehouse-adjustment-qty'), '-5');
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('warehouse-adjustment-notice')).toHaveTextContent(/partide 3 adet var, 5 adet düşülemez/),
    );
  });

  it('kapsam dışı parti EKRANDA görünür — hangi partinin dışarıda kaldığı kaybolmaz', async () => {
    withResult({ status: 'forbidden', reason: 'out_of_scope', stockIds: [STOCK_A] });

    await render(<AdjustmentScreen />);
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-reason-damaged'));
    await fireEvent.changeText(screen.getByTestId('warehouse-adjustment-qty'), '-1');
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('warehouse-adjustment-notice')).toHaveTextContent(/başka deponun/),
    );
  });
});
