import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { CourierDayResponse, CourierRunDetail, StartCourierDayResponse } from '@lezzet/types';

import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import { courierDay, courierDayRun, courierStop } from './courier-fixture';
import { CourierVanRunsScreen } from './van-runs-screen';

/*
  K · ARAÇTAKİ SEFERLER (v3:15) — 31.08'de doğan ekran.

  ── NE ÖLÇÜLÜYOR ────────────────────────────────────────────────────────────
  Modelin kalbi: **yükleme ile başlatma ayrı iki eylem.** Araçta kurulmuş ama başlamamış sefer
  durabilir; kurye istediğini başlatır ve başlatma müşteriye haber gönderir. Ekran bu ayrımı
  görünür kılmazsa kurye "kutuları yükledim, iş bitti" sanır ve durakları hiç açılmaz.

  ── DÖRT LİSTENİN CÜMLESİ BURAYA TAŞINDI ────────────────────────────────────
  Kısmi başarı (atlanan · bayat · kutu bekleyen) eskiden gün ekranının "Seferi başlat" düğmesinde
  ölçülüyordu. O düğme artık sefer KURUYOR ve kurulan seferde hiçbir durak yola çıkmaz — cevabın
  dört listesi de tanım gereği boş. Başlatma bu ekranın eylemi oldu, ölçümü de buraya geldi.
*/

