import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { CourierDayResponse, CourierRoute, StartCourierDayResponse } from '@lezzet/types';

import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import { CourierDayScreen } from './courier-day-screen';
import {
  courierDay,
  courierDayRun,
  courierRoute,
  courierStop,
  dayCloseDraft,
  stopItemId,
  takenRouteRun,
} from './courier-fixture';
import messages from './messages.json';

/*
  K1 EKRAN TESTİ — beş veri hâli (yükleniyor · rota seçimi · dolu sefer · boş · hata), kapanmış
  seferin durak kilidi, CTA'nın dönüşümü, ilerleme satırı ve "Seferi başlat"ın DÖRT DALLI cevabı
  (mutlu yol · atlanan · bayat · rota zaten açılmış).

  HOOK TAKLİT EDİLMEZ: gerçek hook + taklit `fetch` ile koşuyor, yani ekranın gördüğü veri
  GERÇEKTEN sözleşmeden (`CourierDayResponseSchema`) geçiyor — alan adı ayrışırsa test kırılır
  (katalog ekranının aynı kararı).

  TAKLİT SUNUCU SEFERİ HATIRLAR (18.08): başarılı bir başlatmadan SONRAKİ gün okuması `run` taşır —
  gerçek uçta sefer kaydı doğduğu için başka türlü olamaz. Bu olmadan ekran, başlattığı seferi bir
  sonraki tazelemede yok sayardı ve test yalancı bir davranışı ölçerdi.

  RNTL v14 tuzağı: aynı testte ikinci bir `render` öncekini söker — her test tek render kullanır.
*/

