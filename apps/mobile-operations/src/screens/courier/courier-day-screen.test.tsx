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
  startResult,
  stopItemId,
  takenRouteRun,
} from './courier-fixture';
import messages from './messages.json';

/*
  Gün ekranı testi: veri hâlleri, kapanmış seferin durak kilidi, CTA'nın dönüşümü, ilerleme satırı ve sefer başlatmanın dallı cevabı; hook taklit edilmez, taklit `fetch` sözleşmeden geçer ki alan adı ayrışırsa test kırılsın.
  Taklit sunucu seferi hatırlar (başlatmadan sonraki okuma `run` taşır); RNTL aynı testte ikinci `render`ı öncekini söktüğü için her test tek render kullanır.
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
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
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
/** Boş hâlin düğmesi seçime götürür, sefer kurmaz. */
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
      // Sunucu gibi: açılan sefer sonraki okumada hem sürülen sefer hem araçtaki seferlerden biri olur.
      if (start.status === 'ok' && current !== null) current = { ...current, run: start.run, runs: [start.run] };
      return Promise.resolve(okResponse(start));
    }
    if (address.includes('/day-close')) return Promise.resolve(draft === null ? failResponse() : okResponse(draft));
    if (address.includes('/courier/routes')) {
      return Promise.resolve(routes === null ? failResponse() : okResponse({ date: '2026-08-08', routes }));
    }
    /* Araç listesi varsayılan olarak boştur, çünkü araçsız sefer kurulabilir ve araç listesi hiçbir testin ön koşulu değildir. */
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
  /* İlk yük iskelettir, halka değil; ayıran iz roldür (halka `progressbar`dır), çünkü testID iki bileşende de aynı kalırdı. */
  it('yüklenirken İSKELET gösterir (halka değil), liste çizilmez', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));

    await renderDay();

    expect(screen.getByTestId('courier-day-loading')).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByTestId('courier-day-list')).toBeNull();
  });

  /* Üstbaşlık "neredeyim"i (bölüm ve gün), bağlam satırı "kim ve hangi sefer"i söyler; ikisi her ekranda aynı yerde, başlıktadır. */
  it('üstbaşlık bölüm + gün, bağlam satırı ad + sefer künyesi', async () => {
    mockDay(courierDay([courierStop(1)]));

    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    expect(screen.getByText('KURYE · 8 AĞUSTOS')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: t.day.title })).toBeOnTheScreen();
    expect(screen.getByText('Musa Kaya · Kuzey rotası · SF-26-ABCDEF')).toBeOnTheScreen();
  });

  it('ARAÇ BOŞSA rehber çizilir ve düğme HER HÂLDE durur — rota olmasa bile', async () => {
    /* Boş hâl bir seçim değil rehberdir (seç → yükle → başlat) ve seçime götüren tek düğmedir; düğme rota yokken de çizilir, çünkü sebebi seçim ekranı söyler. */
    mockDay(courierDay([], { run: null, runs: [] }), dayCloseDraft(), startResult(), []);

    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-guide')).toBeOnTheScreen());
    expect(screen.getByText(t.day.vanEmpty.step1)).toBeOnTheScreen();
    expect(screen.getByTestId('courier-day-cta')).toHaveTextContent(t.day.vanEmpty.cta);
  });

  it('YERİNDE SATIŞ kapısı YALNIZ sürülen seferde çizilir — "yoldan gelen" yolda gelir', async () => {
    /* "Yoldan gelen müşteri" kapısı yalnız sürülen seferde çizilir: sefer kurmamış kurye depodadır ve oradaki satış depo kapısının işidir. */
    mockDay(courierDay([], { run: null, runs: [] }), dayCloseDraft(), startResult(), []);
    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-guide')).toBeOnTheScreen());
    expect(screen.queryByTestId('courier-day-sale')).toBeNull();

    // Kutular araçta ama hiçbir sefer BAŞLATILMADI: durak da açılmadı, satış da açılmaz.
    mockDay(courierDay([], { run: null, runs: [courierDayRun()] }), dayCloseDraft(), startResult(), []);
    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-van')).toBeOnTheScreen());
    expect(screen.queryByTestId('courier-day-sale')).toBeNull();

    // Sürülen sefer VAR: kapı burada, ve satış ARACIN stoğundan (`place=van`).
    mockDay(courierDay([courierStop(1)]));
    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-sale')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('courier-day-sale'));
    expect(mockNavigate).toHaveBeenCalledWith('/sale?place=van');
  });

  it('DURAKSIZ sürülen sefer ÇIKMAZ DEĞİL — araçtaki seferler kapısı yine çizilir', async () => {
    /* "Araçtaki seferler" ve "Yoldan gelen müşteri" kapıları durak listesine değil araca bağlıdır; durağı olmayan sürülen seferde de kurye araçtaki öteki sefere geçebilmeli. */
    const ikinci = courierDayRun({ runId: '00000000-0000-4000-8000-000000000803', zoneName: 'Batı Hattı' });
    mockDay(courierDay([], { runs: [courierDayRun(), { ...ikinci, departedAt: null }] }));
    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-empty')).toBeOnTheScreen());
    // Çıkış yolu VAR: araçtaki seferlere ve araçtan satışa.
    expect(screen.getByTestId('courier-day-trip')).toBeOnTheScreen();
    expect(screen.getByTestId('courier-day-sale')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('courier-day-trip'));
    expect(mockNavigate).toHaveBeenCalledWith('/van-runs');
  });

  it('ARAÇTA YÜK VAR gövdesi: cümleler DOLU, kapılar doğru sayıyı sayıyor', async () => {
    /* Yükleme kapısı kutu sayar, sefer kapısı sefer; iki metnin anahtarları karışırsa ekranda ham yer tutucu görünür. */
    mockDay(
      courierDay([], {
        run: null,
        runs: [{ ...courierDayRun(), departedAt: null }],
      }),
    );
    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-van')).toBeOnTheScreen());

    // Hiçbir yuva ham kalmadı — dolmayan `{...}` ekranda bir söz olarak durur.
    expect(screen.getByTestId('courier-day-van-empty')).not.toHaveTextContent(/\{[a-z]+\}/i);
    expect(screen.getByTestId('courier-day-van-empty')).toHaveTextContent(/1 sefer araçta · 0 sürülüyor/);
    expect(screen.getByTestId('courier-day-van-runs')).toHaveTextContent(/1 sefer araçta · 0 sürülüyor/);
    expect(screen.getByTestId('courier-day-load')).toHaveTextContent(/kutu araçta/);
    expect(screen.getByTestId('courier-day-load')).not.toHaveTextContent(/\{[a-z]+\}/i);
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
    /* Kapanmış sefer `/courier/day`den dönmez (ne `run` ne `runs` içinde), bu yüzden ekran doğrudan seçim gövdesine düşer. */
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
    // Düğme seçime götürür; kurma ve başlatma başka ekranların eylemidir.
    expect(screen.getByTestId('courier-day-cta')).toHaveTextContent(START_CTA);
  });

  /* Rota seçimi ayrı ekrandadır ve `route-pick-screen.test.tsx`te ölçülür; burada seçimden dönünce listenin geldiği ölçülür. */

  it('sefer kapatma CTA\'sı KAPATILACAK SEFERİN KİMLİĞİYLE gider', async () => {
    mockDay(
      courierDay([courierStop(1, { outcome: 'delivered', payment: { dueAmountCents: null, expectedMethod: null, collectedAtDoorCents: null } })]),
    );

    await renderDay();
    await waitFor(() => expect(screen.getByText(t.day.close)).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('courier-day-cta'));

    /* Kapanış ekranına seferin kimliği gider, çünkü iki seferli günde gösterilen künye ile kapatılan kaydın aynı olduğunu ancak kimlik garanti eder. */
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/day-close',
      params: { runId: courierDayRun().runId },
    });
  });

  /* Ekran anatomisi: özet kartı koyu, tamamlanan sayı büyük, sefer ve satış satırları ikonlu kart, duraklar kendi kartında. */
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

  /* Sonuç etikete çıkar ("ne oldu ve ne zaman"), alt satır "ne bıraktım, ne aldım"ı taşır: kuryenin listeye dönüp sorduğu iki ayrı soru. */
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
    /* Sayaç sonuçlanmış durağı sayar, teslim edileni değil; niteliği çubuk söyler: yeşil teslim, kırmızı takılı. */
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

  /* Kısmi teslim çizimde ayrılır: kapıda eksik kalem `fulfilledQty`yi düşürür, sözleşmenin `StopOutcome`u yine dörtlüdür. */
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

  /* Malın akıbeti iki sonuçta farklıdır: `unreachable` malı araçta bırakır ve kapanışta karara düşer, `refused` depoya döndürür. */
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

