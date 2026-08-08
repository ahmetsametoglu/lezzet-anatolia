import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { StartCourierDayResponse } from '@lezzet/types';

import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import { CourierDayScreen } from './courier-day-screen';
import { courierDay, courierStop, dayCloseDraft } from './courier-fixture';
import messages from './messages.json';

/*
  K1 EKRAN TESTİ — dört veri hâli (yükleniyor · dolu · boş · hata), durak kilidi, gün CTA'sının
  dönüşümü, ilerleme satırı ve "Yola çıktım"ın DÖRT LİSTELİ cevabı (mutlu yol · atlanan · bayat ·
  sıfır başlangıç).

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
/** Fixture'ın birinci durağı — kilit ve başlatma testleri hep bu kimliği konuşuyor. */
const STOP_1 = '00000000-0000-4000-8000-000000000001';

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

/** Uçtan dönen dört listenin varsayılanı: hiçbir şey olmamış gün — testler kendi dalını doldurur. */
function startResult(overrides: Partial<StartCourierDayResponse> = {}): StartCourierDayResponse {
  return { date: '2026-08-08', started: [], alreadyOut: [], stale: [], skipped: [], ...overrides };
}

/**
 * Gün listesi, kapanış taslağı ve başlatma cevabı ayrı ayrı kurulur — üçünün kaderi ekranda da ayrı.
 * `null` geçilen uç 500 döner.
 */
