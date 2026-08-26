import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import type { ManagementHub } from '@lezzet/types';
import { DaySummaryScreen } from './day-summary-screen';
import { ManagementHubScreen } from './management-hub-screen';
import { managementCopy } from './copy';

/*
  YÖNETİM HUB + GÜN ÖZETİ EKRAN TESTİ (21.12 Dilim A) — depo hub emsali: hook taklit edilmez,
  ağ FETCH seviyesinde sahte ve cevap SÖZLEŞME şeklinde (alan düşerse Zod testte kırar).

  Çivilenen kararlar:
  · SIFIR SAYILI KARAR ALANI HİÇ ÇİZİLMEZ — dokununca boş ekran açan ölü satır olmasın.
  · Hata hâli GERÇEK: "Tekrar dene" yeniden okur ve toparlanır (fixture dönemindeki "basılınca
    hiçbir şey denemeyen düğme çizilmez" sözünün kapanışı).
  · Ölçülemeyen kanal cirosu "bilinmiyor" yazar, 0,00 € değil (CLAUDE §1).
  · İçgörü motoru yokken blok yokluğu SÖYLER, uydurma metin basmaz.
*/

// Ad `mock` ile başlamak ZORUNDA (jest hoisting) — gezinme iddiaları bu casusa bakar.
const mockNavigate = jest.fn();
jest.mock('expo-router', () => {
  const react = jest.requireActual<{ useEffect: (effect: () => void, deps: unknown[]) => void }>('react');
  return {
    useRouter: () => ({ navigate: mockNavigate, back: jest.fn() }),
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

function fail(error: string, status = 500): Response {
  return { status, headers: { get: () => null }, json: async () => ({ data: null, error }) } as unknown as Response;
}

/**
 * Mock URL-YÖNLENDİRMELİDİR, sıra-bazlı değil (ölçüldü 26.08): başlıktaki zil de artık fetch'liyor
 * (`/me/notifications`, bildirim şeridi) ve sıra-bazlı `mockResolvedValueOnce` hangi çağrının önce
 * geldiğine göre YANLIŞ cevabı yutuyordu. Hub'a ait olmayan yol nötr bir hata alır — zil kancası
 * kendi hatasını kendi yutar, ekran çizilir; bu testin konusu zil değil.
 */
function routeHub(hub: () => Response) {
  fetchMock.mockImplementation((url) =>
    Promise.resolve(String(url).includes('/management/hub') ? hub() : fail('not_in_this_test', 500)),
  );
}

/** Sözleşme şeklinde hub zarfı — testler yalnız değiştirdikleri parçayı ezer. */
function hubData(overrides: {
  queue?: Partial<ManagementHub['queue']>;
  summary?: Partial<ManagementHub['summary']>;
} = {}): ManagementHub {
  return {
    queue: {
      complaints: {
        count: 3,
        head: {
          ticketId: '00000000-0000-4000-8000-000000000001',
          type: 'damaged',
          customerName: 'Claire Muller',
          orderReferenceNo: 'LA-26-TEST01',
          hasAttachment: true,
          awaitingReply: true,
          lastMessageAt: '2026-08-26T10:00:00Z',
        },
      },
      exceptions: {
        count: 1,
        head: { orderId: '00000000-0000-4000-8000-000000000002', referenceNo: 'LA-26-TEST02', shortLineCount: 2 },
      },
      offers: { candidateCount: 4 },
      supply: { groupCount: 2, unmappedVariantCount: 1 },
      intents: { count: 2 },
      ...overrides.queue,
    },
    summary: {
      date: '2026-08-26',
      orderCount: 12,
      preparingCount: 5,
      revenueCents: 141_260,
      openComplaintCount: 3,
      channels: [
        { source: 'web', cents: 108_640 },
        { source: 'door', cents: 32_620 },
        { source: 'whatsapp', cents: null },
      ],
      pendingPayment: { count: 4, cents: 17_850 },
      tomorrow: { orderCount: 14, readyCount: 9, doorPaymentCents: 21_200 },
      insights: [],
      ...overrides.summary,
    },
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

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockNavigate.mockReset();
});

describe('yönetim hub — karar kutusu', () => {
  it('beş karar alanı da doluysa beş satır çizilir; "top bizde" rozeti başlıktan gelir', async () => {
    routeHub(() => ok(hubData()));

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');

    for (const key of ['complaint', 'exception', 'offer', 'supply', 'intent']) {
      expect(screen.getByTestId(`management-decision-${key}`)).toBeOnTheScreen();
    }
    expect(screen.getByText(t.common.ourTurn)).toBeOnTheScreen();
    // Özet kartı zarfın sayılarını okur — 12 sipariş · 5 hazırlanıyor · 4 tahsilat bekliyor.
    expect(screen.getByText('12 sipariş · 5 hazırlanıyor · 4 tahsilat bekliyor')).toBeOnTheScreen();
  });

  it('SIFIR sayılı alan HİÇ çizilmez — ölü satır yok', async () => {
    routeHub(() =>
      ok(
        hubData({
          queue: {
            exceptions: { count: 0, head: null },
            offers: { candidateCount: 0 },
            supply: { groupCount: 0, unmappedVariantCount: 0 },
            intents: { count: 0 },
          },
        }),
      ),
    );

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');

    expect(screen.getByTestId('management-decision-complaint')).toBeOnTheScreen();
    for (const key of ['exception', 'offer', 'supply', 'intent']) {
      expect(screen.queryByTestId(`management-decision-${key}`)).toBeNull();
    }
  });

  it('şikâyet satırı başı KİMLİĞİYLE açar; niyet satırı SOSYAL kutuya gider (Y6 kararı)', async () => {
    routeHub(() => ok(hubData()));

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');

    await fireEvent.press(screen.getByTestId('management-decision-complaint'));
    // Kutunun gösterdiği satır ile açılan talep AYNI olmalı — adres kimlik taşır.
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/complaint',
      params: { id: '00000000-0000-4000-8000-000000000001' },
    });

    await fireEvent.press(screen.getByTestId('management-decision-intent'));
    // Ayrı niyet ekranı YOK (bilinçli sapma): gerçek sosyal gelen kutusu açılır.
    expect(mockNavigate).toHaveBeenCalledWith('/social');
  });

  it('okuma düşerse hata bloğu; "Tekrar dene" GERÇEKTEN yeniden okur ve toparlanır', async () => {
    let hubCalls = 0;
    routeHub(() => {
      hubCalls += 1;
      return hubCalls === 1 ? fail('boom') : ok(hubData());
    });

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');
    expect(screen.getByTestId('management-hub-error')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('management-hub-error-retry'));
    await waitFor(() => expect(screen.getByTestId('management-decision-complaint')).toBeOnTheScreen());
    expect(hubCalls).toBe(2);
  });
});

describe('gün özeti', () => {
  it('ölçülemeyen kanal "bilinmiyor" yazar; içgörü yokken yokluk söylenir', async () => {
    routeHub(() => ok(hubData()));

    await renderScreen(<DaySummaryScreen />, 'management-day-summary-loading');

    expect(screen.getByText(t.summary.channels.unknown)).toBeOnTheScreen();
    expect(screen.getByTestId('management-insights-empty')).toBeOnTheScreen();
    // Yarın cümlesi "rotaya atanmamış" İÇERMEZ — sefer sabah kurulur, o sayı bugünden ölçülemez.
    expect(screen.getByText('14 sipariş · 9 hazır · kapıda ödeme yükü 212,00 €')).toBeOnTheScreen();
  });
});