const mockNavigate = jest.fn();
jest.mock('expo-router', () => {
  /* Gerçek `useFocusEffect` navigasyon bağlamı ister; ekranın sözleşmesi "odakta koş" olduğu için
     taklit onu MOUNT'ta koşan bir etkiye indirger — tek yükleme yolu aynen korunur. Fabrika
     hoisting yüzünden dışarıdaki `import`u kapatamaz, o yüzden React buradan alınıyor. */
  const react = jest.requireActual<{ useEffect: (effect: () => void, deps: unknown[]) => void }>('react');
  return {
    useRouter: () => ({ navigate: (href: unknown) => mockNavigate(href), back: jest.fn() }),
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

const t = messages;

function okResponse(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

/** Fixture'ın birinci durağı — kilit ve durak testleri hep bu kimliği konuşuyor. */
const STOP_1 = '00000000-0000-4000-8000-000000000001';
/** İkinci ve üçüncü durak — sonuç etiketlerini ayrı ayrı okuyan testin adresleri. */
const STOP_2 = '00000000-0000-4000-8000-000000000002';
const STOP_3 = '00000000-0000-4000-8000-000000000003';
/** Boş hâlin düğmesi — seçime GÖTÜRÜR, kurmaz (31.08 · v3:15). */
const START_CTA = 'Sefer ve araç seç';

function failResponse(): Response {
  return {
    status: 500,
    headers: { get: () => null },
    json: async () => ({ data: null, error: 'server_error' }),
  } as unknown as Response;
}

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

/** Açılan seferin dört listesi: varsayılanı hiçbir şey olmamış sefer — testler kendi dalını doldurur. */
function startResult(
  overrides: Partial<Extract<StartCourierDayResponse, { status: 'ok' }>> = {},
): StartCourierDayResponse {
  return {
    status: 'ok',
    date: '2026-08-08',
    // Başlatma cevabının künyesi GÜN seferiyle aynı şekli taşıyor (30.08): ekran bu değeri
    // doğrudan günün seferi olarak yazıyor, ayrışsalardı depo adı sefer başlar başlamaz boş kalırdı.
    run: courierDayRun(),
    started: [],
    alreadyOut: [],
    stale: [],
    skipped: [],
    // 23.8: kutulu sipariş okutulmayı bekliyor olabilir — varsayılan "kutusuz gün".
    awaitingBoxes: [],
    ...overrides,
  };
}

/**
 * Gün, kapanış taslağı, başlatma cevabı ve rota listesi ayrı ayrı kurulur — dördünün kaderi ekranda
 * da ayrı. `null` geçilen uç 500 döner.
 */
function mockDay(
  day: CourierDayResponse | null,
  draft: unknown = dayCloseDraft(),
  start: StartCourierDayResponse | null = startResult(),
  routes: CourierRoute[] | null = [courierRoute()],
) {
  let current = day;
  fetchMock.mockImplementation((url) => {
    const address = String(url);
    if (address.includes('/day/start')) {
      if (start === null) return Promise.resolve(failResponse());
      // Sunucunun kendisi gibi: sefer açıldıysa sonraki gün okuması artık o seferi taşır.
      // Sunucu gibi: açılan sefer hem SÜRÜLEN sefer hem ARAÇTAKİ seferlerden biri olur (31.08).
      if (start.status === 'ok' && current !== null) current = { ...current, run: start.run, runs: [start.run] };
      return Promise.resolve(okResponse(start));
    }
    if (address.includes('/day-close')) return Promise.resolve(draft === null ? failResponse() : okResponse(draft));
    if (address.includes('/courier/routes')) {
      return Promise.resolve(routes === null ? failResponse() : okResponse({ date: '2026-08-08', routes }));
    }
    /* ARAÇ LİSTESİ (31.08) — ekran araç seçimini de çiziyor. Varsayılan BOŞ ve bu bilinçli:
       araçsız sefer kurulabiliyor, yani araç listesi hiçbir testin ön koşulu değil. */
    if (address.includes('/courier/vehicles')) return Promise.resolve(okResponse({ vehicles: [] }));
    return Promise.resolve(current === null ? failResponse() : okResponse(current));
  });
}

async function renderDay() {
  await render(
    <OperationsSessionProvider
      /* Depo kapsamı BOŞ: kurye üstbaşlığı tesisin adını yazmaz (sefer künyesini yazar), yani bu
         ekranın ölçtüğü hiçbir şey kapsama bağlı değil. */
      value={{
        sections: ['courier'],
        userName: 'Musa Kaya',
        userEmail: 'musa@lezzetanatolia.fr',
        warehouses: [],
        resolvedWarehouseId: null,
      }}
    >
      <CourierDayScreen />
    </OperationsSessionProvider>,
  );
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockNavigate.mockReset();
});

describe('K1 · günün seferi', () => {
  /*
    İLK YÜK İSKELET, HALKA DEĞİL (ortak karar 30.08 · N9). İkisini ayıran ölçülebilir iz ROL:
    halka (`LoadingState`) kendini `progressbar` diye tanıtır, iskelet tanıtmaz — yer tutucu bir
    ilerleme bildirmez, gelecek bloğun ölçüsünü tutar. Testin halkanın GERİ DÖNMESİNİ yakalaması
    lazım; yalnız testID'ye bakmak yetmezdi, o kimlik iki bileşende de aynı kalırdı.
  */
  it('yüklenirken İSKELET gösterir (halka değil), liste çizilmez', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));

    await renderDay();

    expect(screen.getByTestId('courier-day-loading')).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByTestId('courier-day-list')).toBeNull();
  });

  /*
    ÜSTBAŞLIK ↔ BAĞLAM SATIRI AYRIMI (v3, 30.08): üstbaşlık "NEREDEYİM"i söyler (bölüm + gün),
    bağlam satırı "KİM ve HANGİ SEFER"i. v2'de ad üstbaşlığın kuyruğundaydı ve sefer künyesi ayrı
    bir şeride yazılıyordu; künye listenin başında olduğu için duraklara inince kayboluyordu.
    Şimdi ikisi tek satırda ve BAŞLIKTA — her ekranda aynı yerde.
  */
  it('üstbaşlık bölüm + gün, bağlam satırı ad + sefer künyesi', async () => {
    mockDay(courierDay([courierStop(1)]));

    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    expect(screen.getByText('KURYE · 8 AĞUSTOS')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: t.day.title })).toBeOnTheScreen();
    expect(screen.getByText('Musa Kaya · Kuzey rotası · SF-26-ABCDEF')).toBeOnTheScreen();
  });

  it('ARAÇ BOŞSA rehber çizilir ve düğme HER HÂLDE durur — rota olmasa bile', async () => {
    /* Rota listesi 31.08'de kendi ekranına taşındı (v3:17). Bu ekranın boş hâli artık bir SEÇİM
       değil bir REHBER: üç adım (seç → yükle → başlat) ve seçime götüren tek düğme.

       Düğme rota YOKKEN de çiziliyor ve bu bilinçli: sebebi ("deponda planlanmış sefer yok")
       seçim ekranı söylüyor. Gizlenen bir düğme, kuryeye o cümleyi hiç okutmazdı. */
    mockDay(courierDay([], { run: null, runs: [] }), dayCloseDraft(), startResult(), []);

    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-guide')).toBeOnTheScreen());
    expect(screen.getByText(t.day.vanEmpty.step1)).toBeOnTheScreen();
    expect(screen.getByTestId('courier-day-cta')).toHaveTextContent(t.day.vanEmpty.cta);
  });

  it('rota okunamazsa hata bloğu + tekrar dene; basılınca liste gelir', async () => {
    mockDay(null);

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-error')).toBeOnTheScreen());
    expect(screen.getByText(t.day.error.title)).toBeOnTheScreen();

    mockDay(courierDay([courierStop(1)]));
    await fireEvent.press(screen.getByTestId('courier-day-error-retry'));

    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
  });

  it('kapanış taslağı düşerse liste AYAKTA kalır ve cepteki para "bilinmiyor" olur (sıfır DEĞİL)', async () => {
    mockDay(courierDay([courierStop(1)]), null);

    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    expect(screen.getByText(t.day.pocketUnknown)).toBeOnTheScreen();
    expect(screen.queryByText('cepte 0,00 €')).toBeNull();
  });

  it('cepteki para kapanış taslağının beklenen tahsilatından toplanır', async () => {
    mockDay(
      courierDay([courierStop(1)]),
      dayCloseDraft({ expected: { cashCents: 4200, cardCents: 1000, chequeCents: 0 } }),
    );

    await renderDay();

    /* v3'te tutar "CEPTE" etiketiyle iki satır (özet kartının sağ ucu): para bir sayı değil bir
       DURUM ve etiketi olmadan cümlenin içinde kayboluyordu. */
    await waitFor(() => expect(screen.getByTestId('courier-day-summary')).toHaveTextContent(/CEPTE/));
    expect(screen.getByTestId('courier-day-summary')).toHaveTextContent(/52,00 €/);
  });

  it('KAPANMIŞ sefer ARAÇTA DEĞİLDİR: gövde yeniden REHBER, duraklar çizilmez', async () => {
    /*
      31.08: kapanmış sefer artık `/courier/day`den HİÇ dönmüyor — ne `run` olarak ne `runs`
      içinde. Kapanan seferin işi bitmiştir ve kutuları da inmiştir (v3:13'ün kuralı). Ekran o
      yüzden doğrudan seçim gövdesine düşer; "neyi bitirdim" sorusunun yeri gün özeti ekranı.
    */
    mockDay(
      courierDay([], { run: null, runs: [] }),
      dayCloseDraft(),
      startResult(),
      [
        // Az önce kapatılan rota: ikinci tur veride yasak (K3), kart pasif.
        courierRoute({ run: takenRouteRun({ closed: true }) }),
        courierRoute({ zoneId: '00000000-0000-4000-8000-000000000802', zoneName: 'Güney rotası' }),
      ],
    );

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-routes')).toBeOnTheScreen());

    expect(screen.queryByTestId(`courier-stop-${STOP_1}`)).toBeNull();
    // Düğme SEÇİME götürür; kurma da başlatma da başka ekranların eylemi (31.08).
    expect(screen.getByTestId('courier-day-cta')).toHaveTextContent(START_CTA);
  });

  /* ROTA SEÇİMİ ARTIK BU EKRANDA DEĞİL (31.08 · v3:17). "Tek aday kendiliğinden seçili",
     "başlatılmış rota pasif" ve çoklu seçim `route-pick-screen.test.tsx`te ölçülüyor; buraya
     kalan tek şey seçimden DÖNÜNCE listenin gelmesi ve o da aşağıdaki testlerde zaten var. */

  it('sefer kapatma CTA\'sı kapanış ekranına gider', async () => {
    mockDay(
      courierDay([courierStop(1, { outcome: 'delivered', payment: { dueAmountCents: null, expectedMethod: null, collectedAtDoorCents: null } })]),
    );

    await renderDay();
    await waitFor(() => expect(screen.getByText(t.day.close)).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('courier-day-cta'));

    expect(mockNavigate).toHaveBeenCalledWith('/day-close');
  });

  /*
    v3 ANATOMİSİ (30.08 · cihazda tasarımla yan yana konup ölçüldü).

    Kapanan uyuşmazlıklar: özet kartı KOYU (açık çizilmişti, sayfadaki her kutuyla aynı
    ağırlıktaydı) · tamamlanan sayı KAHRAMAN ("3" büyük, "/5 durak" küçük) · sefer ve satış
    satırları İKONLU KART (satış başlık+düğme olarak EN ÜSTTEydi, akışın parçası görünmüyordu) ·
    duraklar KENDİ KARTINDA.
  */
  it('sefer ve satış satırları tasarımın metniyle ve akışın İÇİNDE çizilir', async () => {
    mockDay(courierDay([courierStop(1)]));

    await renderDay();

    expect(screen.getByTestId('courier-day-sale')).toHaveTextContent(/Yoldan gelen müşteri/);
    // Alt metin satırın NE OLDUĞUNU söylüyor; eskiden yalnız düğme etiketi vardı.
    expect(screen.getByTestId('courier-day-sale')).toHaveTextContent(/yerinde satış · anonim/);
  });

  it('kapıda tahsilat rozeti ve "kaldı" satırı yalnız BEKLEYEN borçlu duraklardan sayılır', async () => {
    mockDay(
      courierDay([
        courierStop(1),
        courierStop(2, { payment: { dueAmountCents: 1000, expectedMethod: 'card', collectedAtDoorCents: null } }),
        courierStop(3, { outcome: 'delivered', payment: { dueAmountCents: null, expectedMethod: null, collectedAtDoorCents: null } }),
      ]),
    );

    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-door-left')).toBeOnTheScreen());
    expect(screen.getByText('2 kapıda tahsilat kaldı · 52,00 €')).toBeOnTheScreen();
    expect(screen.getByText('KAPIDA · 42,00 € NAKİT')).toBeOnTheScreen();
    expect(screen.getByText('KAPIDA · 10,00 € KART')).toBeOnTheScreen();
  });

  /*
    SONUÇ ETİKETE ÇIKTI (v3:14 · 30.08). Eskiden alt satır sonucu da söylüyordu ("Müşteri 1 ·
    teslim edildi") ve SAAT hiçbir yerde yazmıyordu. Artık etiket "ne oldu ve ne zaman"ı, alt satır
    "ne bıraktım, ne aldım"ı taşıyor — kuryenin listeye dönüp sorduğu iki ayrı soru.
  */
  it('sonuçlanmış durak ETİKETİNDE sonucu ve SAATİ yazar; iç durum adı sızmaz', async () => {
    mockDay(
      courierDay([
        courierStop(1, {
          outcome: 'delivered',
          settledAt: '2026-08-08T14:12:00.000Z',
          payment: { dueAmountCents: null, expectedMethod: null, collectedAtDoorCents: null },
        }),
        courierStop(2, { outcome: 'unreachable', attempts: 1, settledAt: '2026-08-08T15:05:00.000Z' }),
        courierStop(3, { outcome: 'refused', settledAt: '2026-08-08T15:40:00.000Z' }),
      ]),
    );

    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    /* Saat CİHAZIN yerel saatiyle yazılıyor (`timeOf`), yani test makinesinin kuşağına göre
       değişir — sınanan şey ETİKETİN ŞEKLİ: sonuç adı + ayraç + "SS:DD". Sabit bir saat beklemek
       testi kuşağa bağlar ve CI'da yalancı kırmızı üretirdi. */
    expect(screen.getByTestId('courier-stop-tag-' + STOP_1)).toHaveTextContent(/^TESLİM EDİLDİ · \d{2}:\d{2}$/);
    expect(screen.getByTestId('courier-stop-tag-' + STOP_2)).toHaveTextContent(/^ULAŞILAMADI · \d{2}:\d{2}$/);
    expect(screen.getByTestId('courier-stop-tag-' + STOP_3)).toHaveTextContent(/^KABUL ETMEDİ · \d{2}:\d{2}$/);
    // İlerleme sayacı yalnız TESLİM edilenleri sayar; ulaşılamayan/reddedilen "biten" değildir.
    expect(screen.getByTestId('courier-day-progress')).toBeOnTheScreen();
    /* SAYAÇ SONUÇLANMIŞ DURAĞI SAYAR, teslim edileni değil (v3:15 `surulenBiten`:
       `hal !== 'siradaki' && hal !== 'bekleyen'`). Üç durağın üçü de sonuçlanmış — biri teslim,
       ikisi takılı — ve kuryenin o duraklarda yapacak işi kalmadı. Niteliği ÇUBUK söylüyor:
       yeşil teslim, kırmızı takılı. */
    expect(screen.getByTestId('courier-day-summary')).toHaveTextContent(/3\/3 durak/);
    /* BAŞLIK KOŞULSUZ "SEFERE GÖRE" (v3:14 — düz metin), sağ uç TAKILI durak sayısını taşır
       (ulaşılamadı + kabul etmedi = 2). Sayı başlıktan çıktı: grup başlığı artık tek seferde de
       çizildiği için aynı sayı iki kez yazılıyordu. */
    expect(screen.getByText('DURAKLAR · SEFERE GÖRE')).toBeOnTheScreen();
    expect(screen.getByTestId('courier-day-stuck')).toHaveTextContent('2 takılı');
  });

  it('damgası olmayan sonuç etiketi SAATSİZ yazılır — uydurma saat yok', async () => {
    mockDay(courierDay([courierStop(1, { outcome: 'delivered', settledAt: null })]));

    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-stop-tag-' + STOP_1)).toHaveTextContent('TESLİM EDİLDİ'));
    expect(screen.getByTestId('courier-stop-tag-' + STOP_1)).not.toHaveTextContent(':');
  });

  it('teslim edilmiş durağın alt satırı ALINAN PARAYI, kanıdı ve kalan borcu söyler', async () => {
    mockDay(
      courierDay([
        courierStop(1, {
          outcome: 'delivered',
          hasProof: true,
          payment: { dueAmountCents: 4200, expectedMethod: 'cash', collectedAtDoorCents: 8500 },
        }),
      ]),
    );

    await renderDay();

    await waitFor(() =>
      expect(screen.getByText('2 kalem · nakit 85,00 € alındı · imza var · kalan borç 42,00 €')).toBeOnTheScreen(),
    );
  });

  /*
    KISMİ TESLİM (30.08) — v2 döneminde "kısmi diye bir sonuç yok" diye kapatılmıştı, oysa veri onu
    zaten üretiyor: kapıda eksik kalem işaretlenince `adjustFulfillment` `fulfilledQty`yi düşürüyor.
    Sözleşmenin `StopOutcome`u yine dörtlü; ayrım yalnız çizimde.
  */
  it('kısmi teslim edilmiş durak KENDİ etiketini ve adet dökümünü çizer', async () => {
    mockDay(
      courierDay([
        courierStop(1, {
          outcome: 'delivered',
          items: [
            {
              orderItemId: stopItemId(1, 0),
              name: 'Fıstıklı Baklava',
              qty: 3,
              fulfilledQty: 2,
              unitPriceCents: 1400,
              lineDiscountAmountCents: 0,
            },
          ],
          payment: { dueAmountCents: null, expectedMethod: null, collectedAtDoorCents: null },
        }),
      ]),
    );

    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-stop-tag-' + STOP_1)).toHaveTextContent('KISMİ TESLİM'));
    /* Metin İYELİK EKİ TAŞIMIYOR ("2'si" / "3'ü" sayıya göre değişir ve şablon bunu yapamaz) —
       v3'ün cümlesi ekliydi, buradaki hâli ekten kaçınıyor ve aynı şeyi söylüyor. */
    expect(screen.getByText('3 adetten 2 adet bırakıldı · 1 adet araçta — iade depoya')).toBeOnTheScreen();
  });

  it('ulaşılamayan durak KURYENİN KENDİ NOTUNU yazar', async () => {
    mockDay(
      courierDay([
        courierStop(1, {
          outcome: 'unreachable',
          attempts: 1,
          outcomeNote: 'Zil bozuk — kimse yok',
        }),
      ]),
    );

    await renderDay();

    await waitFor(() =>
      expect(screen.getByText('Zil bozuk — kimse yok · 2 kalem araçta kaldı · kapanışta karara düşer')).toBeOnTheScreen(),
    );
  });

  /*
    MALIN AKIBETİ İKİ SONUÇTA FARKLI (cihaz turu 30.08). İlk hâlde ikisine de "araçta kaldı"
    yazılıyordu; sözleşmenin kuralı ise net: `unreachable` malı araçta bırakır ve kapanışta karara
    düşer, `refused` depoya döndürür — orada bekleyen bir karar yok.
  */
  it('kabul etmeyen durakta mal DEPOYA döner, araçta kalmaz', async () => {
    mockDay(
      courierDay([courierStop(1, { outcome: 'refused', outcomeNote: 'Restoran kapalıydı' })]),
    );

    await renderDay();

    await waitFor(() =>
      expect(screen.getByText('Restoran kapalıydı · 2 kalem depoya dönüyor')).toBeOnTheScreen(),
    );
    expect(screen.queryByText(/araçta kaldı/)).toBeNull();
    expect(screen.queryByText(/kapanışta karara düşer/)).toBeNull();
  });
});