describe('hazırlanmamış durak (kullanıcı bulgusu 03.09)', () => {
  it('depoda toplanmamış durak listede "HAZIRLANMADI" etiketi taşır — saatsiz, sonuç değil hâl', async () => {
    mockDay(courierDay([courierStop(1, { awaitingPreparation: true, boxes: [] }), courierStop(2)]));

    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    expect(screen.getByTestId('courier-stop-tag-' + STOP_1)).toHaveTextContent(/^HAZIRLANMADI$/);
    expect(screen.queryByTestId('courier-stop-tag-' + STOP_2)).toBeNull();
  });
});

/*
  İptal edilen durak listeye yalnız kutusu araçtayken gelir; ekran onu doğru anlatmalı ve teslimat sayılarına karıştırmamalı.
  Karışsaydı "sıradaki durak" oku oraya bakar, tahsilat özeti onun parasını bekler ve ilerleme çubuğu hiç dolmazdı.
*/
describe('iptal edilen durak (05.09)', () => {
  const iptalli = (index: number) =>
    courierStop(index, {
      cancelled: true,
      payment: { dueAmountCents: 4200, expectedMethod: 'cash', collectedAtDoorCents: null },
    });

  it('üstü çizili "SİPARİŞ İPTAL EDİLDİ" — ve tek söylediği şey kutunun geri getirileceği', async () => {
    mockDay(courierDay([iptalli(1), courierStop(2)]));

    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    expect(screen.getByTestId('courier-stop-tag-' + STOP_1)).toHaveTextContent(/^SİPARİŞ İPTAL EDİLDİ$/);
    /* Müşteri adı ve kanal YAZILMAZ: onlar "kime teslim edeceksin" sorusunun cevabı ve o soru
       burada yok. Kutu SAYISI yazılır — kurye araçta hangisini arayacağını bilmeli. */
    expect(screen.getByText('1 kutu araçta — depoya geri getir')).toBeOnTheScreen();
  });

  it('KAPIDA PARA KONUŞULMAZ — rozet çizilmez, tahsilat özetine de girmez', async () => {
    /* Borç motorun gözünde hâlâ açık görünebilir (iade yazılmamış olabilir) ama kapıda tahsil
       edilecek bir şey yok: kurye oraya gitmiyor. Rozeti çizmek onu para toplamaya çağırırdı. */
    mockDay(courierDay([iptalli(1), courierStop(2)]));

    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    expect(screen.queryByTestId('courier-stop-door-' + STOP_1)).toBeNull();
    // Özet yalnız ÖTEKİ durağın parasını sayıyor (fikstürün varsayılanı 42,00 €).
    expect(screen.getByText('1 kapıda tahsilat kaldı · 42,00 €')).toBeOnTheScreen();
  });

  it('İLERLEME İPTALİ SAYMAZ — tek gerçek durak teslim edilince gün BİTER', async () => {
    /* Ölçülen arıza buydu: iptal edilmiş durak `pending` sayıldığı için çubuk hiç dolmuyor ve
       kurye günü kapatamadığını sanıyordu. */
    mockDay(courierDay([iptalli(1), courierStop(2, { outcome: 'delivered' })]));

    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());
    /* Payda ölçülür: iki durak var ama biri iptal, gün tek duraklıktır; payda ikide kalsaydı kurye günü bitiremediğini sanırdı. */
    expect(screen.getByText('/1 durak')).toBeOnTheScreen();
    expect(screen.queryByText('/2 durak')).toBeNull();
  });
});

