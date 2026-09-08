import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

/*
  KURUMSAL BAŞVURU — LİSTE VE KART (21.217).

  Sınanan şey ekranın ÜÇ kararı:
  1. Tek bekleyen başvuruda liste ATLANIR — kestirme kümenin sayacından gelir, sayfadan değil.
  2. Bayrak satırda okunur; karar rozeti yalnız karar verilmiş sekmesinde çizilir.
  3. Ret SEBEPSİZ gönderilemez — düğme kapalı, ve sebep yazılınca gövde uca sebeple gider.

  Kapı `fetch` düzeyinde taklit ediliyor (hub testiyle aynı desen): sınanan şey ekranın çizimi ve
  gövdenin şekli, taşıma katmanı değil.
*/

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: CUSTOMER_ID }),
  /* Kabuk kromunun odak hizalaması (21.290) — taklit modülü bütünüyle değiştiriyor. */
  useFocusEffect: () => undefined,
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

import { B2bApplicationsScreen } from './b2b-applications-screen';
import { B2bApplicationScreen } from './b2b-application-screen';
import { managementCopy } from './copy';

const t = managementCopy;
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000b2b';
const OTHER_ID = '00000000-0000-4000-8000-000000000b2c';

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

const flag = (tone: 'ok' | 'warn' | 'bad' = 'ok') => ({
  label: tone === 'ok' ? 'Temiz' : tone === 'warn' ? 'Dikkat' : 'Mükerrer',
  tone,
  /* Gerekçe MOTORDAN gelen cümle; kart şeridinde yazan budur, liste satırında `label`. */
  reason: tone === 'ok' ? 'Sinyaller temiz — onaya engel görünmüyor.' : 'Dikkat — Resmî kayıt: Kayıt kapalı.',
});

const row = (over: Record<string, unknown> = {}) => ({
  customerId: CUSTOMER_ID,
  name: 'Bosphore SARL',
  city: 'Strasbourg',
  country: 'FR',
  appliedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  flag: flag(),
  status: 'pending',
  ...over,
});

const queue = (rows: unknown[], over: Record<string, unknown> = {}) => ({
  rows,
  nextCursor: null,
  counts: { pending: rows.length, decided: 0 },
  single: rows.length === 1 ? CUSTOMER_ID : null,
  ...over,
});

const check = (over: Record<string, unknown> = {}) => ({
  check: {
    customerId: CUSTOMER_ID,
    name: 'Bosphore SARL',
    legalName: 'BOSPHORE SARL',
    identity: { label: 'SIRET', value: '81234567800019', source: 'resmî kayıttan' },
    country: 'FR',
    phone: '+33388123456',
    addressLine: '12 rue des Fleurs, 67000 Strasbourg',
    city: 'Strasbourg',
    appliedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    mapsHref: null,
    status: 'pending',
    signals: [{ label: 'Resmî kayıt', value: 'Aktif', tone: 'ok' }],
    flag: flag(),
    duplicates: [],
    ...over,
  },
});

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockReplace.mockReset();
  mockPush.mockReset();
});

