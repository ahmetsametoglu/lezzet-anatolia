import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import messages from '@/lib/places/messages.json';
import { PostalCodeSheet } from './postal-code-sheet';

/*
  TESLİMAT BÖLGESİ ÇEKMECESİ — kod ÖNERİSİ (kullanıcı kararı 26.08): kısmi kod yazan müşteri
  adayları listeden seçebilmeli (web `place-dialog` ile aynı davranış; ayrışma denetimin 25.08
  kaydıydı). İki kural ölçülür:
    · yazarken adaylar listelenir, dokununca alan dolar ve liste kapanır;
    · beş hane ELLE tamamlanınca liste hiç açılmaz — o noktada soruyu yer çözümü cevaplıyor.
  Ağ FETCH SEVİYESİNDE sahte, cevaplar sözleşme şeklinde — öneri kancası ve zarf gerçek yolunu koşar.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: (href: unknown) => mockPush(href) }) }));

// Toast deposu gerçek zamanlayıcı açıyor — mock, koşu sonunda asılı tanıtıcı bırakmasın.
jest.mock('@/lib/toast/toast-store', () => ({
  toastSuccess: jest.fn(),
  toastError: jest.fn(),
  toastInfo: jest.fn(),
}));

// Misafir yeter: sınanan şey öneri listesi, `useMe` yalnız bir cümleyi açıp kapatıyor.
jest.mock('@/lib/auth/supabase', () => ({
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
  mockPlaces();
});

function renderSheet() {
  return render(
    <PostalCodeSheet visible code={null} onClose={jest.fn()} showZonesLink={false} testID="zip" />,
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
  // Beş haneye seçimle ulaşmak da kaydı açar — düğme artık kilitli değil.
  await waitFor(() => expect(screen.getByText(t.save)).toBeEnabled());
});

test('beş hane elle tamamlanınca liste hiç açılmaz — soruyu artık yer çözümü cevaplıyor', async () => {
  await renderSheet();

  await fireEvent.changeText(screen.getByTestId('zip-field'), '67200');
  // Çözüm cevabı ekranda: istek turu bitti, "liste yok" iddiası artık erken bir bakış değil.
  await screen.findByText('67200 · Strasbourg');
  /* Öneri kancasının gecikme penceresi (300 ms) bilerek BEKLENİR: çözüm cevabı anında geldiği
     için erken bakış "liste açılmadı"yı hep doğrular ve iddia sahte yeşil olurdu (21.111'in
     dersi — sabotajla yakalandı: eşik kaldırılınca test yine geçiyordu). */
  await act(() => new Promise((resolve) => setTimeout(resolve, 400)));

  expect(screen.queryByTestId('zip-suggestions')).toBeNull();
  const asked = fetchMock.mock.calls.map(([url]) => String(url));
  expect(asked.some((url) => url.includes('/places/suggest'))).toBe(false);
});
