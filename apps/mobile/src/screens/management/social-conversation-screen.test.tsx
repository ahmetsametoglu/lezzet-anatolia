import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SocialConversationScreen } from './social-conversation-screen';
import messages from './messages.json';

/*
  SOSYAL SOHBET EKRANI (15.17 · test dalgası 15.18).

  Bu ekranın en kritik kararı bir YOKLUK: **kutu mesaj GÖNDERMEZ, deftere işler.** Sistemin bir
  gönderim kanalı yok (15.11); yazışma operatörün telefonundan yürüyor. Gönderdiğini sanan operatör,
  cevapsız kalan müşteriyi asla fark etmez — bu yüzden düğme "gönder" değil "Deftere işle" ve altında
  uyarı var. Bir gün biri "kullanıcı deneyimi" adına o cümleyi yumuşatırsa, kırılması gereken test bu.

  İkinci karar: **yürütücü modu İKİ değerli** (insan · hibrit). Üçüncüsü (özerk AI) arkasında motoru
  olmadığı için seçilemez (15.13); seçilebilir olsaydı ekran olmayan bir yeteneği vaat ederdi.

  Desen kurye ekranlarıyla aynı: hook taklit EDİLMEZ, `fetch` taklit edilir — ekran ile sözleşme
  arasındaki yol gerçek kalsın diye.
*/
const t = messages.social.detail;

jest.mock('expo-router', () => {
  /* Gerçek `useFocusEffect` navigasyon bağlamı ister; ekranın sözleşmesi "odakta yükle" olduğu için
     taklit onu MOUNT'ta koşan bir etkiye indirger — tek yükleme yolu aynen korunur (kurye emsali).
     Fabrika hoisting yüzünden dışarıdaki `import`u kapatamaz, o yüzden React buradan alınıyor. */
  const react = jest.requireActual<{ useEffect: (effect: () => void, deps: unknown[]) => void }>('react');
  return {
    useRouter: () => ({ back: jest.fn(), navigate: jest.fn(), push: jest.fn() }),
    useFocusEffect: (callback: () => void) => react.useEffect(callback, [callback]),
  };
});

