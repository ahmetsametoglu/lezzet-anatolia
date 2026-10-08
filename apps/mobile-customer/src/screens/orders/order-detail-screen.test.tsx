import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { CROP_CENTER, type MeOrderDetail } from '@lezzet/types';
import { OrderDetailScreen } from './order-detail-screen';
import messages from '@lezzet/i18n/customer/orders';

/*
  Ağ fetch düzeyinde sahte ve cevap sözleşme şeklinde, ki uç bir alanı düşürünce iddia değil derleme kırılsın. Tekrar siparişin
  sepet yazımı depoda (`reorderInto`) taklit edilir; burada ekranın kararı sınanır.
*/

const mockPush = jest.fn();
const mockReorderInto = jest.fn();
jest.mock('@/screens/customer-kit/cart-store', () => ({
  ...jest.requireActual<object>('@/screens/customer-kit/cart-store'),
  reorderInto: (...args: unknown[]) => mockReorderInto(...args),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), navigate: jest.fn() }),
}));

const mockSession = { access_token: 'test-token' };
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
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
function orderDetail(feedback: MeOrderDetail['feedback'], overrides: Partial<MeOrderDetail> = {}): MeOrderDetail {
  return { ...temelDetay(feedback), ...overrides };
}

function temelDetay(feedback: MeOrderDetail['feedback']): MeOrderDetail {
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
    pickup: null,
    subtotalCents: 2000,
    discountCents: 0,
    discountLabel: '',
    shippingFeeCents: 0,
    totalCents: 2000,
    pricesIncludeVat: true,
    zeroRated: false,
    vat: [],
    paymentMethod: 'online',
    paymentStatus: 'paid',
    onAccount: false,
    shipment: null,
    feedback,
  };
}

async function renderScreen(feedback: MeOrderDetail['feedback'], overrides: Partial<MeOrderDetail> = {}) {
  fetchMock.mockResolvedValue(ok(orderDetail(feedback, overrides)));
  await render(<OrderDetailScreen reference="LA-26-TEST01" locale="tr" />);
  await waitFor(() => expect(screen.queryByTestId('order-loading')).toBeNull());
}

/**
 * Gönderi künyesi — eski üç alan (geriye uyum) ile yeni alanlar BİRLİKTE taşınır, çünkü sözleşme
 * de öyle taşıyor. Eskiler İLK koliyi anlatıyor; ekranın onları artık okumaması bu testlerin
 * asıl iddiası.
 */
