import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { CourierDayResponse, CourierRoute } from '@lezzet/types';

import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import { courierDay, courierRoute, startResult, takenRouteRun } from './courier-fixture';
import { CourierRoutePickScreen } from './route-pick-screen';

/*
  K · SEFER VE ARAÇ SEÇİMİ (v3:17).

  ── NE ÖLÇÜLÜYOR ────────────────────────────────────────────────────────────
  Bu ekranın taşıdığı üç karar: ÇOKLU seçim (araç birden çok seferi birden taşır), seferi açılmış
  rotanın seçilemezliği (K3 — rota+gün başına tek sefer) ve düğmenin SEFER KURDUĞU, başlatmadığı.

  Seçim 31.08'e kadar gün ekranının gövdesindeydi ve testleri de oradaydı; kullanıcı tasarımı
  gösterip ayrımı istedi (*"giriş ekranı bu olması gerekmiyor mu?"*). Ölçüm ekranla birlikte taşındı.
*/

const mockNavigate = jest.fn();
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => {
  const react = jest.requireActual<{ useEffect: (effect: () => void, deps: unknown[]) => void }>('react');
  return {
    useRouter: () => ({ navigate: mockNavigate, back: jest.fn(), dismissTo: mockDismissTo }),
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

const ZONE_B = '00000000-0000-4000-8000-000000000802';
const VEHICLE = '00000000-0000-4000-8000-000000000900';

function mockPick(
  routes: CourierRoute[],
  day: CourierDayResponse = courierDay([], { run: null, runs: [] }),
  /* Kurma cevabı VARSAYILAN OLARAK olumsuz: dosyanın çoğu testi "istek ne gönderdi"yi ölçüyor ve
     başarılı bir cevap ekranı yerinden oynatırdı. Gezinmeyi ölçen test kendi cevabını verir. */
  startOutcome: unknown = { status: 'no_route' },
) {
  fetchMock.mockImplementation((url) => {
    const address = String(url);
    if (address.includes('/day/start')) return Promise.resolve(okResponse(startOutcome));
    if (address.includes('/day-close')) return Promise.resolve(okResponse(null));
    if (address.includes('/courier/routes')) return Promise.resolve(okResponse({ date: '2026-08-08', routes }));
    if (address.includes('/courier/vehicles')) {
      return Promise.resolve(okResponse({ vehicles: [{ vehicleId: VEHICLE, plate: 'FR-482-BX', label: 'Frigo kamyonet' }] }));
    }
    return Promise.resolve(okResponse(day));
  });
}

async function renderPick() {
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
      <CourierRoutePickScreen />
    </OperationsSessionProvider>,
  );
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockNavigate.mockReset();
  mockDismissTo.mockReset();
});

