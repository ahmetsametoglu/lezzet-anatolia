import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { fillCopy } from '@/screens/operations/copy';
import { SocialConversationScreen } from './social-conversation-screen';
import messages from './messages.json';

/*
  SOSYAL SOHBET EKRANI (15.17 · test dalgası 15.18).

  Bu ekranın en kritik kararı bir YOKLUK: **kutu mesaj GÖNDERMEZ, deftere işler.** Sistemin bir
  gönderim kanalı yok (15.11); yazışma operatörün telefonundan yürüyor. Gönderdiğini sanan operatör,
  cevapsız kalan müşteriyi asla fark etmez — bu yüzden düğme "gönder" değil "Deftere işle" ve altında
  uyarı var. Bir gün biri "kullanıcı deneyimi" adına o cümleyi yumuşatırsa, kırılması gereken test bu.

  İkinci karar: **yürütücü çipleri ENUM'dan türer**, elle sayılmaz. Özerk AI bir tur boyunca enum'un
  dışındaydı (arkasında motor yoktu, 15.13) ve 29.08'de geri döndü; ekran o gün tek satır bile
  değişmedi. Türetmenin karşılığı budur.

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
/* CANLI ZİL SAHTESİ (21.291): kanca artık `getSupabase().channel(...)` çağırıyor. Sahte, gerçek
   imzanın en küçüğü — `on` kendini döndürür, `subscribe` bir tutamaç verir. Zilin ÇALDIĞINI
   testler kendi tetikliyor (yakalanan geri çağrıyı çağırarak); burada taklit edilen tek şey soket. */
const mockRemoveChannel = jest.fn();
const mockSubscribe = jest.fn(() => ({ topic: 'test' }));
const mockOnBroadcast = jest.fn();
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
    },
    channel: (name: string) => {
      const kanal = {
        on: (...args: unknown[]) => {
          mockOnBroadcast(name, ...args);
          return kanal;
        },
        subscribe: mockSubscribe,
      };
      return kanal;
    },
    removeChannel: mockRemoveChannel,
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
    /* `channel` sözleşmenin ZORUNLU alanı (21.291): bu sohbetin canlı zilinin adı sunucudan gelir.
       Sahte cevaba eklenmemiş olsaydı `parse` düşer ve ekran "beklenmedik" hatasına giderdi. */
    channel: `conversation:${CONV_ID}`,
  };
}

function mockDetay(payload: unknown) {
  fetchMock.mockImplementation(() => Promise.resolve(envelope(payload)));
}

async function ekranAc() {
  await render(<SocialConversationScreen conversationId={CONV_ID} />);
  await waitFor(() => expect(screen.getByTestId('management-social-chat')).toBeOnTheScreen());
}

let disariAc: jest.SpyInstance;