function shipmentOf(parcels: Array<{ ordinal: string | null; trackingNumber: string; trackingUrl: string | null }>, carrierName: string | null = 'Chronopost'): MeOrderDetail['shipment'] {
  const ilk = parcels[0];
  return {
    carrier: 'other',
    trackingNumber: ilk?.trackingNumber ?? null,
    trackingUrl: ilk?.trackingUrl ?? null,
    carrierName,
    parcels,
  };
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

/* Çok kutulu takip: ekran koli başına numarayı ve taşıyıcının gerçek adını okur, eski tek koli alanlarını değil. */
describe('sipariş detayı · çok kutulu takip', () => {
  it('TEK kutuda görüntü DEĞİŞMEDİ: sıra yazılmaz, tek takip düğmesi çıkar', async () => {
    await renderScreen(null, {
      shipment: shipmentOf([{ ordinal: null, trackingNumber: 'CH0001', trackingUrl: 'https://takip.test/CH0001' }]),
    });

    // `1/1` yazmak olmayan bir bölünmeyi varmış gibi göstermek olurdu.
    expect(screen.getByText(t.trackingNumber)).toBeOnTheScreen();
    expect(screen.getByText('CH0001')).toBeOnTheScreen();
    expect(screen.getByTestId('order-tracking')).toBeOnTheScreen();
  });

  it('ÇOK kutuda her koli kendi satırını ve kendi bağlantısını alır', async () => {
    await renderScreen(null, {
      shipment: shipmentOf([
        { ordinal: '1/2', trackingNumber: 'CH0001', trackingUrl: 'https://takip.test/CH0001' },
        { ordinal: '2/2', trackingNumber: 'CH0002', trackingUrl: 'https://takip.test/CH0002' },
      ]),
    });

    expect(screen.getByText('CH0001')).toBeOnTheScreen();
    expect(screen.getByText('CH0002')).toBeOnTheScreen();
    expect(screen.getByText(`${t.trackingNumber} 1/2`)).toBeOnTheScreen();
    expect(screen.getByText(`${t.trackingNumber} 2/2`)).toBeOnTheScreen();
    // Tek büyük düğme YERİNE kutu başına satır: hangi bağlantının hangi kutu olduğu yazıyor.
    expect(screen.queryByTestId('order-tracking')).toBeNull();
    expect(screen.getByTestId('order-tracking-1-2')).toBeOnTheScreen();
    expect(screen.getByTestId('order-tracking-2-2')).toBeOnTheScreen();
  });

  it('TAŞIYICININ GERÇEK ADI yazılır — enum "Kargo firması"na düşülmez', async () => {
    await renderScreen(null, {
      shipment: shipmentOf([{ ordinal: null, trackingNumber: 'CH0001', trackingUrl: null }], 'Chronopost'),
    });

    expect(screen.getByText('Chronopost')).toBeOnTheScreen();
    // Sözleşme `carrier: 'other'` gönderiyor; ekran onu okusaydı bu metin çıkardı.
    expect(screen.queryByText(t.carrier.other)).toBeNull();
  });

  it('adresi olmayan koli DÜĞME AÇMAZ ama numarası özette durur', async () => {
    await renderScreen(null, {
      shipment: shipmentOf([{ ordinal: null, trackingNumber: 'MANUEL-42', trackingUrl: null }], null),
    });

    expect(screen.getByText('MANUEL-42')).toBeOnTheScreen();
    expect(screen.queryByTestId('order-tracking')).toBeNull();
    // `carrierName` boşsa eski enum'a düşülür — elle girilmiş taşıyıcının meşru hâli.
    expect(screen.getByText(t.carrier.other)).toBeOnTheScreen();
  });
});

/* Eksik karşılama: cümle yalnız eksiği söyler, para çözümü tutar sütununda (çizili eski, altında ödenecek). */
describe('sipariş detayı · eksik karşılama', () => {
  const eksikSatir = (): MeOrderDetail['lines'] => [
    {
      id: 'line-1',
      name: 'Su Böreği',
      unitLabel: '2500 g',
      image: { url: null, crop: CROP_CENTER, frames: null },
      bundle: null,
      qty: 2,
      billedQty: 1,
      shortfall: true,
      shortfallCents: 2247,
      unitPriceCents: 2247,
      lineTotalCents: 1572,
    },
  ];

  it('cümle yalnız EKSİĞİ söyler ve gramajın yanında durur', async () => {
    await renderScreen(null, { lines: eksikSatir(), totalCents: 2392 });

    expect(screen.getByText(/2500 g · 1 adet eksik gönderildi/)).toBeOnTheScreen();
  });

  it('tutar sütununda SİPARİŞ EDİLENİN tutarı üstü çizili, ödenecek olan yanında', async () => {
    await renderScreen(null, { lines: eksikSatir(), totalCents: 2392 });

    // 15,72 + 22,47 = 38,19 — sipariş edilen 2 adedin tutarı. Sözleşmeden türer, alan eklenmedi.
    expect(screen.getByTestId('order-line-was-line-1')).toHaveTextContent(/38,19/);
    expect(screen.getByTestId('order-line-was-line-1')).toHaveStyle({ textDecorationLine: 'line-through' });
  });

  it('sipariş TOPLAMI satıra yazılmaz — orası satırın yeri, siparişin değil', async () => {
    await renderScreen(null, { lines: eksikSatir(), paymentMethod: 'cash', paymentStatus: 'pending', totalCents: 2392 });

    // Toplam yalnız özet panelinde geçer; satır bloğunda hiç görünmez.
    expect(within(screen.getByTestId('order-line-line-1')).queryByText(/23,92/)).toBeNull();
  });

  it('eksiği OLMAYAN satırda ne cümle ne çizili tutar doğar — ölü işaret yok', async () => {
    await renderScreen(null, {
      lines: [{ ...eksikSatir()[0]!, shortfall: false, shortfallCents: 0, billedQty: 2 }],
    });

    expect(screen.queryByTestId('order-line-was-line-1')).toBeNull();
    expect(screen.queryByText(/eksik gönderildi/)).toBeNull();
  });
});

describe('sipariş detayı · tekrar sipariş', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReorderInto.mockReset();
  });

  // Hiçbir kalem eklenemediğinde boş sepete götürülürse ya da eklendiğinde sepete gidilmezse kırmızıya döner.
  it('kalem eklendiyse sepete gider; hiçbiri eklenemediyse sayfada kalır', async () => {
    mockReorderInto.mockResolvedValueOnce({ data: { added: 0, skipped: ['Su Böreği'] }, error: null });
    await renderScreen(null);

    await fireEvent.press(screen.getByTestId('order-reorder'));
    await waitFor(() => expect(mockReorderInto).toHaveBeenCalledWith('LA-26-TEST01'));
    expect(mockPush).not.toHaveBeenCalledWith('/cart');

    mockReorderInto.mockResolvedValueOnce({ data: { added: 1, skipped: [] }, error: null });
    await fireEvent.press(screen.getByTestId('order-reorder'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/cart'));
  });
});

describe('sipariş detayı · yoldaki sipariş', () => {
  const yoldaCizgi: MeOrderDetail['timeline'] = [
    { milestone: 'received', state: 'done', at: '2026-08-20T10:00:00Z' },
    { milestone: 'prepared', state: 'done', at: null },
    { milestone: 'on_the_way', state: 'current', at: '2026-08-21T09:00:00Z' },
    { milestone: 'delivered', state: 'pending', at: null },
  ];

  // Kargo da "yolda" sayıldığı için ayrım düşerse taşıyıcıdaki koliye kurye haritası ve "kurye bölgenizde" notu çıkar.
  it('kargoda kurye haritası ve kurye notu yok, kargo notu var', async () => {
    await renderScreen(null, { status: 'on_the_way', active: true, deliveryType: 'shipping', timeline: yoldaCizgi });

    expect(screen.queryByTestId('order-map')).toBeNull();
    expect(screen.getByText(t.onTheWayShipping)).toBeOnTheScreen();
    expect(screen.queryByText(t.note.on_the_way)).toBeNull();
  });

  it('kurye seferinde harita ve kurye notu görünür', async () => {
    await renderScreen(null, { status: 'on_the_way', active: true, deliveryType: 'route', timeline: yoldaCizgi });

    expect(screen.getByTestId('order-map')).toBeOnTheScreen();
    expect(screen.getByText(t.note.on_the_way)).toBeOnTheScreen();
  });
});
