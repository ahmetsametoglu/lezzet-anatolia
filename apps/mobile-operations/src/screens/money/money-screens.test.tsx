import { render, screen, waitFor } from '@testing-library/react-native';

import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import type { MoneyDayEnd, MoneyOverview, StaffWarehouse } from '@lezzet/types';
import { MoneyDayEndScreen } from './day-end-screen';
import { MoneyTrackingScreen } from './money-screen';
import { moneyCopy } from './copy';

/*
  Para ekranları testi: hook taklit edilmez, ağ fetch düzeyinde sahtedir ve cevaplar sözleşme şeklindedir.
  Çivilenen kurallar: bekleyen satır kalan tutarı ve yöntemi söyler, hesap satırları defterdeki adıyla çizilir, kapanan sefer yoksa fark 0 değil "soru sorulmadı"dır ve fark işaretli yazılır.
*/

jest.mock('expo-router', () => {
  const react = jest.requireActual<{ useEffect: (effect: () => void, deps: unknown[]) => void }>('react');
  return {
    useRouter: () => ({ navigate: jest.fn(), back: jest.fn() }),
    useFocusEffect: (callback: () => void) => react.useEffect(callback, [callback]),
  };
});

const mockSession = { access_token: 'test-token' };
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
    },
  }),
}));

const t = moneyCopy;
const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

function overviewData(overrides: Partial<MoneyOverview> = {}): MoneyOverview {
  return {
    pending: [
      {
        orderId: '00000000-0000-4000-8000-000000000001',
        referenceNo: 'LA-26-TEST01',
        customerName: 'Restaurant Bosphore',
        status: 'out_for_delivery',
        kind: 'door',
        remainingCents: 4200,
        method: 'cash',
      },
      {
        orderId: '00000000-0000-4000-8000-000000000002',
        referenceNo: null,
        customerName: 'L. Petit',
        status: 'delivered',
        kind: 'partial',
        remainingCents: 1290,
        method: 'card',
      },
    ],
    todayByMethod: [
      { method: 'online', cents: 61_280 },
      { method: 'cash', cents: 8650 },
    ],
    todayCount: 14,
    courierFloat: [
      {
        runId: '00000000-0000-4000-8000-000000000101',
        referenceNo: 'SF-26-TESTRUN',
        courierName: 'Marc Lemoine',
        cashCents: 7800,
        cardCents: 2250,
        chequeCents: 0,
      },
    ],
    accounts: [
      { name: 'Kasa', type: 'cash', cents: 41_230 },
      { name: 'Revolut', type: 'bank', cents: 821_477 },
      { name: 'Stripe', type: 'provider', cents: 12_000 },
    ],
    ...overrides,
  };
}

function dayEndData(overrides: Partial<MoneyDayEnd> = {}): MoneyDayEnd {
  return {
    date: '2026-08-26',
    collectedCents: 73_980,
    refundCents: -1290,
    courierHandoverCents: 6800,
    discrepancy: {
      expectedCents: 7800,
      countedCents: 6800,
      runs: [
        {
          referenceNo: 'SF-26-TESTRUN',
          courierName: 'Marc Lemoine',
          closedAt: '2026-08-26T15:42:00.000Z',
          differenceCents: -1000,
        },
      ],
    },
    unexplainedMovementCount: 0,
    ...overrides,
  };
}

/** Oturum künyesi; kapsam varsayılan olarak boştur, çünkü muhasebecinin günlük hâli iki tesisli olabilir ve o hâlde tesis adı yazılmaz. */
async function renderScreen(node: React.ReactElement, loadingTestId: string, warehouse: StaffWarehouse | null = null) {
  await render(
    <OperationsSessionProvider
      value={{
        sections: ['money'],
        userName: 'Meral T.',
        userEmail: 'meral@lezzetanatolia.fr',
        warehouses: warehouse === null ? [] : [warehouse],
        resolvedWarehouseId: warehouse?.id ?? null,
      }}
    >
      {node}
    </OperationsSessionProvider>,
  );
  await waitFor(() => expect(screen.queryByTestId(loadingTestId)).toBeNull());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
});