describe('K1 · "Seferi başlat" — gerçek yazım', () => {

  it('boş hâlin düğmesi SEÇİM EKRANINA götürür — uca istek göndermez', async () => {
    /* 31.08'e kadar bu düğme doğrudan `/day/start`e gidiyordu. Artık kurma eylemi seçim ekranının
       kendi düğmesi; buradaki düğmenin tek işi YÖN vermek — gönderilecek bir seçim yok. */
    mockDay(courierDay([], { run: null, runs: [] }));

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-cta')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('courier-day-cta'));

    expect(mockNavigate).toHaveBeenCalledWith('/route-pick');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/day/start'))).toBe(false);
  });

  /*
    DÖRT LİSTENİN CÜMLESİ EKRAN DEĞİŞTİRDİ (31.08). Burada altı test vardı — atlanan duraklar,
    ikinci başlatma yolu, `stale`, "hiçbiri yola çıkmasa da sefer açılır", "zaten yoldaydı" ve
    başlatma hatası. Altısı da SEFERİ BAŞLATMANIN cevabını ölçüyordu; bu ekranın düğmesi ise artık
    seferi KURUYOR (`depart:false`) ve o cevap dört listeyi hiç doldurmuyor — kurulan seferde
    hiçbir durak yola çıkmaz, tanım gereği.

    Başlatma v3:15'in eylemi oldu ve ölçümü de oraya taşındı: `van-runs-screen.test.tsx`. Cümleyi
    kuran kod da ortak (`noticeOfStart`), yani iki kapı bir gün ayrışamaz.
  */
});

