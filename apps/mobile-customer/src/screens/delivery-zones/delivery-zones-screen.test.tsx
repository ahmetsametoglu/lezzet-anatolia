import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import messages from '@lezzet/i18n/customer/delivery-zones';

import * as onboardingStore from '@/lib/onboarding/onboarding-store';
import { DeliveryZonesScreen } from './delivery-zones-screen';

/*
  Ekranın üç hâli (yükleniyor, dolu, boş), hata ve tekrar deneme ile kod kartı gerçek hook ve taklit `fetch` ile sınanır ki veri
  sözleşmeden geçsin. Boş liste ile hata ayrı sınanır, çünkü tek dala inseler ekran çalışan sistemi arızalı ya da arızayı "bölge yok" gösterirdi.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-FR' }] }));

// Varsayılan: cihazda saklı kod yok, kod kartı boş açılır ve yer çözümü (beş hane) tetiklenmez.
jest.mock('@/lib/onboarding/onboarding-store');

// Ad `mock` ile başlamak ZORUNDA: `jest.mock` fabrikası dosyanın tepesine kaldırılıyor.
const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: () => mockBack(), push: jest.fn() }) }));

// Çekmece kimliği kitin ortak durumundan okuyor (`useMe`); oturumsuz hâl döner, ağa çıkılmaz.
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      refreshSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

/* İlan edilen tutarlar da gerçek uçtan gelir, kapanış cümlesinin ülkeleri oradan okunur; sahtelenmezse `apiFetch` env arar ve testte
   patlar. */
jest.mock('@/lib/api/delivery-terms', () => ({
  fetchDeliveryTerms: () =>
    Promise.resolve({
      data: {
        minBasketRouteCents: 4000,
        minBasketShippingCents: 0,
        freeShippingCents: 6000,
        codMaxCents: 50_000,
        shippingCountries: ['FR', 'DE'],
      },
      error: null,
      status: 200,
    }),
}));

const t = messages.tr;

/** Kapanış cümlesinin ülke yer tutucusu doldurulmuş hâli — cümleyi testte yeniden yazmamak için. */
const closingWith = (countries: string) => t.closing.replace('{countries}', countries);

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
  // Gösterge iskelettir; ekran okuyucuya giden ses (rol, ad, meşgul) testin tuttuğu şeydir.
  it('ilk yükte listenin skeletonını çizer ve bölge ucunu çağırır', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));

    await render(<DeliveryZonesScreen />);

    expect(screen.getByRole('progressbar', { name: t.loading })).toBeOnTheScreen();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://api.test/api/v1/places/zones');
  });

  /* Ülke kartları kapalı gelir ki liste büyüdükçe sayfa uzamasın; ülke adı ekranın sözlüğünden gelir, çünkü uç yalnız kod gönderir. */
  it('ülke kartları kapalı gelir, açılınca yerleri kodlarıyla gösterir; kapanış cümlesi durur', async () => {
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
    // Ülke adı kod kartının çipinde de geçtiği için kartın kendi içinde aranır.
    expect(screen.getByTestId('zones-area-FR')).toHaveTextContent(new RegExp(t.countries.FR));
    expect(screen.getByTestId('zones-area-DE')).toHaveTextContent(new RegExp(t.countries.DE));
    expect(screen.getByText(t.placeCount.replace('{n}', '2'))).toBeOnTheScreen();
    expect(screen.queryByText('Strasbourg')).toBeNull();

    await fireEvent.press(screen.getByTestId('zones-area-FR'));

    expect(screen.getByText('Strasbourg')).toBeOnTheScreen();
    expect(screen.getByText('67000 · 67100')).toBeOnTheScreen();
    // Öteki kart kendi kendine açılmaz.
    expect(screen.queryByText('Kehl')).toBeNull();
    // Kapanış cümlesinin ülkeleri kargo depolarından türer; ekran yalnız yer tutucuyu doldurur.
    expect(await screen.findByText(closingWith('Fransa ve Almanya'))).toBeOnTheScreen();
  });

  /* Yer kaydı OLMAYAN kod (sözleşmenin `name: null` hâli): kod yine listelenir, yalnız başlıksız —
     gittiğimiz bir yeri saklamak, adı uydurmak kadar yanlış olurdu. */
  it('adı çözülemeyen kod BAŞLIKSIZ ama LİSTEDE kalır', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ areas: [{ country: 'FR', places: [{ name: null, codes: ['67999'] }] }] }),
    );

    await render(<DeliveryZonesScreen />);
    await fireEvent.press(await screen.findByTestId('zones-area-FR'));

    // Adsız yer yalnız kodlarıyla çizilir.
    expect(screen.getByText('67999')).toBeOnTheScreen();
  });

  it('boş liste HATA DEĞİLDİR: kendi cümlesiyle söylenir', async () => {
    fetchMock.mockResolvedValue(okResponse({ areas: [] }));

    await render(<DeliveryZonesScreen />);

    expect(await screen.findByTestId('zones-empty')).toBeOnTheScreen();
    expect(screen.queryByTestId('zones-error')).toBeNull();
    // Kargo cümlesi boş listede de doğrudur ve gizlenmez.
    expect(await screen.findByText(closingWith('Fransa ve Almanya'))).toBeOnTheScreen();
  });

  it('okuma düşerse hata kutusu çıkar; tekrar dene listeyi getirir', async () => {
    fetchMock.mockResolvedValueOnce(failResponse()).mockResolvedValue(okResponse({ areas: [{ country: 'FR', places: [{ name: 'Colmar', codes: ['68000'] }] }] }));

    await render(<DeliveryZonesScreen />);

    expect(await screen.findByTestId('zones-error')).toBeOnTheScreen();
    // Sayfanın kalanı yerinde: hata yalnız listenin hâlidir.
    expect(screen.getByTestId('zones-code-field')).toBeOnTheScreen();

    // `await`li dokunuş: tekrar deneme yeni bir uçuş başlatıyor, cevabı beklenmezse React
    // "act(...) dışında güncelleme" uyarısı basar.
    await fireEvent.press(screen.getByTestId('zones-retry'));

    await waitFor(() => expect(screen.getByTestId('zones-area-FR')).toBeOnTheScreen());
    expect(screen.queryByTestId('zones-error')).toBeNull();
  });

  /* Müşteri kendi kodunun cevabını yazmadan görür; kart cihazda saklı kodla ve onun ülkesiyle açılır. */
  it('kod kartı cihazda saklı kodla dolu açılır', async () => {
    // Anlık durum sabit referans olmalı: `useSyncExternalStore` her çağrıda yeni nesne görürse sonsuz döngüye girer.
    const saved = { done: true, locale: 'tr', postalCode: '77694', country: 'DE' } as const;
    const snapshot = jest.spyOn(onboardingStore, 'getOnboardingSnapshot').mockReturnValue(saved);
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));

    await render(<DeliveryZonesScreen />);

    expect(screen.getByTestId('zones-code-field')).toHaveProp('value', '77694');
    // Yer saklı kodun ülkesinde sorulur: aynı kod iki ülkede de bulunabilir.
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => /77694/.test(String(url)) && /country=DE/.test(String(url)))).toBe(true),
    );
    snapshot.mockRestore();
  });

  it('geri düğmesi yığından çıkarır', async () => {
    fetchMock.mockResolvedValue(okResponse({ areas: [] }));

    await render(<DeliveryZonesScreen />);
    await screen.findByTestId('zones-empty');

    fireEvent.press(screen.getByTestId('zones-back'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
