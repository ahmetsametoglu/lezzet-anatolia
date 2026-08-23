import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SocialInboxScreen } from './social-inbox-screen';
import messages from './messages.json';

/*
  SOSYAL GELEN KUTUSU (15.17 · test dalgası 15.18).

  Ekranın taşıdığı iki karar var ve ikisi de "liste" görünümünün altında saklı:

  1. **Üç kanal TEK kuyrukta.** Operatörün sorusu "hangi kanaldan yazdı" değil, "kim cevap
     bekliyor". Kanal ayrı sekme olsaydı o soru üçe bölünürdü. Kanal bir SÜZGEÇ ve iki eksen
     (durum · kanal) BAĞIMSIZ — "cevap bekleyen Messenger sohbetleri" meşru bir sorudur.
  2. **Sayaç yüklenmiş sayfadan sayılmaz, sunucudan gelir.** Kalabalık kuyrukta tam da sayının
     anlam kazandığı yerde yalan söylerdi.

  Desen sohbet ekranıyla aynı: hook taklit EDİLMEZ, `fetch` taklit edilir.
*/
const t = messages.social;

jest.mock('expo-router', () => {
  const react = jest.requireActual<{ useEffect: (effect: () => void, deps: unknown[]) => void }>('react');
  return {
    useRouter: () => ({ back: jest.fn(), navigate: jest.fn(), push: jest.fn() }),
    useFocusEffect: (callback: () => void) => react.useEffect(callback, [callback]),
  };
});

jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'test-token' } } }),
      refreshSession: async () => ({ data: { session: { access_token: 'test-token' } }, error: null }),
    },
  }),
}));

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function envelope(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

/** Kimlikler GERÇEK uuid: sözleşme `id`yi uuid olarak doğruluyor, kısa etiket satırı düşürür. */
const ID = {
  wa: '00000000-0000-4000-8000-000000000001',
  fb: '00000000-0000-4000-8000-000000000002',
  ig: '00000000-0000-4000-8000-000000000003',
} as const;

function satir(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    source: 'whatsapp',
    externalRef: '+33600000001',
    customerId: null,
    customerName: 'Ayşe Yılmaz',
    profileName: null,
    handledBy: 'human',
    aiDraftReply: null,
    windowExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    lastMessageAt: new Date().toISOString(),
    messageCount: 2,
    awaitingReply: true,
    lastMessageText: 'Fıstıklı baklava var mı?',
    lastMessageDirection: 'inbound',
    lastMessageKind: 'text',
    ...over,
  };
}

function mockInbox(rows: unknown[], counts = { awaitingReply: 3, handledByAi: 1 }) {
  fetchMock.mockImplementation((url) => {
    // Sorgu dizesi kaydedilsin: süzgeçlerin SUNUCUYA gittiğini iddia edeceğiz.
    void url;
    return Promise.resolve(envelope({ rows, nextCursor: null, counts }));
  });
}

async function ekranAc() {
  await render(<SocialInboxScreen />);
  await waitFor(() => expect(screen.getByTestId('management-social')).toBeOnTheScreen());
}