describe('K1 · "Seferi başlat" — gerçek yazım', () => {

  it('boş hâlin düğmesi SEÇİM EKRANINA götürür — uca istek göndermez', async () => {
    /* Kurma eylemi seçim ekranının kendi düğmesidir; buradaki düğmenin tek işi yön vermektir. */
    mockDay(courierDay([], { run: null, runs: [] }));

    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-cta')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('courier-day-cta'));

    expect(mockNavigate).toHaveBeenCalledWith('/route-pick');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/day/start'))).toBe(false);
  });

  /* Dört listenin cümlesi sefer başlatmanın cevabıdır ve `van-runs-screen.test.tsx`te ölçülür; bu ekranın düğmesi seferi kurar, kurulan seferde hiçbir durak yola çıkmaz. */
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

    /* Okutma kendi ekranındadır; günde kapı ve sayacı kalır ki kapıyı açmadan "işim var mı" cevaplansın, kapı araçtaki seferlere götürür. */
    expect(screen.getByTestId('courier-day-trip')).toHaveTextContent(/1 sefer araçta · 1 sürülüyor/);
    expect(screen.queryByTestId('courier-day-box-scan')).toBeNull();
  });

  it('KUTUSUZ günde de sefer kapısı çizilir — satırın bilgisi kutulardan gelmiyor', async () => {
    /* Kapı kutusuz günde de çizilir: `/van-runs` kutuları değil araçtaki seferleri gösterir ve kurye ikinci seferine ancak buradan ulaşır. */
    mockDay(courierDay([courierStop(1, { boxes: [] })]));
    await renderDay();
    await waitFor(() => expect(screen.getByTestId('courier-day-list')).toBeOnTheScreen());

    expect(screen.getByTestId('courier-day-trip')).toBeOnTheScreen();
    // Yükleme okutması AYRI bir şey ve o gerçekten kutulara bağlı — o kapı yine yok.
    expect(screen.queryByTestId('courier-day-box-scan')).toBeNull();
  });
});