beforeAll(() => {
  // `env.apiUrl` tanımsızsa `apiFetch` daha `fetch`e varmadan fırlar ve sonuç `network_error`
  // olur — yani ekran, sahte cevabı hiç görmeden hata durumuna düşer (ölçüldü 23.08). Kurye
  // testlerinin aynı satırı.
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  /* DIŞ ÇIKIŞ NÖBETİ (21.287): kullanıcı kararı *"Uygulama dışına çıkışlar olmamalı."* Casus
     burada kuruluyor ki fotoğraf ve ses iddiaları "açılmadı"yı gerçekten ölçebilsin. */
  disariAc = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

beforeEach(() => {
  fetchMock.mockReset();
  disariAc.mockClear();
  mockRemoveChannel.mockClear();
  mockSubscribe.mockClear();
  mockOnBroadcast.mockClear();
});

describe('kutu bir DEFTER kutusudur — mesaj göndermez', () => {
  /* DEFTER EVRESİ BİTTİ (21.286 · kullanıcı kararı 07.09). Bu üç iddia eskiden tam TERSİNİ
     çiviliyordu ("Deftere işle" · "buradan gönderilmez" · "gönderim ucu YOK") ve o gün doğruydu:
     mobil uç `recordOutboundMessage` çağırıyordu. Web `sendOutboundMessage` çağırırken mobilin
     defterde kalması aynı konuşmayı iki yüzeyde iki ayrı yetenek yapıyordu. */
  it('düğme "Gönder" der — mesaj gerçekten gidiyor', async () => {
    mockDetay(detay());
    await ekranAc();
    expect(screen.getByTestId('management-social-record')).toBeOnTheScreen();
    expect(screen.getByText(t.record)).toBeOnTheScreen();
    expect(t.record).toBe('Gönder');
  });

  it('altındaki not gönderimin GERİ ALINAMAZ olduğunu söyler — ve KANALI adıyla anar', async () => {
    /* Cümle ekranın kendisi kadar önemli: operatörün "deneme yaparım" sanmasını engelleyen tek şey
       o. Mesaj müşteriye gidiyor ve geri çağrılamıyor.

       Kanal adı 21.292'de eklendi: metin sabit "WhatsApp" diyordu ve Messenger sohbetinde yanlış
       bir cümle kuruyordu (cihazda görüldü 08.09). */
    mockDetay(detay());
    await ekranAc();
    expect(screen.getByText(fillCopy(t.recordNote, { channel: messages.social.channel.whatsapp }))).toBeOnTheScreen();
    expect(t.recordNote).toContain('geri alınamaz');
  });

  it('MESSENGER sohbetinde not "WhatsApp" DEMEZ', async () => {
    mockDetay(detay({ source: 'messenger', externalRef: 'PSID-9' }));
    await ekranAc();
    expect(
      screen.getByText(fillCopy(t.recordNote, { channel: messages.social.channel.messenger })),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/WhatsApp üzerinden/)).not.toBeOnTheScreen();
  });

  it('cevap `reply` ucuna gider — uç adı değişmedi, DAVRANIŞI değişti', async () => {
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
      /* Uç ADI korundu ve bu bilinçli: aynı kapı, aynı gövde — değişen tek şey ucun içinde
         `record` yerine `send` çağrılması. İkinci bir uç açmak aynı işe iki ad vermek olurdu. */
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

describe('yürütücü modu — çipler ENUM\'dan doğar', () => {
  it('insan · hibrit · AI: üç çip de enum\'dan türer', async () => {
    // Çip listesi elle sayılmıyor: `ConversationHandlerEnum.options`. Enum bir tur boyunca `ai`yi
    // dışlıyordu (arkasında motor yoktu); 29.08'de geri aldı ve üçüncü çip kendiliğinden doğdu.
    mockDetay(detay());
    await ekranAc();
    expect(screen.getByTestId('management-social-mode-human')).toBeOnTheScreen();
    expect(screen.getByTestId('management-social-mode-hybrid')).toBeOnTheScreen();
    /* ÜÇÜNCÜ ÇİP 29.08'DE DOĞDU ve bu dosyaya elle eklenmedi: ekran modları
       `ConversationHandlerEnum.options`tan türetiyor, enum da o gün `ai`yi geri aldı. İddia
       tersine çevrildi — eskiden "görünmemeli" diyordu. */
    expect(screen.getByTestId('management-social-mode-ai')).toBeOnTheScreen();
  });

  it('`ai` modunda ÇIKIŞ uyarısı YOK — mod artık çalışıyor', async () => {
    /* Uyarı *"AI modunda ama sohbette ajan yok — İnsan'a alın"* diyordu ve motor doğmadan önce
       doğruydu. Bugün yalan olurdu: operatörü çalışan bir modu terk etmeye iterdi. */
    mockDetay(detay({ handledBy: 'ai' }));
    await ekranAc();
    expect(screen.queryByTestId('management-social-mode-orphan')).toBeNull();
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

  it('taslak BİÇİMLİ çizilir — operatör göndereceği metnin görüneceği hâli görmeli (07.09)', async () => {
    /* Dokuzuncu yüzeydi ve atlanmıştı: 21.279 mesaj baloncuklarını çizdirdi, taslak AYRI bir kutu.
       Buradaki metin defterde işaret taşıma ihtimali en yüksek metin — onu yapay zekâ üretiyor ve
       biçimli üretiyor. Ham gösterilirse operatör görmediği bir hâli onaylar. */
    mockDetay(detay({ handledBy: 'hybrid', aiDraftReply: '*Fıstıklı Baklava* 4,57 €' }));
    await ekranAc();

    // İşaret ÇİZİLİYOR: yıldızlar ekranda düz metin olarak durmuyor.
    expect(screen.getByText('Fıstıklı Baklava')).toBeOnTheScreen();
    expect(screen.queryByText('*Fıstıklı Baklava* 4,57 €')).toBeNull();
  });

  it('hibritte taslak YOKKEN "Taslak öner" düğmesi görünür', async () => {
    mockDetay(detay({ handledBy: 'hybrid', aiDraftReply: null }));
    await ekranAc();
    expect(screen.getByTestId('management-social-suggest')).toBeOnTheScreen();
    expect(screen.queryByTestId('management-social-draft')).toBeNull();
  });

  /* v3 (30.08): taslak YAZIŞMADAN çıkıp cevap çubuğunun üstüne taşındı — bir mesaj değil, bekleyen
     bir karar. Test yerini çiviliyor: yazışma kaydırıcısının İÇİNDE değil, çubuğun yanında. */
  it('v3 · taslak yazışmanın içinde DEĞİL, cevap çubuğunun üstündedir', async () => {
    mockDetay(detay({ handledBy: 'hybrid', aiDraftReply: 'Yarın 09:00 için ayırdık.' }));
    await ekranAc();

    const thread = screen.getByTestId('management-social-thread');
    const draft = screen.getByTestId('management-social-draft');
    expect(thread).not.toContainElement(draft);
    // Kuralın cümlesi kartın üstünde: hibritte gönderen insandır.
    expect(screen.getByText(t.draftNote)).toBeOnTheScreen();
  });

  it('v3 · "Reddet" düğmesi ÇİZİLMEZ — taslağı reddeden bir uç yok', async () => {
    // Şablon iki düğme çiziyor; ikincisinin arkasında kapı olmadığı için yazılmadı. Basılınca
    // hiçbir şey yapmayan düğme, operatöre "reddettim" dedirtip taslağı yerinde bırakırdı.
    mockDetay(detay({ handledBy: 'hybrid', aiDraftReply: 'Yarın 09:00 için ayırdık.' }));
    await ekranAc();

    expect(screen.queryByText('Reddet')).toBeNull();
    expect(screen.getAllByTestId('management-social-draft-take')).toHaveLength(1);
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

/*
  MEDYA (21.287) — ekran buraya kadar fotoğrafı da sesi de aynı yer tutucu yazısıyla çiziyordu
  (`[görsel / dosya]`), çünkü sözleşme ne `mediaMime` ne adres taşıyordu. Aşağıdaki iddialar o
  yokluğun geri dönmemesini bekliyor: yer tutucuya düşen bir medya mesajı, testi kırar.
*/
let mediaSeq = 0;

/** Sözleşme şeklinde bir mesaj — verilmeyen medya alanları BOŞ (metin mesajının normali). */
function mesaj(over: Record<string, unknown> = {}) {
  mediaSeq += 1;
  const govde = (over.body as { text: string | null } | undefined) ?? { text: 'Merhaba', payload: null };
  return {
    id: `00000000-0000-4000-8000-00000000${String(1000 + mediaSeq)}`,
    direction: 'inbound',
    author: 'customer',
    kind: 'text',
    body: { text: 'Merhaba', payload: null },
    templateName: null,
    mediaMime: null,
    mediaTranscript: null,
    mediaUrl: null,
    /* ÇEVİRİSİZ VARSAYILAN (21.297): gösterilen metin gövdenin kendisi, çeviri YOK. Türkçe
       konuşulan bir sohbetin gerçek hâli bu — uç `resolveUserText`ten aynısını döndürür.
       Çevrilmiş hâli ölçen testler üçlüyü açıkça veriyor. */
    shownText: govde.text,
    shownTranslated: false,
    language: 'tr',
    createdAt: new Date().toISOString(),
    ...over,
  };
}

/** Alt yazısız gelen fotoğraf — ızgaraya giren tek şekil. */
function foto(over: Record<string, unknown> = {}) {
  return mesaj({
    kind: 'media',
    body: { text: null, payload: null },
    mediaMime: 'image/jpeg',
    mediaUrl: 'https://r2.test/imzali-1.jpg',
    ...over,
  });
}

describe('gelen fotoğraf ÇİZİLİR — yer tutucu yazısı değil', () => {
  it('tek fotoğraf karesi çizilir', async () => {
    mockDetay(detay({}, [foto()]));
    await ekranAc();
    expect(screen.getByTestId('management-social-photos')).toBeOnTheScreen();
    expect(screen.getByTestId('management-social-photo-0')).toBeOnTheScreen();
  });

  it('dokunuş UYGULAMA İÇİNDE tam ekranı açar — dışarı çıkmaz', async () => {
    /* Kullanıcı kararı 07.09. Bir tur boyunca `Linking.openURL` sistem tarayıcısını açıyordu ve
       cihazda çalışıyordu — ama operatörü yazışmadan çıkarıyordu. */
    mockDetay(detay({}, [foto()]));
    await ekranAc();
    fireEvent.press(screen.getByTestId('management-social-photo-0'));

    await waitFor(() => expect(screen.getByTestId('management-social-photo-viewer')).toBeOnTheScreen());
    expect(disariAc).not.toHaveBeenCalled();
  });

  it('görüntüleyici KAPANIR — açık kalan bir perde yazışmayı kilitlerdi', async () => {
    mockDetay(detay({}, [foto()]));
    await ekranAc();
    fireEvent.press(screen.getByTestId('management-social-photo-0'));
    await waitFor(() => expect(screen.getByTestId('management-social-photo-viewer')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('management-social-photo-viewer-close'));

    await waitFor(() => expect(screen.queryByTestId('management-social-photo-viewer')).not.toBeOnTheScreen());
  });

  it('İNDİRİLEMEMİŞ fotoğraf görüntüleyiciye GİRMEZ — sıra kayması olmaz', async () => {
    /* Boş karo tam ekranda gösterilecek hiçbir şey taşımıyor, o yüzden görüntüleyiciye alınmıyor.
       Karonun IZGARADAKİ sırası ile GÖRÜNTÜLEYİCİDEKİ sırası bu yüzden ayrı hesaplanır: eşit
       sayılsaydı boş karodan sonraki her dokunuş bir öncekinin fotoğrafını açardı.

       Telde mesajlar YENİDEN ESKİYE gelir, ekran onları çevirir (hook'un kararı) — dizi burada
       bilerek ters yazıldı ki ızgarada `[url, url, boş]` sırası doğsun. */
    mockDetay(
      detay({}, [
        foto({ mediaUrl: null }),
        foto({ mediaUrl: 'https://r2.test/ikinci.jpg' }),
        foto({ mediaUrl: 'https://r2.test/ucuncu.jpg' }),
      ]),
    );
    await ekranAc();

    // Izgarada üç karo var (`-photo-2` boş olan), görüntüleyicide İKİ fotoğraf: sayaç bunu söyler.
    expect(screen.getByTestId('management-social-photo-missing')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('management-social-photo-1'));

    await waitFor(() => expect(screen.getByTestId('management-social-photo-viewer')).toBeOnTheScreen());
    expect(screen.getByTestId('management-social-photo-viewer-counter')).toHaveTextContent('2 / 2');
  });

  it('yer tutucu `[görsel / dosya]` ARTIK yazılmaz', async () => {
    mockDetay(detay({}, [foto()]));
    await ekranAc();
    expect(screen.queryByText(messages.social.kind.media)).not.toBeOnTheScreen();
  });

  it('indirmesi düşmüş fotoğraf mesajı YOK SAYILMAZ — boş karo + sebep', async () => {
    /* `mediaKey` boş kalabilir ve bu meşru (varlık künyesi: indirme düşse de satır yazılır).
       Mesajı hiç çizmemek, defterin ilk kuralını ekranda bozmak olurdu. */
    mockDetay(detay({}, [foto({ mediaUrl: null })]));
    await ekranAc();
    expect(screen.getByTestId('management-social-photos')).toBeOnTheScreen();
    expect(screen.getByTestId('management-social-photo-missing')).toBeOnTheScreen();
  });
});

describe('ardışık fotoğraflar TEK ızgarada — yazışma alanı dolmaz', () => {
  it('aynı taraftan gelen üç alt yazısız fotoğraf tek öbekte toplanır', async () => {
    mockDetay(detay({}, [foto(), foto(), foto()]));
    await ekranAc();
    // Tek ızgara, üç karo: üç ayrı baloncuk olsaydı üç ayrı `-photos` düğümü olurdu.
    expect(screen.getAllByTestId('management-social-photos')).toHaveLength(1);
    expect(screen.getByTestId('management-social-photo-2')).toBeOnTheScreen();
  });

  it('ALT YAZILI fotoğraf öbeği kırar — söz kaybolmasın', async () => {
    mockDetay(detay({}, [foto(), foto({ body: { text: 'Kutu ezilmiş', payload: null } }), foto()]));
    await ekranAc();
    // Üç öbek: [foto] · [alt yazılı foto] · [foto] — ortadaki kendi baloncuğunda, sözüyle.
    expect(screen.getAllByTestId('management-social-photos')).toHaveLength(3);
    expect(screen.getByText('Kutu ezilmiş')).toBeOnTheScreen();
  });

  it('ARADAKİ metin mesajı öbeği kırar — sıra korunur', async () => {
    mockDetay(detay({}, [foto(), mesaj({ body: { text: 'Bir de şu', payload: null } }), foto()]));
    await ekranAc();
    expect(screen.getAllByTestId('management-social-photos')).toHaveLength(2);
  });

  it('KARŞI taraftan gelen fotoğraf öbeğe katılmaz — tonları ayrı', async () => {
    mockDetay(detay({}, [foto(), foto({ direction: 'outbound', author: 'admin' })]));
    await ekranAc();
    expect(screen.getAllByTestId('management-social-photos')).toHaveLength(2);
  });
});

describe('sesli mesaj — çalınamasa bile OKUNUR', () => {
  const ses = (over: Record<string, unknown> = {}) =>
    mesaj({
      kind: 'media',
      body: { text: null, payload: null },
      mediaMime: 'audio/ogg',
      mediaUrl: 'https://r2.test/imzali-1.ogg',
      ...over,
    });

  it('ses kartı çizilir — fotoğraf ızgarası DEĞİL', async () => {
    mockDetay(detay({}, [ses()]));
    await ekranAc();
    expect(screen.getByTestId('management-social-voice')).toBeOnTheScreen();
    expect(screen.queryByTestId('management-social-photos')).not.toBeOnTheScreen();
  });

  it('ÇALAR UYGULAMANIN İÇİNDE — dışarı açan bir bağlantı yok', async () => {
    /* Kullanıcı kararı 07.09: *"Uygulama dışına çıkışlar olmamalı."* Bir tur boyunca dokunuş
       `Linking.openURL` ile sistem tarayıcısını açıyordu; bu iddia o dönüşü engeller. */
    mockDetay(detay({}, [ses()]));
    await ekranAc();
    expect(screen.getByTestId('management-social-voice-play-toggle')).toBeOnTheScreen();
    expect(screen.getByTestId('management-social-voice-play-track')).toBeOnTheScreen();
    expect(disariAc).not.toHaveBeenCalled();
  });

  it('süre bilinmiyorsa SIFIR yazılmaz — ölçülemeyen değer sıfır değildir', async () => {
    mockDetay(detay({}, [ses()]));
    await ekranAc();
    // Sahte sürücü 5 saniyelik bir kayıt veriyor; ekran "0:00 / 0:05" yazar, "0:00 / 0:00" değil.
    expect(screen.getByTestId('management-social-voice-play-time')).toHaveTextContent('0:00 / 0:05');
  });

  it('transkript çizilir ve MAKİNE ÇÖZÜMÜ olduğu yazar', async () => {
    /* Ayrım 15.26'nın kuralı: makine çözümünü müşterinin kesin sözü sanmak, yanlış cevabın en
       sessiz yoludur. Etiket düşerse bu test kırılır. */
    mockDetay(detay({}, [ses({ mediaTranscript: 'Siparişim bugün gelecek mi' })]));
    await ekranAc();
    expect(screen.getByTestId('management-social-transcript')).toBeOnTheScreen();
    expect(screen.getByText('Siparişim bugün gelecek mi')).toBeOnTheScreen();
    expect(screen.getByText(t.media.transcript)).toBeOnTheScreen();
  });

  it('ses dosyası alınamamışsa kart yine durur, dinleme kapalı', async () => {
    mockDetay(detay({}, [ses({ mediaUrl: null, mediaTranscript: 'Merhaba' })]));
    await ekranAc();
    expect(screen.getByText(t.media.voiceMissing)).toBeOnTheScreen();
    // Transkript hâlâ okunabilir: ses düşse de söylenen kaybolmadı.
    expect(screen.getByText('Merhaba')).toBeOnTheScreen();
  });
});

describe('gönderim reddi TEK cümledir — ham anahtar ekrana çıkmaz', () => {
  it('ret sebebi sözlükten cümleye çevrilir', async () => {
    /* 21.286'da sebep İKİ kez çiziliyordu ve alttaki ham anahtarı ("window_closed") operatöre
       gösteriyordu. Sözlük tek çeviri yeridir. */
    mockDetay(detay());
    await ekranAc();

    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(envelope({ status: 'refused', reason: 'window_closed', retryable: false, detail: null })),
    );
    fireEvent.changeText(screen.getByTestId('management-social-reply'), 'Merhaba');
    // Düğme boş metinde kapalı — açıldığını beklemeden basmak sessizce yutulur (emsal: yukarıdaki
    // "cevap `reply` ucuna gider" testi; ölçülmüş tuzak).
    await waitFor(() => expect(screen.getByTestId('management-social-record')).toBeEnabled());
    fireEvent.press(screen.getByTestId('management-social-record'));

    await waitFor(() => expect(screen.getByTestId('management-social-action-error')).toBeOnTheScreen());
    expect(screen.getByText(t.failure.window_closed)).toBeOnTheScreen();
    expect(screen.queryByText(/window_closed/)).not.toBeOnTheScreen();
    // Metin kutuda DURUR — gitmeyen bir cevabı silmek onu yeniden yazdırmaktır.
    expect(screen.getByTestId('management-social-reply').props.value).toBe('Merhaba');
  });
});

/*
  CANLI YAZIŞMA (21.291 · kullanıcı cihaz turu 08.09) — ekran açıkken gelen mesaj düşmüyordu ve
  sebebi bir hata değil, YAZILMAMIŞ bir davranıştı: bu kancada tek bir abonelik satırı yoktu.
  Operatör "çıkıp geri girerek" görüyordu.
*/
describe('sohbet CANLI dinler — açık ekrana mesaj kendiliğinden düşer', () => {
  it('zilin adı SUNUCUDAN gelir ve BU sohbetin kanalına abone olunur', async () => {
    /* Kuyruğun kanalı değil, sohbetin KENDİ kanalı: kuyruk zili dinlenseydi listedeki her hareket
       okunan yazışmayı yeniden çizdirirdi. */
    mockDetay(detay());
    await ekranAc();

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());
    expect(mockOnBroadcast).toHaveBeenCalledWith(
      `conversation:${CONV_ID}`,
      'broadcast',
      { event: 'changed' },
      expect.any(Function),
    );
  });

  it('zil çalınca yazışma SUNUCUDAN yeniden istenir — kanaldan veri gelmez', async () => {
    mockDetay(detay({}, [mesaj({ body: { text: 'İlk', payload: null } })]));
    await ekranAc();
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

    // Sunucu artık İKİ mesaj döndürüyor; zil yalnız "bir şey oldu" diyor, mesajı taşımıyor.
    mockDetay(detay({}, [mesaj({ body: { text: 'İkinci', payload: null } }), mesaj({ body: { text: 'İlk', payload: null } })]));
    const cal = mockOnBroadcast.mock.calls.at(-1)?.[3] as () => void;
    cal();

    await waitFor(() => expect(screen.getByText('İkinci')).toBeOnTheScreen());
  });

  it('ekran sökülünce abonelik KAPANIR — sızan soketin bedeli sessizdir', async () => {
    mockDetay(detay());
    const view = await render(<SocialConversationScreen conversationId={CONV_ID} />);
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

    view.unmount();
    await waitFor(() => expect(mockRemoveChannel).toHaveBeenCalled());
  });
});

/*
  ÇEVİRİ (21.297) — baloncuk OPERASYON dilinde konuşur, asıl metin bir dokunuş ötede.

  Kural `body.text` DAİMA KANALDAN GEÇEN metindir: Fransızca konuşulan bir sohbette giden mesajın
  gövdesi Fransızcadır, operatörün yazdığı Türkçe torbadadır ve uç onu `shownText`e çözer. Bu
  ayrım yerelde ÜRETİLEMEZ (defterdeki sohbetlerin hepsi Türkçe), o yüzden fikstürle kuruluyor.
*/
describe('çeviri — baloncuk Türkçesini çizer, orijinali dokununca açılır', () => {
  it('giden mesajda operatörün TÜRKÇESİ okunur, kanaldan geçen Fransızca değil', async () => {
    mockDetay(
      detay({}, [
        mesaj({
          direction: 'outbound',
          author: 'admin',
          body: { text: 'Bonjour ! Nous serons chez vous jeudi.', payload: null },
          shownText: 'Merhaba! Perşembe kapınızdayız.',
          shownTranslated: true,
          language: 'fr',
        }),
      ]),
    );

    await ekranAc();

    expect(screen.getByText('Merhaba! Perşembe kapınızdayız.')).toBeOnTheScreen();
    expect(screen.queryByText('Bonjour ! Nous serons chez vous jeudi.')).toBeNull();
  });

  it('"orijinali gör" kanaldan geçen metni açar ve geri alır', async () => {
    const id = '00000000-0000-4000-8000-000000009001';
    mockDetay(
      detay({}, [
        mesaj({
          id,
          body: { text: 'Bonjour, je voudrais commander.', payload: null },
          shownText: 'Merhaba, sipariş vermek istiyorum.',
          shownTranslated: true,
          language: 'fr',
        }),
      ]),
    );

    await ekranAc();

    await fireEvent.press(screen.getByTestId(`management-social-original-${id}`));
    expect(screen.getByText('Bonjour, je voudrais commander.')).toBeOnTheScreen();

    // Geçiş BALONCUĞUN kendi durumu ve geri alınabilir — tek yönlü bir kapı değil.
    await fireEvent.press(screen.getByTestId(`management-social-original-${id}`));
    expect(screen.getByText('Merhaba, sipariş vermek istiyorum.')).toBeOnTheScreen();
  });

  it('ÇEVRİLMEMİŞ mesajda düğme HİÇ çizilmez — aynı metni iki kez açan bağlantı olmaz', async () => {
    const id = '00000000-0000-4000-8000-000000009002';
    mockDetay(mockDetayTekTurkce(id));

    await ekranAc();

    expect(screen.getByText('Merhaba, sipariş vermek istiyorum.')).toBeOnTheScreen();
    expect(screen.queryByTestId(`management-social-original-${id}`)).toBeNull();
  });
});

/** Türkçe yazılmış, çevrilmemiş tek mesaj — `shownTranslated: false` olan gerçek hâl. */
function mockDetayTekTurkce(id: string) {
  return detay({}, [
    mesaj({
      id,
      body: { text: 'Merhaba, sipariş vermek istiyorum.', payload: null },
      shownText: 'Merhaba, sipariş vermek istiyorum.',
      shownTranslated: false,
      language: 'tr',
    }),
  ]);
}
