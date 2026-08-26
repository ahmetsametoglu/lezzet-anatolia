import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import type { ComplaintResponse, ExceptionsResponse } from '@lezzet/types';
import { ComplaintScreen } from './complaint-screen';
import { OrderExceptionScreen } from './order-exception-screen';
import { managementCopy } from './copy';

/*
  Y1 (ŞİKÂYET) + Y2 (İSTİSNA) EKRAN TESTLERİ (21.12 Dilim C) — ağ FETCH seviyesinde sahte,
  cevaplar sözleşme şeklinde. Çivilenen kararlar:

  · YZ taslağının "düzenleyerek gönder" yolu SUNUCUNUN döndürdüğü metni cevap kutusuna koyar —
    ekran taslağın yerel kopyasını kullanmaz (taslak o an düşmüş olabilir).
  · Cevap gönderimi gerçek gövdeyle POST'lanır ve sohbet TAZE okunur (yerel yankı yok).
  · "Orijinali gör" yalnız GERÇEKTEN çevrilmiş mesajda çizilir.
  · İstisna satırı eksik TUTARI taşır (para Y2'de görünür); "müşteriye sor" doğru kaleme gider ve
    akıbet satırda cümleye döner — "kalanı gönder" düğmesi YOKTUR (mekanizmasız düğme çizilmez).
*/

