import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { CourierReturnScreen } from './courier-return-screen';
import { COURIER_RETURN_FIXTURE } from './courier-return-fixture';
import { targetQtyOf } from './use-courier-return.hook';
import { resetWarehouseStatus } from './warehouse-status';

/*
  D6 EKRAN TESTİ — üç akıbet, HEDEF değer kuralı, "stoğa dön"ün zorunlu notu, ulaşılamayanların
  KABUL EDİLMEMESİ ve para alanlarının depocuya GÖSTERİLMEMESİ.

  En kritik iddia hedef değerdir: jestte mal müşteride kalır (adet DEĞİŞMEZ), iade/imhada geri
  gelir (adet 0). Fark sistemde hesaplanır — ekran çıkarma yapmaz.
*/

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn(), back: jest.fn() }),
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

const LINE = COURIER_RETURN_FIXTURE.lines[0]!;
const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

function lastPostBody(): {
  adjustments: { orderItemId: string; fulfilledQty: number; returnDisposition: string; note: string | null }[];
} {
  const call = fetchMock.mock.calls.findLast((entry) => entry[1]?.method === 'POST');
  return JSON.parse(String(call?.[1]?.body ?? '{}'));
}

function withResult(result?: unknown) {
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      ok(
        result ?? {
          status: 'ok',
          restockedQty: 2,
          discardedQty: 0,
          releasedQty: 2,
          refundedAmountCents: 1800,
          paymentStatus: 'refunded',
          amountToCollectCents: 0,
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
});

describe('D6 · hedef değer kuralı', () => {
  it('jestte adet DEĞİŞMEZ (mal müşteride), iade ve imhada SIFIRLANIR', () => {
    expect(targetQtyOf('goodwill', 2)).toBe(2);
    expect(targetQtyOf('restock', 2)).toBe(0);
    expect(targetQtyOf('discard', 2)).toBe(0);
  });
});

describe('D6 · kurye dönüşü kabulü', () => {
  it('akıbet işaretlenmeden CTA kapalıdır', async () => {
    withResult();

    await render(<CourierReturnScreen />);

    expect(screen.getByTestId('warehouse-return-cta')).toHaveTextContent(/akıbet işaretle/);
    expect(screen.getByTestId('warehouse-return-cta')).toBeDisabled();
  });

  it('"stoğa dön" NOT ister — not boşken CTA açılmaz', async () => {
    withResult();

    await render(<CourierReturnScreen />);
    await fireEvent.press(screen.getByTestId(`warehouse-return-restock-${LINE.orderItemId}`));

    expect(screen.getByTestId(`warehouse-return-note-block-${LINE.orderItemId}`)).toBeOnTheScreen();
    expect(screen.getByTestId('warehouse-return-cta')).toBeDisabled();

    await fireEvent.changeText(
      screen.getByTestId(`warehouse-return-note-${LINE.orderItemId}`),
      'soğuk zincir kesintisiz',
    );
    expect(screen.getByTestId('warehouse-return-cta')).not.toBeDisabled();
  });

  it('imha HEDEF değeri sıfırlar ve not istemez', async () => {
    withResult();

    await render(<CourierReturnScreen />);
    await fireEvent.press(screen.getByTestId(`warehouse-return-discard-${LINE.orderItemId}`));
    await fireEvent.press(screen.getByTestId('warehouse-return-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-return-notice')).toBeOnTheScreen());
    expect(lastPostBody().adjustments).toEqual([
      { orderItemId: LINE.orderItemId, fulfilledQty: 0, returnDisposition: 'discard', note: null },
    ]);
  });

  it('jestte adet KORUNUR — mal müşteride kaldı, yalnız kayıt düşer', async () => {
    withResult();

    await render(<CourierReturnScreen />);
    await fireEvent.press(screen.getByTestId(`warehouse-return-goodwill-${LINE.orderItemId}`));
    await fireEvent.press(screen.getByTestId('warehouse-return-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-return-notice')).toBeOnTheScreen());
    expect(lastPostBody().adjustments[0]?.fulfilledQty).toBe(LINE.qty);
  });

  it('para alanları depocuya GÖSTERİLMEZ; `refundBlocked` ise SÖYLENİR', async () => {
    withResult({
      status: 'ok',
      restockedQty: 2,
      discardedQty: 0,
      releasedQty: 2,
      refundedAmountCents: 1800,
      paymentStatus: 'paid',
      amountToCollectCents: 0,
      refundBlocked: 'provider_unavailable',
    });

    await render(<CourierReturnScreen />);
    await fireEvent.press(screen.getByTestId(`warehouse-return-discard-${LINE.orderItemId}`));
    await fireEvent.press(screen.getByTestId('warehouse-return-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('warehouse-return-notice')).toHaveTextContent(/sağlayıcısı bağlı değil/),
    );
    expect(screen.queryByText(/18,00/)).toBeNull();
    expect(screen.queryByText(/€/)).toBeNull();
  });

  it('ULAŞILAMAYANLAR listelenir ama kabul edilmez — dokunulabilir değildir', async () => {
    withResult();

    await render(<CourierReturnScreen />);

    expect(screen.getByTestId('warehouse-return-unreached-LZA-26-7T4D')).toHaveTextContent(/yeniden planlanacak/);
    expect(screen.queryByTestId('warehouse-return-restock-LZA-26-7T4D')).toBeNull();
  });

  it('`stale` YUTULMAZ: sipariş artık düzeltilemez cümlesi ekranda', async () => {
    withResult({ status: 'stale', currentStatus: 'cancelled' });

    await render(<CourierReturnScreen />);
    await fireEvent.press(screen.getByTestId(`warehouse-return-discard-${LINE.orderItemId}`));
    await fireEvent.press(screen.getByTestId('warehouse-return-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('warehouse-return-notice')).toHaveTextContent(/artık bu durumda düzeltilemez/),
    );
  });
});
