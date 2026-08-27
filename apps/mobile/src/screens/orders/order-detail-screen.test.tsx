import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { MeOrderDetail } from '@lezzet/types';
import { OrderDetailScreen } from './order-detail-screen';
import messages from './messages.json';

/*
  SİPARİŞ DETAYI — YORUM TEŞVİKİ (27.08 · kullanıcı kararı).

  Çivilenen kararlar:
  · Blok YALNIZ açık davet varken çizilir; `feedback: null`de HİÇ doğmaz (üç hâl birden: davet
    yok · tamamlandı · süresi doldu — ekran ayrımı bilmez, sözleşme künyesi).
  · Düğme bir KAPIDIR: davetin token'ıyla akışa gider. Bildirim artık bu sayfaya götürdüğü için
    kapının açılmaması, bildirimi boş bir vaade çevirirdi.
  · Puandaki sayı SUNUCUDAN gelir; ekran rakam uydurmaz (yazılmayacak ödül vaat edilmez).

  Ağ FETCH seviyesinde sahte ve cevap SÖZLEŞME şeklinde: uç bir alanı düşürürse iddia değil
  DERLEME kırılır (yönetim ekranlarının deseni).
*/

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), navigate: jest.fn() }),
}));

const mockSession = { access_token: 'test-token' };
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
    },
  }),
}));

const t = messages.tr.detail;
const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

const TOKEN = 'fb-test-token-01';

/** Sözleşme şeklinde detay — testler yalnız değiştirdikleri parçayı ezer. */
function orderDetail(feedback: MeOrderDetail['feedback']): MeOrderDetail {
  return {
    reference: 'LA-26-TEST01',
    placedAt: '2026-08-20T10:00:00Z',
    status: 'delivered',
    active: false,
    deliveryType: 'shipping',
    deliveryDate: '2026-08-22',
    address: { line1: '8 rue de la Mésange', line2: null, postalCode: '67000', city: 'Strasbourg' },
    lines: [],
    timeline: null,
    subtotalCents: 2000,
    discountCents: 0,
    discountLabel: '',
    shippingFeeCents: 0,
    totalCents: 2000,
    paymentMethod: 'online',
    paymentStatus: 'paid',
    onAccount: false,
    shipment: null,
    feedback,
  };
}

async function renderScreen(feedback: MeOrderDetail['feedback']) {
  fetchMock.mockResolvedValue(ok(orderDetail(feedback)));
  await render(<OrderDetailScreen reference="LA-26-TEST01" locale="tr" />);
  await waitFor(() => expect(screen.queryByTestId('order-loading')).toBeNull());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
});

describe('sipariş detayı · yorum teşviki', () => {
  it('AÇIK davet varken blok çizilir ve puanı SUNUCUDAN söyler', async () => {
    await renderScreen({ token: TOKEN, points: 5 });

    expect(screen.getByTestId('order-feedback-invite')).toBeOnTheScreen();
    expect(screen.getByText(t.feedback.title)).toBeOnTheScreen();
    // Cümledeki sayı zarftan gelir: ekran kendi rakamını yazsaydı ayar değiştiği gün
    // müşteriye sistemin vermeyeceği bir ödül vaat edilirdi.
    expect(screen.getByText(t.feedback.body.replace('{points}', '5'))).toBeOnTheScreen();
  });

  it('davet YOKKEN blok HİÇ çizilmez — ölü kutu yok', async () => {
    await renderScreen(null);

    expect(screen.queryByTestId('order-feedback-invite')).toBeNull();
    expect(screen.queryByTestId('order-feedback-cta')).toBeNull();
  });

  it('düğme akışı DAVETİN TOKEN’ıyla açar — bildirimin indiği sayfa boş vaat olmasın', async () => {
    await renderScreen({ token: TOKEN, points: 5 });

    await fireEvent.press(screen.getByTestId('order-feedback-cta'));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/feedback/[token]', params: { token: TOKEN } });
  });
});
