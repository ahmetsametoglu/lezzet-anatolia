import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { PickupQueueOrderContract, PickupQueueResponse } from '@lezzet/types';

import { PickupScreen } from './pickup-screen';
import { resetWarehouseStatus } from './warehouse-status';

/* Taklit modülü bütünüyle değiştirir; kabuk kromu odakta `useFocusEffect` çağırır. */
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), navigate: jest.fn() }), useFocusEffect: () => undefined }));

const mockSession = { access_token: 'test-token' };
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
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

const SIPARIS: PickupQueueOrderContract = {
  orderId: '00000000-0000-4000-8000-0000000000d1',
  referenceNo: 'LZA-26-GA01',
  customerName: 'Gel-al Müşterisi',
  channel: 'b2c',
  lineCount: 2,
  boxCount: 2,
  boxes: [
    { boxNo: 1, code: 'KT-26-GA1' },
    { boxNo: 2, code: 'KT-26-GA2' },
  ],
  readyAt: null,
  waitingDays: 1,
  amountDueCents: 0,
  onAccount: false,
  paymentStatus: 'paid',
};
const KUYRUK: PickupQueueResponse = { orders: [SIPARIS], doorCollection: { cash: true, card: true } };

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(ok(KUYRUK)));
  resetWarehouseStatus();
});

async function okut(code: string) {
  await fireEvent.press(screen.getByTestId('warehouse-pickup-scan'));
  await fireEvent(screen.getByTestId('warehouse-pickup-scan-sheet'), 'scan', code);
}

// Okutma yüzen düğmededir ve yalnız seçili siparişin okutulacak kutusu varken çizilir; tüm kutular okutulunca iş teslim düğmesine geçer.
it('okutma düğmesi yalnız seçili siparişin okutulmamış kutusu varken çizilir', async () => {
  await render(<PickupScreen />);
  await waitFor(() => expect(screen.getByTestId(`warehouse-pickup-order-${SIPARIS.orderId}`)).toBeOnTheScreen());
  expect(screen.queryByTestId('warehouse-pickup-scan')).toBeNull();

  await fireEvent.press(screen.getByTestId(`warehouse-pickup-order-${SIPARIS.orderId}`));
  await okut('KT-26-GA1');
  expect(screen.getByTestId('warehouse-pickup-scan')).toBeOnTheScreen();
  expect(screen.getByTestId('warehouse-pickup-deliver')).toBeDisabled();

  await okut('KT-26-GA2');
  await waitFor(() => expect(screen.queryByTestId('warehouse-pickup-scan')).toBeNull());
  expect(screen.getByTestId('warehouse-pickup-deliver')).not.toBeDisabled();
});
