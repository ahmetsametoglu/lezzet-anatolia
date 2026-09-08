import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { operationsCopy } from '@/screens/operations/copy';
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

/* CANLI ZİL SAHTESİ (21.289): hook artık `getSupabase().channel(...)` çağırıyor. Sahte zincir
   gerçek imzanın en küçüğü — `on` kendini döndürür, `subscribe` bir tutamaç verir. Zilin ÇALDIĞINI
   taklit etmiyoruz: aboneliğin kurulduğunu ve sökülürken kapatıldığını ölçüyoruz, çünkü sızan bir
   soketin bedeli sessizdir. */
const mockRemoveChannel = jest.fn();
const mockSubscribe = jest.fn(() => ({ topic: 'test' }));
const mockOnBroadcast = jest.fn();
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'test-token' } } }),
      refreshSession: async () => ({ data: { session: { access_token: 'test-token' } }, error: null }),
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
    /* `channel` sözleşmenin ZORUNLU alanı (21.289): canlı zilin adı sunucudan gelir. Sahte cevaba
       eklenmemiş olsaydı `parse` düşer ve ekran "beklenmedik" hatasına giderdi — testin ölçtüğü
       şey de bu, sözleşmenin gerçekten zorunlu tuttuğu. */
    return Promise.resolve(envelope({ rows, nextCursor: null, counts, channel: 'ops:conversations:test' }));
  });
}

async function ekranAc() {
  await render(<SocialInboxScreen />);
  await waitFor(() => expect(screen.getByTestId('management-social')).toBeOnTheScreen());
}

beforeAll(() => {
  // `env.apiUrl` tanımsızsa `apiFetch` fetch'e varmadan fırlar ve ekran hata durumuna düşer.
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockRemoveChannel.mockClear();
  mockSubscribe.mockClear();
  mockOnBroadcast.mockClear();
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

  /* v3 (30.08): satır kart oldu. Rozet SÖZLEŞMEYE bağlı — `aiDraftReply` dolu satırda çizilir,
     boş satırda çizilmez; operatör hangi sohbette onayının beklendiğini listeden görür. */
  it('v3 · bekleyen YZ taslağı olan satır rozet taşır, olmayan taşımaz', async () => {
    mockInbox([
      satir(ID.wa, { aiDraftReply: 'Yarın 09:00 için ayırdık.' }),
      satir(ID.fb, { source: 'messenger', externalRef: 'PSID-2', aiDraftReply: null }),
    ]);
    await ekranAc();

    expect(screen.getByTestId(`management-social-draft-${ID.wa}`)).toBeOnTheScreen();
    expect(screen.getByText(t.draftBadge)).toBeOnTheScreen();
    expect(screen.queryByTestId(`management-social-draft-${ID.fb}`)).toBeNull();
  });

  it('v3 · "top bizde" görünür rozetten çerçeveye geçti ama SESLİ okumadan düşmedi', async () => {
    // Çerçevenin rengi ekran okuyucuya ulaşmaz; bilgi satırın adına eklenmezse tamamen kaybolurdu.
    mockInbox([satir(ID.wa, { customerName: 'Mehmet Aydın', awaitingReply: true })]);
    await ekranAc();

    expect(screen.getByLabelText(`Mehmet Aydın — ${messages.common.ourTurn}`)).toBeOnTheScreen();
  });
});