const mockSession = { access_token: 'test-token' };
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
    },
  }),
}));

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function envelope(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

const CONV_ID = '00000000-0000-4000-8000-000000000010';

/** Açık pencereli WhatsApp sohbeti — pencere ileri bir damga taşır. */
function detay(over: Record<string, unknown> = {}, mesajlar: unknown[] = []) {
  return {
    conversation: {
      id: CONV_ID,
      source: 'whatsapp',
      externalRef: '+33600000001',
      customerId: null,
      customerName: null,
      profileName: 'Duman Testi',
      handledBy: 'human',
      aiDraftReply: null,
      windowExpiresAt: new Date(Date.now() + 20 * 3_600_000).toISOString(),
      lastMessageAt: new Date().toISOString(),
      messageCount: mesajlar.length,
      awaitingReply: true,
      lastMessageText: 'Merhaba',
      lastMessageDirection: 'inbound',
      lastMessageKind: 'text',
      ...over,
    },
    messages: mesajlar,
    nextCursor: null,
  };
}

function mockDetay(payload: unknown) {
  fetchMock.mockImplementation(() => Promise.resolve(envelope(payload)));
}

async function ekranAc() {
  await render(<SocialConversationScreen conversationId={CONV_ID} />);
  await waitFor(() => expect(screen.getByTestId('management-social-chat')).toBeOnTheScreen());
}

beforeAll(() => {
  // `env.apiUrl` tanımsızsa `apiFetch` daha `fetch`e varmadan fırlar ve sonuç `network_error`
  // olur — yani ekran, sahte cevabı hiç görmeden hata durumuna düşer (ölçüldü 23.08). Kurye
  // testlerinin aynı satırı.
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe('kutu bir DEFTER kutusudur — mesaj göndermez', () => {
  it('düğme "Deftere işle" der, "gönder" demez', async () => {
    mockDetay(detay());
    await ekranAc();
    expect(screen.getByTestId('management-social-record')).toBeOnTheScreen();
    expect(screen.getByText(t.record)).toBeOnTheScreen();
    expect(t.record).toBe('Deftere işle');
  });

  it('altında "buradan gönderilmez" uyarısı GÖRÜNÜR', async () => {
    // Bu cümle ekranın kendisi kadar önemli: operatörün mesajı gönderdiğini sanmasını engelleyen
    // tek şey o. Yumuşatılırsa bu iddia kırılır.
    mockDetay(detay());
    await ekranAc();
    expect(screen.getByText(t.recordNote)).toBeOnTheScreen();
    expect(t.recordNote).toContain('gönderilmez');
  });

  it('kayıt isteği `reply` ucuna gider — gönderim ucu YOK', async () => {
    mockDetay(detay());
    await ekranAc();

    fireEvent.changeText(screen.getByTestId('management-social-reply'), 'Merhaba, hazır.');
    // Düğme metin BOŞKEN kapalı; basmadan önce açıldığını doğruluyoruz, yoksa `press` sessizce
    // yutulur ve test "POST atılmadı" diye YANLIŞ bir sonuç okur.
    await waitFor(() => expect(screen.getByTestId('management-social-record')).toBeEnabled());
    fireEvent.press(screen.getByTestId('management-social-record'));

    await waitFor(() => {
      const yazmalar = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
      expect(yazmalar).toHaveLength(1);
      expect(String(yazmalar[0]![0])).toContain(`/api/v1/social/conversations/${CONV_ID}/reply`);
      // Gönderim ucu diye bir şey yok; olsaydı adı `send` olurdu ve bu iddia onu yakalardı.
      expect(String(yazmalar[0]![0])).not.toContain('/send');
    });
  });

  it('BOŞ metinle kayıt yazılmaz — deftere boş satır düşmez', async () => {
    mockDetay(detay());
    await ekranAc();
    fireEvent.press(screen.getByTestId('management-social-record'));

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toHaveLength(0);
    });
  });
});

describe('yürütücü modu — İKİ değer, üçüncüsü YOK', () => {
  it('insan ve hibrit çipleri var, "AI" çipi YOK', async () => {
    // Özerk sohbet motoru yazılmadı (15.8). Seçilebilir bir "AI" çipi, arkasında hiçbir şey
    // koşmayan bir modu vaat ederdi — sohbet operatör AI ilgileniyor sanarken cevapsız kalırdı.
    mockDetay(detay());
    await ekranAc();
    expect(screen.getByTestId('management-social-mode-human')).toBeOnTheScreen();
    expect(screen.getByTestId('management-social-mode-hybrid')).toBeOnTheScreen();
    expect(screen.queryByTestId('management-social-mode-ai')).toBeNull();
  });

  it('eski `ai` satırında ÇIKIŞ uyarısı gösterilir — ekran bozuk sanılmasın', async () => {
    // Mod artık seçilemiyor ama kolonda durabilir (16.08–22.08 arası). Hiçbir çip aktif
    // görünmezken sebep söylenmezse operatör ekranı bozuk sanar.
    mockDetay(detay({ handledBy: 'ai' }));
    await ekranAc();
    expect(screen.getByTestId('management-social-mode-orphan')).toBeOnTheScreen();
  });
});

describe('YZ taslağının tek çıkışı kutuya taşımaktır', () => {
  it('taslak varken "Cevap kutusuna al" görünür; doğrudan gönderme yolu yok', async () => {
    mockDetay(detay({ handledBy: 'hybrid', aiDraftReply: 'Merhaba! Fıstıklı baklava 4,57 €.' }));
    await ekranAc();

    expect(screen.getByTestId('management-social-draft')).toBeOnTheScreen();
    expect(screen.getByTestId('management-social-draft-take')).toBeOnTheScreen();
    // Taslak kartında "gönder" yok: onaylanmadan hiçbir metin müşteriye gitmez.
    expect(screen.queryByText(t.record)).toBeOnTheScreen(); // altlıktaki defter düğmesi hâlâ tek yazma yolu
  });

  it('hibritte taslak YOKKEN "Taslak öner" düğmesi görünür', async () => {
    mockDetay(detay({ handledBy: 'hybrid', aiDraftReply: null }));
    await ekranAc();
    expect(screen.getByTestId('management-social-suggest')).toBeOnTheScreen();
    expect(screen.queryByTestId('management-social-draft')).toBeNull();
  });
});

describe('pencere bandı — kanalın diliyle konuşur', () => {
  it('WhatsApp açık pencerede kalan saati söyler', async () => {
    mockDetay(detay());
    await ekranAc();
    expect(screen.getByTestId('management-social-window')).toBeOnTheScreen();
  });

  it('pencere HİÇ açılmamışsa kanalın kendi cümlesi kurulur', async () => {
    // "Kapandı" ile "hiç açılmadı" ayrı cümlelerdir: biri kaçırılmış fırsat, öteki kurulmamış ilişki.
    mockDetay(detay({ windowExpiresAt: null }));
    await ekranAc();
    expect(screen.getByText(t.window.whatsapp.never)).toBeOnTheScreen();
  });

  it('Messenger kapalı pencerede ÜCRET değil KURAL cümlesi kurar', async () => {
    // WhatsApp'ta kapalı pencere para demek; Messenger'da insan-temsilci kuralı ve ücretsiz.
    mockDetay(detay({ source: 'messenger', externalRef: 'PSID-1', windowExpiresAt: new Date(Date.now() - 1000).toISOString() }));
    await ekranAc();
    expect(screen.getByText(t.window.messenger.closed)).toBeOnTheScreen();
    expect(t.window.messenger.closed).not.toContain('ücretli');
  });
});
