import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

/*
  TAHSİLAT TUTARI ARTIK TUŞ TAKIMIYLA yazılıyor (v3 · `00-ortak`, 30.08): alan bir `TextInput`
  değil, tuş takımını açan düğme. Testler kapıdaki gerçek yolu izliyor — alana dokun, rakamlara
  bas, "Yaz". Doğrudan metin yazmak artık var olmayan bir yolu ölçmek olurdu.
*/
async function typeCollection(amount: string) {
  await fireEvent.press(screen.getByTestId('courier-collection-amount'));
  for (const key of amount) {
    await fireEvent.press(screen.getByTestId(`courier-collection-keypad-key-${key}`));
  }
  await fireEvent.press(screen.getByTestId('courier-collection-keypad-confirm'));
}

/** Alanı boşaltır — "tutar yazılmadı" hâlinin gerçek yolu. */
async function clearCollection() {
  await fireEvent.press(screen.getByTestId('courier-collection-amount'));
  for (let i = 0; i < 8; i += 1) {
    await fireEvent.press(screen.getByTestId('courier-collection-keypad-delete'));
  }
  await fireEvent.press(screen.getByTestId('courier-collection-keypad-confirm'));
}

import type { CourierStopContract } from '@lezzet/types';
import { CourierDeliveryScreen } from './delivery-screen';
import { courierDay, courierStop, DOOR_ACCOUNT_ID, stopItemId } from './courier-fixture';
import messages from './messages.json';

/*
  TOAST KÖKTE ÇİZİLİR (`app/_layout`), bu test ekranı tek başına render ediyor — yani `ToastHost`
  ağaçta yok ve mesaj DEPODAN okunur. Ölçülen şey zaten host değil, kuryeye ne söylendiği.
*/
jest.mock('@/lib/toast/toast-store', () => {
  const actual = jest.requireActual('@/lib/toast/toast-store');
  return { ...actual, toastSuccess: (message: string) => lastToast.push(message) };
});
const lastToast: string[] = [];

/*
  TESLİMAT EKRANI — kutu okutması, reddedilen kalem çekmecesi, tahsilat paneli, iki adımlı sonuç
  akışı ve kapının olumsuz cevaplarının EKRANDA görünmesi.

  Hook taklit EDİLMEZ (katalog/K1 emsali): gerçek hook + taklit `fetch`. Yalnız İKİ şey taklit
  edilir ve ikisi de yerel (native) sınırdır:
  · `expo-router` — navigasyon bağlamı yok
*/

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: () => mockBack(), navigate: jest.fn(), push: jest.fn() }),
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

const t = messages;
const ORDER_ID = '00000000-0000-4000-8000-000000000001';
/** Fixture'ın birinci durağının iki kalemi — satır anahtarı artık KİMLİK (21.10e). */
const BAKLAVA = stopItemId(1, 0);
const MANTI = stopItemId(1, 1);

interface Route {
  ok?: unknown;
  error?: { status: number; key: string };
}

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function envelope(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

function errorEnvelope(status: number, key: string): Response {
  return {
    status,
    headers: { get: () => null },
    json: async () => ({ data: null, error: key }),
  } as unknown as Response;
}

/** Uç başına cevap kurar. */
function mockRoutes(routes: { day: unknown; deliver?: Route; undelivered?: Route }) {
  fetchMock.mockImplementation((url) => {
    const address = String(url);
    if (address.includes('/deliver')) {
      const route = routes.deliver ?? { ok: okDelivery() };
      return Promise.resolve(route.error ? errorEnvelope(route.error.status, route.error.key) : envelope(route.ok));
    }
    if (address.includes('/undelivered')) {
      const route = routes.undelivered ?? { ok: { status: 'ok', outcome: 'unreachable', currentStatus: 'ready' } };
      return Promise.resolve(route.error ? errorEnvelope(route.error.status, route.error.key) : envelope(route.ok));
    }
    return Promise.resolve(envelope(routes.day));
  });
}

function okDelivery(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ok',
    collectedCents: 0,
    amountDueCents: 0,
    paymentStatus: 'paid',
    cashLimitExceeded: false,
    adjustedLines: 0,
    ...overrides,
  };
}

/** Borçsuz B2C durağı — tahsilat kapısı devrede olmayan "temiz" hâl. */
const settledStop = (overrides: Partial<CourierStopContract> = {}) =>
  courierStop(1, { payment: { dueAmountCents: null, expectedMethod: null, collectedAtDoorCents: null }, ...overrides });