/* Üstbaşlığın künyesi personelin bağlamını söyler, sayıların süzgecini değil; kapsamı tek tesis çözmeyen muhasebeciye tesislerden birinin adını yazmak ekranın yalan söylemesi olurdu. */
describe('tahsilat izleme · üstbaşlık künyesi', () => {
  const STR: StaffWarehouse = { id: 'w-str', code: 'STR', name: 'Strasbourg Merkez', kind: 'facility' };

  it('kapsam tek tesisi çözüyorsa künye tesisin adıyla biter', async () => {
    fetchMock.mockResolvedValue(ok(overviewData()));

    await renderScreen(<MoneyTrackingScreen />, 'money-tracking-loading', STR);

    expect(screen.getByTestId('operations-section-money')).toHaveTextContent(/Meral T\. · .+ · Strasbourg Merkez/);
  });

  it('tesis adı yoksa künye KUYRUKSUZ kalır — uydurma bir tesis yazılmaz', async () => {
    fetchMock.mockResolvedValue(ok(overviewData()));

    await renderScreen(<MoneyTrackingScreen />, 'money-tracking-loading');

    expect(screen.getByTestId('operations-section-money')).toHaveTextContent(/Meral T\./);
    expect(screen.getByTestId('operations-section-money')).not.toHaveTextContent(/Strasbourg/);
  });
});

describe('M1 · tahsilat izleme', () => {
  it('bekleyen satırlar kalan tutar + yöntemle; hesaplar defterdeki adıyla', async () => {
    fetchMock.mockResolvedValue(ok(overviewData()));

    await renderScreen(<MoneyTrackingScreen />, 'money-tracking-loading');

    /* REFERANS VE MÜŞTERİ TEK SATIRDA (v3:23) — satırın kimliği ikisinin birleşimidir; ayrı
       satırlara bölündüğünde kart iki başlıklı görünüyordu. */
    expect(screen.getByText('LA-26-TEST01 · Restaurant Bosphore')).toBeOnTheScreen();
    /* TUTAR VE ETİKET AYRI (v3:23): satırın cevabı tutar, "kapıda mı" ve yöntem onun künyesi.
       v2'de tek cümleydi ("Kapıda 42,00 € · nakit") ve tutar cümlenin içinde kayboluyordu. */
    expect(screen.getByText('42,00 €')).toBeOnTheScreen();
    /* ETİKETİN TAMAMI BÜYÜK (v3:23) — "KAPIDA · nakit" tek satırda iki büyüklük demekti.
       Büyütme dilin kuralıyla: Türkçe "nakit" → "NAKİT" (noktalı İ), `textTransform` değil. */
    expect(screen.getByText('KAPIDA · NAKİT')).toBeOnTheScreen();
    // Kısmi ödenmiş satır KALANI söyler ve referanssız hâli uydurmaz.
    expect(screen.getByText('12,90 €')).toBeOnTheScreen();
    expect(screen.getByText('KALAN · KART')).toBeOnTheScreen();
    expect(screen.getByText(`${t.track.pending.noRef} · L. Petit`)).toBeOnTheScreen();
    // Günün parası EN ÜSTTE ve toplamı kırılımdan TÜRÜYOR (42,00 + 12,90 değil; bugünkü tahsilat).
    expect(screen.getByTestId('money-today-total')).toBeOnTheScreen();
    // Hesaplar adlarıyla — üçüncü hesap (Stripe) iki sabit satıra indirgenip yutulmuyor.
    for (const name of ['Kasa', 'Revolut', 'Stripe']) {
      expect(screen.getByText(name)).toBeOnTheScreen();
    }
  });

  it('bekleyen yoksa boş cümle; bugün tahsilat yoksa kırılım da yokluğu söyler', async () => {
    fetchMock.mockResolvedValue(ok(overviewData({ pending: [], todayByMethod: [] })));

    await renderScreen(<MoneyTrackingScreen />, 'money-tracking-loading');

    expect(screen.getByTestId('money-pending-empty')).toBeOnTheScreen();
    expect(screen.getByTestId('money-today-empty')).toBeOnTheScreen();
  });

  /* Para kimde: kart sefer başınadır (kurye adı, sefer künyesi, o seferin toplamı), çünkü muhasebecinin asıl sorusu "kimde"dir. */
  it('kuryenin üstündeki para kurye ve sefer künyesiyle, sefer başına yazılır', async () => {
    fetchMock.mockResolvedValue(ok(overviewData()));

    await renderScreen(<MoneyTrackingScreen />, 'money-tracking-loading');

    expect(screen.getByText('Marc Lemoine · SF-26-TESTRUN')).toBeOnTheScreen();
    // 7800 nakit + 2250 kart + 0 çek = 10050 → "100,50 €" (toplam satırdan TÜRER)
    expect(screen.getByTestId('money-courier-float')).toHaveTextContent(/100,50\s?€/u);
  });

  /* KURYE ADI UYDURULMAZ: profili okunamayan seferde künye kuyruksuz kalır — uydurma bir ad,
     parayı yanlış kişinin üstünde gösterirdi. */
  it('kurye adı yoksa künye yalnız sefer referansıdır', async () => {
    fetchMock.mockResolvedValue(
      ok(
        overviewData({
          courierFloat: [
            {
              runId: '00000000-0000-4000-8000-000000000102',
              referenceNo: 'SF-26-ADSIZ',
              courierName: null,
              cashCents: 5000,
              cardCents: 0,
              chequeCents: 0,
            },
          ],
        }),
      ),
    );

    await renderScreen(<MoneyTrackingScreen />, 'money-tracking-loading');

    expect(screen.getByText('SF-26-ADSIZ')).toBeOnTheScreen();
  });

  /* ADET TUTARDAN TÜREMEZ (v3:23 rozeti) — aynı toplam iki tahsilattan da kırktan da gelebilir. */
  it('günün rozeti tahsilat ADEDİNİ yazar', async () => {
    fetchMock.mockResolvedValue(ok(overviewData()));

    await renderScreen(<MoneyTrackingScreen />, 'money-tracking-loading');

    expect(screen.getByTestId('money-today-count')).toHaveTextContent('14 tahsilat');
  });
});

