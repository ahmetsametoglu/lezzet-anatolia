import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { Me } from '@/lib/api/me';
import messages from '@/lib/places/messages.json';
import { meFixture } from '@/screens/operations/me-fixture';
import { PlaceNoticeBand } from './place-notice-band';

/*
  BÖLGE DIŞI BİLGİ BANDI — bandın TEK BLOK olduğu (kutunun altına taşan parça yok) ve iki
  eyleminin ikisinin de birer ÇEKMECE açtığı buradan doğrulanır.

  ÇEKMECELER TAKLİT EDİLMEDİ: bant içinden gerçekten kitin ortak çekmeceleri açılıyor
  (`PostalCodeSheet` · `PlaceNoticeSheet`) — ikinci bir nüsha yazılmadığının kanıtı bu.

  Talep akışının kendi hâlleri (yanlış kod, `already`, `place_unknown`) çekmecenin kendi
  testinde; burada yalnız bandın akıştan SONRAKİ hâli ölçülür: kayıt alınınca eylem kalkar.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-FR' }] }));

// Cihazda saklı posta kodu: kayıt "tamamlandı, kod yok" — çekmece boş taslakla açılır ve yer
// çözümü (beş hane şartı) hiç tetiklenmez.
jest.mock('@/lib/onboarding/onboarding-store');

// Ad `mock` ile başlamak ZORUNDA: `jest.mock` fabrikası dosyanın tepesine kaldırılıyor.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: (href: unknown) => mockPush(href) }) }));

// Toast deposu gerçek zamanlayıcı açıyor — mock, koşu sonunda asılı tanıtıcı bırakmasın.
const mockToast = jest.fn();
jest.mock('@/lib/toast/toast-store', () => ({ publishToast: (m: string) => mockToast(m) }));

/* Oturum DURUMLUDUR: `null` misafir, dolu ise girişli. İki dal ("çekmece açılır" ⟷ "toast basılır")
   bu bayrakla ayrılıyor — `useMe` gerçek kancadır, taklit edilmedi. */
