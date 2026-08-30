import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { CourierDayResponse, CourierRoute, StartCourierDayResponse } from '@lezzet/types';

import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import { CourierDayScreen } from './courier-day-screen';
import { courierDay, courierRoute, courierRunBrief, courierStop, dayCloseDraft, takenRouteRun } from './courier-fixture';
import messages from './messages.json';

/*
  K1 EKRAN TESTİ — beş veri hâli (yükleniyor · rota seçimi · dolu sefer · boş · hata), kapanmış
  seferin durak kilidi, CTA'nın dönüşümü, ilerleme satırı ve "Seferi başlat"ın DÖRT DALLI cevabı
  (mutlu yol · atlanan · bayat · rota zaten açılmış).

  HOOK TAKLİT EDİLMEZ: gerçek hook + taklit `fetch` ile koşuyor, yani ekranın gördüğü veri
  GERÇEKTEN sözleşmeden (`CourierDayResponseSchema`) geçiyor — alan adı ayrışırsa test kırılır
  (katalog ekranının aynı kararı).

  TAKLİT SUNUCU SEFERİ HATIRLAR (18.08): başarılı bir başlatmadan SONRAKİ gün okuması `run` taşır —
  gerçek uçta sefer kaydı doğduğu için başka türlü olamaz. Bu olmadan ekran, başlattığı seferi bir
  sonraki tazelemede yok sayardı ve test yalancı bir davranışı ölçerdi.

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
/** Fixture rotasının bölgesi — başlatma isteğinin gövdesinde bu kimlik gider. */
const ZONE_ID = courierRoute().zoneId;
/** Seçili rotanın CTA'da okunan hâli. */
const START_CTA = `Seferi başlat — ${courierRoute().zoneName}`;

/** Sefer ALINMAMIŞ gün — rota seçim hâli; başlatma testlerinin başlangıç noktası. */
function unstartedDay(stops: Parameters<typeof courierDay>[0]): CourierDayResponse {
  return courierDay(stops, { run: null });
}

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

/** Açılan seferin dört listesi: varsayılanı hiçbir şey olmamış sefer — testler kendi dalını doldurur. */
function startResult(
  overrides: Partial<Extract<StartCourierDayResponse, { status: 'ok' }>> = {},
): StartCourierDayResponse {
  return {
    status: 'ok',
    date: '2026-08-08',
    run: courierRunBrief(),
    started: [],
    alreadyOut: [],
    stale: [],
    skipped: [],
    // 23.8: kutulu sipariş okutulmayı bekliyor olabilir — varsayılan "kutusuz gün".
    awaitingBoxes: [],
    ...overrides,
  };
}

/**
 * Gün, kapanış taslağı, başlatma cevabı ve rota listesi ayrı ayrı kurulur — dördünün kaderi ekranda
 * da ayrı. `null` geçilen uç 500 döner.
 */
function mockDay(
  day: CourierDayResponse | null,
  draft: unknown = dayCloseDraft(),
  start: StartCourierDayResponse | null = startResult(),
  routes: CourierRoute[] | null = [courierRoute()],
) {
  let current = day;
  fetchMock.mockImplementation((url) => {
    const address = String(url);
    if (address.includes('/day/start')) {
      if (start === null) return Promise.resolve(failResponse());
      // Sunucunun kendisi gibi: sefer açıldıysa sonraki gün okuması artık o seferi taşır.
      if (start.status === 'ok' && current !== null) current = { ...current, run: start.run };
      return Promise.resolve(okResponse(start));
    }
    if (address.includes('/day-close')) return Promise.resolve(draft === null ? failResponse() : okResponse(draft));
    if (address.includes('/courier/routes')) {
      return Promise.resolve(routes === null ? failResponse() : okResponse({ date: '2026-08-08', routes }));
    }
    return Promise.resolve(current === null ? failResponse() : okResponse(current));
  });
}