describe('kurumsal başvuru listesi', () => {
  it('TEK bekleyen başvuruda liste ATLANIR — doğrudan başvuru açılır', async () => {
    /*
      Kestirme KÜMENİN sayacından geliyor (`single`), `rows.length`ten değil: sayfalanmış bir listede
      ilk sayfa doluysa uzunluk yanlış cevap verirdi. `replace` — atlanan liste geri yığınında kalmaz.
    */
    fetchMock.mockResolvedValue(ok(queue([row()])));

    await render(<B2bApplicationsScreen />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(`/b2b-application?id=${CUSTOMER_ID}`));
  });

  it('BİRDEN ÇOK başvuruda liste çizilir ve bayrak satırda okunur', async () => {
    fetchMock.mockResolvedValue(
      ok(queue([row(), row({ customerId: OTHER_ID, name: 'Anadolu Gıda', flag: flag('bad') })])),
    );

    await render(<B2bApplicationsScreen />);

    await waitFor(() => expect(screen.getByTestId(`management-b2b-row-${OTHER_ID}`)).toBeOnTheScreen());
    expect(mockReplace).not.toHaveBeenCalled();
    /* Bayrak ETİKETİYLE okunuyor — renk tek başına anlam taşımaz (tasarım kuralı). */
    expect(screen.getByText('Mükerrer')).toBeOnTheScreen();
    expect(screen.getByText('Temiz')).toBeOnTheScreen();
    /* Bekleyen sekmesinde karar rozeti YOK: her satırda aynı şeyi tekrarlamak gürültüdür. */
    expect(screen.queryByText(t.b2b.status.pending)).toBeNull();
  });

  it('boş sekme bölümü kapatmaz — arşiv görünmez olmaz', async () => {
    fetchMock.mockResolvedValue(ok(queue([], { counts: { pending: 0, decided: 4 } })));

    await render(<B2bApplicationsScreen />);

    await waitFor(() => expect(screen.getByTestId('management-b2b-empty')).toBeOnTheScreen());
    expect(screen.getByText(t.b2b.emptyBody)).toBeOnTheScreen();
    /* Öteki sekmenin sayısı okunmayan sekmede de dolu — operatör basmadan ne olduğunu görür. */
    expect(screen.getByText(`${t.b2b.tabDecided} · 4`)).toBeOnTheScreen();
  });
});