/**
 * Tek kalemli borçsuz durak — kapı testlerinin çoğunun ilgilendiği en küçük hâl.
 *
 * `fulfilledQty` 0: kapıya HENÜZ gidilmedi. Alan 30.08'de sözleşmeye girdi ve buradaki eksikliği
 * derleme YAKALAMADI (`overrides` tipi çıkarımla `{}` idi, yani her şeyi kabul ediyordu) — cevabı
 * şema reddetti ve ekran "durak bulunamadı"ya düştü. Tip aşağıda verildi; sıradaki alan artık
 * derlemede durur.
 */
const oneLineStop = (overrides: Partial<CourierStopContract> = {}) =>
  settledStop({
    itemCount: 1,
    contentSummary: '1 × Mantı',
    items: [{ orderItemId: MANTI, name: 'Mantı', qty: 1, fulfilledQty: 0, unitPriceCents: 1400, lineDiscountAmountCents: 0 }],
    /* KUTUSUZ ve bu bilerek: bu ekranın testlerinin çoğu kutuyu KONU ETMİYOR ve kutulu hâli
       `boxedStop` kuruyor. Ortak fikstür 31.08'de varsayılan bir kutu kazandı (kutusuz sipariş
       artık veri hatası); buradaki boş dizi o varsayılanı bilinçle geri alıyor — kutunun kapıyı
       nasıl kapattığını ölçen testlerin zemini tam olarak bu. */
    boxes: [],
    ...overrides,
  });

/** Kutulu durak (23.8) — iki kutu, ikisi de araca yüklenmiş; kapıda okutulmayı bekliyor. */
const boxedStop = (overrides: Partial<CourierStopContract> = {}) =>
  oneLineStop({
    boxes: [
      { boxNo: 1, code: 'KT-26-AAAAAAAAAA', loadedAt: '2026-08-22T08:00:00Z' },
      { boxNo: 2, code: 'KT-26-BBBBBBBBBB', loadedAt: '2026-08-22T08:01:00Z' },
    ],
    ...overrides,
  });

/** Teslim isteğinin gövdesi — kapıya NE gittiği tek yerden okunur. */
function deliverBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/deliver'));
  return JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
}

/** Teslim ucuna kaç istek gitti — "hiç gitmedi" iddiasının ölçüsü. */
function deliverCalls(): number {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes('/deliver')).length;
}

async function renderDelivery() {
  await render(<CourierDeliveryScreen orderId={ORDER_ID} />);
  await waitFor(() => expect(screen.getByTestId('courier-delivery-body')).toBeOnTheScreen());
}


/**
 * Kutulu durağı kapıya HAZIR hâle getirir: ekranı çizer, kutuları okutur.
 *
 * 30.08'den beri teslim kapısı kutu okutmasına bağlı ve kutusuz durak bir veri hatası — yani
 * "teslim gönderildi" iddiasını ölçen her test bu yoldan geçmek zorunda. Yardımcı olmasaydı her
 * test aynı üç satırı tekrar yazardı (CLAUDE §1).
 */
async function renderScannedStop(
  overrides: Partial<CourierStopContract> = {},
  day?: Record<string, unknown>,
  routes: { deliver?: Route; undelivered?: Route } = {},
) {
  mockRoutes({ day: courierDay([boxedStop(overrides)], day), ...routes });
  await renderDelivery();
  for (const label of ['Kutu 1', 'Kutu 2']) {
    await fireEvent.press(screen.getByTestId('courier-box-scan'));
    await fireEvent.press(screen.getByLabelText(label));
  }
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockBack.mockReset();
  lastToast.length = 0;
});

describe('teslimat · durak künyesi', () => {
  /* İLK YÜK İSKELET, HALKA DEĞİL (N9 · 30.08) — ayıran iz ROL: halka `progressbar`dır. */
  it('yüklenirken İSKELET gösterir, halka değil', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));

    await render(<CourierDeliveryScreen orderId={ORDER_ID} />);

    expect(screen.getByTestId('courier-delivery-loading')).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('durak bugünkü rotada yoksa ekran bunu SÖYLER, boş bir form açmaz', async () => {
    mockRoutes({ day: courierDay([courierStop(9)]) });

    await render(<CourierDeliveryScreen orderId={ORDER_ID} />);

    await waitFor(() => expect(screen.getByTestId('courier-delivery-missing')).toBeOnTheScreen());
  });

  it('sıra ve künye gün listesinden türer; adres yoksa navigasyon köprüsü çizilmez', async () => {
    mockRoutes({ day: courierDay([courierStop(0), settledStop({ address: null, whatsAppLink: null })]) });

    await renderDelivery();

    expect(screen.getByText('Durak 2/2')).toBeOnTheScreen();
    expect(screen.queryByTestId('courier-delivery-navigate')).toBeNull();
    expect(screen.getByText(t.delivery.noNavigate)).toBeOnTheScreen();
    expect(screen.queryByTestId('courier-delivery-whatsapp')).toBeNull();
  });
});