let mockSession: { access_token: string } | null = null;
jest.mock('@/lib/auth/supabase', () => ({
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

const t = messages.tr.placeNotice;

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

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

/** Talep akışının mutlu yolu — çekmecenin kendi testiyle aynı kurgu. */
function mockNoticeFlow() {
  fetchMock.mockImplementation((url) => {
    const address = String(url);
    if (address.includes('/auth/otp/request')) return Promise.resolve(reply(200, { data: true, error: null }));
    if (address.includes('/auth/otp/verify')) return Promise.resolve(reply(200, { data: SESSION, error: null }));
    if (address.includes('/api/v1/me')) return Promise.resolve(meReply());
    if (address.includes('/places/notice')) return Promise.resolve(reply(200, { data: { status: 'ok' }, error: null }));
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
});

/** Girişli müşteri: `/me` okunabiliyor, talep tek dokunuşta bırakılıyor. */
function mockSignedIn(noticeStatus: 'ok' | 'already' | 'place_unknown') {
  mockSession = { access_token: 'access-1' };
  fetchMock.mockImplementation((url) => {
    const address = String(url);
    if (address.includes('/api/v1/me')) return Promise.resolve(meReply({ email: 'girisli@musteri.fr' }));
    if (address.includes('/places/notice')) {
      return Promise.resolve(reply(200, { data: { status: noticeStatus }, error: null }));
    }
    return Promise.resolve(reply(404, { data: null, error: 'not_found' }));
  });
}

function renderBand() {
  return render(<PlaceNoticeBand country="FR" postalCode="75001" source="app-catalog" testID="band" />);
}

describe('PlaceNoticeBand', () => {
  it('tek cümlelik gövde + İKİ eylem çizer; üçüncü eylem yok', async () => {
    await renderBand();

    expect(screen.getByText(t.title)).toBeOnTheScreen();
    expect(screen.getByText(t.body)).toBeOnTheScreen();
    expect(screen.getByTestId('band-cta')).toBeOnTheScreen();
    expect(screen.getByTestId('band-change-zip')).toBeOnTheScreen();
    // "Nerelere gidiyorsunuz?" banttan kalktı — yeri posta kodu çekmecesi (kullanıcı kararı).
    expect(screen.queryByText(t.zones)).toBeNull();
  });

  it('"Posta kodunu değiştir" ORTAK çekmeceyi açar ve bölge bağlantısını İÇİNDE taşır', async () => {
    await renderBand();

    expect(screen.queryByTestId('band-zip-sheet')).toBeNull();
    await fireEvent.press(screen.getByTestId('band-change-zip'));

    expect(await screen.findByTestId('band-zip-sheet')).toBeOnTheScreen();
    // Alan çekmecenin kendi alanıdır; kayıtlı kod yok, taslak boş açılır.
    expect(screen.getByTestId('band-zip-field')).toHaveProp('value', '');

    await fireEvent.press(screen.getByTestId('band-zip-zones'));
    expect(mockPush).toHaveBeenCalledWith('/delivery-zones');
  });

  it('"Buraya da gelin" TALEP ÇEKMECESİNİ açar — bandın içinde satır içi form yok', async () => {
    mockNoticeFlow();
    await renderBand();

    await fireEvent.press(screen.getByTestId('band-cta'));

    expect(await screen.findByTestId('band-notice-sheet')).toBeOnTheScreen();
    expect(screen.getByTestId('band-notice-email')).toBeOnTheScreen();
  });

  /* GİRİŞLİ MÜŞTERİ ÇEKMECE GÖRMEZ (kullanıcı kararı 10.08): e-postasını sormak, sunucunun zaten
     bildiği bir şeyi sormaktır. Test iki şeyi birden tutuyor — katman AÇILMIYOR ve sonuç toast'ta
     müşterinin adresi geçiyor (haberin nereye gideceğini bilsin). */
  it('girişli müşteride çekmece AÇILMAZ: talep tek dokunuşta bırakılır, sonuç toast olur', async () => {
    mockSignedIn('ok');
    await renderBand();

    await fireEvent.press(await screen.findByTestId('band-cta'));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t.toastRecorded.replace('{email}', 'girisli@musteri.fr')));
    expect(screen.queryByTestId('band-notice-sheet')).toBeNull();
    // Kayıt alındı: eylem kalkar (misafir dalıyla aynı kural).
    await waitFor(() => expect(screen.queryByTestId('band-cta')).toBeNull());
  });

  /* `already` AYRI bir cümledir: "kaydınız zaten var" demek, sessiz kalmaktan da "yeni kayıt
     aldık" demekten de dürüsttür (sözleşmenin kendi hükmü). */
  it('girişli müşteri ikinci kez bastığında ZATEN KAYITLI cümlesi basılır', async () => {
    mockSignedIn('already');
    await renderBand();

    await fireEvent.press(await screen.findByTestId('band-cta'));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t.toastAlready.replace('{email}', 'girisli@musteri.fr')));
  });

  /* Yer çözülemedi: kayıt ALINMADI ve eylem YERİNDE kalır — kaydedilmemiş bir talebi kaydedilmiş
     gibi göstermek, sayacı da müşteriyi de yanıltırdı. */
  it('girişli müşteride yer çözülemezse kayıt alınmaz ve eylem durur', async () => {
    mockSignedIn('place_unknown');
    await renderBand();

    await fireEvent.press(await screen.findByTestId('band-cta'));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t.placeUnknown));
    expect(screen.getByTestId('band-cta')).toBeOnTheScreen();
  });

  it('kayıt alınınca eylem KALKAR, yerine sonucun tek satırı geçer', async () => {
    mockNoticeFlow();
    await renderBand();

    await fireEvent.press(screen.getByTestId('band-cta'));
    await fireEvent.changeText(await screen.findByTestId('band-notice-email'), 'yeni@musteri.fr');
    await fireEvent.press(screen.getByTestId('band-notice-send'));
    await fireEvent.changeText(await screen.findByTestId('band-notice-code'), '123456');

    await waitFor(() => expect(screen.getByTestId('band-result')).toHaveTextContent(t.recorded));
    expect(screen.queryByTestId('band-cta')).toBeNull();
    // Posta kodu eylemi yerinde kalır: kayıt bırakmak, kodun yanlış olma ihtimalini kapatmaz.
    expect(screen.getByTestId('band-change-zip')).toBeOnTheScreen();
  });
});
