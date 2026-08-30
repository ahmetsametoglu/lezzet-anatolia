import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { customerColors } from '@lezzet/design-tokens';
import type { CourierDayResponse } from '@lezzet/types';

import { CourierLoadScreen } from './load-screen';
import { courierDay, courierStop, dayCloseDraft } from './courier-fixture';

/*
  K · ARACA YÜKLEME (v3:1401) — kutuların araca bindiği ekran.

  ── NEDEN AYRI EKRAN VE AYRI TEST ───────────────────────────────────────────
  Yükleme günün rotasında tek satırlık bir sayaçtı ("3/7 kutu araçta"). O satır "kaç kutu bindi"yi
  söylüyordu ama kuryenin rampada sorduğu asıl soruyu — HANGİ durağın kutusu eksik — hiç
  cevaplamıyordu. Kırılım kendi ekranına taşındı; testi de onunla birlikte geldi.

  Veri ZATEN VARDI: `stop.boxes[].loadedAt` sözleşmede duruyordu ve hiçbir yerde çizilmiyordu
  (ölçüldü 30.08) — deponun `areaName`iyle aynı hikâye.
*/

jest.mock('expo-router', () => {
  const react = jest.requireActual<{ useEffect: (effect: () => void, deps: unknown[]) => void }>('react');
  return {
    useRouter: () => ({ navigate: jest.fn(), back: jest.fn() }),
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

const STOP_A = '00000000-0000-4000-8000-000000000001';
const STOP_B = '00000000-0000-4000-8000-000000000002';

/** İki duraklı gün: A'nın iki kutusundan biri binmiş, B'nin tek kutusu hiç binmemiş. */
function loadingDay(): CourierDayResponse {
  return courierDay([
    courierStop(1, {
      orderId: STOP_A,
      customerName: 'Restaurant Oberjaegerhof',
      boxes: [
        { boxNo: 1, code: 'KT-26-AAAAAAAAAA', loadedAt: '2026-08-30T08:00:00Z' },
        { boxNo: 2, code: 'KT-26-BBBBBBBBBB', loadedAt: null },
      ],
    }),
    courierStop(2, {
      orderId: STOP_B,
      customerName: 'Claire Weber',
      boxes: [{ boxNo: 1, code: 'KT-26-CCCCCCCCCC', loadedAt: null }],
    }),
  ]);
}

function mockDay(day: CourierDayResponse) {
  fetchMock.mockImplementation((url) => {
    const address = String(url);
    if (address.includes('/day-close')) return Promise.resolve(okResponse(dayCloseDraft()));
    if (address.includes('/courier/routes')) return Promise.resolve(okResponse({ date: '2026-08-30', routes: [] }));
    return Promise.resolve(okResponse(day));
  });
}

async function renderLoad() {
  await render(<CourierLoadScreen />);
  await waitFor(() => expect(screen.queryByTestId('courier-load-loading')).toBeNull());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe('K · araca yükleme', () => {
  /*
    SAYAÇ KARTI KOYU (v3:1412 · 30.08). Krem çizilmişti ve altındaki okut düğmesiyle, durak
    kartlarıyla EŞİT sesle konuşuyordu; oysa rampada kuryenin ilk bakışı buraya düşmeli. Renk
    burada bir süs değil hiyerarşi — test onu çiviliyor.
  */
  it('sayaç kartı KOYU — rampadaki ilk bakış oraya düşer', async () => {
    mockDay(loadingDay());

    await renderLoad();

    expect(screen.getByTestId('courier-load-counter')).toHaveStyle({ backgroundColor: customerColors.ink });
  });

  /* Dipnot bir KARARIN bedelini anlatıyor ("eksik kutuyla çıkarsan o durak açılmaz") ve karar
     dipteki düğmeyle veriliyor — eksik yokken uyarının konusu da yok (v3:1465). */
  it('eksik kutu dipnotu YALNIZ eksik varken çizilir', async () => {
    mockDay(loadingDay());

    await renderLoad();

    expect(screen.getByText(/o durak/)).toBeOnTheScreen();
  });

  /* İLK YÜK İSKELET, HALKA DEĞİL (N9 · 30.08) — ayıran iz ROL: halka `progressbar`dır. */
  it('yüklenirken İSKELET gösterir, halka değil', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));

    await render(<CourierLoadScreen />);

    expect(screen.getByTestId('courier-load-loading')).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('sayaç duraklardan türer — üç kutunun biri binmiş', async () => {
    mockDay(loadingDay());

    await renderLoad();

    expect(screen.getByTestId('courier-load-counter')).toHaveTextContent(/1\/3 kutu/);
    expect(screen.getByTestId('courier-load-counter')).toHaveTextContent(/2 kutu daha okutulmalı/);
  });

  /* ASIL SORU BUYDU: "hangi durağın kutusu eksik". Üç hâl üç ayrı cümle — yarım binen durak
     "eksik", hiç binmeyen "binmedi"; ikisi aynı şey değil ve kurye ikisine farklı davranır. */
  it('durak kırılımı HANGİ durağın eksik olduğunu söyler', async () => {
    mockDay(loadingDay());

    await renderLoad();

    expect(screen.getByTestId(`courier-load-stop-${STOP_A}`)).toHaveTextContent(/1\/2/);
    expect(screen.getByTestId(`courier-load-stop-${STOP_A}`)).toHaveTextContent(/eksik/);
    expect(screen.getByTestId(`courier-load-stop-${STOP_B}`)).toHaveTextContent(/0\/1/);
    expect(screen.getByTestId(`courier-load-stop-${STOP_B}`)).toHaveTextContent(/binmedi/);
  });

  it('hepsi binince ekran "yola çıkabilirsin" der ve okutma düğmesi çekilir', async () => {
    mockDay(
      courierDay([
        courierStop(1, {
          orderId: STOP_A,
          boxes: [{ boxNo: 1, code: 'KT-26-AAAAAAAAAA', loadedAt: '2026-08-30T08:00:00Z' }],
        }),
      ]),
    );

    await renderLoad();

    expect(screen.getByTestId('courier-load-counter')).toHaveTextContent(/Tüm kutular araçta/);
    expect(screen.queryByTestId('courier-load-scan')).toBeNull();
  });

  /* Simülasyon çipleri BU seferin YÜKLENMEMİŞ kutularıdır: başka bir kod okutulsa kapı reddeder
     ve çip "tanınmayan" gibi görünürdü (depo kuyruğunun aynı kararı). */
  it('okutucunun çipleri yalnız binmemiş kutulardır', async () => {
    mockDay(loadingDay());

    await renderLoad();
    await fireEvent.press(screen.getByTestId('courier-load-scan'));

    // A'nın binmemiş 2 numaralı kutusu ve B'nin hiç binmemiş 1 numaralı kutusu — ikisi de çip.
    expect(screen.getByLabelText('Kutu 2')).toBeOnTheScreen();
    expect(screen.getByLabelText('Kutu 1')).toBeOnTheScreen();
  });

  /*
    KUTUSUZ SEFER "TAMAMLANMIŞ" DEĞİLDİR (ölçüldü 30.08, cihazda). İlk yazımda `remaining === 0`
    koşulu sıfır kutuluk seferde de doğruydu ve ekran "Tüm kutular araçta — yola çıkabilirsin"
    diyordu: hiç kutu yokken "hepsi bindi" demek, boş kümeyi tamamlanmış saymaktır ve kurye
    "yükleme bitti" sanırdı. Oysa yükleme diye bir adım hiç yok.
  */
  it('kutusuz seferde ekran "hepsi bindi" DEMEZ — konusu olmadığını söyler', async () => {
    mockDay(courierDay([courierStop(1, { orderId: STOP_A })]));

    await renderLoad();

    expect(screen.getByTestId('courier-load-no-boxes')).toHaveTextContent(/kutulu sipariş yok/);
    expect(screen.queryByTestId('courier-load-counter')).toBeNull();
    expect(screen.queryByTestId(`courier-load-stop-${STOP_A}`)).toBeNull();
  });
});