async function renderDay() {
  await render(
    <OperationsSessionProvider
      /* Depo kapsamı BOŞ: kurye üstbaşlığı tesisin adını yazmaz (sefer künyesini yazar), yani bu
         ekranın ölçtüğü hiçbir şey kapsama bağlı değil. */
      value={{
        sections: ['courier'],
        userName: 'Musa Kaya',
        userEmail: 'musa@lezzetanatolia.fr',
        warehouses: [],
        resolvedWarehouseId: null,
      }}
    >
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

describe('K1 · günün seferi', () => {
  it('yüklenirken halka gösterir, liste çizilmez', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));

    await renderDay();

    expect(screen.getByTestId('courier-day-loading')).toBeOnTheScreen();
    expect(screen.queryByTestId('courier-day-list')).toBeNull();
  });

  /*
    ÜSTBAŞLIK ↔ BAĞLAM SATIRI AYRIMI (v3, 30.08): üstbaşlık "NEREDEYİM"i söyler (bölüm + gün),
    bağlam satırı "KİM ve HANGİ SEFER"i. v2'de ad üstbaşlığın kuyruğundaydı ve sefer künyesi ayrı
    bir şeride yazılıyordu; künye listenin başında olduğu için duraklara inince kayboluyordu.
    Şimdi ikisi tek satırda ve BAŞLIKTA — her ekranda aynı yerde.
  */
  it('üstbaşlık bölüm + gün, bağlam satırı ad + sefer künyesi', async () => {
    mockDay(courierDay([courierStop(1)]));

    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    expect(screen.getByText('KURYE · 8 AĞUSTOS')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: t.day.title })).toBeOnTheScreen();
    expect(screen.getByText('Musa Kaya · Kuzey rotası · SF-26-ABCDEF')).toBeOnTheScreen();
  });

  it('koşan rota yoksa boş blok çıkar, CTA ve ilerleme çizilmez', async () => {
    mockDay(unstartedDay([]), dayCloseDraft(), startResult(), []);

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

    /* v3'te tutar "CEPTE" etiketiyle iki satır (özet kartının sağ ucu): para bir sayı değil bir
       DURUM ve etiketi olmadan cümlenin içinde kayboluyordu. */
    await waitFor(() => expect(screen.getByTestId('courier-day-summary')).toHaveTextContent(/CEPTE/));
    expect(screen.getByTestId('courier-day-summary')).toHaveTextContent(/52,00 €/);
  });

  it('KAPANMIŞ sefer: gövde yeniden ROTA SEÇİMİ, künye şeritte kalır, duraklar çizilmez', async () => {
    mockDay(
      courierDay([courierStop(1)], {
        run: courierRunBrief({ returnedAt: '2026-08-08T18:00:00.000Z', closed: true }),
      }),
      dayCloseDraft(),
      startResult(),
      [
        // Az önce kapatılan rota: ikinci tur veride yasak (K3), kart pasif.
        courierRoute({ run: takenRouteRun({ closed: true }) }),
        courierRoute({ zoneId: '00000000-0000-4000-8000-000000000802', zoneName: 'Güney rotası' }),
      ],
    );

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-routes')).toBeOnTheScreen());

    // "Neyi bitirdim" ekrandan silinmez; ama kapanan seferin durakları artık burada değil (K7'de).
    expect(screen.getByTestId('courier-day-run')).toHaveTextContent(/KAPANDI/);
    expect(screen.getByTestId('courier-day-hint')).toHaveTextContent(/Bu sefer kapandı/);
    expect(screen.queryByTestId(`courier-stop-${STOP_1}`)).toBeNull();
    // Günün ikinci ROTASI serbest: tek aday olduğu için kendiliğinden seçili.
    expect(screen.getByText('Seferi başlat — Güney rotası')).toBeOnTheScreen();
  });

  it('rota seçimi: tek aday kendiliğinden seçili, başlatılmış rota PASİF; sefer açılınca liste gelir', async () => {
    mockDay(
      unstartedDay([courierStop(1), courierStop(2)]),
      dayCloseDraft(),
      startResult({ started: [STOP_1, '00000000-0000-4000-8000-000000000002'] }),
      [
        courierRoute(),
        // Başkasının açtığı rota: kart kimin sürdüğünü söyler ve seçilemez (K3 — rota+gün tek sefer).
        courierRoute({ zoneId: '00000000-0000-4000-8000-000000000802', zoneName: 'Güney rotası', run: takenRouteRun() }),
      ],
    );

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-routes')).toBeOnTheScreen());
    expect(screen.getByText('Strasbourg deposu · 3 durak')).toBeOnTheScreen();
    expect(screen.getByText('bugün Musa Kaya sürüyor · SF-26-ABCDEF')).toBeOnTheScreen();
    // Tek SEÇİLEBİLİR rota var: soru sorulmadı, CTA adını taşıyor.
    expect(screen.getByText(START_CTA)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('courier-day-cta'));

    await waitFor(() => expect(screen.getByText(t.day.close)).toBeOnTheScreen());
    // Açık durak sayısı rozet olarak CTA'nın içinde.
    expect(screen.getByText('2 açık')).toBeOnTheScreen();
    expect(screen.queryByTestId('courier-day-routes')).toBeNull();

    await fireEvent.press(screen.getByTestId(`courier-stop-${STOP_1}`));
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/delivery/[orderId]',
      params: { orderId: STOP_1 },
    });
  });

  it('sefer kapatma CTA\'sı kapanış ekranına gider', async () => {
    mockDay(
      courierDay([courierStop(1, { outcome: 'delivered', payment: { dueAmountCents: null, expectedMethod: null } })]),
    );

    await renderDay();
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
    // v3: sayaç tek cümle ("1/3 durak") — v2'de sayı ile bölen ayrı iki metindi.
    expect(screen.getByTestId('courier-day-summary')).toHaveTextContent(/1\/3 durak/);
  });

  it('teslim edilmiş ama borcu kalan durak bunu ALT SATIRDA söyler', async () => {
    mockDay(courierDay([courierStop(1, { outcome: 'delivered' })]));

    await renderDay();

    await waitFor(() =>
      expect(screen.getByText('Müşteri 1 · teslim edildi · kalan borç 42,00 €')).toBeOnTheScreen(),
    );
  });
});

