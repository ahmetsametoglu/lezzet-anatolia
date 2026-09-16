import { fireEvent, render, screen } from '@testing-library/react-native';

import messages from '@lezzet/i18n/customer/place';
import { PlaceNoticeBand } from './place-notice-band';

/*
  BÖLGE DIŞI BİLGİ BANDI — bandın TEK BLOK olduğu ve tek eyleminin (posta kodu hapı) ortak çekmeceyi
  açtığı buradan doğrulanır.

  ÇEKMECE TAKLİT EDİLMEDİ: bant içinden gerçekten kitin ortak çekmecesi açılıyor (`PostalCodeSheet`) —
  ikinci bir nüsha yazılmadığının kanıtı bu.

  "BURAYA DA GELİN" ARTIK BANTTA DEĞİL (kullanıcı kararı): talep, müşteri kodu girip hükmü okuduğu anda
  çekmecede soruluyor. Akışın kendi hâlleri (misafir · girişli · `already` · yer çözülemedi · kayıt
  hafızası) çekmecenin kendi testinde; burada yalnız daveti bandın ÇIKARMADIĞI ölçülür.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-FR' }] }));

// Cihazda saklı posta kodu: kayıt "tamamlandı, kod yok" — çekmece boş taslakla açılır ve yer
// çözümü (beş hane şartı) hiç tetiklenmez.
jest.mock('@/lib/onboarding/onboarding-store');

// Ad `mock` ile başlamak ZORUNDA: `jest.mock` fabrikası dosyanın tepesine kaldırılıyor.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: (href: unknown) => mockPush(href) }) }));

// Toast deposu gerçek zamanlayıcı açıyor — mock, koşu sonunda asılı tanıtıcı bırakmasın.
jest.mock('@lezzet/mobile-kit/src/lib/toast/toast-store', () => ({
  toastSuccess: jest.fn(),
  toastError: jest.fn(),
  toastInfo: jest.fn(),
}));

// Misafir yeter: bandın konusu kimlik değil, çekmecenin içindeki kimlik okuması ağa çıkmasın.
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

/* İlan edilen tutarlar gerçek uçtan: posta kodu çekmecesi kargo ücretini oradan yazıyor. Bandın konusu
   bu değil ama çekmece onun içinde kuruluyor — mock'lanmazsa çağrı ağa çıkardı. */
jest.mock('@/lib/api/delivery-terms', () => ({
  fetchDeliveryTerms: () =>
    Promise.resolve({
      data: {
        minBasketRouteCents: 4000,
        minBasketShippingCents: 0,
        freeShippingCents: 6000,
        shippingFeeCents: 790,
        codMaxCents: 50_000,
        shippingCountries: ['FR', 'DE'],
      },
      error: null,
      status: 200,
    }),
}));

const t = messages.tr.placeNotice;

function reply(status: number, body: unknown): Response {
  return { status, headers: { get: () => null }, json: async () => body } as unknown as Response;
}

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(reply(404, { data: null, error: 'not_found' })));
  mockPush.mockReset();
});

function renderBand() {
  return render(<PlaceNoticeBand postalCode="75001" testID="band" />);
}

describe('PlaceNoticeBand', () => {
  it('tek cümlelik gövde + TEK eylem çizer; talep daveti bantta yok', async () => {
    await renderBand();

    expect(screen.getByText(t.title)).toBeOnTheScreen();
    expect(screen.getByText(t.body)).toBeOnTheScreen();
    expect(screen.getByTestId('band-change-zip')).toBeOnTheScreen();
    // "Buraya da gelin" çekmeceye taşındı: bant aynı daveti ikinci kez çıkarmaz.
    expect(screen.queryByText(t.cta)).toBeNull();
    // "Nerelere gidiyorsunuz?" de banttan kalkmıştı — yeri aynı çekmece.
    expect(screen.queryByText(t.zones)).toBeNull();
  });

  /* POSTA KODU BİR METİN EYLEMİ DEĞİL, VİTRİNDEKİ HAPIN AYNISI: kutu müşterinin bugünkü cevabını
     GÖSTERİR ve dokununca aynı ortak çekmeceyi açar. */
  it('posta kodu kutunun içinde YAZILI ve tıklanınca ortak çekmeceyi açar', async () => {
    await renderBand();

    expect(screen.getByText(t.code.replace('{postal}', '75001'))).toBeOnTheScreen();
    // Eski "Posta kodunu değiştir" cümlesi ekranda YAZILI değil; ekran okuyucunun adı oldu.
    expect(screen.queryByText(t.changeCode)).toBeNull();

    await fireEvent.press(screen.getByTestId('band-change-zip'));
    expect(await screen.findByTestId('band-zip-sheet')).toBeOnTheScreen();
  });

  it('çekmece bölge bağlantısını İÇİNDE taşır ve taslak boş açılır', async () => {
    await renderBand();

    await fireEvent.press(screen.getByTestId('band-change-zip'));
    expect(await screen.findByTestId('band-zip-sheet')).toBeOnTheScreen();
    // Alan çekmecenin kendi alanıdır; kayıtlı kod yok, taslak boş açılır.
    expect(screen.getByTestId('band-zip-field')).toHaveProp('value', '');

    await fireEvent.press(screen.getByTestId('band-zip-zones'));
    expect(mockPush).toHaveBeenCalledWith('/delivery-zones');
  });
});
