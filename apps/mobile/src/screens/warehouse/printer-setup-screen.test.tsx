import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { PrinterSetupScreen } from './printer-setup-screen';
import { resetWarehouseStatus } from './warehouse-status';

/*
  BU CİHAZ · YAZICILAR (07.12 · kullanıcı kararı 29.08).

  Dört iddia:
  · iki İŞ ayrı ayrı listeleniyor (ayrım fiziksel: 4×6 kutu etiketi ↔ A6 kargo etiketi)
  · o iş için TEK yazıcı varsa seçim SORULMUYOR ama yazıcı yine GÖSTERİLİYOR
  · iki aday varsa dokunuş seçimi CİHAZA yazıyor
  · o iş için hiç yazıcı yoksa eksik SÖYLENİYOR — "yazıcı var" cümlesi hangi işin karşılıksız
    olduğunu gizlerdi
*/

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), navigate: jest.fn() }) }));

const mockSession = { access_token: 'test-token' };
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
    },
  }),
}));

/** Cihaz deposu native — bellek içi sahte; okuma/yazma yolu gerçek kodda koşuyor. */
const mockStore = new Map<string, string>();
jest.mock('@/lib/storage/device-store', () => ({
  DEVICE_STORE_KEYS: { printerChoice: 'lezzet.printer.choice' },
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

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

const KUTU_A = { id: '00000000-0000-4000-8000-0000000000a1', name: 'Masa · QL-1110', purpose: 'box', address: '10.0.0.1', model: 'QL-1110NWB', labelSize: 'DieCutW103H164' };
const KUTU_B = { id: '00000000-0000-4000-8000-0000000000a2', name: 'Depo · QL-1110', purpose: 'box', address: '10.0.0.2', model: 'QL-1110NWB', labelSize: 'DieCutW103H164' };
const KARGO = { id: '00000000-0000-4000-8000-0000000000b1', name: 'Rampa · QL-820', purpose: 'shipping', address: '10.0.0.9', model: 'QL-820NWB', labelSize: 'RollW62' };

const net: { printers: unknown[] } = { printers: [] };
fetchMock.mockImplementation(() => Promise.resolve(ok({ printers: net.printers })));

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockClear();
  resetWarehouseStatus();
  mockStore.clear();
  net.printers = [];
});

async function ekran() {
  await render(<PrinterSetupScreen />);
  await waitFor(() => expect(screen.queryByTestId('warehouse-printers-loading')).toBeNull());
}

describe('bu cihaz · yazıcılar', () => {
  it('İKİ iş ayrı listeleniyor ve tek yazıcı "tek" diye işaretli çıkıyor', async () => {
    net.printers = [KUTU_A, KARGO];
    await ekran();

    // Tek aday: seçim sorulmuyor ama yazıcı GÖSTERİLİYOR — hangi makineye basıldığını bilmek,
    // seçmek kadar önemli.
    expect(screen.getByTestId(`warehouse-printers-option-${KUTU_A.id}`)).toHaveTextContent(/tek/);
    expect(screen.getByTestId(`warehouse-printers-option-${KARGO.id}`)).toHaveTextContent(/tek/);
  });

  it('İKİ aday varsa dokunuş seçimi CİHAZA yazar — sunucuya gitmez', async () => {
    net.printers = [KUTU_A, KUTU_B, KARGO];
    await ekran();

    await fireEvent.press(screen.getByTestId(`warehouse-printers-option-${KUTU_B.id}`));

    await waitFor(() => expect(mockStore.get('lezzet.printer.choice')).toContain(KUTU_B.id));
    // Seçim yalnız cihaz deposuna yazıldı: sunucuya YAZMA isteği hiç atılmadı.
    const yazmalar = fetchMock.mock.calls.filter((c) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(c[1]?.method ?? 'GET')));
    expect(yazmalar).toHaveLength(0);
  });

  it('o iş için yazıcı YOKSA eksik söyleniyor — "yazıcı var" cümlesi onu gizlerdi', async () => {
    net.printers = [KUTU_A];
    await ekran();

    /* v3 eksikliği SONUCUYLA söylüyor (30.08): "tanımlı değil" tek başına bir durum bildirimiydi,
       "etiket alınsa da basılamaz" ise bedelini yazıyor — depocu kargo etiketini alıp elinde
       kalmasın diye. */
    expect(screen.getByTestId('warehouse-printers-shipping')).toHaveTextContent(/Tanımlı değil — etiket alınsa da basılamaz/);
    expect(screen.getByTestId('warehouse-printers-box')).not.toHaveTextContent(/Tanımlı değil/);
  });

  /* HER İŞİN KENDİ SONUCU (v3:1017, 1035): seçim bir tercih değil, bir DAVRANIŞ belirliyor ve
     ikisinin bedeli ayrı — ortak bir dipnot ikisini de yarım anlatırdı. */
  it('her grup kendi sonucunu yazar — kutu kendiliğinden basar, kargo iptal olmaz', async () => {
    net.printers = [KUTU_A];
    await ekran();

    expect(screen.getByTestId('warehouse-printers-box')).toHaveTextContent(/kendiliğinden basar/);
    expect(screen.getByTestId('warehouse-printers-shipping')).toHaveTextContent(/basım düşse bile iptal olmaz/);
  });

  it('liste alınamazsa seçim SİLİNMEZ — cihazda ne varsa duruyor', async () => {
    mockStore.set('lezzet.printer.choice', JSON.stringify({ box: KUTU_B.id }));
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('ağ yok')));
    await ekran();

    expect(screen.getByTestId('warehouse-printers-error')).toBeOnTheScreen();
    expect(mockStore.get('lezzet.printer.choice')).toContain(KUTU_B.id);
  });
});
