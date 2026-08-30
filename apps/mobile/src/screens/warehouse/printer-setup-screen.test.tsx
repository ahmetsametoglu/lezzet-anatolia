import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { PrinterSetupScreen } from './printer-setup-screen';
import { resetWarehouseStatus } from './warehouse-status';

/*
  BU CİHAZ · YAZICILAR (07.12 · kullanıcı kararı 29.08 · v3 yerleşimi 30.08).

  Altı iddia:
  · iki İŞ ayrı KARTTA duruyor (ayrım fiziksel: 4×6 kutu etiketi ↔ taşıyıcının kargo etiketi)
  · kartın tepesindeki yazıcı basımın GERÇEK hedefidir: tek aday varsa seçim sorulmadan o
  · aday iki ve daha fazlaysa liste çizilir ve dokunuş seçimi CİHAZA yazar
  · seçili aday listede KALIR ve işaretlidir — cihazın kararı geri alınabilir olmalı
  · hedef yoksa kart uyarıya döner ve bedeli yazar; hiç aday yoksa yön de gösterir
  · liste alınamazsa cihazdaki seçim SİLİNMEZ
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
  it('iki iş iki KARTTA; tek aday varsa hedef sorulmadan o yazıcıdır ve seçenek listesi çizilmez', async () => {
    net.printers = [KUTU_A, KARGO];
    await ekran();

    // Kartın tepesi hedefi ADIYLA söylüyor — hangi makineye basıldığını bilmek, seçmek kadar önemli.
    expect(screen.getByTestId('warehouse-printers-target-box')).toHaveTextContent(KUTU_A.name);
    expect(screen.getByTestId('warehouse-printers-target-shipping')).toHaveTextContent(KARGO.name);
    // Seçenek yoksa soru da yok: liste satırı hiç çizilmiyor.
    expect(screen.queryByTestId(`warehouse-printers-option-${KUTU_A.id}`)).toBeNull();
    // Hedefi olan kartta test düğmesi var — kâğıt harcayan fiil yalnız hedefe bağlı.
    expect(screen.getByTestId(`warehouse-printers-test-${KUTU_A.id}`)).toBeOnTheScreen();
  });

  it('İKİ aday varsa liste çizilir; dokunuş seçimi CİHAZA yazar ve seçili satır listede kalır', async () => {
    net.printers = [KUTU_A, KUTU_B, KARGO];
    await ekran();

    // İki aday = soru var: kutu kartı listeyi çiziyor, tek adaylı kargo kartı çizmiyor.
    expect(screen.getByTestId(`warehouse-printers-option-${KUTU_A.id}`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`warehouse-printers-option-${KARGO.id}`)).toBeNull();
    // Seçim yapılmadan hedef YOK: iki adaydan birini yazılımın seçmesi, kâğıdın hangi odadan
    // çıkacağına kodun karar vermesi olurdu.
    expect(screen.getByTestId('warehouse-printers-target-box')).toHaveTextContent('Tanımlı değil');

    await fireEvent.press(screen.getByTestId(`warehouse-printers-option-${KUTU_B.id}`));

    await waitFor(() => expect(mockStore.get('lezzet.printer.choice')).toContain(KUTU_B.id));
    // Seçim yalnız cihaz deposuna yazıldı: sunucuya YAZMA isteği hiç atılmadı.
    const yazmalar = fetchMock.mock.calls.filter((c) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(c[1]?.method ?? 'GET')));
    expect(yazmalar).toHaveLength(0);

    // Seçilen yazıcı kartın hedefi oldu; liste kaybolmadı — karar geri alınabilir olmalı.
    await waitFor(() => expect(screen.getByTestId('warehouse-printers-target-box')).toHaveTextContent(KUTU_B.name));
    expect(screen.getByTestId(`warehouse-printers-option-${KUTU_A.id}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`warehouse-printers-option-${KUTU_B.id}`)).toHaveTextContent(/seçili/);
    expect(screen.getByTestId(`warehouse-printers-option-${KUTU_A.id}`)).toHaveTextContent(/seç$/);
  });

  it('o iş için yazıcı YOKSA kart eksikliği bedeliyle ve yönüyle söyler', async () => {
    net.printers = [KUTU_A];
    await ekran();

    /* v3 eksikliği SONUCUYLA söylüyor (30.08): "Tanımlı değil" tek başına bir durum bildirimiydi,
       "etiket alınsa da basılamaz" ise bedelini yazıyor — depocu kargo etiketini alıp elinde
       kalmasın diye. Hiç aday yoksa ayrıca nereden tanımlandığı da yazılı: cihazda seçilecek bir
       şey yok, eksiklik sunucuda. */
    const kargo = screen.getByTestId('warehouse-printers-shipping');
    expect(kargo).toHaveTextContent(/Tanımlı değil/);
    expect(kargo).toHaveTextContent(/etiket alınsa da basılamaz/);
    expect(kargo).toHaveTextContent(/Depolar ekranından tanımlanır/);
    expect(screen.getByTestId('warehouse-printers-box')).not.toHaveTextContent(/Tanımlı değil/);
    // Hedefsiz kartta test düğmesi YOK: basılacak bir yazıcı yokken "test bas" yalan söylerdi.
    expect(screen.queryByTestId(`warehouse-printers-test-${KARGO.id}`)).toBeNull();
  });

  /* HER İŞİN KENDİ SONUCU (v3:1024, 1039): seçim bir tercih değil, bir DAVRANIŞ belirliyor ve
     ikisinin bedeli ayrı — ortak bir dipnot ikisini de yarım anlatırdı. */
  it('her kart kendi sonucunu yazar — kutu kendiliğinden basar, kargo iptal olmaz', async () => {
    net.printers = [KUTU_A];
    await ekran();

    expect(screen.getByTestId('warehouse-printers-box')).toHaveTextContent(/kendiliğinden basar/);
    expect(screen.getByTestId('warehouse-printers-shipping')).toHaveTextContent(/basım düşse bile iptal olmaz/);
  });

  /* İLK YÜK İSKELET, HALKA DEĞİL (kullanıcı kararı 30.08): halka yerleşim tutmaz — söndüğü an
     sayfa zıplar. Ölçülen şey "bir gösterge var mı" değil, YER TUTUYOR MU: kutuların yüksekliği
     yerini tuttukları iş kartının ölçüsünde olmalı. */
  it('ilk yük İSKELET çiziyor ve kutular kartın ölçüsünde yer tutuyor', async () => {
    fetchMock.mockImplementationOnce(() => new Promise<Response>(() => {}));
    await render(<PrinterSetupScreen />);

    const iskelet = await screen.findByTestId('warehouse-printers-loading');
    const yerTutucular = iskelet.children
      .filter((child): child is Exclude<(typeof iskelet.children)[number], string> => typeof child !== 'string')
      .map((child) => Number(StyleSheet.flatten(child.props.style)?.height))
      .filter((height) => Number.isFinite(height));

    // İki kart = iki kutu; her biri gerçek kart yüksekliğinde (ölçüm: tasarımın kutu kartı 128 dp).
    expect(yerTutucular).toHaveLength(2);
    for (const height of yerTutucular) expect(height).toBeGreaterThan(100);
    expect(screen.getByText('Yazıcılar yükleniyor…')).toBeOnTheScreen();
  });

  it('liste alınamazsa seçim SİLİNMEZ — cihazda ne varsa duruyor', async () => {
    mockStore.set('lezzet.printer.choice', JSON.stringify({ box: KUTU_B.id }));
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('ağ yok')));
    await ekran();

    expect(screen.getByTestId('warehouse-printers-error')).toBeOnTheScreen();
    expect(mockStore.get('lezzet.printer.choice')).toContain(KUTU_B.id);
  });
});