describe('K1 · "Seferi başlat" — gerçek yazım', () => {
  /** CTA'ya basıp cevabın işlenmesini bekler; başlatma isteğinin gövdesini geri verir. */
  async function pressStart(): Promise<Record<string, unknown>> {
    await fireEvent.press(screen.getByTestId('courier-day-cta'));
    await waitFor(() => expect(screen.getByTestId('courier-day-start-notice')).toBeOnTheScreen());
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/day/start'));
    return JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
  }

  it('düğme uca GİDER: seçilen rota + ekranın gösterdiği gün gider, sonra liste tazelenir', async () => {
    mockDay(unstartedDay([courierStop(1)]), dayCloseDraft(), startResult({ started: [STOP_1] }));

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-routes')).toBeOnTheScreen());
    const before = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/courier/day')).length;

    // Gün, cevabın kendi `date`idir — ikinci bir hesap değil; gece yarısı geçişinde ekranla kapı
    // ayrışmasın. Rota da ekranda seçili olandır: ucun kendi çözümüne bırakılmaz.
    expect(await pressStart()).toEqual({ zoneId: ZONE_ID, date: '2026-08-08' });
    expect(screen.getByTestId('courier-day-start-notice')).toHaveTextContent(/1 durak yola çıktı\./);
    // Cevap "durum değişti" dedi: liste yeniden okundu.
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/courier/day')).length).toBeGreaterThan(before),
    );
  });

  it('ATLANAN duraklar gizlenmez: kaç tane ve HANGİ durumda bekledikleri yazılır', async () => {
    mockDay(
      unstartedDay([courierStop(1), courierStop(2)]),
      dayCloseDraft(),
      startResult({
        started: [STOP_1],
        skipped: [{ orderId: '00000000-0000-4000-8000-000000000002', currentStatus: 'preparing' }],
      }),
    );

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-routes')).toBeOnTheScreen());
    await pressStart();

    const notice = screen.getByTestId('courier-day-start-notice');
    expect(notice).toHaveTextContent(/Sefer açıldı: Kuzey rotası · SF-26-ABCDEF\./);
    expect(notice).toHaveTextContent(/1 durak yola çıktı\./);
    expect(notice).toHaveTextContent(/1 durak hazırlanmayı bekliyor \(Hazırlanıyor\)/);
    // Sefer açık: kilit açık, atlanan durak da listede duruyor (reddi kapıda görünür).
    await waitFor(() => expect(screen.getByText(t.day.close)).toBeOnTheScreen());
  });

  it('ATLANAN kalınca İKİNCİ bir başlatma yolu açılır; sefer açıkken uç "zaten açık" der', async () => {
    const STOP_2 = '00000000-0000-4000-8000-000000000002';
    mockDay(
      unstartedDay([courierStop(1), courierStop(2)]),
      dayCloseDraft(),
      startResult({ started: [STOP_1], skipped: [{ orderId: STOP_2, currentStatus: 'preparing' }] }),
    );

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-routes')).toBeOnTheScreen());
    await pressStart();

    // Birincil düğme artık "Seferi kapat"; hazırlığı geciken durağı yola çıkarmanın tek yolu bu
    // ikincil eylem. Açık sefere ikinci basış uçta CATCH-UP CLAIM'e dönüşüyor (18.08): geç kalan
    // durak aynı sefere bağlanır ve `started` listesinde döner.
    await waitFor(() => expect(screen.getByText(t.day.close)).toBeOnTheScreen());
    mockDay(courierDay([courierStop(1), courierStop(2)]), dayCloseDraft(), startResult({ started: [STOP_2] }));
    await fireEvent.press(screen.getByTestId('courier-day-start-retry'));

    await waitFor(() => expect(screen.getByTestId('courier-day-start-notice')).toHaveTextContent(/1 durak yola çıktı/));
    // İş bitti: ikincil eylem kendiliğinden kayboldu.
    expect(screen.queryByTestId('courier-day-start-retry')).toBeNull();
  });

  it('atlanan/bayat durak yoksa İKİNCİL eylem çizilmez — yapılacak bir şey kalmadı', async () => {
    mockDay(unstartedDay([courierStop(1)]), dayCloseDraft(), startResult({ started: [STOP_1] }));

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-routes')).toBeOnTheScreen());
    await pressStart();

    expect(screen.queryByTestId('courier-day-start-retry')).toBeNull();
    await waitFor(() => expect(screen.getByText(t.day.close)).toBeOnTheScreen());
  });

  it('`stale` yutulmaz: araya girildiğini söyler ve tazelemeye çağırır', async () => {
    mockDay(
      unstartedDay([courierStop(1), courierStop(2)]),
      dayCloseDraft(),
      startResult({
        started: [STOP_1],
        stale: [{ orderId: '00000000-0000-4000-8000-000000000002', currentStatus: 'cancelled' }],
      }),
    );

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-routes')).toBeOnTheScreen());
    await pressStart();

    expect(screen.getByTestId('courier-day-start-notice')).toHaveTextContent(/durumu tam o sırada değişti/);
  });

  it('HİÇBİRİ yola çıkmasa da SEFER açılır: kayıt var, ekran onu yok sayamaz', async () => {
    mockDay(
      unstartedDay([courierStop(1)]),
      dayCloseDraft(),
      startResult({ skipped: [{ orderId: STOP_1, currentStatus: 'confirmed' }] }),
    );

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-routes')).toBeOnTheScreen());
    await pressStart();

    const notice = screen.getByTestId('courier-day-start-notice');
    expect(notice).toHaveTextContent(/hiçbir durak yola çıkmadı/);
    expect(notice).toHaveTextContent(/1 durak hazırlanmayı bekliyor \(Onaylandı\)/);
    // Sefer açıldı: birincil düğme kapanışa döndü ve durak açılabilir (reddi kapıda görünür).
    await waitFor(() => expect(screen.getByText(t.day.close)).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId(`courier-stop-${STOP_1}`));
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/delivery/[orderId]',
      params: { orderId: STOP_1 },
    });
  });

  it('İKİNCİ basış bir hata DEĞİL: "zaten yoldaydı" da seferi açık sayar', async () => {
    mockDay(unstartedDay([courierStop(1)]), dayCloseDraft(), startResult({ alreadyOut: [STOP_1] }));

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-routes')).toBeOnTheScreen());
    await pressStart();

    expect(screen.getByTestId('courier-day-start-notice')).toHaveTextContent(/1 durak zaten yoldaydı\./);
    await waitFor(() => expect(screen.getByText(t.day.close)).toBeOnTheScreen());
  });

  it('başlatma düşerse sefer açılmış SAYILMAZ ve sebebi yazılır', async () => {
    mockDay(unstartedDay([courierStop(1)]), dayCloseDraft(), null);

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-routes')).toBeOnTheScreen());
    await pressStart();

    expect(screen.getByTestId('courier-day-start-notice')).toHaveTextContent(/Sefer başlatılamadı/);
    // Ekran seçim hâlinde kaldı: düğme hâlâ seçili rotanın adını taşıyor.
    expect(screen.getByText(START_CTA)).toBeOnTheScreen();
  });
});

