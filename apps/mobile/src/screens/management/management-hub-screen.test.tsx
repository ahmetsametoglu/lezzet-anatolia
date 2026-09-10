import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { operationsCopy } from '@/screens/operations/copy';
import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import type { ManagementHub } from '@lezzet/types';
import { DaySummaryScreen } from './day-summary-screen';
import { ManagementHubScreen } from './management-hub-screen';
import { managementCopy } from './copy';

/*
  YÖNETİM HUB + GÜN ÖZETİ EKRAN TESTİ (21.12 Dilim A) — depo hub emsali: hook taklit edilmez,
  ağ FETCH seviyesinde sahte ve cevap SÖZLEŞME şeklinde (alan düşerse Zod testte kırar).

  Çivilenen kararlar:
  · SIFIR SAYILI KARAR ALANI HİÇ ÇİZİLMEZ — dokununca boş ekran açan ölü satır olmasın.
  · Hata hâli GERÇEK: "Tekrar dene" yeniden okur ve toparlanır (fixture dönemindeki "basılınca
    hiçbir şey denemeyen düğme çizilmez" sözünün kapanışı).
  · Ölçülemeyen kanal cirosu "bilinmiyor" yazar, 0,00 € değil (CLAUDE §1).
  · İçgörü motoru yokken blok yokluğu SÖYLER, uydurma metin basmaz.
*/

// Ad `mock` ile başlamak ZORUNDA (jest hoisting) — gezinme iddiaları bu casusa bakar.
const mockNavigate = jest.fn();
jest.mock('expo-router', () => {
  const react = jest.requireActual<{ useEffect: (effect: () => void, deps: unknown[]) => void }>('react');
  return {
    useRouter: () => ({ navigate: mockNavigate, back: jest.fn() }),
    /* Odak kanalı CASUSLU: "hub odakta tazelenir" iddiası ancak İKİNCİ bir odak tetiklenerek
       ölçülebilir — kayıtlı geri çağrılar `refocus()` ile yeniden koşturuluyor. */
    useFocusEffect: jest.fn((callback: () => void) => react.useEffect(callback, [callback])),
  };
});

/** Ekranın kayıtlı bütün odak etkilerini yeniden koşturur — gerçek bir geri dönüşün yaptığı şey. */
async function refocus(): Promise<void> {
  const { useFocusEffect } = jest.requireMock<{ useFocusEffect: jest.Mock }>('expo-router');
  const callbacks = useFocusEffect.mock.calls.map(([callback]) => callback as () => void);
  await act(async () => {
    for (const callback of callbacks) callback();
  });
}

const mockSession = { access_token: 'test-token' };
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
    },
  }),
}));

const t = managementCopy;
const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

function fail(error: string, status = 500): Response {
  return { status, headers: { get: () => null }, json: async () => ({ data: null, error }) } as unknown as Response;
}

/**
 * Mock URL-YÖNLENDİRMELİDİR, sıra-bazlı değil (ölçüldü 26.08): başlıktaki zil de artık fetch'liyor
 * (`/me/notifications`, bildirim şeridi) ve sıra-bazlı `mockResolvedValueOnce` hangi çağrının önce
 * geldiğine göre YANLIŞ cevabı yutuyordu. Hub'a ait olmayan yol nötr bir hata alır — zil kancası
 * kendi hatasını kendi yutar, ekran çizilir; bu testin konusu zil değil.
 */
function routeHub(hub: () => Response) {
  fetchMock.mockImplementation((url) =>
    Promise.resolve(String(url).includes('/management/hub') ? hub() : fail('not_in_this_test', 500)),
  );
}

