import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { DeliveryZonesScreen } from './delivery-zones-screen';
import messages from './messages.json';

/*
  EKRAN TESTİ — üç hâlin ÜÇÜ (yükleniyor · dolu liste · boş liste) + hata ve tekrar deneme, bir
  de posta kodu çekmecesinin açılışı. Hook TAKLİT EDİLMEZ: gerçek hook + taklit `fetch` ile
  koşuyor, yani ekranın gördüğü veri gerçekten sözleşmeden (`DeliveryAreaListSchema`) geçiyor.

  BOŞ LİSTE ile HATA'nın AYRI test edilmesi bilinçli: ikisi tek dala indirilseydi ekran, çalışan
  bir sistemi arızalı gösterir ya da düşen bir okumayı "bölge yok" diye okuturdu.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-FR' }] }));

// Cihazda saklı kod yok — çekmece boş taslakla açılır, yer çözümü (beş hane) tetiklenmez.
jest.mock('@/lib/onboarding/onboarding-store');

// Ad `mock` ile başlamak ZORUNDA: `jest.mock` fabrikası dosyanın tepesine kaldırılıyor.
const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: () => mockBack(), push: jest.fn() }) }));

// Çekmece kimliği kitin ortak durumundan okuyor (`useMe`); oturumsuz hâl döner, ağa çıkılmaz.
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      refreshSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

const t = messages.tr;

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

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockBack.mockReset();
});

describe('DeliveryZonesScreen', () => {
  it('ilk yükte halkayı çizer ve bölge ucunu çağırır', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));

    await render(<DeliveryZonesScreen />);

    expect(screen.getByRole('progressbar', { name: t.loading })).toBeOnTheScreen();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://api.test/api/v1/places/zones');
  });

  /* Liste ÜLKE → YER → KODLAR diye öbekli (kullanıcının ölçek sorusu 10.08: 200 kodun ellisi
     Almanya'da). Test üç şeyi birden tutuyor: ülke başlığı ekranın sözlüğünden geliyor (uç KOD
     gönderiyor), yer adı öbeği başlıklıyor, kodlar rozet olarak basılıyor. */
  it('kodları ÜLKE ve YER adına göre öbekli listeler; kapanış cümlesi durur', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        areas: [
          { country: 'FR', places: [{ name: 'Strasbourg', codes: ['67000', '67100'] }] },
          { country: 'DE', places: [{ name: 'Kehl', codes: ['77694'] }] },
        ],
      }),
    );

    await render(<DeliveryZonesScreen />);

    expect(await screen.findByTestId('zones-list')).toBeOnTheScreen();
    expect(screen.getByText(t.countries.FR)).toBeOnTheScreen();
    expect(screen.getByText(t.countries.DE)).toBeOnTheScreen();
    // Satır başına TEK yer: ad + parantez içinde kodları (kullanıcı kararı 10.08).
    expect(screen.getByText('Strasbourg (67000 · 67100)')).toBeOnTheScreen();
    expect(screen.getByText('Kehl (77694)')).toBeOnTheScreen();
    expect(screen.getByText(t.closing)).toBeOnTheScreen();
  });

  /* Yer kaydı OLMAYAN kod (sözleşmenin `name: null` hâli): kod yine listelenir, yalnız başlıksız —
     gittiğimiz bir yeri saklamak, adı uydurmak kadar yanlış olurdu. */
  it('adı çözülemeyen kod BAŞLIKSIZ ama LİSTEDE kalır', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ areas: [{ country: 'FR', places: [{ name: null, codes: ['67999'] }] }] }),
    );

    await render(<DeliveryZonesScreen />);

    // Adsız öbek YALNIZ kodlarıyla, parantezsiz.
    expect(await screen.findByText('67999')).toBeOnTheScreen();
    expect(screen.getByText(t.countries.FR)).toBeOnTheScreen();
  });

  it('boş liste HATA DEĞİLDİR: kendi cümlesiyle söylenir', async () => {
    fetchMock.mockResolvedValue(okResponse({ areas: [] }));

    await render(<DeliveryZonesScreen />);

    expect(await screen.findByTestId('zones-empty')).toBeOnTheScreen();
    expect(screen.queryByTestId('zones-error')).toBeNull();
    // Kargo cümlesi boş listede de doğrudur ve gizlenmez.
    expect(screen.getByText(t.closing)).toBeOnTheScreen();
  });

  it('okuma düşerse hata kutusu çıkar; tekrar dene listeyi getirir', async () => {
    fetchMock.mockResolvedValueOnce(failResponse()).mockResolvedValue(okResponse({ areas: [{ country: 'FR', places: [{ name: 'Colmar', codes: ['68000'] }] }] }));

    await render(<DeliveryZonesScreen />);

    expect(await screen.findByTestId('zones-error')).toBeOnTheScreen();
    // Sayfanın kalanı yerinde: hata yalnız listenin hâlidir.
    expect(screen.getByTestId('zones-try-code')).toBeOnTheScreen();

    // `await`li dokunuş: tekrar deneme yeni bir uçuş başlatıyor, cevabı beklenmezse React
    // "act(...) dışında güncelleme" uyarısı basar.
    await fireEvent.press(screen.getByTestId('zones-retry'));

    await waitFor(() => expect(screen.getByText('Colmar (68000)')).toBeOnTheScreen());
    expect(screen.queryByTestId('zones-error')).toBeNull();
  });

  it('"kendi kodumu deneyeyim" ORTAK çekmeceyi açar (ikinci bir alan yazılmadı)', async () => {
    fetchMock.mockResolvedValue(okResponse({ areas: [{ country: 'FR', places: [{ name: 'Strasbourg', codes: ['67000'] }] }] }));

    await render(<DeliveryZonesScreen />);
    await screen.findByTestId('zones-list');

    expect(screen.queryByTestId('zones-zip-sheet')).toBeNull();
    await fireEvent.press(screen.getByTestId('zones-try-code'));

    expect(await screen.findByTestId('zones-zip-sheet')).toBeOnTheScreen();
    expect(screen.getByTestId('zones-zip-field')).toHaveProp('value', '');
  });

  it('geri düğmesi yığından çıkarır', async () => {
    fetchMock.mockResolvedValue(okResponse({ areas: [] }));

    await render(<DeliveryZonesScreen />);
    await screen.findByTestId('zones-empty');

    fireEvent.press(screen.getByTestId('zones-back'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