/*
  MAL ADIMI: TESLİM VARSAYILAN, RED İSTİSNA (kullanıcı kararı 30.08).

  Eski testler kalemleri tek tek işaretletiyordu ("üç hâlli kalem", "her kalem işaretlenmeden kapı
  açılmaz") — o model kalktı. Kutu okutması zorunlu olunca "mal verildi mi" sorusu zaten
  cevaplanıyor; kuryenin söylemesi gereken tek şey İSTİSNA: müşteri ne geri verdi. İstisna
  çekmeceden giriliyor, ekranda sürekli duran bir liste yok.
*/
describe('teslimat · mal (reddedilen kalem çekmecesi)', () => {
  it('varsayılan HEPSİ TESLİM: özet öyle der ve gövdede düzeltme doğmaz', async () => {
    await renderScannedStop();
    expect(screen.getByTestId('courier-goods-summary')).toHaveTextContent(t.delivery.goods.allDelivered);
    // Kapı AÇIK: işaretlenecek bir şey yok, kutu da yok (kutusuz durak bu testin konusu değil).
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));

    await waitFor(() => expect(deliverCalls()).toBe(1));
    expect(deliverBody()).not.toHaveProperty('adjustments');
    // Kutu kodları HER kutulu teslimde gider — kanıt kaydını sunucu bunlardan kuruyor.
    expect(deliverBody().scannedBoxCodes).toHaveLength(2);
  });

  it('çekmeceden seçilen adet kalem satırında ÖZETLENİR ve kimliğiyle gider', async () => {
    /* İki kalemli kutulu durak: çok adetli kalemde "kaçı geri verildi" ancak böyle ölçülür. */
    await renderScannedStop({
      itemCount: 2,
      items: [
        { orderItemId: BAKLAVA, name: 'Fıstıklı Baklava', qty: 2, fulfilledQty: 0, unitPriceCents: 1400, lineDiscountAmountCents: 0 },
        { orderItemId: MANTI, name: 'Mantı', qty: 1, fulfilledQty: 0, unitPriceCents: 1400, lineDiscountAmountCents: 0 },
      ],
    });
    await fireEvent.press(screen.getByTestId('courier-goods-refuse-open'));
    // Baklava 2 adet gönderildi, 1'i geri verildi.
    await fireEvent.press(screen.getByTestId(`courier-refuse-step-${BAKLAVA}-increase`));
    await fireEvent.press(screen.getByTestId('courier-refuse-done'));

    expect(screen.getByTestId('courier-goods-refused')).toHaveTextContent(/1\/2 geri verildi/);
    expect(screen.getByTestId('courier-partial-note')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));

    await waitFor(() => expect(deliverCalls()).toBe(1));
    // `fulfilledQty` HEDEF adettir: 2 sipariş edildi, 1 geri döndü → kapıda kalan 1.
    // Kutu kodları da gövdede: kutulu durakta teslimin ön koşulu (23.8).
    expect(deliverBody().adjustments).toEqual([{ orderItemId: BAKLAVA, fulfilledQty: 1 }]);
  });

  /*
    KAPIDA ALINACAK TUTAR, GERİ VERİLEN MAL DÜŞÜLMÜŞ (kullanıcı bulgusu 30.08). Ekran eskiden
    siparişin TAM tutarını gösteriyordu: kurye "1/2 geri verildi" yazıp altında hâlâ 42,00 €
    görüyor, kapıda ne tahsil edeceğini bilmiyordu. Hesap motorun kendisi (`lineAmountCents`).
  */
  it('geri verilen kalem TAHSİLAT tutarından düşer', async () => {
    await renderScannedStop(
      {
        itemCount: 2,
        items: [
          { orderItemId: BAKLAVA, name: 'Fıstıklı Baklava', qty: 2, fulfilledQty: 0, unitPriceCents: 1400, lineDiscountAmountCents: 0 },
          { orderItemId: MANTI, name: 'Mantı', qty: 1, fulfilledQty: 0, unitPriceCents: 1400, lineDiscountAmountCents: 0 },
        ],
        payment: { dueAmountCents: 4200, expectedMethod: 'cash', collectedAtDoorCents: null },
      },
      { doorAccountId: DOOR_ACCOUNT_ID },
    );
    expect(screen.getByTestId('courier-collection-amount')).toHaveTextContent(/42,00\s€/);

    await fireEvent.press(screen.getByTestId('courier-goods-refuse-open'));
    await fireEvent.press(screen.getByTestId(`courier-refuse-step-${BAKLAVA}-increase`));
    await fireEvent.press(screen.getByTestId('courier-refuse-done'));

    // 1 adet × 14,00 € geri verildi → kapıda 28,00 € kaldı; başlık da yeni tutarı yazar.
    expect(screen.getByTestId('courier-collection-amount')).toHaveTextContent(/28,00\s€/);
    expect(screen.getByText(/TAHSİLAT — MOTOR TUTARI 28,00 €/)).toBeOnTheScreen();
  });

  it('adet sipariş edilenin üstüne çıkmaz, sıfırın altına inmez', async () => {
    mockRoutes({ day: courierDay([oneLineStop()]) });

    await renderDelivery();
    await fireEvent.press(screen.getByTestId('courier-goods-refuse-open'));
    // Tek adetli kalem: üç kez artır → yine 1; iki kez azalt → 0.
    for (let i = 0; i < 3; i += 1) await fireEvent.press(screen.getByTestId(`courier-refuse-step-${MANTI}-increase`));
    expect(screen.getByTestId(`courier-refuse-step-${MANTI}-value`)).toHaveTextContent('1');
    for (let i = 0; i < 2; i += 1) await fireEvent.press(screen.getByTestId(`courier-refuse-step-${MANTI}-decrease`));
    expect(screen.getByTestId(`courier-refuse-step-${MANTI}-value`)).toHaveTextContent('0');
  });

  it('TÜMÜ geri verildiğinde teslim kapatılır ve "Kabul etmedi"ye yönlendirilir', async () => {
    mockRoutes({ day: courierDay([oneLineStop()]) });

    await renderDelivery();
    await fireEvent.press(screen.getByTestId('courier-goods-refuse-open'));
    await fireEvent.press(screen.getByTestId(`courier-refuse-step-${MANTI}-increase`));
    await fireEvent.press(screen.getByTestId('courier-refuse-done'));

    expect(screen.getByTestId('courier-delivery-cta')).toHaveTextContent(t.delivery.cta.allRefused);
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));
    expect(deliverCalls()).toBe(0);
  });
});

