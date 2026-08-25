import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AccountScreen } from './account-screen';

/*
  HESAP EKRANI TESTİ — bu turda EKLENEN şey ekranın ÇIKIŞLARIDIR (21.14 ikinci dilim): profil
  düzenleme, taleplerim, bize yazın ve adres düğmeleri artık gerçek sayfalara gidiyor. Testin
  koruduğu değişmez de bu: bir gün biri bu satırları yer tutucuya geri bağlarsa kırmızı yanar.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

// Profil KAYDETME gerçek istemci yolundan geçer (updateMe → authorizedFetch → Bearer): oturum ve
// tel mock'lanır; öteki testler bu yola hiç girmez.
const mockSession = { access_token: 'test-token' };
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

/** PATCH cevabının gövdesi — `MeSchema`nın geçerli asgarisi. */
const ME_BODY = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'individual',
  name: 'Ayşe Yeni',
  email: 'ayse@example.com',
  phone: null,
  preferredLanguage: 'tr',
  country: 'FR',
  roles: ['customer'],
  b2bApproved: false,
  b2bPending: false,
  marketingConsent: {},
  referralCode: null,
  createdAt: '2026-08-08T00:00:00.000Z',
};

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: (href: unknown) => mockPush(href) }) }));

/* Adres uçları MOCK (21.15) — ekran gerçek istemci modülünü çağırır, testler cevabı kurar.
   Sözleşme kararı testte de görünür: her çağrının cevabı GÜNCEL listedir. */
const mockFetchAddresses = jest.fn();
const mockCreateAddress = jest.fn();
const mockUpdateAddress = jest.fn();
const mockDeleteAddress = jest.fn();
const mockMakeDefaultAddress = jest.fn();
jest.mock('@/lib/api/addresses', () => ({
  fetchAddresses: () => mockFetchAddresses(),
  createAddress: (body: unknown) => mockCreateAddress(body),
  updateAddress: (id: string, body: unknown) => mockUpdateAddress(id, body),
  deleteAddress: (id: string) => mockDeleteAddress(id),
  makeDefaultAddress: (id: string) => mockMakeDefaultAddress(id),
}));

/* Toast deposu gerçek zamanlayıcı açıyor (2400 ms) — mock, koşu sonunda asılı tanıtıcı
   bırakmasın (login testinin deseni). */
const mockToast = jest.fn();
jest.mock('@/lib/toast/toast-store', () => ({
  toastSuccess: (m: string) => mockToast(m),
  toastError: (m: string) => mockToast(m),
  toastInfo: (m: string) => mockToast(m),
}));

const HOME = { id: 'addr-home', label: 'Ev', line1: '12 Quai des Bateliers', line2: null, postalCode: '67000', city: 'Strasbourg', isDefault: true };
const WORK = { id: 'addr-work', label: 'İş', line1: '3 Rue du Dôme', line2: null, postalCode: '67000', city: 'Strasbourg', isDefault: false };
const listResult = (addresses: unknown[]) => ({ data: addresses, error: null, status: 200, retryAfterSec: null });

beforeEach(() => {
  mockPush.mockReset();
  mockFetchAddresses.mockReset().mockResolvedValue(listResult([HOME, WORK]));
  mockCreateAddress.mockReset();
  mockUpdateAddress.mockReset();
  mockDeleteAddress.mockReset();
  mockMakeDefaultAddress.mockReset();
  mockToast.mockReset();
});

