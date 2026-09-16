import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { Me } from '@lezzet/mobile-kit/src/lib/api/me';
import messages from '@lezzet/i18n/customer/place';
import { meFixture } from '@lezzet/mobile-kit/src/testing/me-fixture';
import { rememberPlaceNotice, resetPlaceNotices } from '@/lib/places/place-notice-store';
import { PostalCodeSheet } from './postal-code-sheet';

/*
  TESLİMAT BÖLGESİ ÇEKMECESİ — iki konu ölçülür.

  KOD ÖNERİSİ (kullanıcı kararı 26.08): kısmi kod yazan müşteri adayları listeden seçebilmeli.
    · yazarken adaylar listelenir, dokununca alan dolar ve liste kapanır;
    · beş hane ELLE tamamlanınca liste hiç açılmaz — o noktada soruyu yer çözümü cevaplıyor.

  "BURAYA DA GELİN" (kullanıcı kararı): davet, kod çözülüp "bu bölgeye gelmiyoruz" hükmü ekrana geldiği
  anda burada çıkar — Kaydet'ten önce. Rota içindeki kodda çizilmez; girişli müşteride katman açılmadan
  tek dokunuşta bırakılır; kayıt alınınca düğme komple kalkar ve hafıza YERE anahtarlıdır.

  Ağ FETCH SEVİYESİNDE sahte, cevaplar sözleşme şeklinde — öneri kancası, yer çözümü ve kayıt ucu gerçek
  yolunu koşar.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: (href: unknown) => mockPush(href) }) }));

/* Üç fiil de AYNI casusa düşer: ölçülen şey "hangi cümle basıldı", tipi değil. */
const mockToast = jest.fn();
jest.mock('@lezzet/mobile-kit/src/lib/toast/toast-store', () => ({
  toastSuccess: (m: string) => mockToast(m),
  toastError: (m: string) => mockToast(m),
  toastInfo: (m: string) => mockToast(m),
}));

/* Oturum DURUMLUDUR: `null` misafir, dolu ise girişli. İki dal ("çekmece açılır" ⟷ "toast basılır") bu
   bayrakla ayrılıyor — `useMe` gerçek kancadır, taklit edilmedi. */
let mockSession: { access_token: string } | null = null;
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      setSession: async () => {
        mockSession = { access_token: 'access-1' };
        return { error: null };
      },
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

const t = messages.tr.zip;
const notice = messages.tr.placeNotice;

function reply(status: number, body: unknown): Response {
  return { status, headers: { get: () => null }, json: async () => body } as unknown as Response;
}

const SESSION = {
  session: {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresIn: 3600,
    expiresAt: null,
    tokenType: 'bearer',
  },
};

function meReply(overrides: Partial<Me> = {}): Response {
  return reply(200, { data: meFixture(['customer'], overrides), error: null });
}

/** Çözüm cevabı: `inRoute` ile rota içi/dışı ayrılır — davet yalnız DIŞARIDA çizilir. */
function placeReply(inRoute: boolean): Response {
  return reply(200, {
    data: {
      kind: 'resolved',
      place: { country: 'FR', postalCode: '67200', placeName: 'Strasbourg', places: ['Strasbourg'], inRoute },
    },
    error: null,
  });
}

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

/* Öneri sözleşme şeklinde döner (`PlaceOptionListSchema` — çıplak dizi zarf içinde): alan eksilirse
   istemci Zod'u burada patlar, bu bilerek. */
function mockPlaces({ inRoute = true, noticeStatus = 'ok' as 'ok' | 'already' | 'place_unknown' } = {}) {
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
    if (address.includes('/places/by-postal-code')) return Promise.resolve(placeReply(inRoute));
    if (address.includes('/places/notice')) {
      return Promise.resolve(reply(200, { data: { status: noticeStatus }, error: null }));
    }
    if (address.includes('/auth/otp/request')) return Promise.resolve(reply(200, { data: true, error: null }));
    if (address.includes('/auth/otp/verify')) return Promise.resolve(reply(200, { data: SESSION, error: null }));
    if (address.includes('/api/v1/me')) return Promise.resolve(meReply({ email: 'girisli@musteri.fr' }));
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
  mockToast.mockReset();
  mockSession = null;
  /* Kayıt hafızası MODÜL düzeyinde yaşıyor (ekranlar arası ortak olması bunun için) — dosyalar arası da
     yaşar. Kalıntı, bir sonraki testi sessizce yeşile boyardı. */
  resetPlaceNotices();
  mockPlaces();
});

function renderSheet(code: string | null = null) {
  return render(<PostalCodeSheet visible code={code} onClose={jest.fn()} showZonesLink={false} testID="zip" />);
}

