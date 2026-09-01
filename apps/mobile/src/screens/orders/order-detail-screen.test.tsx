import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { CROP_CENTER, type MeOrderDetail } from '@lezzet/types';
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

/*
  ÇOK KUTULU TAKİP (07.12) — dört iddia.

  Sözleşme 28.08'de genişledi: gönderi artık `carrierName` (taşıyıcının GERÇEK adı) ve `parcels`
  (koli başına takip) taşıyor. Eski üç alan (`carrier` · `trackingNumber` · `trackingUrl`) yalnız
  geriye uyum için duruyor ve İLK koliyi anlatıyor — ekran onları okumayı bıraktı.

  Bırakmasaydı ne olurdu, ölçüldü: üç kutulu bir siparişte taşıyıcı "Kargo firması" (enum `other`)
  yazıyor ve üç numaradan yalnız biri görünüyordu.
*/
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

/*
  EKSİK KARŞILAMA (kullanıcı kararı 01.09) — satırın KENDİSİ konuşur, kutusu yoktur.

  Çivilenen iki şey: (1) cümle yalnız EKSİĞİ söyler — "kaç sipariş edildi" ad satırında zaten var,
  ikinci kez yazmak gürültü; (2) para çözümü CÜMLEDE değil TUTAR SÜTUNUNDA — sipariş edilenin
  tutarı üstü çizili, ödenecek olan altında. Bir tur burada "tahsilat {sipariş toplamı}" yazıyordu:
  o sipariş DÜZEYİNDE bir sayı ve birden çok eksik satırda defalarca tekrarlanırdı.
*/
describe('sipariş detayı · eksik karşılama', () => {
  const eksikSatir = (): MeOrderDetail['lines'] => [
    {
      id: 'line-1',
      name: 'Su Böreği',
      unitLabel: '2500 g',
      image: { url: null, crop: CROP_CENTER },
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