describe('teslimat · tahsilat', () => {
  it('alan MOTORUN tutarıyla açılır, yöntem beklenenden seçilir', async () => {
    mockRoutes({ day: courierDay([courierStop(1)]) });

    await renderDelivery();

    /* Alan artık tutarı ve "tuş takımı" rozetini birlikte taşıyor (tasarımın tek satırı) —
       iddia tutarın kendisinde, satırın tamamında değil. */
    expect(screen.getByTestId('courier-collection-amount')).toHaveTextContent(/42,00\s€/);
    expect(screen.getByRole('button', { name: 'nakit', selected: true })).toBeOnTheScreen();
  });

  /*
    ARTI/EKSİ SÖKÜLDÜ (kullanıcı kararı 30.08) — tasarımda yok. Kapıda tahsil edilen tutar MOTORUN
    hesabıdır; adım adım artırma onu "pazarlık edilebilir" gibi gösteriyordu. Eksik ödeme tuş
    takımından yazılır ve ekranda "Kısmi" diye işaretlenir — o yol testte aşağıda ayrıca ölçülüyor.
  */
  it('tutar TUŞ TAKIMINDAN yazılır; CTA yazılan tutarı taşır', async () => {
    /* KUTU OKUTULMADAN PARA ADIMI KİLİTLİ (kapı sırası: kutu → mal → para). Fikstürün varsayılanı
       31.08'de kutulu oldu; bu blok tahsilatı ölçüyor, kutuyu değil — o yüzden okutma adımı
       zeminden çıkarılıyor. Kilidin KENDİSİ "kutu okutması" başlığı altında ayrıca ölçülüyor. */
    mockRoutes({ day: courierDay([courierStop(1, { boxes: [] })]) });

    await renderDelivery();
    await typeCollection('30,00');

    expect(screen.getByTestId('courier-delivery-cta')).toHaveTextContent(/30,00/);
    expect(screen.getByTestId('courier-collection-amount')).toHaveTextContent(/30,00\s€/);
    // Adım düğmeleri tasarımda yok ve ekranda da olmamalı.
    expect(screen.queryByTestId('courier-collection-plus')).toBeNull();
    expect(screen.queryByTestId('courier-collection-minus')).toBeNull();
  });

  it('eksik ödemede KISMİ rozeti çıkar; tam ödemede çıkmaz', async () => {
    /* KUTU OKUTULMADAN PARA ADIMI KİLİTLİ (kapı sırası: kutu → mal → para). Fikstürün varsayılanı
       31.08'de kutulu oldu; bu blok tahsilatı ölçüyor, kutuyu değil — o yüzden okutma adımı
       zeminden çıkarılıyor. Kilidin KENDİSİ "kutu okutması" başlığı altında ayrıca ölçülüyor. */
    mockRoutes({ day: courierDay([courierStop(1, { boxes: [] })]) });

    await renderDelivery();
    expect(screen.queryByTestId('courier-collection-partial')).toBeNull();

    await typeCollection('30,00');
    expect(screen.getByTestId('courier-collection-partial')).toHaveTextContent(t.delivery.collection.partial);
  });

  it('nakit yasal sınırın üstünde UYARI çıkar; kart seçilince kaybolur (uyarı nakde özgüdür)', async () => {
    mockRoutes({
      day: courierDay([
        courierStop(1, { boxes: [], payment: { dueAmountCents: 124_000, expectedMethod: 'cash', collectedAtDoorCents: null } }),
      ]),
    });

    await renderDelivery();

    expect(screen.getByTestId('courier-cash-warning')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('courier-method-card'));
    expect(screen.queryByTestId('courier-cash-warning')).toBeNull();
  });

  it('borç yoksa tahsilat paneli hiç çizilmez, "borç yok" bloğu çıkar', async () => {
    mockRoutes({ day: courierDay([settledStop()]) });

    await renderDelivery();

    expect(screen.queryByTestId('courier-collection')).toBeNull();
    expect(screen.getByTestId('courier-settled')).toBeOnTheScreen();
  });

  it('kapı kasası hesabı YOKSA sebep ekranda ve teslim kapısı KAPALI (para yazılmadan teslim yok)', async () => {
    // Gün cevabının `doorAccountId`si null — ayar boş; fixture'ın varsayılanı bu.
    mockRoutes({ day: courierDay([oneLineStop({ payment: { dueAmountCents: 4200, expectedMethod: 'cash', collectedAtDoorCents: null } })]) });

    await renderDelivery();

    expect(screen.getByTestId('courier-collection-blocked')).toHaveTextContent(/kapı kasası hesabı ayarlanmamış/);
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));
    expect(deliverCalls()).toBe(0);
  });

  it('hesap GELİNCE tahsilat gövdeye girer: tutar, yöntem, hesap ve istek kimliğiyle', async () => {
    await renderScannedStop(
      { payment: { dueAmountCents: 4200, expectedMethod: 'cash', collectedAtDoorCents: null } },
      { doorAccountId: DOOR_ACCOUNT_ID },
      { deliver: { ok: okDelivery({ collectedCents: 4200 }) } },
    );
    expect(screen.queryByTestId('courier-collection-blocked')).toBeNull();
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));

    await waitFor(() => expect(deliverCalls()).toBe(1));
    expect(deliverBody().collection).toEqual({
      method: 'cash',
      amountCents: 4200,
      accountId: DOOR_ACCOUNT_ID,
      // Anahtar İSTEĞİN kimliği: içeriği rastgele, varlığı sözleşme (para iki kez yazılmasın).
      idempotencyKey: expect.stringMatching(/^col-/) as unknown as string,
    });
  });

  it('borç varken tutar BOŞSA teslim yine gider ama düğme "tahsilat yazılmaz" der', async () => {
    await renderScannedStop(
      { payment: { dueAmountCents: 4200, expectedMethod: 'cash', collectedAtDoorCents: null } },
      { doorAccountId: DOOR_ACCOUNT_ID },
      { deliver: { ok: okDelivery({ amountDueCents: 4200, paymentStatus: 'pending' }) } },
    );
    await clearCollection();

    expect(screen.getByTestId('courier-delivery-cta')).toHaveTextContent(t.delivery.cta.deliverNoCollection);
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));

    await waitFor(() => expect(deliverCalls()).toBe(1));
    // Tahsilat DOĞMAZ (boş tutar "para almadım"dır) ve kalan borç sonuçta yazılır.
    expect(deliverBody().collection).toBeUndefined();
    /* Sonuç artık ekranda değil TOAST'ta ve ekran listeye dönüyor (kullanıcı kararı 30.08) —
       iddia da mesajın kendisinde: kalan borç kuryeye söyleniyor mu. */
    await waitFor(() => expect(lastToast.at(-1)).toMatch(/Kalan borç 42,00\s€/));
    // İş bitti: ekran listeye döner, kurye durakta takılı kalmaz.
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('teslimat · sonuç akışı (K5)', () => {
  it('İKİ ADIM: sonuç seçilir, sonra not + onay istenir', async () => {
    mockRoutes({ day: courierDay([settledStop()]) });

    await renderDelivery();
    expect(screen.queryByTestId('courier-outcome-sheet')).toBeNull();

    // Etiketler render AĞACINDA da ölçülür (23.08 arızasının dersi: cihazda metin görünmez
    // olmuştu ve jest süslemeyi göremez — bu satır en azından metnin ağaçtan düşmesini yakalar).
    expect(screen.getByTestId('courier-outcome-unreachable')).toHaveTextContent('Ulaşılamadı');
    expect(screen.getByTestId('courier-outcome-refused')).toHaveTextContent('Kabul etmedi');

    await fireEvent.press(screen.getByTestId('courier-outcome-unreachable'));

    expect(screen.getByTestId('courier-outcome-sheet')).toBeOnTheScreen();
    expect(screen.getByText(t.delivery.outcome.unreachableTitle)).toBeOnTheScreen();
    // Çipler HIZLANDIRICIDIR; serbest metin alanı da birlikte durur (doc 21, 21.8 kararı).
    expect(screen.getByTestId('courier-outcome-note')).toBeOnTheScreen();
  });

  it('NOT ZORUNLU: boş notla onay uca gitmez, alan hatası çıkar', async () => {
    mockRoutes({ day: courierDay([settledStop()]) });

    await renderDelivery();
    await fireEvent.press(screen.getByTestId('courier-outcome-refused'));
    await fireEvent.press(screen.getByTestId('courier-outcome-sheet-confirm'));

    expect(screen.getByTestId('courier-outcome-note-error')).toHaveTextContent(t.delivery.outcome.noteRequired);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/undelivered'))).toHaveLength(0);
  });

  it('çip notu doldurur ve onay uca `outcome` + `note` gönderir', async () => {
    await renderScannedStop({}, undefined, {
      undelivered: { ok: { status: 'ok', outcome: 'refused', currentStatus: 'returned' } },
    });
    await fireEvent.press(screen.getByTestId('courier-outcome-refused'));
    await fireEvent.press(screen.getByTestId('courier-outcome-chip-çok geç geldi'));
    await fireEvent.press(screen.getByTestId('courier-outcome-sheet-confirm'));

    await waitFor(() => expect(lastToast.at(-1)).toBe(t.delivery.result.refused));
    expect(mockBack).toHaveBeenCalled();
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/undelivered'));
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ outcome: 'refused', note: 'çok geç geldi' });
  });

  it('ucun `note_required` cevabı ALAN hatası olarak gösterilir', async () => {
    mockRoutes({
      day: courierDay([settledStop()]),
      undelivered: { error: { status: 400, key: 'note_required' } },
    });

    await renderDelivery();
    await fireEvent.press(screen.getByTestId('courier-outcome-unreachable'));
    await fireEvent.changeText(screen.getByTestId('courier-outcome-note'), 'zil bozuk');
    await fireEvent.press(screen.getByTestId('courier-outcome-sheet-confirm'));

    await waitFor(() => expect(screen.getByTestId('courier-outcome-note-error')).toBeOnTheScreen());
    expect(screen.queryByTestId('courier-delivery-notice')).toBeNull();
  });
});