describe('K · sefer ve araç seçimi', () => {
  it('ÇOKLU seçim: iki rota birden işaretlenir ve özet ikisini birden sayar', async () => {
    mockPick([
      courierRoute({ stopCount: 3 }),
      courierRoute({ zoneId: ZONE_B, zoneName: 'Güney rotası', stopCount: 4 }),
    ]);

    await renderPick();
    await waitFor(() => expect(screen.getByTestId(`courier-route-${ZONE_B}`)).toBeOnTheScreen());

    /* Tek aday kendiliğinden seçilidir ("tek adayda soru sorulmaz") ama İKİ aday varsa seçim
       kuryenindir — otomatik biri işaretlenseydi ötekini fark etmeden yükleyebilirdi. */
    await fireEvent.press(screen.getByTestId(`courier-route-${courierRoute().zoneId}`));
    await fireEvent.press(screen.getByTestId(`courier-route-${ZONE_B}`));

    /* Özet bir gösterge değil ONAY: kurye basmadan önce ne yüklediğini görür — ve v3:17'den beri
       ÜÇ sayıda: sefer · durak · KUTU. Hacim en somut olanı ve tek satırlık cümlede hiç yoktu. */
    const summary = screen.getByTestId('courier-route-pick-summary');
    expect(summary).toHaveTextContent(/2/);
    expect(summary).toHaveTextContent(/7/);
    // Fikstürün her rotası 5 kutu taşıyor: iki rota = 10.
    expect(summary).toHaveTextContent(/10/);
    expect(summary).toHaveTextContent(/kutu/);
  });

  it('seferi AÇILMIŞ rota seçilemez ve kimin sürdüğünü söyler (K3)', async () => {
    mockPick([courierRoute({ zoneId: ZONE_B, zoneName: 'Güney rotası', run: takenRouteRun() })]);

    await renderPick();
    await waitFor(() => expect(screen.getByTestId(`courier-route-${ZONE_B}`)).toBeOnTheScreen());

    expect(screen.getByTestId(`courier-route-${ZONE_B}`)).toHaveTextContent(/bugün Musa Kaya sürüyor/);
    await fireEvent.press(screen.getByTestId(`courier-route-${ZONE_B}`));
    // Basıldı ama seçilmedi: rota+gün başına tek sefer, ikinci kez açılamaz.
    expect(screen.getByTestId('courier-route-pick-summary')).not.toHaveTextContent('1 sefer');
  });

  it('ARAÇ KARARI VERİLMEDEN sefer kurulmaz — düğme eksiği söyler (v3:17)', async () => {
    mockPick([courierRoute({ stopCount: 3 })]);

    await renderPick();
    await waitFor(() => expect(screen.getByTestId('courier-route-pick-cta')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId(`courier-route-${courierRoute().zoneId}`));

    /* Rota seçili ama araç kararı yok: düğme pasif ve NEDEN pasif olduğunu yazıyor. Tek bir
       "önce sefer seç" etiketi, kuryeye hangi adımın eksik olduğunu söylemiyordu. */
    expect(screen.getByTestId('courier-route-pick-cta')).toHaveTextContent(/Önce araç seç/);
    await fireEvent.press(screen.getByTestId('courier-route-pick-cta'));
    expect(fetchMock.mock.calls.find(([url]) => String(url).includes('/day/start'))).toBeUndefined();
  });

  it('ARAÇSIZ DEVAM açık bir seçimdir — çekmeceden işaretlenince düğme açılır', async () => {
    mockPick([courierRoute({ stopCount: 3 })]);

    await renderPick();
    await waitFor(() => expect(screen.getByTestId('courier-vehicle-gate')).toBeOnTheScreen());
    /* Kapı seçilmemişken EKSİĞİ söylüyor (v3:17 `"Seçilmedi — sefer için gerekli"`), sessiz bir
       boşluk değil. */
    expect(screen.getByTestId('courier-vehicle-gate')).toHaveTextContent(/Seçilmedi/);

    await fireEvent.press(screen.getByTestId('courier-vehicle-gate'));
    await fireEvent.press(screen.getByTestId('courier-vehicle-none'));
    await fireEvent.press(screen.getByTestId(`courier-route-${courierRoute().zoneId}`));

    expect(screen.getByTestId('courier-vehicle-gate')).toHaveTextContent(/Araçsız/);
    expect(screen.getByTestId('courier-route-pick-cta')).toHaveTextContent(/Seferleri kur — 1 sefer/);
  });

  it('düğme SEFER KURAR, başlatmaz — istek `depart:false` taşır', async () => {
    mockPick([courierRoute({ stopCount: 3 })]);

    await renderPick();
    await waitFor(() => expect(screen.getByTestId('courier-route-pick-cta')).toBeOnTheScreen());
    /* Araç ÇEKMECEDEN seçiliyor (v3:17): kapı → radyo satırı. Plaka başlıkta, adı altında —
       kurye rampada aracı plakasından buluyor. */
    await fireEvent.press(screen.getByTestId('courier-vehicle-gate'));
    await fireEvent.press(screen.getByTestId(`courier-vehicle-${VEHICLE}`));
    await fireEvent.press(screen.getByTestId(`courier-route-${courierRoute().zoneId}`));
    await fireEvent.press(screen.getByTestId('courier-route-pick-cta'));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/day/start'));
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ depart: false });
    });
  });

  it('SEFER KURULUNCA YÜKLEMEYE GEÇİLİR — düğmenin verdiği söz tutulur', async () => {
    /*
      ── KULLANICI BULGUSU 01.09 ──────────────────────────────────────────────
      *"Rotanın sorumluluğunu alıyor ama hâlâ rota sayfasında kalıyor. Ne olduğunu anlayamıyor
      bile kullanıcı."* Kurma başarılıydı, seçim listesi boşalıyor, düğme pasifleşiyordu — yani
      ekran "bir şey oldu" demiyordu bile; kurye geri gidip bakmadan işin olup olmadığını
      bilemiyordu.

      Gidilecek yeri DÜĞMENİN KENDİSİ söylüyor: *"Seferleri kur — N sefer **yüklemeye geçer**"*
      (v3 `03-Sefer-ve-Arac/03`). Bir tur boyunca araçtaki seferlere gidiyordu; oysa o ekran
      tasarımın akışında yüklemeden SONRA geliyor (`02-Aractaki-Seferler` karelerinde bütün
      seferler tam yüklü). `dismissTo` çünkü bu ekrana iki yoldan gelinir; `navigate` araçtaki
      seferlerden gelindiğinde yığında iki kopya bırakırdı.
    */
    mockPick([courierRoute({ stopCount: 3 })], undefined, startResult());

    await renderPick();
    await waitFor(() => expect(screen.getByTestId('courier-route-pick-cta')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('courier-vehicle-gate'));
    await fireEvent.press(screen.getByTestId(`courier-vehicle-${VEHICLE}`));
    await fireEvent.press(screen.getByTestId(`courier-route-${courierRoute().zoneId}`));
    await fireEvent.press(screen.getByTestId('courier-route-pick-cta'));

    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/load'));
  });

  it('rota YOKSA sebep yazılır — boş bir liste değil', async () => {
    mockPick([]);

    await renderPick();

    await waitFor(() => expect(screen.getByTestId('courier-route-pick-empty')).toBeOnTheScreen());
    expect(screen.getByTestId('courier-route-pick-empty')).toHaveTextContent(/yönetimde günlük planlanır/);
  });
});
