import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import messages from '@lezzet/i18n/customer/place';
import { PostalCodeSheet } from './postal-code-sheet';

/*
  Kısmi kod yazan müşteri adayları listeden seçebilir, beş hane elle tamamlanınca soruyu yer çözümü cevaplar; seçilen ülke yer sorusuna ve
  kayda gider. Ağ fetch düzeyinde sahte ve cevaplar sözleşme şeklinde, ki öneri kancası ve zarf gerçek yolunu koşsun.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockSave = jest.fn();
jest.mock('@/lib/onboarding/onboarding-store', () => ({ saveOnboarding: (state: unknown) => mockSave(state) }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: (href: unknown) => mockPush(href) }) }));

// Toast deposu gerçek zamanlayıcı açıyor — mock, koşu sonunda asılı tanıtıcı bırakmasın.
jest.mock('@lezzet/mobile-kit/src/lib/toast/toast-store', () => ({
  toastSuccess: jest.fn(),
  toastError: jest.fn(),
  toastInfo: jest.fn(),
}));

// Misafir yeter: sınanan şey öneri listesi, `useMe` yalnız bir cümleyi açıp kapatıyor.
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

const t = messages.tr.zip;

function reply(status: number, body: unknown): Response {
  return { status, headers: { get: () => null }, json: async () => body } as unknown as Response;
}

/* Öneri sözleşme şeklinde döner (`PlaceOptionListSchema` — çıplak dizi zarf içinde): alan eksilirse
   istemci Zod'u burada patlar, bu bilerek. Çözüm ucu da cevaplanır — taslak beş haneye ulaştığında
   `usePlaceLookup` gerçekten soruyor. */
const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
function mockPlaces() {
  fetchMock.mockImplementation((url) => {
    const address = String(url);
    if (address.includes('/places/suggest')) {
      return Promise.resolve(
        reply(200, {
          data: [
            { country: 'FR', postalCode: '67200', placeName: 'Strasbourg', places: ['Strasbourg'], inRoute: true },
            { country: 'FR', postalCode: '67201', placeName: null, places: ['Eckbolsheim', 'Wolfisheim'], inRoute: true },
          ],
          error: null,
        }),
      );
    }
    if (address.includes('/places/by-postal-code')) {
      return Promise.resolve(
        reply(200, {
          data: {
            kind: 'resolved',
            place: { country: 'FR', postalCode: '67200', placeName: 'Strasbourg', places: ['Strasbourg'], inRoute: true },
          },
          error: null,
        }),
      );
    }
    return Promise.resolve(reply(404, { data: null, error: 'not_found' }));
  });
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockSave.mockReset();
  mockPlaces();
});

function renderSheet() {
  return render(
    <PostalCodeSheet visible code={null} country={null} onClose={jest.fn()} showZonesLink={false} testID="zip" />,
  );
}

test('kısmi kod adayları listeler; dokununca alan dolar, liste kapanır', async () => {
  await renderSheet();

  await fireEvent.changeText(screen.getByTestId('zip-field'), '672');
  // Debounce (300 ms) gerçek zamanlayıcıyla dolar; waitFor onu bekler.
  const row = await screen.findByText('67200 · FR');
  // Çok yerleşimli aday ad UYDURMAZ: alt satır yerleşimleri sayar.
  expect(screen.getByText('Eckbolsheim, Wolfisheim')).toBeTruthy();

  await fireEvent.press(row);
  expect(screen.getByTestId('zip-field').props.value).toBe('67200');
  expect(screen.queryByTestId('zip-suggestions')).toBeNull();
  // Beş haneye seçimle ulaşmak da kaydı açar.
  await waitFor(() => expect(screen.getByText(t.save)).toBeEnabled());
});

test('beş hane elle tamamlanınca liste hiç açılmaz — soruyu artık yer çözümü cevaplıyor', async () => {
  await renderSheet();

  await fireEvent.changeText(screen.getByTestId('zip-field'), '67200');
  // Çözüm cevabı ekranda, yani istek turu bitti ve "liste yok" iddiası erken bir bakış değil.
  await screen.findByText('67200 · Strasbourg');
  /* Öneri kancasının gecikme penceresi (300 ms) bilerek beklenir: çözüm cevabı anında geldiği için erken bakış "liste açılmadı"yı hep
     doğrular ve iddia sahte yeşil olurdu. */
  await act(() => new Promise((resolve) => setTimeout(resolve, 400)));

  expect(screen.queryByTestId('zip-suggestions')).toBeNull();
  const asked = fetchMock.mock.calls.map(([url]) => String(url));
  expect(asked.some((url) => url.includes('/places/suggest'))).toBe(false);
});

test('seçilen ülke yer sorusuna gider ve kayda yazılır', async () => {
  await renderSheet();

  await fireEvent.press(screen.getByTestId('zip-country-DE'));
  await fireEvent.changeText(screen.getByTestId('zip-field'), '67200');
  await screen.findByText('67200 · Strasbourg');
  const asked = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/places/by-postal-code'));
  expect(asked.at(-1)).toContain('country=DE');

  await fireEvent.press(screen.getByText(t.save));
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ postalCode: '67200', country: 'DE' }));
});