jest.mock('expo-router', () => {
  const react = jest.requireActual<{ useEffect: (effect: () => void, deps: unknown[]) => void }>('react');
  return {
    useRouter: () => ({ navigate: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => ({}),
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

const t = managementCopy;
const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

const TICKET = '00000000-0000-4000-8000-0000000000a1';
const ITEM = '00000000-0000-4000-8000-0000000000b2';
const ORDER = '00000000-0000-4000-8000-0000000000b3';

function complaintData(overrides: Partial<ComplaintResponse['complaint'] & object> = {}): ComplaintResponse {
  return {
    complaint: {
      ticketId: TICKET,
      type: 'damaged',
      status: 'open',
      source: 'order',
      handledBy: 'hybrid',
      awaitingReply: true,
      customerName: 'Claire Muller',
      orderReferenceNo: 'LA-26-TEST01',
      lastMessageAt: '2026-08-26T10:00:00Z',
      aiDraftReply: 'Özür dileriz — yarınki rotaya yeni kutu değişimi ekliyoruz.',
      messages: [
        {
          id: '00000000-0000-4000-8000-0000000000c1',
          sender: 'customer',
          body: 'Baklava kutusu ezik geldi, şerbet akmış.',
          bodyTranslated: true,
          originalBody: "Le coffret de baklava est arrivé écrasé.",
          language: 'fr',
          authorName: null,
          attachmentUrls: [],
          createdAt: '2026-08-26T09:58:00Z',
        },
      ],
      ...overrides,
    },
  };
}

function exceptionsData(): ExceptionsResponse {
  return {
    exceptions: [
      {
        orderId: ORDER,
        referenceNo: 'LA-26-TEST02',
        customerName: 'Restaurant Bosphore',
        status: 'preparing',
        totalCents: 8980,
        lines: [
          {
            orderItemId: ITEM,
            title: 'Su Böreği · tepsi',
            orderedQty: 2,
            pickedQty: 1,
            missingQty: 1,
            unitPriceCents: 1290,
            missingValueCents: 1290,
            advice: { action: 'ask_customer', reason: 'large_share' },
          },
        ],
      },
    ],
  };
}

async function renderScreen(node: React.ReactElement, loadingTestId: string) {
  await render(
    <OperationsSessionProvider value={{ sections: ['management'], userName: 'Selim A.', userEmail: 'selim@lezzetanatolia.fr' }}>
      {node}
    </OperationsSessionProvider>,
  );
  await waitFor(() => expect(screen.queryByTestId(loadingTestId)).toBeNull());
}

function lastPost(): { url: string; body: unknown } {
  const post = [...fetchMock.mock.calls].reverse().find(([, init]) => init?.method === 'POST');
  expect(post).toBeDefined();
  return { url: String(post![0]), body: JSON.parse(String(post![1]!.body)) };
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe('Y1 · şikâyet', () => {
  it('çevrilmiş mesajda orijinal açılır; cevap POST edilir ve sohbet TAZE okunur', async () => {
    let reads = 0;
    fetchMock.mockImplementation((url, init) => {
      if (init?.method === 'POST') return Promise.resolve(ok({ ok: true, reason: null }));
      reads += 1;
      return Promise.resolve(ok(complaintData()));
    });

    await renderScreen(<ComplaintScreen />, 'management-complaint-loading');

    expect(screen.getByText('Baklava kutusu ezik geldi, şerbet akmış.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('management-complaint-original-00000000-0000-4000-8000-0000000000c1'));
    expect(screen.getByText("Le coffret de baklava est arrivé écrasé.")).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByTestId('management-complaint-reply'), 'Fotoğrafları aldık, bakıyorum.');
    await fireEvent.press(screen.getByTestId('management-complaint-send'));

    await waitFor(() => {
      const { url, body } = lastPost();
      expect(url).toContain(`/management/complaints/${TICKET}/reply`);
      expect(body).toEqual({ body: 'Fotoğrafları aldık, bakıyorum.' });
    });
    // Sohbet sunucudan yeniden okunur — yerel yankı yok.
    await waitFor(() => expect(reads).toBeGreaterThanOrEqual(2));
  });

  it('YZ taslağının düzenleme yolu SUNUCUNUN döndürdüğü metni kutuya koyar', async () => {
    fetchMock.mockImplementation((url, init) => {
      if (init?.method === 'POST') {
        return Promise.resolve(ok({ ok: true, reason: null, draft: 'SUNUCUDAN dönen taslak metni' }));
      }
      return Promise.resolve(ok(complaintData()));
    });

    await renderScreen(<ComplaintScreen />, 'management-complaint-loading');
    await fireEvent.press(screen.getByTestId('management-complaint-assistant-edit'));

    await waitFor(() => {
      const { url, body } = lastPost();
      expect(url).toContain(`/management/complaints/${TICKET}/draft`);
      expect(body).toEqual({ send: false });
    });
    await waitFor(() =>
      expect(screen.getByTestId('management-complaint-reply').props.value).toBe('SUNUCUDAN dönen taslak metni'),
    );
  });

  it('red bir cümledir: reason ekranda görünür, yutulmaz', async () => {
    fetchMock.mockImplementation((url, init) => {
      if (init?.method === 'POST') return Promise.resolve(ok({ ok: false, reason: 'already_human' }));
      return Promise.resolve(ok(complaintData()));
    });

    await renderScreen(<ComplaintScreen />, 'management-complaint-loading');
    await fireEvent.press(screen.getByTestId('management-complaint-claim'));

    await waitFor(() => expect(screen.getByTestId('management-complaint-action-error')).toBeOnTheScreen());
    expect(screen.getByText(/already_human/u)).toBeOnTheScreen();
  });

  it('bekleyen talep yoksa dürüst boş hâl', async () => {
    fetchMock.mockResolvedValue(ok({ complaint: null }));

    await renderScreen(<ComplaintScreen />, 'management-complaint-loading');

    expect(screen.getByTestId('management-complaint-empty')).toBeOnTheScreen();
  });
});

describe('Y2 · istisna', () => {
  it('eksik satır PARASIYLA görünür; soru doğru kaleme gider, akıbet cümleye döner; "kalanı gönder" düğmesi YOK', async () => {
    fetchMock.mockImplementation((url, init) => {
      if (init?.method === 'POST') {
        return Promise.resolve(ok({ status: 'ok', ticketId: '00000000-0000-4000-8000-0000000000d4' }));
      }
      return Promise.resolve(ok(exceptionsData()));
    });

    await renderScreen(<OrderExceptionScreen />, 'management-exception-loading');

    expect(screen.getByText('eksik 1 adet · 12,90 €')).toBeOnTheScreen();
    expect(screen.getByText(/MÜŞTERİYE SOR/u)).toBeOnTheScreen();
    // v2'nin "kalanı gönder" düğmesi bilinçli yok — mekanizmasız düğme çizilmez (künye).
    expect(screen.queryByText(/[Kk]alanı gönder —/u)).toBeNull();

    await fireEvent.press(screen.getByTestId(`management-exception-ask-${ITEM}`));
    await waitFor(() => {
      const { url } = lastPost();
      expect(url).toContain(`/management/exceptions/${ITEM}/ask`);
    });
  });

  it('zaten sorulmuş kaleme ikinci soru: akıbet "zaten açık" cümlesidir', async () => {
    fetchMock.mockImplementation((url, init) => {
      if (init?.method === 'POST') {
        return Promise.resolve(ok({ status: 'already_asked', ticketId: '00000000-0000-4000-8000-0000000000d4' }));
      }
      return Promise.resolve(ok(exceptionsData()));
    });

    await renderScreen(<OrderExceptionScreen />, 'management-exception-loading');
    await fireEvent.press(screen.getByTestId(`management-exception-ask-${ITEM}`));

    await waitFor(() => expect(screen.getByText(t.exception.askedAlready)).toBeOnTheScreen());
  });
});
