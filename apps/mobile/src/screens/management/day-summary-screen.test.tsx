import { render, screen, waitFor, within } from '@testing-library/react-native';

import { money } from '@/lib/operations/money';
import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import type { ManagementHub, StaffWarehouse } from '@lezzet/types';
import { DaySummaryScreen } from './day-summary-screen';
import { managementCopy } from './copy';

/*
  Y5 · GÜN ÖZETİ — v3 YERLEŞİMİNİN TESTİ (v3:29). Ağ FETCH seviyesinde sahte, cevap SÖZLEŞME
  şeklinde (alan düşerse test kırar). Çivilenen kararlar:

  · Koyu kart günün cevabını TEK yerde verir: ciro + sipariş sayısı + kanal kırılımı.
  · Kutucuk ızgarasının "aday parti" sayısı zarfın KARAR KUTUSU tarafından gelir — ekran ikinci bir
    uç istemez, iki katman aynı okumadan beslenir (hub ile özet aynı sayıyı söyler).
  · Künye satırı GÜNÜN adıdır; tesisin adı ancak personelin kapsamı onu çözüyorsa eklenir (30.08)
    — çözmüyorsa künye kuyruksuz kalır ve uydurma bir tesis adı yazılmaz.
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

const t = managementCopy;
const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

function fail(error: string): Response {
  return { status: 500, headers: { get: () => null }, json: async () => ({ data: null, error }) } as unknown as Response;
}

/** Sözleşme şeklinde hub zarfı — bu ekran hub'la AYNI okumayı tüketir. */
function hubData(): ManagementHub {
  return {
    queue: {
      complaints: { count: 3, head: null },
      exceptions: { count: 0, head: null },
      offers: { candidateCount: 4, head: null },
      supply: { groupCount: 2, unmappedVariantCount: 1, head: null },
      intents: { count: 2 },
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
    },
  };
}

/**
 * Kapsam varsayılan olarak BOŞ: yönetim okumaları depo boyutu taşımaz ve yöneticinin kapsamı
 * çoğunlukla boştur (`seed/people.ts` → `yonetici`). Tesis adını ölçen test kendi tesisini verir.
 */
async function renderSummary(warehouse: StaffWarehouse | null = null) {
  fetchMock.mockImplementation((url) =>
    Promise.resolve(String(url).includes('/management/hub') ? ok(hubData()) : fail('not_in_this_test')),
  );
  await render(
    <OperationsSessionProvider
      value={{
        sections: ['management'],
        userName: 'Selim A.',
        userEmail: 'selim@lezzetanatolia.fr',
        warehouses: warehouse === null ? [] : [warehouse],
        resolvedWarehouseId: warehouse?.id ?? null,
      }}
    >
      <DaySummaryScreen />
    </OperationsSessionProvider>,
  );
  await waitFor(() => expect(screen.queryByTestId('management-day-summary-loading')).toBeNull());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe('gün özeti · v3 yerleşimi', () => {
  it('koyu kart ciroyu, sipariş sayısını ve kanal kırılımını birlikte söyler', async () => {
    await renderSummary();

    const card = within(screen.getByTestId('management-summary-revenue'));
    expect(card.getByText(money(141_260))).toBeOnTheScreen();
    expect(card.getByText('12 sipariş')).toBeOnTheScreen();
    // Kırılım kanal bazlıdır (web/kapı/WhatsApp) — v3'ün B2B/B2C ayrımı sözleşmede yok.
    expect(within(card.getByTestId('management-channel-web')).getByText(money(108_640))).toBeOnTheScreen();
    expect(within(card.getByTestId('management-channel-door')).getByText(t.summary.channels.door)).toBeOnTheScreen();
  });

  it('kutucuklar hazırlık oranını, bekleyen tahsilatı ve KARAR KUTUSUNUN aday partisini gösterir', async () => {
    await renderSummary();

    expect(within(screen.getByTestId('management-summary-preparing')).getByText('5/12')).toBeOnTheScreen();

    const pending = within(screen.getByTestId('management-summary-door-pending'));
    expect(pending.getByText(money(17_850))).toBeOnTheScreen();
    expect(pending.getByText('4 sipariş tahsilat bekliyor')).toBeOnTheScreen();

    // Sayı özetten DEĞİL kuyruktan gelir: hub "4 aday parti" diyorsa özet de 4 demek zorunda.
    const offers = within(screen.getByTestId('management-summary-offer-candidates'));
    expect(offers.getByText('4')).toBeOnTheScreen();
    expect(offers.getByText(t.summary.tiles.offerCandidates)).toBeOnTheScreen();
  });

  it('künye GÜNÜN adını yazar; tesis adı yoksa KUYRUKSUZ kalır (uydurulmaz)', async () => {
    await renderSummary();

    expect(within(screen.getByTestId('management-day-summary-header')).getByText('26 Ağustos')).toBeOnTheScreen();
  });

  it('kapsam tek tesisi çözüyorsa künye "gün · tesis" olur (v3:29)', async () => {
    await renderSummary({ id: 'w-str', code: 'STR', name: 'Strasbourg Merkez', kind: 'facility' });

    expect(screen.getByTestId('management-day-summary-header')).toHaveTextContent(/26 Ağustos · Strasbourg Merkez/);
  });
});