/** Sözleşme şeklinde hub zarfı — testler yalnız değiştirdikleri parçayı ezer. */
function hubData(overrides: {
  queue?: Partial<ManagementHub['queue']>;
  summary?: Partial<ManagementHub['summary']>;
} = {}): ManagementHub {
  return {
    queue: {
      complaints: {
        count: 3,
        /* Karar kutusunun TALEP kartı (07.09): `count` cevap bekleyeni, `open` kuyruğun tamamını
           sayar; kırılım listenin çip şeridiyle aynı kaynaktan gelir. */
        open: 6,
        byType: { damaged: 3, missing: 2, question: 1, other: 0 },
        head: {
          ticketId: '00000000-0000-4000-8000-000000000001',
          type: 'damaged',
          customerName: 'Claire Muller',
          orderReferenceNo: 'LA-26-TEST01',
          hasAttachment: true,
          awaitingReply: true,
          lastMessageAt: '2026-08-26T10:00:00Z',
          preview: 'İki tepsi su böreği kokuyordu, kuryeye geri verdik.',
        },
      },
      exceptions: {
        count: 1,
        head: {
          orderId: '00000000-0000-4000-8000-000000000002',
          referenceNo: 'LA-26-TEST02',
          shortLineCount: 2,
          lineTitle: 'Yoğurtlu Patlıcan · 1000 g',
          missingQty: 1,
        },
      },
      offers: {
        candidateCount: 4,
        head: { title: 'Su Böreği · tepsi', qty: 6, daysLeft: 2, discountPercent: 30 },
      },
      supply: { groupCount: 2, unmappedVariantCount: 1, head: { supplierName: 'Gaziantep Baklava', lineCount: 7 } },
      intents: { count: 2, draftCount: 0 },
      /* Varsayılan BOŞ: kurumsal kart yalnız bekleyen başvuru varken doğuyor ve öteki testlerin
         kart sayımını bozmasın. Kartın kendi testleri sayıyı açıkça veriyor. */
      b2b: { pendingCount: 0, head: null },
      ...overrides.queue,
    },
    summary: {
      date: '2026-08-26',
      orderCount: 12,
      preparingCount: 5,
      revenueCents: 141_260,
      openComplaintCount: 3,
      channels: [
        { source: 'web', cents: 108_640 },
        { source: 'door', cents: 32_620 },
        { source: 'whatsapp', cents: null },
      ],
      pendingPayment: { count: 4, cents: 17_850 },
      tomorrow: { orderCount: 14, readyCount: 9, doorPaymentCents: 21_200 },
      insights: [],
      ...overrides.summary,
    },
  };
}

async function renderScreen(node: React.ReactElement, loadingTestId: string) {
  await render(
    <OperationsSessionProvider
      value={{
        sections: ['management'],
        userName: 'Selim A.',
        userEmail: 'selim@lezzetanatolia.fr',
        warehouses: [],
        resolvedWarehouseId: null,
      }}
    >
      {node}
    </OperationsSessionProvider>,
  );
  await waitFor(() => expect(screen.queryByTestId(loadingTestId)).toBeNull());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockNavigate.mockReset();
});