function mockDay(day: unknown, draft: unknown = dayCloseDraft(), start: unknown = startResult()) {
  fetchMock.mockImplementation((url) => {
    const address = String(url);
    if (address.includes('/day/start')) return Promise.resolve(start === null ? failResponse() : okResponse(start));
    if (address.includes('/day-close')) return Promise.resolve(draft === null ? failResponse() : okResponse(draft));
    return Promise.resolve(day === null ? failResponse() : okResponse(day));
  });
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
    const stop = screen.getByTestId(`courier-stop-${STOP_1}`);
    await fireEvent.press(stop);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('CTA "Yola çıktım"dan "Günü kapat"a döner; kilit açılır ve durak açılabilir', async () => {
    mockDay(
      courierDay([courierStop(1), courierStop(2)]),
      dayCloseDraft(),
      startResult({ started: [STOP_1, '00000000-0000-4000-8000-000000000002'] }),
    );

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    expect(screen.getByText(t.day.startCta)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('courier-day-cta'));

    await waitFor(() => expect(screen.getByText(t.day.close)).toBeOnTheScreen());
    // Açık durak sayısı rozet olarak CTA'nın içinde.
    expect(screen.getByText('2 açık')).toBeOnTheScreen();
    expect(screen.queryByTestId('courier-day-start-hint')).toBeNull();

    await fireEvent.press(screen.getByTestId(`courier-stop-${STOP_1}`));
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/delivery/[orderId]',
      params: { orderId: STOP_1 },
    });
  });

  it('gün kapatma CTA\'sı kapanış ekranına gider', async () => {
    mockDay(
      courierDay([courierStop(1, { outcome: 'delivered', payment: { dueAmountCents: null, expectedMethod: null } })]),
      dayCloseDraft(),
      startResult({ started: [STOP_1] }),
    );

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('courier-day-cta'));
    await waitFor(() => expect(screen.getByText(t.day.close)).toBeOnTheScreen());
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

describe('K1 · "Yola çıktım" — gerçek yazım', () => {
  /** CTA'ya basıp cevabın işlenmesini bekler; başlatma isteğinin gövdesini geri verir. */
  async function pressStart(): Promise<Record<string, unknown>> {
    await fireEvent.press(screen.getByTestId('courier-day-cta'));
    await waitFor(() => expect(screen.getByTestId('courier-day-start-notice')).toBeOnTheScreen());
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/day/start'));
    return JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
  }

  it('düğme uca GİDER ve ekranın gösterdiği günü gönderir; sonra liste tazelenir', async () => {
    mockDay(courierDay([courierStop(1)]), dayCloseDraft(), startResult({ started: [STOP_1] }));

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    const before = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/courier/day')).length;

    // Gün, cevabın kendi `date`idir — ikinci bir hesap değil; gece yarısı geçişinde ekranla kapı ayrışmasın.
    expect(await pressStart()).toEqual({ date: '2026-08-08' });
    expect(screen.getByTestId('courier-day-start-notice')).toHaveTextContent(/1 durak yola çıktı\./);
    // Cevap "durum değişti" dedi: liste yeniden okundu.
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/courier/day')).length).toBeGreaterThan(before),
    );
  });

  it('ATLANAN duraklar gizlenmez: kaç tane ve HANGİ durumda bekledikleri yazılır', async () => {
    mockDay(
      courierDay([courierStop(1), courierStop(2)]),
      dayCloseDraft(),
      startResult({
        started: [STOP_1],
        skipped: [{ orderId: '00000000-0000-4000-8000-000000000002', currentStatus: 'preparing' }],
      }),
    );

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    await pressStart();

    const notice = screen.getByTestId('courier-day-start-notice');
    expect(notice).toHaveTextContent(/1 durak yola çıktı\./);
    expect(notice).toHaveTextContent(/1 durak hazırlanmayı bekliyor \(Hazırlanıyor\)/);
    // Gün başladı: kilit açık, atlanan durak da listede duruyor (reddi kapıda görünür).
    await waitFor(() => expect(screen.getByText(t.day.close)).toBeOnTheScreen());
  });

  it('ATLANAN kalınca İKİNCİ bir başlatma yolu açılır — yoksa o durak hiç yola çıkamazdı', async () => {
    const STOP_2 = '00000000-0000-4000-8000-000000000002';
    mockDay(
      courierDay([courierStop(1), courierStop(2)]),
      dayCloseDraft(),
      startResult({ started: [STOP_1], skipped: [{ orderId: STOP_2, currentStatus: 'preparing' }] }),
    );

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    await pressStart();

    // Birincil düğme artık "Günü kapat"; kalanları yola çıkarmanın tek yolu bu ikincil eylem.
    await waitFor(() => expect(screen.getByText(t.day.close)).toBeOnTheScreen());
    mockDay(courierDay([courierStop(1), courierStop(2)]), dayCloseDraft(), startResult({ started: [STOP_2] }));
    await fireEvent.press(screen.getByTestId('courier-day-start-retry'));

    await waitFor(() => expect(screen.getByTestId('courier-day-start-notice')).toHaveTextContent(/1 durak yola çıktı/));
    // İş bitti: ikincil eylem kendiliğinden kayboldu.
    expect(screen.queryByTestId('courier-day-start-retry')).toBeNull();
  });

  it('hiçbir durak yola çıkmamışsa İKİNCİL eylem çizilmez — birincil düğme zaten "Yola çıktım"', async () => {
    mockDay(
      courierDay([courierStop(1)]),
      dayCloseDraft(),
      startResult({ skipped: [{ orderId: STOP_1, currentStatus: 'preparing' }] }),
    );

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    await pressStart();

    expect(screen.queryByTestId('courier-day-start-retry')).toBeNull();
    expect(screen.getByText(t.day.startCta)).toBeOnTheScreen();
  });

  it('`stale` yutulmaz: araya girildiğini söyler ve tazelemeye çağırır', async () => {
    mockDay(
      courierDay([courierStop(1), courierStop(2)]),
      dayCloseDraft(),
      startResult({
        started: [STOP_1],
        stale: [{ orderId: '00000000-0000-4000-8000-000000000002', currentStatus: 'cancelled' }],
      }),
    );

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    await pressStart();

    expect(screen.getByTestId('courier-day-start-notice')).toHaveTextContent(/durumu tam o sırada değişti/);
  });

  it('HİÇBİRİ yola çıkmadıysa gün BAŞLAMAZ: kilit kapalı kalır, düğme "Yola çıktım" olarak durur', async () => {
    mockDay(
      courierDay([courierStop(1)]),
      dayCloseDraft(),
      startResult({ skipped: [{ orderId: STOP_1, currentStatus: 'confirmed' }] }),
    );

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    await pressStart();

    const notice = screen.getByTestId('courier-day-start-notice');
    expect(notice).toHaveTextContent(/gün BAŞLAMADI, duraklar kilitli kalır/);
    expect(notice).toHaveTextContent(/1 durak hazırlanmayı bekliyor \(Onaylandı\)/);
    expect(screen.getByText(t.day.startCta)).toBeOnTheScreen();
    expect(screen.getByTestId('courier-day-start-hint')).toBeOnTheScreen();
    // Kilit gerçekten kapalı: durak açılmıyor.
    await fireEvent.press(screen.getByTestId(`courier-stop-${STOP_1}`));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('İKİNCİ basış bir hata DEĞİL: "zaten yoldaydı" da günü başlamış sayar', async () => {
    mockDay(courierDay([courierStop(1)]), dayCloseDraft(), startResult({ alreadyOut: [STOP_1] }));

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    await pressStart();

    expect(screen.getByTestId('courier-day-start-notice')).toHaveTextContent('1 durak zaten yoldaydı.');
    await waitFor(() => expect(screen.getByText(t.day.close)).toBeOnTheScreen());
  });

  it('başlatma düşerse gün başlamış SAYILMAZ ve sebebi yazılır', async () => {
    mockDay(courierDay([courierStop(1)]), dayCloseDraft(), null);

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    await pressStart();

    expect(screen.getByTestId('courier-day-start-notice')).toHaveTextContent(/Gün başlatılamadı/);
    expect(screen.getByText(t.day.startCta)).toBeOnTheScreen();
  });
});
