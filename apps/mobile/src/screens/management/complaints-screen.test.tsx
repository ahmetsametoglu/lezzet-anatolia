import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ComplaintsScreen } from './complaints-screen';
import messages from './messages.json';

/*
  Y1 · TALEP LİSTESİ (21.281).

  Ekranın taşıdığı kararlar "liste" görünümünün altında saklı ve testler onlara bakıyor:

  1. **Şerit TEK SEÇİMLİ ve süzgeç SUNUCUYA gider** — ekran yüklenmiş sayfayı kendi içinde
     süzmez; süzülmüş liste sunucudan gelir, yoksa çip "3" derken listede 3'ten fazlası olurdu.
  2. **Sayaçlar sayfadan sayılmaz.** Çipin üstündeki sayı `counts`tan gelir; sayfa uzunluğundan
     türetilseydi tam da kalabalıkta yalan söylerdi.
  3. **Kapanmış talep ERİŞİLEBİLİR** — ekranın var olma sebebi buydu (hub kartı yalnız kuyruğun
     başını açıyordu).
  4. **Kuyruk sayfası düşerse liste DÜŞMEZ** — dipte yeniden deneme kalır.

  Desen kardeş ekranla aynı: hook taklit EDİLMEZ, `fetch` taklit edilir — süzgeç iddiası ancak
  gerçekten atılan isteğin adresine bakarak kurulabilir.
*/
const t = messages.complaints;

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

/** Kimlikler GERÇEK uuid: sözleşme `ticketId`yi uuid olarak doğruluyor, kısa etiket satırı düşürür. */
const ID = {
  a: '00000000-0000-4000-8000-0000000000a1',
  b: '00000000-0000-4000-8000-0000000000a2',
  c: '00000000-0000-4000-8000-0000000000a3',
} as const;

function satir(ticketId: string, over: Record<string, unknown> = {}) {
  return {
    ticketId,
    type: 'damaged',
    status: 'open',
    customerName: 'Mehmet Aydın',
    preview: 'Kolinin dışı ıslanmış gelmiş.',
    previewTranslated: false,
    previewLanguage: 'tr',
    lastMessageAt: new Date().toISOString(),
    awaitingReply: true,
    hasAttachment: false,
    orderReferenceNo: null,
    /* Varsayılan PENCERESİZ (21.301): talebin arkasında konuşma yok — sipariş/form kaynaklı hâl.
       Satır o zaman son hareketin yaşını yazar. Pencereli hâl kendi testinde kuruluyor. */
    windowExpiresAt: null,
    ...over,
  };
}

const COUNTS = { all: 6, byType: { damaged: 3, missing: 2, question: 1, other: 0 }, awaiting: 2, resolved: 4 };

/** Atılan son isteğin adresi — süzgeç iddialarının tek kanıtı. */
function sonAdres(): string {
  const call = fetchMock.mock.calls.at(-1);
  return String(call?.[0] ?? '');
}

function mockListe(rows: unknown[], counts = COUNTS) {
  fetchMock.mockImplementation(() => Promise.resolve(envelope({ rows, nextCursor: null, counts })));
}

async function ekranAc() {
  await render(<ComplaintsScreen />);
  await waitFor(() => expect(screen.getByTestId('management-complaints')).toBeOnTheScreen());
}