describe('iki süzgeç ekseni BAĞIMSIZ — çekmecenin içinde', () => {
  /* SÜZGEÇ ŞERİTTEN ÇEKMECEYE TAŞINDI (kullanıcı kararı 07.09). Eskiden sekiz çip iki satırda
     listenin üstünde duruyordu; şimdi yukarıda seçili süzgeçlerin METNİ, düzenleme çekmecede.
     Çiplerin kendisi değişmedi — yalnız yerleri. */
  const cekmeceyiAc = () => fireEvent.press(screen.getByTestId('management-social-filter-open'));

  it('çipler ŞERİTTE DEĞİL — kapalıyken görünmezler', async () => {
    mockInbox([satir(ID.wa)]);
    await ekranAc();
    expect(screen.queryByTestId('management-social-filter-awaiting')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('management-social-channel-messenger')).not.toBeOnTheScreen();
  });

  it('seçili süzgeçler yukarıda METİN olarak yazar', async () => {
    // Operatör listenin neye göre süzüldüğünü çekmeceyi açmadan okuyabilmeli.
    mockInbox([satir(ID.wa)]);
    await ekranAc();
    expect(screen.getByTestId('management-social-filter-summary')).toHaveTextContent(
      `${t.filter.all} · ${t.channelAll} · ${t.handlerAll}`,
    );
  });

  it('çekmece açılınca iki eksenin çipleri de gelir', async () => {
    mockInbox([satir(ID.wa)]);
    await ekranAc();
    cekmeceyiAc();

    await waitFor(() => expect(screen.getByTestId('management-social-filter-all')).toBeOnTheScreen());
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
    cekmeceyiAc();
    await waitFor(() => expect(screen.getByTestId('management-social-filter-awaiting')).toBeOnTheScreen());
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
    cekmeceyiAc();
    await waitFor(() => expect(screen.getByTestId('management-social-filter-awaiting')).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId('management-social-filter-awaiting'));
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)![0])).toContain('filter=awaiting'));

    /* Çekmece seçimden sonra KAPANMAZ: iki eksen var ve her seçimde yeniden açtırmak, operatörü
       aynı yolu iki kez yürütürdü. İkinci çipe doğrudan basılabiliyor olması bunun kanıtı. */
    fireEvent.press(screen.getByTestId('management-social-channel-messenger'));
    await waitFor(() => {
      const son = String(fetchMock.mock.calls.at(-1)![0]);
      expect(son).toContain('source=messenger');
      // İki eksen bağımsız: kanal seçmek "cevap bekleyen" süzgecini düşürmemeli.
      expect(son).toContain('filter=awaiting');
    });

    // Ve özet satırı seçimden TÜREDİĞİ için kendiliğinden güncellenmiş olmalı.
    expect(screen.getByTestId('management-social-filter-summary')).toHaveTextContent(
      `${t.filter.awaiting} · ${t.channel.messenger} · ${t.handlerAll}`,
    );
  });

  it('"sıfırla" YALNIZ süzgeç varken çizilir', async () => {
    mockInbox([satir(ID.wa)]);
    await ekranAc();
    cekmeceyiAc();
    await waitFor(() => expect(screen.getByTestId('management-social-filter-awaiting')).toBeOnTheScreen());
    // Hiçbir süzgeç yokken basıldığında hiçbir şey olmayacak bir düğme çizilmez.
    expect(screen.queryByTestId('management-social-filter-reset')).not.toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('management-social-channel-messenger'));
    await waitFor(() => expect(screen.getByTestId('management-social-filter-reset')).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId('management-social-filter-reset'));
    await waitFor(() => {
      const son = String(fetchMock.mock.calls.at(-1)![0]);
      expect(son).not.toContain('source=');
      expect(son).not.toContain('filter=awaiting');
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

/*
  ARIZANIN SEBEBİ — 06.09'da cihazda ölçülen yanlış teşhisin testi.

  Ekran her sebebe tek cümle yazıyordu: "Bağlantıyı kontrol edip yeniden deneyin." Oturumu ölmüş
  bir cihazda çağrı ağa HİÇ çıkmıyor (yerel kısa devre, `401`) ve operatör çalışan bir wifi'nin
  peşine düşüyordu; uç, şema ve veri yolu boyunca yanlış olan tek şey EKRANIN CÜMLESİYDİ.

  İddia CÜMLENİN KENDİSİ değil, SINIFI: metinler ortak sözlükten geliyor (`operationsCopy.failure`),
  yani metin değişince test kırılmaz — kırılması gereken tek şey, 401'in "bağlantı" diye okunmasıdır.
*/
describe('arıza SEBEBİNE göre konuşur — ağ · oturum · yetki', () => {
  const description = () => screen.getByTestId('management-social-error-description');

  /** Cümle ARANIR, tamamı eşleşmez: geliştirmede sonuna ret anahtarı ekleniyor (`[unauthorized]`). */
  const iceren = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  function mockStatus(status: number, error: string) {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ status, headers: { get: () => null }, json: async () => ({ data: null, error }) } as unknown as Response),
    );
  }

  it('401 OTURUM der — "bağlantını kontrol et" demez', async () => {
    mockStatus(401, 'unauthorized');
    await ekranAc();

    expect(description()).toHaveTextContent(iceren(operationsCopy.failure.session));
    expect(description()).not.toHaveTextContent(iceren(operationsCopy.failure.connection));
  });

  it('403 YETKİ der — rol kapısı bir bağlantı arızası değildir', async () => {
    mockStatus(403, 'forbidden');
    await ekranAc();

    expect(description()).toHaveTextContent(iceren(operationsCopy.failure.forbidden));
  });

  it('istek ağa hiç çıkamazsa BAĞLANTI der', async () => {
    // `fetch`in fırlattığı tek hâl budur (`apiFetch` künyesi): ağ yok / istek atılamadı.
    fetchMock.mockImplementation(() => Promise.reject(new Error('ağ yok')));
    await ekranAc();

    expect(description()).toHaveTextContent(iceren(operationsCopy.failure.connection));
  });

  it('sözleşmeye uymayan gövde BEKLENMEDİK sınıfına düşer — oturum suçlanmaz', async () => {
    // 200 döndü ama satır şemayı tutmuyor: bu bizim hatamız, operatörün oturumu değil.
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        status: 200,
        headers: { get: () => null },
        json: async () => ({ data: { rows: [{ id: 'kısa-kimlik' }], nextCursor: null, counts: {} }, error: null }),
      } as unknown as Response),
    );
    await ekranAc();

    expect(description()).toHaveTextContent(iceren(operationsCopy.failure.unexpected));
  });
});