beforeAll(() => {
  // `env.apiUrl` tanımsızsa `apiFetch` fetch'e varmadan fırlar ve ekran hata durumuna düşer.
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  global.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe('kuyruk — üç kanal tek listede', () => {
  it('farklı kanallardan gelen satırlar AYNI listede akar', async () => {
    // Kanal bir sekme değil: "kim cevap bekliyor" sorusu üçe bölünmemeli.
    mockInbox([
      satir(ID.wa),
      satir(ID.fb, { source: 'messenger', externalRef: 'PSID-1', customerName: null, profileName: 'Emre Y.' }),
      satir(ID.ig, { source: 'instagram', externalRef: 'IGSID-1', customerName: null, profileName: null }),
    ]);
    await ekranAc();

    expect(screen.getByTestId(`management-social-row-${ID.wa}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`management-social-row-${ID.fb}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`management-social-row-${ID.ig}`)).toBeOnTheScreen();
  });

  it('başlık sayacı SUNUCUDAN gelen sayıyı yazar, satır sayısını değil', async () => {
    // Tek satır yüklüyken sayaç 3 diyor: sayım yüklenmiş sayfadan türetilseydi 1 derdi ve
    // kalabalık kuyrukta tam da sayının anlam kazandığı yerde yalan söylerdi.
    mockInbox([satir(ID.wa)], { awaitingReply: 3, handledByAi: 1 });
    await ekranAc();
    // İddia SÖZLÜKTEN türetiliyor: cümle değişirse test kırılmaz, kırılması gereken tek şey
    // sayının KAYNAĞIDIR (sunucu mu, yüklenmiş sayfa mı).
    const beklenen = t.caption.replace('{awaiting}', '3').replace('{ai}', '1');
    expect(screen.getByText(beklenen)).toBeOnTheScreen();
  });

  it('kimliksiz satır boş başlıkla kalmaz — profil adı, o da yoksa ham anahtar', async () => {
    mockInbox([satir(ID.ig, { source: 'instagram', externalRef: 'IGSID-9', customerName: null, profileName: null })]);
    await ekranAc();
    expect(screen.getByText('IGSID-9')).toBeOnTheScreen();
  });
});

describe('iki süzgeç ekseni BAĞIMSIZ', () => {
  it('durum ve kanal çipleri ayrı satırlarda ve ayrı ayrı seçilebilir', async () => {
    mockInbox([satir(ID.wa)]);
    await ekranAc();

    expect(screen.getByTestId('management-social-filter-all')).toBeOnTheScreen();
    expect(screen.getByTestId('management-social-filter-awaiting')).toBeOnTheScreen();
    expect(screen.getByTestId('management-social-channel-all')).toBeOnTheScreen();
    expect(screen.getByTestId('management-social-channel-whatsapp')).toBeOnTheScreen();
    expect(screen.getByTestId('management-social-channel-messenger')).toBeOnTheScreen();
    expect(screen.getByTestId('management-social-channel-instagram')).toBeOnTheScreen();
  });

  it('"cevap bekleyen" seçilince SUNUCUYA süzgeçli istek gider — yerelde süzülmez', async () => {
    // Yerel süzme, sayfalanmış bir listede kuyruğun geri kalanını sessizce yutardı.
    mockInbox([satir(ID.wa)]);
    await ekranAc();
    fetchMock.mockClear();

    fireEvent.press(screen.getByTestId('management-social-filter-awaiting'));
    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
      expect(String(fetchMock.mock.calls.at(-1)![0])).toContain('filter=awaiting');
    });
  });

  it('kanal çipi de SUNUCUYA gider ve durum eksenini sıfırlamaz', async () => {
    mockInbox([satir(ID.wa)]);
    await ekranAc();

    fireEvent.press(screen.getByTestId('management-social-filter-awaiting'));
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)![0])).toContain('filter=awaiting'));

    fireEvent.press(screen.getByTestId('management-social-channel-messenger'));
    await waitFor(() => {
      const son = String(fetchMock.mock.calls.at(-1)![0]);
      expect(son).toContain('source=messenger');
      // İki eksen bağımsız: kanal seçmek "cevap bekleyen" süzgecini düşürmemeli.
      expect(son).toContain('filter=awaiting');
    });
  });
});

describe('boş ve hatalı hâller ayrı cümlelerdir', () => {
  it('hiç satır yoksa boş blok', async () => {
    mockInbox([]);
    await ekranAc();
    expect(screen.getByTestId('management-social-empty')).toBeOnTheScreen();
  });

  it('sunucu hata verirse HATA bloğu — boş liste gibi gösterilmez', async () => {
    // "Kuyruk boş" ile "kuyruğu okuyamadım" aynı şey değil: ilki huzur verir, ikincisi
    // bekleyen müşteriyi görünmez kılar.
    fetchMock.mockImplementation(() =>
      Promise.resolve({ status: 500, headers: { get: () => null }, json: async () => ({ data: null, error: 'server_error' }) } as unknown as Response),
    );
    await ekranAc();
    expect(screen.getByTestId('management-social-error')).toBeOnTheScreen();
    expect(screen.queryByTestId('management-social-empty')).toBeNull();
  });
});