/* Araç bir ara depodur ve ekranın üç hâli vardır: sefer yok, kurulmuş ama başlamamış sefer, sürülen sefer. */
describe('askıda kalan duraklar (03.09 · denetim bulgusu 7)', () => {
  it('teslim günü geçmiş durak ŞERİTTE görünür — kutusu araçta olan ayrıca söylenir; kurye buradan iş yapmaz', async () => {
    mockDay(
      courierDay([courierStop(1)], {
        stranded: [
          { orderId: '00000000-0000-4000-8000-00000000a001', referenceNo: 'LA-26-ASKIDA1', customerName: 'Léa Girard', deliveryDate: '2026-08-07', boxOnVan: true },
          { orderId: '00000000-0000-4000-8000-00000000a002', referenceNo: 'LA-26-ASKIDA2', customerName: 'Hugo Bernard', deliveryDate: '2026-08-06', boxOnVan: false },
        ],
      }),
    );
    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-stranded')).toBeOnTheScreen());
    expect(screen.getByTestId('courier-day-stranded')).toHaveTextContent(/ASKIDA — 2 durak/);
    expect(screen.getByTestId('courier-day-stranded-00000000-0000-4000-8000-00000000a001')).toHaveTextContent(/LA-26-ASKIDA1 · Léa Girard/);
    expect(screen.getByTestId('courier-day-stranded-00000000-0000-4000-8000-00000000a001')).toHaveTextContent(/kutusu araçta/);
    expect(screen.getByTestId('courier-day-stranded-00000000-0000-4000-8000-00000000a002')).toHaveTextContent(/kutusu araçta değil/);
    // Bu satır bir liste, kapı değil: dokunulacak düğmesi yok, yeni günü sevkiyat seçer.
    expect(screen.queryByRole('button', { name: /askıda/i })).toBeNull();
  });

  it('askıda durak yoksa şerit hiç çizilmez', async () => {
    mockDay(courierDay([courierStop(1)]));
    await renderDay();

    await waitFor(() => expect(screen.getByTestId('courier-day-summary')).toBeOnTheScreen());
    expect(screen.queryByTestId('courier-day-stranded')).toBeNull();
  });
});

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

    /* Rotalar ve araçlar sefer sürülürken de okunur, çünkü seçim ekranına araçtaki seferlerden girilebilir; ölçüm ekranda değil çağrıda: iki uç da vuruldu mu. */
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/courier/routes'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/courier/vehicles'))).toBe(true);
  });

  it('grup başlığı TEK SEFERDE DE çizilir (v3:14 `grupGoster: i === 0`)', async () => {
    mockDay(courierDay([courierStop(1)]));
    await renderDay();

    expect(screen.getByTestId(`courier-day-group-${courierDayRun().runId}`)).toBeOnTheScreen();
  });

  it('durak numarası SUNUCUDAN gelir — ekran saymaz, ikinci seferin ilk durağı 1 yazar', async () => {
    const ikinci = courierDayRun({ runId: '00000000-0000-4000-8000-000000000802', zoneName: 'Dağ rotası' });
    mockDay(
      courierDay(
        [
          courierStop(1, { stopSeq: 1 }),
          courierStop(2, { stopSeq: 2 }),
          courierStop(3, { runId: ikinci.runId, runLabel: 'Dağ rotası', stopSeq: 1 }),
        ],
        { runs: [courierDayRun(), ikinci] },
      ),
    );
    await renderDay();

    /* Ekran bir tur boyunca KENDİ sayıyordu (önce liste boyunca, sonra sefer içinde) ve iki sayaç
       da yanlıştı: numara bir sayaç değil bir HESAPTIR — sunucu kapalı tur maliyetiyle diziyor ve
       `stopSeq` alanında taşıyor (11.9). Üçüncü satır listenin üçüncüsü ama ikinci seferin İLK
       durağı; doğru numarayı ekran değil, o alan söylüyor. */
    expect(screen.getByTestId(`courier-stop-${STOP_3}`)).toHaveTextContent(/^1/);
  });

  it('SIRA BİLİNMİYORSA numara UYDURULMAZ — kısmen numaralanmış liste numarasızdan kötüdür', async () => {
    /* Fikstürün varsayılanı bilerek `stopSeq: null`: rota sırası hesaplanamamış gün gerçek bir hâl
       (sunucu kapalı tur çözemediğinde). Ekran o satıra dizi indeksini yazsaydı, siparişin VERİLME
       sırasını rota sırasıymış gibi göstermiş olurdu — ve kurye ona göre sürerdi. */
    mockDay(courierDay([courierStop(1), courierStop(2)]));
    await renderDay();

    expect(screen.getByTestId(`courier-stop-${STOP_1}`)).not.toHaveTextContent(/^[0-9]/);
  });
});