/*
  CANLI GELEN KUTUSU (21.289) — kullanıcı bulgusu 07.09: ekran açıkken gelen yeni bir konuşma
  listeye HİÇ düşmüyordu. Ölçüldü: veritabanında beş konuşma varken ekranda dört satır ve altında
  "Liste bitti". Sunucu zili zaten çalıyordu, dinlemeyen mobildi.
*/
describe('kuyruk CANLI dinler — yeni mesaj kendiliğinden düşer', () => {
  it('zilin adı SUNUCUDAN gelir ve o kanala abone olunur', async () => {
    /* Ad istemcide hesaplanamaz: operasyon kuyruğunun kanal adı sunucu sırrından türetiliyor
       (`opsChannel`). Bu iddia, adın uydurulmadığını çivileyen tek şey. */
    mockInbox([satir(ID.wa)]);
    await ekranAc();

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());
    expect(mockOnBroadcast).toHaveBeenCalledWith('ops:conversations:test', 'broadcast', { event: 'changed' }, expect.any(Function));
  });

  it('zil çalınca kuyruk SUNUCUDAN yeniden istenir', async () => {
    mockInbox([satir(ID.wa)]);
    await ekranAc();
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

    // Kanalın kendisinden veri GELMEZ — zil yalnız "bir şey oldu" der, liste yeniden okunur.
    const zilCagrisi = mockOnBroadcast.mock.calls.at(-1);
    const cal = zilCagrisi?.[3] as () => void;
    fetchMock.mockClear();
    cal();

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(0));
    expect(String(fetchMock.mock.calls.at(-1)![0])).toContain('/api/v1/social/conversations');
  });

  it('ekran sökülünce abonelik KAPANIR — sızan soketin bedeli sessizdir', async () => {
    mockInbox([satir(ID.wa)]);
    const view = await render(<SocialInboxScreen />);
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

    view.unmount();
    await waitFor(() => expect(mockRemoveChannel).toHaveBeenCalled());
  });
});

describe('YÜRÜTÜCÜ süzgeci — kim yönetiyor', () => {
  it('çipler ENUM\'dan doğar: insan · hibrit · yapay zekâ + "farketmez"', async () => {
    mockInbox([satir(ID.wa)]);
    await ekranAc();
    fireEvent.press(screen.getByTestId('management-social-filter-open'));

    await waitFor(() => expect(screen.getByTestId('management-social-handler-all')).toBeOnTheScreen());
    expect(screen.getByTestId('management-social-handler-human')).toBeOnTheScreen();
    expect(screen.getByTestId('management-social-handler-hybrid')).toBeOnTheScreen();
    expect(screen.getByTestId('management-social-handler-ai')).toBeOnTheScreen();
  });

  it('seçim SUNUCUYA gider ve öteki eksenleri sıfırlamaz', async () => {
    mockInbox([satir(ID.wa)]);
    await ekranAc();
    fireEvent.press(screen.getByTestId('management-social-filter-open'));
    await waitFor(() => expect(screen.getByTestId('management-social-handler-ai')).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId('management-social-channel-whatsapp'));
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)![0])).toContain('source=whatsapp'));

    fireEvent.press(screen.getByTestId('management-social-handler-ai'));
    await waitFor(() => {
      const son = String(fetchMock.mock.calls.at(-1)![0]);
      expect(son).toContain('handledBy=ai');
      expect(son).toContain('source=whatsapp');
    });
  });
});

describe('YÜRÜTÜCÜ ROZETİ — yalnız beklenmeyeni söyler', () => {
  it('`human` satırda rozet YOK — varsayılan hâl gürültü olurdu', async () => {
    mockInbox([satir(ID.wa, { handledBy: 'human' })]);
    await ekranAc();
    expect(screen.queryByTestId(`management-social-handler-badge-${ID.wa}`)).toBeNull();
  });

  it('`ai` ve `hybrid` satırlar rozet taşır', async () => {
    mockInbox([
      satir(ID.wa, { handledBy: 'ai' }),
      satir(ID.fb, { source: 'messenger', externalRef: 'PSID-3', handledBy: 'hybrid' }),
    ]);
    await ekranAc();

    expect(screen.getByTestId(`management-social-handler-badge-${ID.wa}`)).toHaveTextContent(
      t.handler.ai.toLocaleUpperCase('tr'),
    );
    expect(screen.getByTestId(`management-social-handler-badge-${ID.fb}`)).toHaveTextContent(
      t.handler.hybrid.toLocaleUpperCase('tr'),
    );
  });
});