beforeAll(() => {
  // `env.apiUrl` tanımsızsa `apiFetch` fetch'e varmadan fırlar ve ekran hata durumuna düşer.
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe('kuyruk — kapı artık kuyruğun tamamına açılıyor', () => {
  it('satırlar listede akar ve tür rozeti sözlükten gelir', async () => {
    mockListe([satir(ID.a), satir(ID.b, { type: 'question', awaitingReply: false })]);
    await ekranAc();

    expect(screen.getByTestId(`management-complaints-row-${ID.a}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`management-complaints-row-${ID.b}`)).toBeOnTheScreen();
    // Tür adı DETAYIN sözlüğünden okunuyor — ikinci bir kopya yok (ekran künyesi).
    expect(screen.getByText(messages.complaint.kind.damaged.toLocaleUpperCase('tr'))).toBeOnTheScreen();
  });

  it('"top bizde" ile "top onlarda" AYRI rozetler — kuyrukta gözün aradığı tek şey', async () => {
    mockListe([satir(ID.a, { awaitingReply: true }), satir(ID.b, { awaitingReply: false })]);
    await ekranAc();

    expect(screen.getByTestId(`management-complaints-turn-${ID.a}`)).toHaveTextContent(t.ourTurn);
    expect(screen.getByTestId(`management-complaints-turn-${ID.b}`)).toHaveTextContent(t.theirTurn);
  });

  it('KAPANMIŞ talep listede görünür — ekranın var olma sebebi', async () => {
    // Hub kartı yalnız kuyruğun BAŞINI açıyordu; kapanmış talebe hiçbir yerden gidilemiyordu.
    mockListe([satir(ID.c, { status: 'resolved', awaitingReply: false })]);
    await ekranAc();

    expect(screen.getByTestId(`management-complaints-turn-${ID.c}`)).toHaveTextContent(t.closed);
  });
});

describe('süzgeç şeridi', () => {
  it('sayaçlar SUNUCUDAN gelir, yüklenmiş sayfadan sayılmaz', async () => {
    // Sayfada tek satır var ama şerit altıyı söylüyor: sayı SAYIMDIR, sayfa uzunluğu değil.
    mockListe([satir(ID.a)]);
    await ekranAc();

    expect(screen.getByTestId('management-complaints-filter-all')).toHaveTextContent(`${t.filterAll} · 6`);
    // `toHaveTextContent` bu kurulumda TAM eşleşir; çipin etiketi tür adıyla birlikte gelir.
    expect(screen.getByTestId('management-complaints-filter-damaged')).toHaveTextContent(
      `${messages.complaint.kind.damaged.toLocaleLowerCase('tr')} · 3`,
    );
    expect(screen.getByTestId('management-complaints-filter-resolved')).toHaveTextContent(`${t.filterResolved} · 4`);
  });

  it('tür çipi SUNUCUYA gider — ekran yüklenmiş listeyi kendi içinde süzmez', async () => {
    mockListe([satir(ID.a)]);
    await ekranAc();

    await fireEvent.press(screen.getByTestId('management-complaints-filter-question'));

    await waitFor(() => expect(sonAdres()).toContain('type=question'));
  });

  it('"kapandı" çipi hâl süzgecini gönderir — tasarımda olmayan ama listesinde duran hâl', async () => {
    mockListe([satir(ID.a)]);
    await ekranAc();

    await fireEvent.press(screen.getByTestId('management-complaints-filter-resolved'));

    await waitFor(() => expect(sonAdres()).toContain('filter=resolved'));
  });

  it('şerit TEK SEÇİMLİ: tür seçilince hâl süzgeci gönderilmez', async () => {
    mockListe([satir(ID.a)]);
    await ekranAc();

    await fireEvent.press(screen.getByTestId('management-complaints-filter-damaged'));

    await waitFor(() => expect(sonAdres()).toContain('type=damaged'));
    // İki eksen birden gitseydi ekran, tasarımın hiç çizmediği bir kombinasyonu temsil ederdi.
    expect(sonAdres()).not.toContain('filter=');
  });
});

describe('satırın alt şeridi', () => {
  it('çeviri satırı KAYNAK dili yazar — "çevrildi" tek başına eksik cümle', async () => {
    mockListe([satir(ID.a, { previewTranslated: true, previewLanguage: 'de' })]);
    await ekranAc();

    expect(screen.getByText('DE · çeviri var')).toBeOnTheScreen();
  });

  it('dil saptanmamışsa kod UYDURULMAZ, yalnız "çeviri var" yazılır', async () => {
    mockListe([satir(ID.a, { previewTranslated: true, previewLanguage: null })]);
    await ekranAc();

    expect(screen.getByText(t.translatedNoLang)).toBeOnTheScreen();
  });

  it('önizleme ÇIPLAK biçimlendirme işareti taşımaz — sunucu söküyor (cihazda görüldü 07.09)', async () => {
    /* Cihazda satırda `*bedelsiz yeniden gönderim*` diye ham işaretler duruyordu: 21.279 yedi
       yüzeyi çizdirdi ama önizleme o yedinin içinde değildi. Sökme `previewOf`ta, yani ekranın
       gördüğü metin zaten temiz — bu iddia ekranın onu OLDUĞU GİBİ yazdığını çivilliyor. */
    mockListe([satir(ID.a, { preview: 'İki tepsi için bedelsiz yeniden gönderim planladık' })]);
    await ekranAc();

    // Tırnak EKRANIN katkısı (v3:29 — müşterinin sesini bizim etiketlerimizden ayırır); içerik temiz.
    expect(screen.getByText('"İki tepsi için bedelsiz yeniden gönderim planladık"')).toBeOnTheScreen();
  });

  it('ek VAR/YOK yazılır, SAYI değil (kullanıcı kararı 07.09)', async () => {
    mockListe([satir(ID.a, { hasAttachment: true })]);
    await ekranAc();

    // Görünüm sayıyı taşımıyor; "2 görsel" yazmak olmayan bir olguyu ekrana koymak olurdu.
    expect(screen.getByText(t.attachment)).toBeOnTheScreen();
  });
});

describe('hâller', () => {
  it('boş süzgeçte liste yerine boş hâl çizilir', async () => {
    mockListe([]);
    await ekranAc();

    expect(screen.getByTestId('management-complaints-empty')).toBeOnTheScreen();
  });

  it('okuma düşerse hata bloğu çıkar ve yeniden deneme kapısı kalır', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await ekranAc();

    await waitFor(() => expect(screen.getByTestId('management-complaints-error')).toBeOnTheScreen());
  });
});

/*
  SERVİS PENCERESİ SATIRDA (21.301, v3:2717 · 2732).

  Tasarım zaman yuvasına *"22 sa kaldı"* yazıyor ve 4 saatte kırmızıya çeviriyor. Bu bir SLA
  DEĞİL — WhatsApp'ın 24 saatlik penceresi: açıkken serbest metin ücretsiz, kapandıktan sonra
  yalnız onaylı kalıp gider (ücretli). Operatörün sorusu "ne kadar bekledi" değil, "bedava cevap
  hakkım ne kadar sürecek".
*/
describe('servis penceresi — bedava cevap hakkı satırda okunur', () => {
  const saatSonra = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString();

  it('pencere AÇIKSA kalan süre yazılır, yaş DEĞİL', async () => {
    mockListe([satir(ID.a, { windowExpiresAt: saatSonra(22) })]);
    await ekranAc();

    expect(screen.getByTestId(`management-complaints-window-${ID.a}`)).toHaveTextContent('22 sa kaldı');
  });

  it('pencere YOKSA (konuşmasız talep) satır yaşı yazar — uydurma bir süre değil', async () => {
    mockListe([satir(ID.a, { windowExpiresAt: null })]);
    await ekranAc();

    expect(screen.queryByTestId(`management-complaints-window-${ID.a}`)).toBeNull();
  });

  it('pencere KAPANMIŞSA da yazılmaz — "0 sa kaldı" bir bilgi değil', async () => {
    mockListe([satir(ID.a, { windowExpiresAt: saatSonra(-3) })]);
    await ekranAc();

    expect(screen.queryByTestId(`management-complaints-window-${ID.a}`)).toBeNull();
  });
});
