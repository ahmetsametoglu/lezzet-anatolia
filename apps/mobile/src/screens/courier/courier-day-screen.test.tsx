import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import { CourierDayScreen } from './courier-day-screen';
import { courierDay, courierStop, dayCloseDraft } from './courier-fixture';
import messages from './messages.json';

/*
  K1 EKRAN TESTİ — dört veri hâli (yükleniyor · dolu · boş · hata), durak kilidi, gün CTA'sının
  dönüşümü ve ilerleme satırı.

  HOOK TAKLİT EDİLMEZ: gerçek hook + taklit `fetch` ile koşuyor, yani ekranın gördüğü veri
  GERÇEKTEN sözleşmeden (`CourierDayResponseSchema`) geçiyor — alan adı ayrışırsa test kırılır
  (katalog ekranının aynı kararı).

  RNTL v14 tuzağı: aynı testte ikinci bir `render` öncekini söker — her test tek render kullanır.
*/

const mockNavigate = jest.fn();
jest.mock('expo-router', () => {
  /* Gerçek `useFocusEffect` navigasyon bağlamı ister; ekranın sözleşmesi "odakta koş" olduğu için
     taklit onu MOUNT'ta koşan bir etkiye indirger — tek yükleme yolu aynen korunur. Fabrika
     hoisting yüzünden dışarıdaki `import`u kapatamaz, o yüzden React buradan alınıyor. */
  const react = jest.requireActual<{ useEffect: (effect: () => void, deps: unknown[]) => void }>('react');
  return {
    useRouter: () => ({ navigate: (href: unknown) => mockNavigate(href), back: jest.fn() }),
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

const t = messages;

function okResponse(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

function failResponse(): Response {
  return {
    status: 500,
    headers: { get: () => null },
    json: async () => ({ data: null, error: 'server_error' }),
  } as unknown as Response;
}

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

/** Gün listesi ve kapanış taslağı ayrı ayrı kurulur — kaderleri de ekranda ayrı. */
function mockDay(day: unknown, draft: unknown = dayCloseDraft()) {
  fetchMock.mockImplementation((url) =>
    Promise.resolve(
      String(url).includes('/day-close')
        ? draft === null
          ? failResponse()
          : okResponse(draft)
        : day === null
          ? failResponse()
          : okResponse(day),
    ),
  );
}

async function renderDay() {
  await render(
    <OperationsSessionProvider value={{ sections: ['courier'], userName: 'Musa Kaya' }}>
      <CourierDayScreen />
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
});

describe('K1 · günün rotası', () => {
  it('yüklenirken halka gösterir, liste çizilmez', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));

    await renderDay();

    expect(screen.getByTestId('courier-day-loading')).toBeOnTheScreen();
    expect(screen.queryByTestId('courier-day-list')).toBeNull();
  });

  it('dolu gün: üstbaşlığın kuyruğu UÇTAN gelen gün + personelin adıdır', async () => {
    mockDay(courierDay([courierStop(1)]));

    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    expect(screen.getByText('KURYE · 8 AĞUSTOS · MUSA K.')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: t.day.title })).toBeOnTheScreen();
  });

  it('boş gün: "rota yok" bloğu çıkar, CTA ve ilerleme çizilmez', async () => {
    mockDay(courierDay([]));

    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-empty')).toBeOnTheScreen());
    expect(screen.getByText(t.day.empty.title)).toBeOnTheScreen();
    expect(screen.queryByTestId('courier-day-cta')).toBeNull();
  });

  it('rota okunamazsa hata bloğu + tekrar dene; basılınca liste gelir', async () => {
    mockDay(null);

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-error')).toBeOnTheScreen());
    expect(screen.getByText(t.day.error.title)).toBeOnTheScreen();

    mockDay(courierDay([courierStop(1)]));
    await fireEvent.press(screen.getByTestId('courier-day-error-retry'));

    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
  });

  it('kapanış taslağı düşerse liste AYAKTA kalır ve cepteki para "bilinmiyor" olur (sıfır DEĞİL)', async () => {
    mockDay(courierDay([courierStop(1)]), null);

    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    expect(screen.getByText(t.day.pocketUnknown)).toBeOnTheScreen();
    expect(screen.queryByText('cepte 0,00 €')).toBeNull();
  });

  it('cepteki para kapanış taslağının beklenen tahsilatından toplanır', async () => {
    mockDay(
      courierDay([courierStop(1)]),
      dayCloseDraft({ expected: { cashCents: 4200, cardCents: 1000, chequeCents: 0 } }),
    );

    await renderDay();

    await waitFor(() => expect(screen.getByText('cepte 52,00 €')).toBeOnTheScreen());
  });

  it('yola çıkmadan durak KİLİTLİ; ipucu ve kilit gerekçesi ekranda', async () => {
    mockDay(courierDay([courierStop(1)]));

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());

    expect(screen.getByTestId('courier-day-start-hint')).toBeOnTheScreen();
    const stop = screen.getByTestId('courier-stop-00000000-0000-4000-8000-000000000001');
    await fireEvent.press(stop);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('CTA "Yola çıktım"dan "Günü kapat"a döner; kilit açılır ve durak açılabilir', async () => {
    mockDay(courierDay([courierStop(1), courierStop(2)]));

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    expect(screen.getByText(t.day.start)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('courier-day-cta'));

    expect(screen.getByText(t.day.close)).toBeOnTheScreen();
    // Açık durak sayısı rozet olarak CTA'nın içinde.
    expect(screen.getByText('2 açık')).toBeOnTheScreen();
    expect(screen.queryByTestId('courier-day-start-hint')).toBeNull();

    await fireEvent.press(screen.getByTestId('courier-stop-00000000-0000-4000-8000-000000000001'));
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/delivery/[orderId]',
      params: { orderId: '00000000-0000-4000-8000-000000000001' },
    });
  });

  it('gün kapatma CTA\'sı kapanış ekranına gider', async () => {
    mockDay(courierDay([courierStop(1, { outcome: 'delivered', payment: { dueAmountCents: null, expectedMethod: null } })]));

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('courier-day-cta'));
    await fireEvent.press(screen.getByTestId('courier-day-cta'));

    expect(mockNavigate).toHaveBeenCalledWith('/day-close');
  });

  it('kapıda tahsilat rozeti ve "kaldı" satırı yalnız BEKLEYEN borçlu duraklardan sayılır', async () => {
    mockDay(
      courierDay([
        courierStop(1),
        courierStop(2, { payment: { dueAmountCents: 1000, expectedMethod: 'card' } }),
        courierStop(3, { outcome: 'delivered', payment: { dueAmountCents: null, expectedMethod: null } }),
      ]),
    );

    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-door-left')).toBeOnTheScreen());
    expect(screen.getByText('2 kapıda tahsilat kaldı · 52,00 €')).toBeOnTheScreen();
    expect(screen.getByText('KAPIDA · 42,00 € NAKİT')).toBeOnTheScreen();
    expect(screen.getByText('KAPIDA · 10,00 € KART')).toBeOnTheScreen();
  });

  it('sonuçlanmış durakların alt satırı sonucu söyler; iç durum adı sızmaz', async () => {
    mockDay(
      courierDay([
        courierStop(1, { outcome: 'delivered', payment: { dueAmountCents: null, expectedMethod: null } }),
        courierStop(2, { outcome: 'unreachable', attempts: 1 }),
        courierStop(3, { outcome: 'refused' }),
      ]),
    );

    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    expect(screen.getByText('Müşteri 1 · teslim edildi')).toBeOnTheScreen();
    expect(screen.getByText('Müşteri 2 · ulaşılamadı — tekrar denenecek')).toBeOnTheScreen();
    expect(screen.getByText('Müşteri 3 · kabul etmedi — iade akışında')).toBeOnTheScreen();
    // İlerleme sayacı yalnız TESLİM edilenleri sayar; ulaşılamayan/reddedilen "biten" değildir.
    expect(screen.getByTestId('courier-day-progress')).toBeOnTheScreen();
    expect(screen.getByText('/3')).toBeOnTheScreen();
  });

  it('teslim edilmiş ama borcu kalan durak bunu ALT SATIRDA söyler', async () => {
    mockDay(courierDay([courierStop(1, { outcome: 'delivered' })]));

    await renderDay();

    await waitFor(() =>
      expect(screen.getByText('Müşteri 1 · teslim edildi · kalan borç 42,00 €')).toBeOnTheScreen(),
    );
  });
});