describe('teslimat · kapının olumsuz cevapları EKRANDA', () => {
  it('`stale` yutulmaz: siparişin ŞU ANKİ durumu ve "ikilenmedi" cümlesi yazılır', async () => {
    await renderScannedStop({}, undefined, { deliver: { ok: { status: 'stale', currentStatus: 'cancelled' } } });
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));

    await waitFor(() => expect(screen.getByTestId('courier-delivery-notice')).toBeOnTheScreen());
    const notice = screen.getByTestId('courier-delivery-notice');
    expect(notice).toHaveTextContent(/"İptal" durumunda/);
    expect(notice).toHaveTextContent(/İKİLENMEDİ/);
    // Ekran SONUÇ ekranına dönmez: kurye tekrar deneyebilmeli.
    expect(screen.getByTestId('courier-delivery-cta')).toBeOnTheScreen();
  });

  it('`proof_required` kanalıyla birlikte ve "hiçbir kayıt yazılmadı" diye gösterilir', async () => {
    await renderScannedStop({}, undefined, { deliver: { ok: { status: 'proof_required', channel: 'b2b' } } });
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('courier-delivery-notice')).toHaveTextContent(/\(B2B\).*HİÇBİR kayıt yazılmadı/),
    );
  });

  it('`forbidden: not_assigned` başkasının durağı olduğunu söyler', async () => {
    await renderScannedStop({}, undefined, { deliver: { ok: { status: 'forbidden', reason: 'not_assigned' } } });
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('courier-delivery-notice')).toHaveTextContent(t.delivery.refusal.notAssigned),
    );
  });

  it('bağlantı yokken kuyruk YOKTUR: "gönderilemedi" dürüstçe yazılır', async () => {
    await renderScannedStop();

    fetchMock.mockImplementation(() => Promise.reject(new Error('ağ yok')));
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('courier-delivery-notice')).toHaveTextContent(/Bağlantı yok.*kuyruk YOK/),
    );
  });

  it('`deduped` tahsilatın İKİLENMEDİĞİNİ söyler ve ekran listeye döner', async () => {
    await renderScannedStop({}, undefined, { deliver: { ok: okDelivery({ collectedCents: 4200, collectionDeduped: true }) } });
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));

    /* "İkilenmedi" bilgisi YUTULMAZ ama artık ekranda tutulmuyor: iş bitti, mesaj toast'a çıkıyor
       ve kurye listeye dönüyor (kullanıcı kararı 30.08). */
    await waitFor(() => expect(lastToast.at(-1)).toMatch(/para İKİLENMEDİ/));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('kutu okutması (23.8 — teslimin ön koşulu)', () => {
  it('kutulu durakta teslim kutular okutulmadan KİLİTLİ; okutuldukça sayaç ilerler, kilit açılır', async () => {
    mockRoutes({ day: courierDay([boxedStop()]) });
    await renderDelivery();

    expect(screen.getByTestId('courier-boxes-heading')).toHaveTextContent(/0\/2 OKUTULDU/);
    /* KUTULAR OKUTULMADAN SONRAKİ ADIMLAR AÇILMAZ (v3:17 · 30.08). Kalem satırına dokunmak bile
       geçmez: bölüm görünür ama dokunulmaz. Teslim düğmesi de kapalı. */
    expect(screen.getByTestId('courier-delivery-cta')).toBeDisabled();

    // Çipler durağın GERÇEK kodlarından kurulur (devCodes) — ikisi de okutulur.
    await fireEvent.press(screen.getByTestId('courier-box-scan'));
    await fireEvent.press(screen.getByLabelText('Kutu 1'));
    await waitFor(() => expect(screen.getByTestId('courier-boxes-heading')).toHaveTextContent(/1\/2 OKUTULDU/));
    /* Satır artık kutunun KODUNU yazıyor (v3:17 · 30.08): "Kutu 1" kuryenin elindeki kartonla
       eşleşmiyordu — kartonun üstünde `KT-26-…` yazıyor. Okutulan satır "verildi"ye dönüyor. */
    expect(screen.getByTestId('courier-box-1')).toHaveTextContent(/KT-26-AAAAAAAAAA/);
    expect(screen.getByTestId('courier-box-1')).toHaveTextContent(/verildi/);
    expect(screen.getByTestId('courier-delivery-cta')).toBeDisabled();

    await fireEvent.press(screen.getByTestId('courier-box-scan'));
    await fireEvent.press(screen.getByLabelText('Kutu 2'));
    await waitFor(() => expect(screen.getByTestId('courier-boxes-heading')).toHaveTextContent(/2\/2 OKUTULDU/));
    // Kilit açıldı: kalem ARTIK işaretlenebiliyor ve teslim düğmesi de açık.
    expect(screen.getByTestId('courier-delivery-cta')).not.toBeDisabled();
  });

  it('teslim isteği okutulan kodları taşır — kapı sunucuda bir kez daha doğrular', async () => {
    mockRoutes({ day: courierDay([boxedStop()]) });
    await renderDelivery();

    // Sıra tasarımın sırası: ÖNCE kutular, sonra kalem — kilit tersini yaptırmıyor.
    for (const label of ['Kutu 1', 'Kutu 2']) {
      await fireEvent.press(screen.getByTestId('courier-box-scan'));
      await fireEvent.press(screen.getByLabelText(label));
    }
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));

    await waitFor(() => expect(deliverCalls()).toBe(1));
    expect(deliverBody()).toMatchObject({ scannedBoxCodes: ['KT-26-AAAAAAAAAA', 'KT-26-BBBBBBBBBB'] });
  });

  /*
    KUTUSUZ DURAK ARTIK BİR ARIZADIR (kullanıcı kararı 30.08). Eski test "kutu bölümü HİÇ çizilmez
    ve teslim kutusuz yazılır (eski akış aynen)" diyordu — o akış kapandı: mal kutusuyla hazırlanır,
    kutusuyla araca biner, kutusuyla kapıdan çıkar. Ekran kutusuz durağı normal saymaz, ADINI KOYAR.
  */
  it('kutusuz durak ARIZA olarak çizilir — sessizce atlanmaz', async () => {
    mockRoutes({ day: courierDay([oneLineStop()]) });
    await renderDelivery();

    expect(screen.getByTestId('courier-boxes-heading')).toBeOnTheScreen();
    expect(screen.getByTestId('courier-boxes-missing')).toHaveTextContent(/Bu durağın kutusu yok/);
  });
});