describe('yükleme okutması (23.8 · karar §1.11)', () => {
  it('sayaç duraklardaki damgalardan türer; son kutunun okutması siparişi yola çıkarır', async () => {
    const kutulu = (ikinciYuklu: boolean) =>
      courierStop(1, {
        boxes: [
          { boxNo: 1, code: 'KT-26-CCCCCCCCCC', loadedAt: '2026-08-22T08:00:00Z' },
          { boxNo: 2, code: 'KT-26-DDDDDDDDDD', loadedAt: ikinciYuklu ? '2026-08-22T08:05:00Z' : null },
        ],
      });
    let day = courierDay([kutulu(false)]);
    fetchMock.mockImplementation((url) => {
      const address = String(url);
      if (address.includes('/boxes/load')) {
        // Sunucu gibi: damga yazıldı — sonraki gün okuması yüklü kutuyu taşır.
        day = courierDay([kutulu(true)]);
        return Promise.resolve(
          okResponse({
            status: 'ok',
            orderId: kutulu(false).orderId,
            referenceNo: kutulu(false).referenceNo,
            boxNo: 2,
            loadedBoxes: 2,
            boxCount: 2,
            orderStarted: true,
          }),
        );
      }
      if (address.includes('/day-close')) return Promise.resolve(okResponse(dayCloseDraft()));
      if (address.includes('/courier/routes')) return Promise.resolve(okResponse({ date: '2026-08-08', routes: [] }));
      return Promise.resolve(okResponse(day));
    });
    await renderDay();

    /* OKUTMA ARTIK BURADA DEĞİL (v3, 30.08): kırılım kendi ekranına taşındı (`/trip` → `/load`).
       Günde kalan şey KAPI ve sayacı — kapıyı açmadan "işim var mı" sorusu cevaplanabilmeli.
       Okutmanın kendisi `load-screen.test.tsx`te sınanıyor. */
    expect(screen.getByTestId('courier-day-trip')).toHaveTextContent(/1\/2 kutu araçta/);
    expect(screen.queryByTestId('courier-day-box-scan')).toBeNull();
  });

  it('kutusuz günde sefer kapısı HİÇ çizilmez — eski akış aynen', async () => {
    mockDay(courierDay([courierStop(1)]));
    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());

    // Sayaç `null` (kutusuz akış): olmayan bir adımı kapı olarak göstermek kuryeyi boş ekrana yollar.
    expect(screen.queryByTestId('courier-day-trip')).toBeNull();
  });
});
