import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { Me } from '@/lib/api/me';
import messages from '@/lib/places/messages.json';
import { rememberPlaceNotice, resetPlaceNotices } from '@/lib/places/place-notice-store';
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
/* Üç fiil de AYNI casusa düşer: bu dosyanın testleri "hangi cümle basıldı"yı ölçüyor, tipini
   değil — ayırmak assert'leri tipe bağımlı kılar, oysa sınanan şey metnin kendisi. */
jest.mock('@/lib/toast/toast-store', () => ({
  toastSuccess: (m: string) => mockToast(m),
  toastError: (m: string) => mockToast(m),
  toastInfo: (m: string) => mockToast(m),
}));

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

/* İlan edilen tutarlar gerçek uçtan (18.08): posta kodu çekmecesi kargo ücretini oradan yazıyor.
   Bandın konusu bu değil ama çekmece onun içinde kuruluyor — mock'lanmazsa çağrı ağa çıkardı. */
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
  /* Kayıt hafızası MODÜL düzeyinde yaşıyor (ekranlar arası ortak olması bunun için) — dosyalar
     arası da yaşar. Her iddia kendi kurduğu hâli ölçmeli; kalıntı, bir sonraki testi sessizce
     yeşile boyardı. */
  resetPlaceNotices();
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

/** Paketler sekmesinin bandı — AYNI yer, AYNI müşteri, ayrı ekran (ve ayrı bileşen örneği). */
function renderPackagesBand() {
  return render(<PlaceNoticeBand country="FR" postalCode="75001" source="app-packages" testID="pkg" />);
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
    // Kayıt alındı: düğme KOMPLE kalkar, yerine bir cümle geçmez (kullanıcı kararı 11.08).
    await waitFor(() => expect(screen.queryByTestId('band-cta')).toBeNull());
    expect(screen.queryByText(t.recorded)).toBeNull();
    expect(screen.queryByText(t.alreadyRecorded)).toBeNull();
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

  it('kayıt alınınca düğme KOMPLE kalkar — yerine bir cümle geçmez', async () => {
    mockNoticeFlow();
    await renderBand();

    await fireEvent.press(screen.getByTestId('band-cta'));
    await fireEvent.changeText(await screen.findByTestId('band-notice-email'), 'yeni@musteri.fr');
    await fireEvent.press(screen.getByTestId('band-notice-send'));
    await fireEvent.changeText(await screen.findByTestId('band-notice-code'), '123456');

    await waitFor(() => expect(screen.queryByTestId('band-cta')).toBeNull());
    /* "Kaydınız zaten var" satırı KUTUYA YAZILMAZ (kullanıcı kararı 11.08). Metin ÇEKMECENİN
       kendi başarı ekranında hâlâ var ve orada doğru — bu yüzden iddia kutunun yuvasına bakar. */
    expect(screen.queryByTestId('band-result')).toBeNull();
    // Posta kodu yerinde kalır: kayıt bırakmak, kodun yanlış olma ihtimalini kapatmaz.
    expect(screen.getByTestId('band-change-zip')).toBeOnTheScreen();
  });

  /* POSTA KODU BİR METİN EYLEMİ DEĞİL, VİTRİNDEKİ HAPIN AYNISI (kullanıcı kararı 11.08): kutu
     müşterinin bugünkü cevabını GÖSTERİR ve dokununca aynı ortak çekmeceyi açar. */
  it('posta kodu kutunun içinde YAZILI ve tıklanınca ortak çekmeceyi açar', async () => {
    await renderBand();

    expect(screen.getByText(messages.tr.placeNotice.code.replace('{postal}', '75001'))).toBeOnTheScreen();
    // Eski "Posta kodunu değiştir" cümlesi ekranda YAZILI değil; ekran okuyucunun adı oldu.
    expect(screen.queryByText(t.changeCode)).toBeNull();

    await fireEvent.press(screen.getByTestId('band-change-zip'));
    expect(await screen.findByTestId('band-zip-sheet')).toBeOnTheScreen();
  });

  /* İKİ LİSTE TEK HAFIZA (kullanıcı bulgusu 11.08) — bandın "kayıt alındığında düğme kalkar" sözü
     ekranlar ARASINDA da geçerli olmalı. Hafıza bandın `useState`indeyken bu iddia kırmızıydı:
     katalogda kaydını bırakan müşteri paketler sekmesinde aynı düğmeyi yeniden görüyordu.

     Test iki AYRI render ile kurulur (aynı ağacın iki bandı değil): sekme değişimi bileşeni
     söküp yeniden kuruyor ve arıza tam da orada doğuyordu. */
  it('katalogda bırakılan kaydı PAKETLER sekmesindeki bant da bilir — düğme geri gelmez', async () => {
    mockSignedIn('ok');
    const catalog = await renderBand();

    await fireEvent.press(await screen.findByTestId('band-cta'));
    await waitFor(() => expect(screen.queryByTestId('band-cta')).toBeNull());

    // Sekme değişimi: katalog bandı söküldü, paketler bandı sıfırdan kuruldu.
    catalog.unmount();
    await renderPackagesBand();

    expect(screen.queryByTestId('pkg-cta')).toBeNull();
    // Posta kodu ORADA da yerinde: kayıt, kodun yanlış olma ihtimalini kapatmaz.
    expect(screen.getByTestId('pkg-change-zip')).toBeOnTheScreen();
  });

  /* Hafıza YERE anahtarlı: başka bir posta koduna geçen müşteri, o yer için kaydını HİÇ
     bırakmamıştır ve düğme haklı olarak geri gelir. Bu iddia olmadan depo "bir kez bastı, bir daha
     hiç sormayız" diye okunabilirdi. */
  it('BAŞKA posta kodunun bandı kaydı devralmaz — eylem yerinde durur', async () => {
    // Kayıt DOĞRUDAN depoya yazılır: ölçülen şey akış değil ANAHTAR — 75001'in kaydı 67000'e
    // geçmemeli. Akışı bir kez daha koşturmak aynı iddiayı ölçmez, yalnız yavaşlatır.
    rememberPlaceNotice('FR', '75001', 'ok');

    const { findByTestId } = await render(
      <PlaceNoticeBand country="FR" postalCode="67000" source="app-catalog" testID="other" />,
    );

    expect(await findByTestId('other-cta')).toBeOnTheScreen();
  });
});