const mockBack = jest.fn();
jest.mock('expo-router', () => {
  const react = jest.requireActual<{ useEffect: (effect: () => void, deps: unknown[]) => void }>('react');
  return {
    useRouter: () => ({ navigate: jest.fn(), back: mockBack }),
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

function okResponse(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

const STOP_1 = '00000000-0000-4000-8000-000000000001';
const RUN_B = '00000000-0000-4000-8000-000000000802';

/** Araçta bekleyen sefer — damgası YOK, yani başlamamış. */
const waitingRun = (overrides: Partial<CourierRunDetail> = {}): CourierRunDetail =>
  courierDayRun({ departedAt: null, ...overrides });

function departResult(overrides: Partial<Extract<StartCourierDayResponse, { status: 'ok' }>> = {}) {
  return {
    status: 'ok' as const,
    date: '2026-08-08',
    run: courierDayRun(),
    started: [STOP_1],
    alreadyOut: [],
    stale: [],
    skipped: [],
    awaitingBoxes: [],
    ...overrides,
  };
}

function mockVan(day: CourierDayResponse, depart: unknown = departResult(), discard: unknown = null) {
  let current = day;
  fetchMock.mockImplementation((url) => {
    const address = String(url);
    if (address.includes('/discard')) {
      return Promise.resolve(okResponse(discard ?? { status: 'ok', releasedOrders: 2, unloadedBoxes: 3 }));
    }
    if (address.includes('/depart')) {
      // Sunucu gibi: başlatılan sefer artık SÜRÜLEN sefer olur ve damgasını taşır.
      const started = courierDayRun();
      current = { ...current, run: started, runs: [started] };
      return Promise.resolve(okResponse(depart));
    }
    if (address.includes('/day-close')) return Promise.resolve(okResponse(null));
    if (address.includes('/courier/routes')) return Promise.resolve(okResponse({ date: '2026-08-08', routes: [] }));
    if (address.includes('/courier/vehicles')) return Promise.resolve(okResponse({ vehicles: [] }));
    return Promise.resolve(okResponse(current));
  });
}

async function renderVan() {
  await render(
    <OperationsSessionProvider
      value={{
        sections: ['courier'],
        userName: 'Musa Kaya',
        userEmail: 'musa@lezzetanatolia.fr',
        warehouses: [],
        resolvedWarehouseId: null,
      }}
    >
      <CourierVanRunsScreen />
    </OperationsSessionProvider>,
  );
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockBack.mockReset();
});

describe('K · araçtaki seferler', () => {
  it('BEKLEYEN sefer başlatılabilir, SÜRÜLEN sefer başlatılamaz — iki eylem karışmaz', async () => {
    const surulen = courierDayRun();
    const bekleyen = waitingRun({ runId: RUN_B, zoneName: 'Dağ rotası' });
    mockVan(courierDay([courierStop(1)], { run: surulen, runs: [surulen, bekleyen] }));

    await renderVan();
    await waitFor(() => expect(screen.getByTestId(`courier-van-run-${RUN_B}`)).toBeOnTheScreen());

    /* Sürülen seferde "başlat" düğmesi HİÇ çizilmez: basılamayacak bir düğme, kuryeye olmayan bir
       yol vaat etmektir. Onun yerine duraklarına giden yol var. */
    expect(screen.queryByTestId(`courier-van-depart-${surulen.runId}`)).toBeNull();
    expect(screen.getByTestId(`courier-van-stops-${surulen.runId}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`courier-van-depart-${RUN_B}`)).toBeOnTheScreen();
  });

  it('BAŞLATMA uca gider ve dört listenin cümlesi yazılır — kısmi başarı görünür', async () => {
    const bekleyen = waitingRun();
    mockVan(
      courierDay([courierStop(1)], { run: null, runs: [bekleyen] }),
      departResult({
        started: [STOP_1],
        skipped: [{ orderId: '00000000-0000-4000-8000-000000000002', currentStatus: 'preparing' }],
      }),
    );

    await renderVan();
    await waitFor(() => expect(screen.getByTestId(`courier-van-depart-${bekleyen.runId}`)).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId(`courier-van-depart-${bekleyen.runId}`));

    await waitFor(() => expect(screen.getByTestId('courier-van-notice')).toBeOnTheScreen());
    const notice = screen.getByTestId('courier-van-notice');
    /* Kısmi başarı GİZLENMEZ (18.08'in kuralı, ekran değişti kural değişmedi): kurye atlanan
       durakta teslim yazamadığında sebebini ancak deneyerek öğrenirdi. */
    expect(notice).toHaveTextContent(/1 durak yola çıktı/);
    expect(notice).toHaveTextContent(/1 durak hazırlanmayı bekliyor \(Hazırlanıyor\)/);
    // İstek gerçekten O SEFERİN üstüne gitti — araçta birden çok sefer varken kimlik şart.
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes(`/runs/${bekleyen.runId}/depart`))).toBe(true);
  });

  it('AYNI ANDA TEK SEFER: sürülen varken ötekinin başlatma düğmesi PASİF ve sebebini yazar', async () => {
    /*
      Kullanıcı kararı 31.08: araç birden çok seferi TAŞIR ama kurye birini SÜRER. Düğme
      GİZLENMİYOR — gizlenseydi kurye "bu sefer neden başlamıyor" sorusunu ekranda hiç
      cevaplayamazdı; pasif ve neden pasif olduğu üstünde yazılı.
    */
    const surulen = courierDayRun();
    const bekleyen = waitingRun({ runId: RUN_B, zoneName: 'Dağ rotası' });
    mockVan(courierDay([courierStop(1)], { run: surulen, runs: [surulen, bekleyen] }));

    await renderVan();
    await waitFor(() => expect(screen.getByTestId(`courier-van-depart-${RUN_B}`)).toBeOnTheScreen());

    const depart = screen.getByTestId(`courier-van-depart-${RUN_B}`);
    expect(depart).toHaveTextContent(new RegExp(`Önce ${surulen.referenceNo} kapatılmalı`));
    await fireEvent.press(depart);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes(`/runs/${RUN_B}/depart`))).toBe(false);
  });

  it('ARAÇTAN ÇIKAR: onay çekmecesi bedeli yazar, onaylanınca uca gider ve sonucu söyler', async () => {
    /*
      Tasarımda karşılığı YOK (ölçüldü: 14/15/16'da "iptal/vazgeç/araçtan çıkar" hiç geçmiyor) ve
      boşluk cihazda görüldü: yanlış rotayı araca alan kuryenin tek çıkışı onu BAŞLATIP kapatmaktı,
      yani hatanın bedeli müşteriye bildirim olarak yansıyordu.
    */
    const bekleyen = waitingRun();
    mockVan(courierDay([courierStop(1)], { run: null, runs: [bekleyen] }));

    await renderVan();
    await waitFor(() => expect(screen.getByTestId(`courier-van-discard-${bekleyen.runId}`)).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId(`courier-van-discard-${bekleyen.runId}`));

    // Onay ÇEKMECEDE: sayfaya gömülü bir onay bir karar anı gibi değil bir uyarı satırı gibi okunur.
    expect(screen.getByTestId('courier-van-discard-sheet')).toHaveTextContent(/hiç başlamadı/);
    await fireEvent.press(screen.getByTestId('courier-van-discard-sheet-confirm'));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes(`/runs/${bekleyen.runId}/discard`))).toBe(true),
    );
    /* Sonuç SAYILARLA yazılır: "oldu" demek, malın nereye gittiğini söylemeden bırakmaktır. */
    await waitFor(() => expect(screen.getByTestId('courier-van-notice')).toHaveTextContent(/2 sipariş serbest/));
  });

  it('SÜRÜLEN seferde "araçtan çıkar" HİÇ çizilmez — onun çıkışı kapanıştır', async () => {
    const surulen = courierDayRun();
    mockVan(courierDay([courierStop(1)], { run: surulen, runs: [surulen] }));

    await renderVan();
    await waitFor(() => expect(screen.getByTestId(`courier-van-stops-${surulen.runId}`)).toBeOnTheScreen());

    expect(screen.queryByTestId(`courier-van-discard-${surulen.runId}`)).toBeNull();
  });

  it('ARAÇ BOŞSA seçime çağırır — "sefer araçta olmakla başlamış sayılmaz" yazılı', async () => {
    mockVan(courierDay([], { run: null, runs: [] }));

    await renderVan();
    await waitFor(() => expect(screen.getByTestId('courier-van-empty')).toBeOnTheScreen());

    expect(screen.getByTestId('courier-van-empty')).toHaveTextContent(/başlamış sayılmaz/);
    expect(screen.getByTestId('courier-van-pick')).toBeOnTheScreen();
  });
});