describe('yükleme okutması (23.8 · karar §1.11)', () => {
  it('sayaç duraklardaki damgalardan türer; son kutunun okutması siparişi yola çıkarır', async () => {
    const kutulu = (ikinciYuklu: boolean) =>
      courierStop(1, {
        boxes: [
          { boxNo: 1, code: 'KT-26-CCCCCCCCCC', loadedAt: '2026-08-22T08:00:00Z' },
          { boxNo: 2, code: 'KT-26-DDDDDDDDDD', loadedAt: ikinciYuklu ? '2026-08-22T08:05:00Z' : null },
        ],
      });
    let day = courierDay([kutulu(false)]);
    fetchMock.mockImplementation((url) => {
      const address = String(url);
      if (address.includes('/boxes/load')) {
        // Sunucu gibi: damga yazıldı — sonraki gün okuması yüklü kutuyu taşır.
        day = courierDay([kutulu(true)]);
        return Promise.resolve(
          okResponse({
            status: 'ok',
            orderId: kutulu(false).orderId,
            referenceNo: kutulu(false).referenceNo,
            boxNo: 2,
            loadedBoxes: 2,
            boxCount: 2,
            orderStarted: true,
          }),
        );
      }
      if (address.includes('/day-close')) return Promise.resolve(okResponse(dayCloseDraft()));
      if (address.includes('/courier/routes')) return Promise.resolve(okResponse({ date: '2026-08-08', routes: [] }));
      return Promise.resolve(okResponse(day));
    });
    await renderDay();

    /* OKUTMA ARTIK BURADA DEĞİL (30.08): kırılım kendi ekranına taşındı. Günde kalan şey KAPI ve
       sayacı — kapıyı açmadan "işim var mı" sorusu cevaplanabilmeli.

       KAPININ HEDEFİ DE DEĞİŞTİ (31.08): satır "Sefer künyesi ve yükleme" diyip `/trip`e
       gidiyordu; o ekran tasarımda artık yok. Araç bir ara depo olunca kuryenin sorusu da
       değişti — "ne taşıyorum" değil "araçta hangi seferler var, hangisini süreceğim". */
    expect(screen.getByTestId('courier-day-trip')).toHaveTextContent(/1 sefer araçta · 1 sürülüyor/);
    expect(screen.queryByTestId('courier-day-box-scan')).toBeNull();
  });

  it('kutusu OKUNAMAYAN günde sefer kapısı HİÇ çizilmez', async () => {
    /* Kutusuz sipariş 30.08'de bir VERİ HATASI oldu; bu hâl artık "eski akış" değil, kutuların
       hiç okunamadığı bir gün. Kapı yine çizilmiyor: olmayan bir adımı göstermek kuryeyi boş
       ekrana yollar. */
    mockDay(courierDay([courierStop(1, { boxes: [] })]));
    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());

    expect(screen.queryByTestId('courier-day-trip')).toBeNull();
  });
});