describe('adım numarası (v3 · 30.08)', () => {
  /*
    Numaralar metne GÖMÜLÜ değil artık; kutulu durakta akış dört adım, kutusuzda üç. Ölçülen şey
    numaranın kendisi: gömülü olduğu sürece kutular numarasız duruyordu ve kurye kapıdaki zorunlu
    ilk kapıyı adımdan saymıyordu.
  */
  it('kutulu durakta kutular 1., mal 2., tahsilat 3. adımdır', async () => {
    mockRoutes({
      day: courierDay([boxedStop({ payment: { dueAmountCents: 4200, expectedMethod: 'cash', collectedAtDoorCents: null } })]),
    });
    await renderDelivery();

    /* Numara artık METİNDE DEĞİL, kendi daire rozetinde (v3:17 · 30.08) — iddia da başlık
       SATIRININ tamamında: rozet ile ad yan yana okunuyor. */
    expect(screen.getByTestId('courier-boxes-heading')).toHaveTextContent(/^1KUTULAR/);
    // KANIT ADIMI YOK (30.08): imza söküldü, kanıt kutu okutmasının kendisi.
    expect(screen.queryByTestId('courier-proof-heading')).toBeNull();
    expect(screen.getByText(/^MAL — /)).toBeOnTheScreen();
    expect(screen.getByText(/^TAHSİLAT — /)).toBeOnTheScreen();
  });

  it('kutusuz durakta numaralar kayar — mal 1., tahsilat 2.', async () => {
    mockRoutes({
      day: courierDay([oneLineStop({ payment: { dueAmountCents: 4200, expectedMethod: 'cash', collectedAtDoorCents: null } })]),
    });
    await renderDelivery();

    expect(screen.queryByTestId('courier-proof-heading')).toBeNull();
    expect(screen.getByText(/^MAL — /)).toBeOnTheScreen();
    expect(screen.getByText(/^TAHSİLAT — /)).toBeOnTheScreen();
  });

  it('okutma düğmesi KALAN sayısını taşır ve durum cümlesi tamamlanınca değişir', async () => {
    mockRoutes({ day: courierDay([boxedStop()]) });
    await renderDelivery();

    expect(screen.getByTestId('courier-box-scan')).toHaveTextContent(/2 kaldı/);
    expect(screen.getByText(/dönüş dökümüne/)).toBeOnTheScreen();

    for (const label of ['Kutu 1', 'Kutu 2']) {
      await fireEvent.press(screen.getByTestId('courier-box-scan'));
      await fireEvent.press(screen.getByLabelText(label));
    }

    // Hepsi okutulunca düğme HİÇ çizilmez: basılacak bir şey kalmadı.
    await waitFor(() => expect(screen.queryByTestId('courier-box-scan')).toBeNull());
    expect(screen.getByText(/Tüm kutular müşteriye verildi/)).toBeOnTheScreen();
  });
});