describe('M2 · gün sonu', () => {
  it('fark İŞARETLİ yazılır — eksik para fazlayla aynı cümleye sokulmaz', async () => {
    fetchMock.mockResolvedValue(ok(dayEndData()));

    await renderScreen(<MoneyDayEndScreen />, 'money-day-end-loading');

    // 6800 − 7800 = −1000 → "−10,00 €" (işaret veriden).
    expect(screen.getByText(/\u221210,00\s?€/u)).toBeOnTheScreen();
    expect(screen.getByText(/Beklenen 78,00 €/u)).toBeOnTheScreen();
    /* CÜMLE ÖNCE, SAYI SONRA (v3:24): "−10,00 €" tek başına eksiğin mi fazlanın mı olduğunu
       söylemiyor. Başlık söylüyor — ve çözümün NEREDE olduğu da yazılı, yoksa muhasebeci bu
       ekranda bir düğme arar. */
    expect(screen.getByText(/Sefer kapanışında 10,00 € eksik/u)).toBeOnTheScreen();
    expect(screen.getByText(/Çözüm masaüstünde/u)).toBeOnTheScreen();
    /* Hangi sefer, kim, ne zaman: bir eksiğin peşine düşen muhasebeci neyi arayacağını bilmeli. */
    expect(screen.getByTestId('money-day-end-discrepancy-runs')).toHaveTextContent(
      /SF-26-TESTRUN · Marc Lemoine · \d{2}:\d{2}/u,
    );
    // Gün SUNUCUNUN söylediği gündür (fikstür 26 Ağustos), cihazın takviminden tahmin edilmez.
    expect(screen.getByText('26 Ağustos · salt okuma')).toBeOnTheScreen();
  });

  it('kapanan sefer yoksa fark 0 DEĞİL "soru sorulmadı"dır', async () => {
    fetchMock.mockResolvedValue(ok(dayEndData({ discrepancy: null })));

    await renderScreen(<MoneyDayEndScreen />, 'money-day-end-loading');

    expect(screen.getByText(t.dayEnd.discrepancy.noRun)).toBeOnTheScreen();
  });
});