describe('kurumsal başvuru kartı', () => {
  it('ŞERİT gerekçeyi yazar, tek kelimeyi DEĞİL — kart açıldıysa sebebi de açılır', async () => {
    /* Cihaz turunda (07.09) bant yalnız "Dikkat" diyordu: yargıyı söylüyor, hangi satıra
       bakılacağını söylemiyordu. Tek kelime kuyruğun işi — orada göz tarar; burada karar verilir. */
    fetchMock.mockResolvedValue(ok(check({ flag: flag('bad') })));

    await render(<B2bApplicationScreen customerId={CUSTOMER_ID} />);

    await waitFor(() => expect(screen.getByTestId('management-b2b-flag')).toBeOnTheScreen());
    expect(screen.getByTestId('management-b2b-flag')).toHaveTextContent('Dikkat — Resmî kayıt: Kayıt kapalı.');
  });

  it('ASİSTAN ÖZETİ gelince BLOK çizilir; gelmezse yalnız cümle kalır', async () => {
    /*
      Özet karttan AYRI okunuyor (model çağrısı kartın açılışını bekletmemeli) ve iki hâli var:
      cümle varsa başlıklı kesikli blok, yoksa soluk tek satır. Başlık ("karar değil") cümlenin
      kendisi kadar taşıyıcı — onsuz tek satırlık bir makine metni, sinyallerin üstünde bir hüküm
      gibi okunurdu.
    */
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith('/summary') ? ok({ summary: 'AB vergi no doğrulaması sorulmadı; diğer sinyaller olumlu.' }) : ok(check()),
    );

    await render(<B2bApplicationScreen customerId={CUSTOMER_ID} />);

    await waitFor(() => expect(screen.getByTestId('management-b2b-summary')).toBeOnTheScreen());
    expect(screen.getByText('AB vergi no doğrulaması sorulmadı; diğer sinyaller olumlu.')).toBeOnTheScreen();
    expect(screen.getByText(t.b2b.summary)).toBeOnTheScreen();
  });

  it('özet ÜRETİLEMEDİĞİNDE kart eksik çizilmez — sınırı söyleyen cümle kalır', async () => {
    /* Uç üretilememeyi 200 + `summary: null` diye söylüyor: 5xx olsaydı ekran "okuma yüklenemedi"
       hâline düşer ve kararın dayanağı olan sinyalleri de götürürdü. */
    fetchMock.mockImplementation(async (url) => (String(url).endsWith('/summary') ? ok({ summary: null }) : ok(check())));

    await render(<B2bApplicationScreen customerId={CUSTOMER_ID} />);

    await waitFor(() => expect(screen.getByText(t.b2b.summaryEmpty)).toBeOnTheScreen());
    /* Blok BAŞLIĞI yok: yokluğa çerçeve çizmek, olmayan bir şeye kartın görünür yerinde yer
       ayırmaktı — sinyaller zaten yukarıda ve karar onlardan veriliyor. */
    expect(screen.queryByText(t.b2b.summary)).toBeNull();
  });

  it('RET SEBEPSİZ gönderilmez; sebep yazılınca gövdeye girer', async () => {
    fetchMock.mockResolvedValue(ok(check()));
    await render(<B2bApplicationScreen customerId={CUSTOMER_ID} />);
    await waitFor(() => expect(screen.getByTestId('management-b2b-reject')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('management-b2b-reject'));
    /* Sebep boşken onay düğmesi KAPALI — uç da boş sebebi reddediyor, ekran onu denemiyor bile. */
    expect(screen.getByTestId('management-b2b-reject-confirm')).toBeDisabled();

    await fireEvent.changeText(screen.getByTestId('management-b2b-reject-reason'), 'resmî kayıt kapalı');
    fetchMock.mockResolvedValue(ok({ result: 'ok', status: 'rejected' }));
    await fireEvent.press(screen.getByTestId('management-b2b-reject-confirm'));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/reject'));
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ reason: 'resmî kayıt kapalı' });
    });
  });

  it('KARAR VERİLMİŞ başvuruda düğmeler yok — değiştirmek masaüstünden', async () => {
    fetchMock.mockResolvedValue(ok(check({ status: 'approved' })));

    await render(<B2bApplicationScreen customerId={CUSTOMER_ID} />);

    await waitFor(() => expect(screen.getByTestId('management-b2b-decided')).toBeOnTheScreen());
    expect(screen.queryByTestId('management-b2b-approve')).toBeNull();
    expect(screen.queryByTestId('management-b2b-reject')).toBeNull();
  });

  it('BAYAT karar sessizce yutulmaz — araya giren telefonun kararı yazılır', async () => {
    /* İki telefon aynı başvuruyu açtı; ikincinin dokunuşu hiçbir şeyi ikilemiyor ve ekran bunu
       adıyla söylüyor. Sessizce "oldu" demek, operatöre olmayan bir kararı üstlendirirdi. */
    fetchMock.mockResolvedValue(ok(check()));
    await render(<B2bApplicationScreen customerId={CUSTOMER_ID} />);
    await waitFor(() => expect(screen.getByTestId('management-b2b-approve')).toBeOnTheScreen());

    fetchMock.mockResolvedValue(ok({ result: 'already_decided', status: 'approved' }));
    await fireEvent.press(screen.getByTestId('management-b2b-approve'));

    await waitFor(() => expect(screen.getByTestId('management-b2b-outcome')).toBeOnTheScreen());
    /* Cümle "araya biri girdi"yi söylüyor — yalnız "oldu" demek, operatöre kendisinin vermediği
       bir kararı üstlendirirdi. */
    expect(screen.getByText(/Karar zaten verilmiş/)).toBeOnTheScreen();
    /* Ve rozet DE tazelendi: ekran ikinci bir okumaya gitmeden yeni hâli gösteriyor — "Onaylı"nın
       iki kez geçmesi bu yüzden doğru, biri cümlede biri künyede. */
    expect(screen.getAllByText(/Onaylı/)).toHaveLength(2);
    /* Ve düğmeler kalktı: bayat ekranda ikinci bir dokunuş kalmıyor. */
    expect(screen.queryByTestId('management-b2b-approve')).toBeNull();
  });
});