describe('yönetim hub — karar kutusu', () => {
  it('dört karar kartı da çizilir; başlık kaç karar beklediğini söyler (v3)', async () => {
    routeHub(() => ok(hubData()));

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');

    // v3'ün üç ağırlığı: koyu (şikâyet) · çerçeveli (eksik kalem) · sessiz iki satır kartı.
    for (const key of ['complaint', 'exception', 'offer', 'supply']) {
      expect(screen.getByTestId(`management-decision-${key}`)).toBeOnTheScreen();
    }
    // Bağlam satırı çizilen KART SAYISINI söyler — "2 tanesi gün içinde" yarısı sözleşmede yok.
    expect(screen.getByText(t.hub.context.replace('{n}', '4'))).toBeOnTheScreen();
  });

  /*
    KARTLAR SAYAÇ DEĞİL İŞ SÖYLER (21.163) — dördü de kendi künyesini yazıyor. Eskiden kartlar
    "1 kalem eksik toplandı" / "4 aday parti" / "2 grup" diyordu; yönetici kararı ürünü, partiyi
    ve tedarikçiyi bilmeden veremez (tasarım v3:2091-2126 üçünü de yazıyor).
  */
  it('dört kart da künyesini yazar: şikâyetin cümlesi · ürün · parti · tedarikçi', async () => {
    routeHub(() => ok(hubData()));

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');

    expect(
      screen.getByText('Claire Muller: İki tepsi su böreği kokuyordu, kuryeye geri verdik.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Yoğurtlu Patlıcan · 1000 g — depoda 1 adet eksik · +1 kalem daha')).toBeOnTheScreen();
    expect(screen.getByText('Su Böreği · tepsi · 6 adet · %30 öneri')).toBeOnTheScreen();
    expect(screen.getByText('2 gün kaldı · +3 aday daha')).toBeOnTheScreen();
    expect(screen.getByText('Gaziantep Baklava · 7 kalem')).toBeOnTheScreen();
  });

  /*
    KÜNYE SATIRI: TÜR + GÖRELİ ZAMAN (v3:2089 "şikâyet · 40 dk önce"). Damga MUTLAKTI ("30.08 ·
    06:45") ve okuyana çıkarma yaptırıyordu; kartın sorduğu şey "ne kadar bekledi".

    Fikstürün damgası ŞİMDİYE GÖRE kuruluyor: sabit bir ISO yazsaydık test yarın "4 g önce" deyip
    kırılırdı — ölçtüğümüz şey tarih değil, aradaki süre.
  */
  it('şikâyet künyesi türü ve GÖRELİ zamanı yazar; alt satır kuyruğun ağırlığını', async () => {
    const fortyMinutesAgo = new Date(Date.now() - 40 * 60 * 1000).toISOString();
    routeHub(() =>
      ok(
        hubData({
          queue: {
            ...hubData().queue,
            complaints: {
              count: 5,
              open: 8,
              byType: { damaged: 4, missing: 2, question: 2, other: 0 },
              head: {
                ticketId: '00000000-0000-4000-8000-000000000001',
                type: 'question',
                customerName: 'Sabine Krüger',
                orderReferenceNo: null,
                hasAttachment: false,
                awaitingReply: true,
                lastMessageAt: fortyMinutesAgo,
                preview: 'Teslimatımı Perşembe’ye erteleyebilir miyim?',
              },
            },
          },
        }),
      ),
    );

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');

    expect(screen.getByText('soru · 40 dk önce')).toBeOnTheScreen();
    expect(screen.getByText('5 açık talep')).toBeOnTheScreen();
  });

  /*
    KÜNYE OKUNAMAZSA SAYAÇ CÜMLESİ KALIR — uydurma ürün adı yazılmaz. Sözleşme künyeyi
    `nullable` bıraktı (kalemsiz istisna, adsız tedarikçi, fiyatsız parti mümkün) ve ekranın o
    hâlde susmaması gerekiyor: kapı yine açık, cümle yalnız daha az şey söylüyor.
  */
  it('künye yoksa kart eski sayaç cümlesine düşer', async () => {
    routeHub(() =>
      ok(
        hubData({
          queue: {
            complaints: { count: 3, open: 3, byType: { damaged: 3, missing: 0, question: 0, other: 0 }, head: null },
            exceptions: { count: 2, head: null },
            offers: { candidateCount: 4, head: null },
            supply: { groupCount: 2, unmappedVariantCount: 0, head: null },
            intents: { count: 2, draftCount: 0 },
          },
        }),
      ),
    );

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');

    expect(screen.getByText('3 açık şikâyet')).toBeOnTheScreen();
    expect(screen.getByText('4 aday parti')).toBeOnTheScreen();
    expect(screen.getByText('2 grup')).toBeOnTheScreen();
  });

  /*
    NEGATİF GÜN "SÜRESİ GEÇTİ" DEĞİL: kuyruğa yalnız satılabilir aday giriyor (`can_offer`), yani
    tarihi geçmiş olan tek küme DDM'si geçmiş partilerdir. "Süresi geçti" demek, satılabilir malı
    imhalık malla aynı cümleye koymak olurdu.
  */
  it('tavsiye tarihi geçmiş aday, imhalık gibi yazılmaz', async () => {
    routeHub(() =>
      ok(
        hubData({
          queue: {
            complaints: { count: 0, open: 0, byType: { damaged: 0, missing: 0, question: 0, other: 0 }, head: null },
            exceptions: { count: 0, head: null },
            offers: {
              candidateCount: 1,
              head: { title: 'Fıstıklı Kek · 90 g', qty: 8, daysLeft: -2, discountPercent: 30 },
            },
            supply: { groupCount: 0, unmappedVariantCount: 0, head: null },
            intents: { count: 0, draftCount: 0 },
          },
        }),
      ),
    );

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');

    expect(screen.getByText('tavsiye tarihi geçti · onay bekliyor')).toBeOnTheScreen();
  });

  it('SIFIR sayılı alan HİÇ çizilmez — ölü kart yok', async () => {
    routeHub(() =>
      ok(
        hubData({
          queue: {
            exceptions: { count: 0, head: null },
            offers: { candidateCount: 0, head: null },
            supply: { groupCount: 0, unmappedVariantCount: 0, head: null },
            intents: { count: 0, draftCount: 0 },
          },
        }),
      ),
    );

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');

    expect(screen.getByTestId('management-decision-complaint')).toBeOnTheScreen();
    for (const key of ['exception', 'offer', 'supply']) {
      expect(screen.queryByTestId(`management-decision-${key}`)).toBeNull();
    }
  });

  /*
    KURUMSAL BAŞVURU KARTI (21.293) — ekranı vardı, KAPISI yoktu.

    Liste ve kontrol kartı 21.217'de yazıldı ama uygulamada ikisine de yalnız bildirimden
    giriliyordu; bildirimi kaçıran için başvuru görünmez bir işti. Kartın iki hâli tasarımın
    ayrımı (v3:2625) ve ikisi de burada çivileniyor — tekte kestirme, çokluda liste.
  */
  it('TEK bekleyen başvuruda kart adı ve bayrağı yazar; dokunuş listeyi ATLAR', async () => {
    routeHub(() =>
      ok(
        hubData({
          queue: {
            b2b: {
              pendingCount: 1,
              head: {
                customerId: '00000000-0000-4000-8000-0000000000b2',
                name: 'Restaurant Oberjaegerhof',
                flag: { label: 'Mükerrer', tone: 'bad', reason: 'Aynı KDV numarasıyla ikinci kayıt' },
              },
            },
          },
        }),
      ),
    );

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');

    expect(screen.getByText(t.hub.rows.b2b.name)).toBeOnTheScreen();
    expect(screen.getByText('Restaurant Oberjaegerhof')).toBeOnTheScreen();
    // Bayrağın KELİMESİ yazılı — renk tek başına konuşmuyor (CLAUDE §3 · b2b-format künyesi).
    expect(screen.getByText('Mükerrer')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('management-decision-b2b'));
    // Tek başvuruda listeye uğramak bir dokunuş fazlası olurdu (kullanıcı kararı 07.09).
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/b2b-application',
      params: { id: '00000000-0000-4000-8000-0000000000b2' },
    });
  });

  it('ÇOK bekleyende kart sayıyı yazar ve LİSTEYE gider — künye uydurulmaz', async () => {
    routeHub(() => ok(hubData({ queue: { b2b: { pendingCount: 3, head: null } } })));

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');

    expect(screen.getByText(t.hub.rows.b2b.nameMany)).toBeOnTheScreen();
    expect(screen.getByText(t.hub.rows.b2b.titleMany.replace('{n}', '3'))).toBeOnTheScreen();
    expect(screen.getByText(t.hub.rows.b2b.subtitleMany)).toBeOnTheScreen();
    // Üç başvurudan birinin adını kartın yüzü yapmak, ötekileri gizleyen bir seçim olurdu.
    expect(screen.queryByText('Restaurant Oberjaegerhof')).toBeNull();

    await fireEvent.press(screen.getByTestId('management-decision-b2b'));
    expect(mockNavigate).toHaveBeenCalledWith('/b2b-applications');
  });

  it('bekleyen başvuru yoksa kurumsal kart HİÇ çizilmez', async () => {
    routeHub(() => ok(hubData()));

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');

    expect(screen.queryByTestId('management-decision-b2b')).toBeNull();
  });

  it('günün nabzı iki sayıyı da uçtan okur — sosyal kutu ve gün özeti kapıları', async () => {
    routeHub(() => ok(hubData()));

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');

    // Sosyal kutucuğun büyük sayısı cevap bekleyen konuşma sayısıdır (kuyruğun `intents`i).
    expect(screen.getByTestId('management-pulse-social-value')).toHaveTextContent('2');
    // Gün özeti kutucuğu ciroyu yazar; alt satırı sipariş sayısını.
    expect(screen.getByTestId('management-pulse-summary-value')).toHaveTextContent('1.412,60 €');
    expect(screen.getByText(t.hub.tiles.summary.subtitle.replace('{orders}', '12'))).toBeOnTheScreen();
  });

  /*
    SOSYAL KUTUCUK İKİ OLGU TAŞIR (21.301, v3:2132) — büyük sayı "kaç konuşma cevap bekliyor",
    alt satır "kaçının cevabı ZATEN YAZILMIŞ ama gönderilmemiş". İkincisi kuyruktaki en pahalı
    bekleyiş: hibrit modda asistan yazdı, müşteri henüz almadı.
  */
  it('taslak bekleyen varsa kutucuğun alt satırı SAYIYI yazar', async () => {
    routeHub(() => ok(hubData({ queue: { intents: { count: 5, draftCount: 2 } } })));

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');

    expect(screen.getByTestId('management-pulse-social-value')).toHaveTextContent('5');
    expect(screen.getByText(t.hub.tiles.social.drafts.replace('{n}', '2'))).toBeOnTheScreen();
    // Büyük sayının tanımı yerini taslağa bıraktı — iki satır aynı anda yazılmaz.
    expect(screen.queryByText(t.hub.tiles.social.subtitle)).toBeNull();
  });

  it('taslak YOKSA satır kutucuğun kendi tanımına döner — "0 taslak" yazılmaz', async () => {
    routeHub(() => ok(hubData({ queue: { intents: { count: 5, draftCount: 0 } } })));

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');

    expect(screen.getByText(t.hub.tiles.social.subtitle)).toBeOnTheScreen();
    expect(screen.queryByText(t.hub.tiles.social.drafts.replace('{n}', '0'))).toBeNull();
  });

  it('şikâyet kartı başı KİMLİĞİYLE açar; sosyal kutucuk gelen kutusuna gider (Y6 kararı)', async () => {
    routeHub(() => ok(hubData()));

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');

    await fireEvent.press(screen.getByTestId('management-decision-complaint'));
    // Kutunun gösterdiği kart ile açılan talep AYNI olmalı — adres kimlik taşır.
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/complaint',
      params: { id: '00000000-0000-4000-8000-000000000001' },
    });

    await fireEvent.press(screen.getByTestId('management-pulse-social'));
    // Ayrı niyet ekranı YOK (bilinçli sapma): gerçek sosyal gelen kutusu açılır.
    expect(mockNavigate).toHaveBeenCalledWith('/social');
  });

  it('okuma düşerse hata bloğu; "Tekrar dene" GERÇEKTEN yeniden okur ve toparlanır', async () => {
    let hubCalls = 0;
    routeHub(() => {
      hubCalls += 1;
      return hubCalls === 1 ? fail('boom') : ok(hubData());
    });

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');
    expect(screen.getByTestId('management-hub-error')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('management-hub-error-retry'));
    await waitFor(() => expect(screen.getByTestId('management-decision-complaint')).toBeOnTheScreen());
    expect(hubCalls).toBe(2);
  });

  /*
    ODAKTA TAZELENME (06.09) — kapının sayısı montaj anında DONMAMALI.

    Okuma `useEffect` ile yalnız montajda koşuyordu; kabuk yığınında hub ekranı sökülmediği için
    kutucuk saatlerce eski günü gösterebiliyordu. İki sonucu ölçüldü: (1) kapı ile içerisi ayrışıyor
    — operatör gelen kutusunu boşaltıp dönüyor, kutucuk hâlâ "1 bekliyor" diyor; (2) ölü bir oturum
    SAĞLIKLI görünüyor — hub dolu fotoğrafı çizmeye devam ettiği için arıza yalnız alt ekranda
    sanılıyor. Kurye günü ve depo hub'ı bu kararı çoktan vermişti.
  */
  it('hub odakta YENİDEN okur ve tazelerken iskelete düşmez', async () => {
    let hubCalls = 0;
    routeHub(() => {
      hubCalls += 1;
      return ok(hubData({ queue: { intents: { count: hubCalls === 1 ? 2 : 0, draftCount: 0 } } }));
    });

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');
    expect(screen.getByTestId('management-pulse-social-value')).toHaveTextContent('2');

    await refocus();

    expect(hubCalls).toBeGreaterThan(1);
    // Sessiz tazeleme: kartlar yerinde kalır, iskelet geri gelmez.
    expect(screen.queryByTestId('management-hub-loading')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('management-pulse-social-value')).toHaveTextContent('0'));
  });

  it('okuma düşerse SEBEP yazılır — 401 "bağlantı" diye gösterilmez', async () => {
    // Cihazda ölçülen yanlış teşhisin hub ayağı: oturum ölünce hub da bu kapıdan düşüyor.
    routeHub(() => fail('unauthorized', 401));

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');

    const description = screen.getByTestId('management-hub-error-description');
    expect(description).toHaveTextContent(new RegExp(operationsCopy.failure.session.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  it('kuyruk okunamasa da nabız KAPILARI durur; sayılar "—" yazar, 0 değil', async () => {
    // Okuma düştüğünde sosyal kutu ve gün özeti hâlâ açılabilmeli — ikisi de kendi ucunu okuyor.
    // Sayıyı 0 göstermek "bugün iş yok" demek olurdu (CLAUDE §1: ölçülemeyen değer sıfır değildir).
    routeHub(() => fail('boom'));

    await renderScreen(<ManagementHubScreen />, 'management-hub-loading');

    expect(screen.getByTestId('management-hub-error')).toBeOnTheScreen();
    expect(screen.getByTestId('management-pulse-social')).toBeOnTheScreen();
    expect(screen.getByTestId('management-pulse-social-value')).toHaveTextContent(t.hub.unknown);
    expect(screen.getByTestId('management-pulse-summary-value')).toHaveTextContent(t.hub.unknown);
  });
});

describe('gün özeti', () => {
  it('ölçülemeyen kanal "bilinmiyor" yazar; içgörü yokken yokluk söylenir', async () => {
    routeHub(() => ok(hubData()));

    await renderScreen(<DaySummaryScreen />, 'management-day-summary-loading');

    expect(screen.getByText(t.summary.channels.unknown)).toBeOnTheScreen();
    expect(screen.getByTestId('management-insights-empty')).toBeOnTheScreen();
    // Yarın cümlesi "rotaya atanmamış" İÇERMEZ — sefer sabah kurulur, o sayı bugünden ölçülemez.
    expect(screen.getByText('14 sipariş · 9 hazır · kapıda ödeme yükü 212,00 €')).toBeOnTheScreen();
  });
});