describe('kapı notunun sırası (30.08)', () => {
  /* Numaralar görünür olunca not ile başlık ayrışabilir hâle geldi: ekran "1 · KUTULAR" derken
     not sırayı "kanıt"tan başlatırsa, kurye iki farklı sıra okur. */
  it('kutulu durakta sıra cümlesi kutuları da sayar', async () => {
    mockRoutes({ day: courierDay([boxedStop()]) });
    await renderDelivery();

    expect(screen.getByTestId('courier-delivery-gate')).toHaveTextContent(/Sıra: kutular → mal → tahsilat/);
  });

  /* KUTUSUZ DURAK ARTIK KAPIYI AÇMAZ (30.08): mal kutusuyla çıkar; kutusuz bir durak veri
     hatasıdır ve sunucu da onu reddediyor. Ekranın kapıyı açık göstermesi, kuryeyi reddedilecek
     bir isteğe göndermek olurdu. */
  it('kutusuz durakta teslim kapısı KAPALI ve sebebi kutuların yokluğudur', async () => {
    mockRoutes({ day: courierDay([oneLineStop()]) });
    await renderDelivery();

    expect(screen.getByTestId('courier-delivery-gate')).toHaveTextContent(t.delivery.cta.notLoaded);
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));
    expect(deliverCalls()).toBe(0);
  });

  /*
    ARAÇA BİNMEMİŞ DURAK KAPIDA AÇILMAZ (kullanıcı bulgusu 30.08 · cihazda yakalandı).
    Kutuları rampada okutulmamış sipariş `ready` kalır; ekran eskiden teslim düğmesini etkin
    gösteriyor, uç `stale` diyor ve kuryeye *"bu durak başkası tarafından kapatılmış olabilir"*
    yazıyordu — durağı kimse kapatmamıştı, mal araçta değildi.
  */
  it('kutuları araca binmemiş durakta kapı KAPALI ve sebep doğru yazılır', async () => {
    mockRoutes({
      day: courierDay([
        boxedStop({
          boxes: [
            { boxNo: 1, code: 'KT-26-AAAAAAAAAA', loadedAt: null },
            { boxNo: 2, code: 'KT-26-BBBBBBBBBB', loadedAt: null },
          ],
        }),
      ]),
    });
    await renderDelivery();

    expect(screen.getByTestId('courier-delivery-gate')).toHaveTextContent(t.delivery.cta.notLoaded);
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));
    expect(deliverCalls()).toBe(0);
  });
});