/** Kodu yazıp çözümün ekrana gelmesini bekler — davet ancak hüküm geldikten sonra doğar. */
async function typeResolvedCode() {
  await fireEvent.changeText(screen.getByTestId('zip-field'), '67200');
  await screen.findByText('67200 · Strasbourg');
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
  /* Öneri kancasının gecikme penceresi (300 ms) bilerek BEKLENİR: çözüm cevabı anında geldiği için erken
     bakış "liste açılmadı"yı hep doğrular ve iddia sahte yeşil olurdu. */
  await act(() => new Promise((resolve) => setTimeout(resolve, 400)));

  expect(screen.queryByTestId('zip-suggestions')).toBeNull();
  const asked = fetchMock.mock.calls.map(([url]) => String(url));
  expect(asked.some((url) => url.includes('/places/suggest'))).toBe(false);
});

describe('"Buraya da gelin"', () => {
  it('ROTA İÇİNDEKİ kodda çizilmez — kapanmış bir kapı yok ki talep doğsun', async () => {
    await renderSheet();

    await typeResolvedCode();
    expect(screen.getByText(t.insideNote)).toBeOnTheScreen();
    expect(screen.queryByTestId('zip-zone-cta')).toBeNull();
  });

  it('rota DIŞINDA çizilir ve misafirde talep çekmecesini açar — satır içi form yok', async () => {
    mockPlaces({ inRoute: false });
    await renderSheet();

    await typeResolvedCode();
    expect(screen.getByText(t.shippingNote)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('zip-zone-cta'));

    expect(await screen.findByTestId('zip-notice-sheet')).toBeOnTheScreen();
    expect(screen.getByTestId('zip-notice-email')).toBeOnTheScreen();
  });

  /* GİRİŞLİ MÜŞTERİ ÇEKMECE GÖRMEZ: e-postasını sormak, sunucunun zaten bildiği bir şeyi sormaktır. Test
     iki şeyi birden tutuyor — katman AÇILMIYOR ve sonuç toast'ta müşterinin adresi geçiyor. */
  it('girişli müşteride çekmece AÇILMAZ: talep tek dokunuşta bırakılır, sonuç toast olur', async () => {
    mockPlaces({ inRoute: false });
    mockSession = { access_token: 'access-1' };
    await renderSheet();

    await typeResolvedCode();
    await fireEvent.press(await screen.findByTestId('zip-zone-cta'));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(notice.toastRecorded.replace('{email}', 'girisli@musteri.fr')));
    expect(screen.queryByTestId('zip-notice-sheet')).toBeNull();
    // Kayıt alındı: düğme KOMPLE kalkar, yerine bir cümle geçmez.
    await waitFor(() => expect(screen.queryByTestId('zip-zone-cta')).toBeNull());
    expect(screen.queryByText(notice.recorded)).toBeNull();
  });

  /* `already` AYRI bir cümledir: "kaydınız zaten var" demek, sessiz kalmaktan da "yeni kayıt aldık"
     demekten de dürüsttür (sözleşmenin kendi hükmü). */
  it('ikinci kez bastığında ZATEN KAYITLI cümlesi basılır', async () => {
    mockPlaces({ inRoute: false, noticeStatus: 'already' });
    mockSession = { access_token: 'access-1' };
    await renderSheet();

    await typeResolvedCode();
    await fireEvent.press(await screen.findByTestId('zip-zone-cta'));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(notice.toastAlready.replace('{email}', 'girisli@musteri.fr')));
  });

  /* Yer çözülemedi: kayıt ALINMADI ve davet YERİNDE kalır — kaydedilmemiş bir talebi kaydedilmiş gibi
     göstermek, sayacı da müşteriyi de yanıltırdı. */
  it('yer çözülemezse kayıt alınmaz ve davet durur', async () => {
    mockPlaces({ inRoute: false, noticeStatus: 'place_unknown' });
    mockSession = { access_token: 'access-1' };
    await renderSheet();

    await typeResolvedCode();
    await fireEvent.press(await screen.findByTestId('zip-zone-cta'));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(notice.placeUnknown));
    expect(screen.getByTestId('zip-zone-cta')).toBeOnTheScreen();
  });

  /* Hafıza YERE anahtarlı ve ORTAK depoda: aynı kod için bir kez bırakan müşteri daveti bir daha görmez,
     başka bir kodda ise haklı olarak görür. Bu iddia olmadan depo "bir kez bastı, bir daha hiç sormayız"
     diye okunabilirdi. */
  it('aynı kodun kaydı daveti kaldırır, BAŞKA kodun kaydı devralınmaz', async () => {
    rememberPlaceNotice('FR', '67200', 'ok');
    mockPlaces({ inRoute: false });
    const same = await renderSheet();

    await typeResolvedCode();
    expect(screen.queryByTestId('zip-zone-cta')).toBeNull();

    same.unmount();
    resetPlaceNotices();
    rememberPlaceNotice('FR', '75001', 'ok');
    await renderSheet();

    await typeResolvedCode();
    expect(await screen.findByTestId('zip-zone-cta')).toBeOnTheScreen();
  });
});