describe('AccountScreen', () => {
  it('profil "Düzenle" ÇEKMECEYİ açar (v3 shPf) — alanlar karttan dolu, e-posta salt okunur', async () => {
    await render(<AccountScreen />);

    await fireEvent.press(screen.getByTestId('account-edit'));

    expect(screen.getByTestId('account-profile-sheet')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-name').props.value).toBe('Ayşe Demir');
    expect(screen.getByTestId('profile-email').props.editable).toBe(false);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('çekmecede Kaydet GERÇEK yazar: PATCH atılır, başarıda çekmece kapanır', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue({
      status: 200,
      headers: { get: () => null },
      json: async () => ({ data: ME_BODY, error: null }),
    } as unknown as Response);
    await render(<AccountScreen />);

    await fireEvent.press(screen.getByTestId('account-edit'));
    await fireEvent.changeText(screen.getByTestId('profile-name'), 'Ayşe Yeni');
    await fireEvent.press(screen.getByTestId('profile-save'));

    await waitFor(() => expect(screen.queryByTestId('account-profile-sheet')).toBeNull());
    const call = fetchMock.mock.calls.find((entry) => entry[1]?.method === 'PATCH');
    // Telefon taslağı karttan dolar (fixture'ın numarası) — dokunulmayan alan da gövdede taşınır.
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ name: 'Ayşe Yeni', phone: '+33 6 24 51 09 88' });
  });

  it('menüdeki "Taleplerim" ve "Bize yazın" destek sayfalarına gider', async () => {
    await render(<AccountScreen />);

    await fireEvent.press(screen.getByTestId('account-menu-tickets'));
    expect(mockPush).toHaveBeenCalledWith('/support');

    await fireEvent.press(screen.getByTestId('account-menu-write'));
    expect(mockPush).toHaveBeenCalledWith('/support/new');
  });

  it('adresler UÇTAN gelir: kartlar çizilir, satır parçalardan kurulur, ekle/düzenle kapıları var (21.15)', async () => {
    await render(<AccountScreen />);

    expect(await screen.findByText('12 Quai des Bateliers, 67000 Strasbourg')).toBeOnTheScreen();
    expect(screen.getByTestId('account-address-add')).toBeOnTheScreen();
    expect(screen.getByTestId('account-address-addr-home-edit')).toBeOnTheScreen();
    expect(mockFetchAddresses).toHaveBeenCalledTimes(1);
  });

  it('"varsayılan yap" GERÇEK uca gider; rozet sunucunun döndürdüğü listeye göre taşınır', async () => {
    mockMakeDefaultAddress.mockResolvedValue(listResult([{ ...WORK, isDefault: true }, { ...HOME, isDefault: false }]));
    await render(<AccountScreen />);
    await screen.findByTestId('account-address-addr-work-default');

    await fireEvent.press(screen.getByTestId('account-address-addr-work-default'));

    expect(mockMakeDefaultAddress).toHaveBeenCalledWith('addr-work');
    await waitFor(() => expect(screen.getByTestId('account-address-addr-home-default')).toBeOnTheScreen());
    expect(screen.queryByTestId('account-address-addr-work-default')).toBeNull();
  });

  /*
    ONAY TOAST'LARI — rozetin yer değiştirmesi "oldu" demek DEĞİLDİR.

    Rozet iyimser bir çizimdir: sunucu cevabı gelmeden de kayabilirdi. Toast ise yalnız yazma
    BAŞARIYLA döndükten sonra basılıyor (`makeDefault` hata dalında erken çıkıyor). Bu yüzden
    üç iddia birlikte anlam taşıyor: metin, ETİKETSİZ adreste ne yazdığı, ve BAŞARISIZLIKTA
    basılmaması.
  */
  it('varsayılan yapma ONAYI toast ile söylenir ve adresin ADIYLA söylenir', async () => {
    mockMakeDefaultAddress.mockResolvedValue(listResult([{ ...WORK, isDefault: true }, { ...HOME, isDefault: false }]));
    await render(<AccountScreen />);
    await screen.findByTestId('account-address-addr-work-default');

    await fireEvent.press(screen.getByTestId('account-address-addr-work-default'));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('İş varsayılan yapıldı'));
  });

  it('ETİKETSİZ adreste toast ŞEHRİ yazar — yer tutucu ham ya da boş kalmaz', async () => {
    /* Etiket isteğe bağlı bir alan; `{label}` yer tutucusu doldurulmazsa müşteri "undefined
       varsayılan yapıldı" okur. Kart başlığıyla aynı kural: etiket yoksa şehir. */
    const noLabel = { ...WORK, label: null };
    mockFetchAddresses.mockResolvedValue(listResult([HOME, noLabel]));
    mockMakeDefaultAddress.mockResolvedValue(listResult([{ ...noLabel, isDefault: true }, { ...HOME, isDefault: false }]));
    await render(<AccountScreen />);
    await screen.findByTestId('account-address-addr-work-default');

    await fireEvent.press(screen.getByTestId('account-address-addr-work-default'));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Strasbourg varsayılan yapıldı'));
    expect(mockToast).not.toHaveBeenCalledWith(expect.stringContaining('{label}'));
  });

  it('varsayılan DEĞİŞTİRİLEMEZSE onay toast\'ı BASILMAZ — yerine hata bloğu çıkar', async () => {
    /* Bu dosyanın asıl iddiası: başarısız yazmada da toast basılsaydı müşteri değişmemiş bir
       ayarı değişmiş sanırdı ve hatayı ancak bir sonraki siparişinde fark ederdi. */
    mockMakeDefaultAddress.mockResolvedValue({ data: null, error: 'unexpected', status: 500, retryAfterSec: null });
    await render(<AccountScreen />);
    await screen.findByTestId('account-address-addr-work-default');

    await fireEvent.press(screen.getByTestId('account-address-addr-work-default'));

    await waitFor(() => expect(screen.getByTestId('account-address-error')).toBeOnTheScreen());
    expect(mockToast).not.toHaveBeenCalled();
    // Rozet de kaymadı: ekran sunucunun döndürdüğü listeyi bekliyor.
    expect(screen.getByTestId('account-address-addr-work-default')).toBeOnTheScreen();
  });

  it('"＋ Yeni adres ekle" çekmeceyi BOŞ açar; Kaydet doğru gövdeyle yazar ve dönen liste basılır', async () => {
    mockCreateAddress.mockResolvedValue(
      listResult([HOME, WORK, { id: 'addr-new', label: null, line1: '8 Rue Neuve', line2: null, postalCode: '67100', city: 'Strasbourg', isDefault: false }]),
    );
    await render(<AccountScreen />);
    await screen.findByTestId('account-address-add');

    await fireEvent.press(screen.getByTestId('account-address-add'));
    expect(screen.getByTestId('account-address-sheet')).toBeOnTheScreen();
    expect(screen.getByTestId('address-line').props.value).toBe('');

    // Eksik alanla istek ATILMAZ — hata satırı çekmecede söylenir.
    await fireEvent.press(screen.getByTestId('address-save'));
    expect(mockCreateAddress).not.toHaveBeenCalled();
    expect(screen.getByTestId('address-error')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByTestId('address-line'), '8 Rue Neuve');
    // Posta kodu maskesi: sayı dışı düşer, 5 hanede kesilir (v3 `sa.onZ`).
    await fireEvent.changeText(screen.getByTestId('address-zip'), '67100abc9');
    expect(screen.getByTestId('address-zip').props.value).toBe('67100');
    await fireEvent.changeText(screen.getByTestId('address-city'), 'Strasbourg');
    await fireEvent.press(screen.getByTestId('address-save'));

    /* Boş etiket null olarak gider; line2 gövdede HİÇ yok (gönderilmeyen alana kapı dokunmaz).
       ALICI VE TELEFON HESABIN KÜNYESİNDEN (22.08): müşteri o iki alana hiç dokunmadı ve gövde
       yine de dolu gitti — kullanıcı kararının ("alanlar dolu gelecek, değiştirmeyip de
       kaydedebilecek") ekrandaki karşılığı budur. Telefon E.164'e indi (`+33 6 24…` → `+336 24…`):
       fikstürün yazdığı boşluklu biçim tek sütunda ikinci bir biçim olarak birikmiyor. */
    expect(mockCreateAddress).toHaveBeenCalledWith({
      label: null,
      recipient: 'Ayşe Demir',
      phone: '+33624510988',
      line1: '8 Rue Neuve',
      postalCode: '67100',
      city: 'Strasbourg',
    });
    await waitFor(() => expect(screen.queryByTestId('account-address-sheet')).toBeNull());
    expect(screen.getByText('8 Rue Neuve, 67100 Strasbourg')).toBeOnTheScreen();
  });

  it('kartın "Düzenle"si çekmeceyi DOLU açar; "Adresi sil" gerçek silmeye gider', async () => {
    mockDeleteAddress.mockResolvedValue(listResult([HOME]));
    await render(<AccountScreen />);
    await screen.findByTestId('account-address-addr-work-edit');

    await fireEvent.press(screen.getByTestId('account-address-addr-work-edit'));
    expect(screen.getByTestId('address-line').props.value).toBe('3 Rue du Dôme');
    expect(screen.getByTestId('address-zip').props.value).toBe('67000');

    await fireEvent.press(screen.getByTestId('address-delete'));

    expect(mockDeleteAddress).toHaveBeenCalledWith('addr-work');
    await waitFor(() => expect(screen.queryByTestId('account-address-sheet')).toBeNull());
    expect(screen.queryByText('3 Rue du Dôme, 67000 Strasbourg')).toBeNull();
  });

  it('adres silinince "Adres silindi" denir — geri alınamayan işlem sessizce kapanmaz', async () => {
    /* Çekmecenin kapanması tek başına bir onay değil: müşteri "Vazgeç"e basmış da olabilir.
       Toast, geri alınamayan tek adres işleminin gerçekten olduğunu söyleyen cümledir. */
    mockDeleteAddress.mockResolvedValue(listResult([HOME]));
    await render(<AccountScreen />);
    await screen.findByTestId('account-address-addr-work-edit');

    await fireEvent.press(screen.getByTestId('account-address-addr-work-edit'));
    await fireEvent.press(screen.getByTestId('address-delete'));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Adres silindi'));
  });

  it('misafirde doğrulama kapısı çıkar, menü çıkmaz — adres ucu HİÇ çağrılmaz', async () => {
    await render(<AccountScreen signedIn={false} />);

    expect(screen.getByTestId('account-guest')).toBeOnTheScreen();
    expect(screen.queryByTestId('account-menu-tickets')).toBeNull();
    // Oturumsuz açılış adres okumasına ağ turu harcamaz (hook `enabled` kapısı).
    expect(mockFetchAddresses).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('account-login'));

    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