/*
  ARAÇ BİR ARA DEPO — EKRANIN ÜÇ HÂLİ (31.08 · v3:14).

  Ekran 31.08'e kadar iki hâlliydi: sefer ya vardı ya yoktu. Araçta kurulmuş ama başlatılmamış
  sefer olabildiği an üçüncü bir hâl doğdu ve o hâl ölçülmeden ekranda kutular görünmez kalırdı.
*/
describe('araçtaki seferler (31.08)', () => {
  it('ARAÇ BOŞ: rehber çizilir, araçtaki seferler kapısı çizilmez', async () => {
    mockDay(courierDay([], { run: null, runs: [] }));
    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-guide')).toBeOnTheScreen());
    // Araçta sefer yokken "araçtaki seferler" kapısı da yok: boş bir ekrana götürürdü.
    expect(screen.queryByTestId('courier-day-van-runs')).toBeNull();
  });

  it('ARAÇTA YÜK VAR AMA SÜRÜLEN SEFER YOK: duraklar açılmaz, "birini başlat" kapısı çizilir', async () => {
    /* Kurulmuş sefer `departedAt: null` taşır — araçta bekliyor. Bu hâl eskiden hiç çizilemiyordu:
       ekran seferi olmayan bir gün sanıp boş seçim gövdesini gösterirdi ve araçtaki mal kaybolurdu. */
    const waiting = courierDayRun({ departedAt: null });
    mockDay(courierDay([courierStop(1)], { run: null, runs: [waiting] }));
    await renderDay();

    expect(screen.getByTestId('courier-day-van-runs')).toBeTruthy();
    // Durak listesi YOK: sefer başlamadan durak açılmaz ve müşteriye haber gitmez.
    expect(screen.queryByTestId('courier-day-list')).toBeNull();
  });

  it('İKİ SEFER SÜRÜLÜRKEN duraklar SEFERE GÖRE gruplanır — başlık rota adını yazar', async () => {
    const ikinci = courierDayRun({ runId: '00000000-0000-4000-8000-000000000802', zoneName: 'Dağ rotası' });
    mockDay(
      courierDay(
        [
          courierStop(1),
          courierStop(2, { runId: ikinci.runId, runLabel: 'Dağ rotası' }),
        ],
        { runs: [courierDayRun(), ikinci] },
      ),
    );
    await renderDay();

    /* Grup başlığı ADI ve KÜNYE+HÂLİ birlikte taşıyor (v3:15 `grupMeta`): iki grup arasındaki
       fark "hangisi sürülüyor" ancak böyle okunuyor. */
    const group = screen.getByTestId(`courier-day-group-${ikinci.runId}`);
    expect(group).toHaveTextContent(/Dağ rotası/);
    expect(group).toHaveTextContent(/sürülüyor/);
  });

  it('SEFER SÜRÜLÜRKEN de rota ve araç listesi okunur — seçim kapısı kapanmaz', async () => {
    mockDay(courierDay([courierStop(1)]));
    await renderDay();

    /*
      ARIZA KÜNYESİ (cihazda ölçüldü 31.08): kanca "sürülen sefer varsa rota listesi gerekmez"
      diye dallanıyordu ve sefer sürülürken `routes`/`vehicles` boş bırakılıyordu. Seçim ekranına
      araçtaki seferlerden girilebildiği için (v3:16 "Araca sefer ekle") o ekran sefer boyunca
      HER ZAMAN boş açılıyordu — "deponda planlanmış sefer yok" diyordu, oysa hiç sormamıştı.

      Ölçüm ekranda değil ÇAĞRIDA: iki uç da vuruldu mu.
    */
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/courier/routes'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/courier/vehicles'))).toBe(true);
  });

  it('grup başlığı TEK SEFERDE DE çizilir (v3:14 `grupGoster: i === 0`)', async () => {
    mockDay(courierDay([courierStop(1)]));
    await renderDay();

    expect(screen.getByTestId(`courier-day-group-${courierDayRun().runId}`)).toBeOnTheScreen();
  });

  it('durak numarası SEFERİN İÇİNDE sayılır — ikinci sefer yine 1den başlar', async () => {
    const ikinci = courierDayRun({ runId: '00000000-0000-4000-8000-000000000802', zoneName: 'Dağ rotası' });
    mockDay(
      courierDay(
        [
          courierStop(1),
          courierStop(2),
          courierStop(3, { runId: ikinci.runId, runLabel: 'Dağ rotası' }),
        ],
        { runs: [courierDayRun(), ikinci] },
      ),
    );
    await renderDay();

    /* Küresel sayaç yazılıydı ve üçüncü durak "3" görünüyordu; oysa o, ikinci seferin İLK durağı.
       Özet kartı sefer bazında sayarken ("1/2 durak") liste küresel sayınca ekran kendi kendisiyle
       çelişiyordu (kullanıcı bulgusu 31.08). */
    expect(screen.getByTestId(`courier-stop-${STOP_3}`)).toHaveTextContent(/^1/);
  });
});
