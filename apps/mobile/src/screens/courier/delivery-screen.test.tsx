import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { CourierDeliveryScreen } from './delivery-screen';
import { courierDay, courierStop } from './courier-fixture';
import messages from './messages.json';

/*
  TESLİMAT EKRANI — kanıt kapısı, kalem üç hâli, tahsilat paneli, iki adımlı sonuç akışı ve kapının
  olumsuz cevaplarının EKRANDA görünmesi.

  Hook taklit EDİLMEZ (katalog/K1 emsali): gerçek hook + taklit `fetch`. Yalnız İKİ şey taklit
  edilir ve ikisi de yerel (native) sınırdır:
  · `expo-router` — navigasyon bağlamı yok
  · `./signature-capture` — `toDataURL` bir yerel çağrıdır ve Jest'te geri çağrıyı hiç çalıştırmaz;
    taklidi olmadan imza akışının testi asılı kalırdı (o dosyanın kendi künyesi).
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

// Yerel yakalama: testte her zaman geçerli bir PNG başlığı döner (base64 çözümü ayrıca ölçülüyor).
jest.mock('./signature-capture', () => ({ captureSignaturePng: async () => 'iVBORw0KGgo=' }));

const t = messages;
const ORDER_ID = '00000000-0000-4000-8000-000000000001';

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

/** Uç başına cevap kurar; kova PUT'u (imzalı adres) her zaman başarılı sayılır. */
function mockRoutes(routes: { day: unknown; deliver?: Route; undelivered?: Route; proof?: Route }) {
  fetchMock.mockImplementation((url) => {
    const address = String(url);
    if (address.startsWith('https://bucket.test')) return Promise.resolve({ ok: true } as unknown as Response);
    if (address.includes('/proof-upload')) {
      const route = routes.proof ?? { ok: { ok: true, key: 'delivery/proofs/x/sig.png', uploadUrl: 'https://bucket.test/put' } };
      return Promise.resolve(route.error ? errorEnvelope(route.error.status, route.error.key) : envelope(route.ok));
    }
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
const settledStop = (overrides = {}) =>
  courierStop(1, { payment: { dueAmountCents: null, expectedMethod: null }, ...overrides });

async function renderDelivery() {
  await render(<CourierDeliveryScreen orderId={ORDER_ID} />);
  await waitFor(() => expect(screen.getByTestId('courier-delivery-body')).toBeOnTheScreen());
}

/**
 * İmza tuvaline tek bir çizgi çizer.
 *
 * Tuval önce ÖLÇÜLMELİ (`onLayout`): `viewBox` gerçek ölçüyle birebir olsun diye komponent ölçü
 * gelmeden `<Svg>`yi hiç çizmiyor. Ardından `PanResponder`'ın kavrama olayı geliyor; olay nesnesi
 * `touchHistory` taşımak ZORUNDA — RN'in jest ortamında dokunma geçmişi yok ve `PanResponder`
 * merkezi (`centroid`) ondan hesaplıyor.
 */
async function drawSignature() {
  await fireEvent(screen.getByTestId('courier-signature-canvas'), 'layout', {
    nativeEvent: { layout: { width: 300, height: 110 } },
  });
  await fireEvent(screen.getByTestId('courier-signature-canvas'), 'responderGrant', {
    nativeEvent: { locationX: 10, locationY: 20, touches: [], changedTouches: [], identifier: 1, timestamp: 0 },
    touchHistory: { touchBank: [], numberActiveTouches: 0, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: 0 },
  });
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockBack.mockReset();
});

describe('teslimat · durak künyesi', () => {
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

describe('teslimat · kalem işaretleri', () => {
  it('kalem ÜÇ HÂLLİDİR: işaretsiz → teslim → reddedildi → işaretsiz', async () => {
    mockRoutes({ day: courierDay([settledStop()]) });

    await renderDelivery();
    const line = screen.getByTestId('courier-line-line-0');

    await fireEvent.press(line);
    expect(screen.getByRole('button', { name: '2 × Fıstıklı Baklava', selected: true })).toBeOnTheScreen();
    await fireEvent.press(line);
    // Reddedilen çok adetli kalemde iade adedi satırı açılır (v2:155).
    expect(screen.getByTestId('courier-line-return-line-0')).toBeOnTheScreen();
    expect(screen.getByText('2/2')).toBeOnTheScreen();
    await fireEvent.press(line);
    expect(screen.queryByTestId('courier-line-return-line-0')).toBeNull();
  });

  it('iade adedi 1 ile kalem adedi arasında kalır', async () => {
    mockRoutes({ day: courierDay([settledStop()]) });

    await renderDelivery();
    await fireEvent.press(screen.getByTestId('courier-line-line-0'));
    await fireEvent.press(screen.getByTestId('courier-line-line-0'));

    await fireEvent.press(screen.getByTestId('courier-line-return-minus-line-0'));
    expect(screen.getByText('1/2')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('courier-line-return-minus-line-0'));
    expect(screen.getByText('1/2')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('courier-line-return-plus-line-0'));
    await fireEvent.press(screen.getByTestId('courier-line-return-plus-line-0'));
    expect(screen.getByText('2/2')).toBeOnTheScreen();
  });

  it('her kalem işaretlenmeden teslim kapısı açılmaz', async () => {
    mockRoutes({ day: courierDay([settledStop()]) });

    await renderDelivery();

    expect(screen.getByTestId('courier-delivery-gate')).toHaveTextContent(/her kalemi işaretle/);
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/deliver'))).toHaveLength(0);
  });

  it('TÜMÜ reddedildiğinde teslim kapatılır ve "Kabul etmedi"ye yönlendirilir', async () => {
    mockRoutes({ day: courierDay([settledStop({ contentSummary: '1 × Mantı', itemCount: 1 })]) });

    await renderDelivery();
    await fireEvent.press(screen.getByTestId('courier-line-line-0'));
    await fireEvent.press(screen.getByTestId('courier-line-line-0'));

    expect(screen.getByText(t.delivery.cta.allRefused)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/deliver'))).toHaveLength(0);
  });

  it('KISMİ red uca gönderilemiyor — sebep ekranda yazılı ve kapı kapalı', async () => {
    mockRoutes({ day: courierDay([settledStop({ contentSummary: '1 × A, 1 × B', itemCount: 2 })]) });

    await renderDelivery();
    await fireEvent.press(screen.getByTestId('courier-line-line-0'));
    await fireEvent.press(screen.getByTestId('courier-line-line-1'));
    await fireEvent.press(screen.getByTestId('courier-line-line-1'));

    expect(screen.getByTestId('courier-partial-note')).toBeOnTheScreen();
    expect(screen.getByTestId('courier-delivery-gate')).toHaveTextContent(/kalem kimliği taşımıyor/);
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/deliver'))).toHaveLength(0);
  });

  it('özete sığmayan kalemler GÖRÜNÜR sayılır ve kapıyı kilitlemez', async () => {
    mockRoutes({ day: courierDay([settledStop({ contentSummary: '1 × A +3', itemCount: 4 })]) });

    await renderDelivery();
    expect(screen.getByTestId('courier-lines-hidden')).toHaveTextContent(/\+3 kalem daha/);

    await fireEvent.press(screen.getByTestId('courier-line-line-0'));
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));

    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/deliver'))).toHaveLength(1),
    );
  });
});

describe('teslimat · kanıt kapısı', () => {
  it('B2B durağında kanıt ZORUNLU: imzasız teslim kapısı kapalı', async () => {
    mockRoutes({ day: courierDay([settledStop({ channel: 'b2b', contentSummary: '1 × A', itemCount: 1 })]) });

    await renderDelivery();
    expect(screen.getByTestId('courier-proof-heading')).toHaveTextContent(/B2B'DE ZORUNLU/);
    await fireEvent.press(screen.getByTestId('courier-line-line-0'));

    expect(screen.getByTestId('courier-delivery-gate')).toHaveTextContent(/kanıt eksik/);
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/deliver'))).toHaveLength(0);
  });

  it('B2C durağında kanıt İSTEĞE BAĞLI: imzasız teslim gönderilir', async () => {
    mockRoutes({ day: courierDay([settledStop({ contentSummary: '1 × A', itemCount: 1 })]) });

    await renderDelivery();
    expect(screen.getByTestId('courier-proof-heading')).toHaveTextContent(/İSTEĞE BAĞLI \(AYAR\)/);
    await fireEvent.press(screen.getByTestId('courier-line-line-0'));
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));

    await waitFor(() => expect(screen.getByTestId('courier-delivery-notice')).toBeOnTheScreen());
    const body = fetchMock.mock.calls.find(([url]) => String(url).includes('/deliver'))?.[1]?.body;
    expect(JSON.parse(String(body))).toEqual({});
  });

  it('imza alınınca kanıt YÜKLENİR ve teslim gövdesine anahtarıyla girer', async () => {
    mockRoutes({ day: courierDay([settledStop({ channel: 'b2b', contentSummary: '1 × A', itemCount: 1 })]) });

    await renderDelivery();
    await fireEvent.press(screen.getByTestId('courier-proof-sign'));
    await drawSignature();

    await fireEvent.press(screen.getByTestId('courier-signature-confirm'));

    await waitFor(() => expect(screen.getByTestId('courier-proof-taken')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('courier-line-line-0'));
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));

    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/deliver'))).toHaveLength(1),
    );
    const body = JSON.parse(String(fetchMock.mock.calls.find(([url]) => String(url).includes('/deliver'))?.[1]?.body));
    expect(body.proof).toEqual({ kind: 'signature', imageKey: 'delivery/proofs/x/sig.png', receivedBy: 'Müşteri 1' });
  });

  it('kova yapılandırılmamışsa kanıt "alındı" GÖSTERİLMEZ, sebep yazılır', async () => {
    mockRoutes({
      day: courierDay([settledStop({ channel: 'b2b' })]),
      proof: { ok: { ok: false, reason: 'storage_unavailable' } },
    });

    await renderDelivery();
    await fireEvent.press(screen.getByTestId('courier-proof-sign'));
    await drawSignature();
    await fireEvent.press(screen.getByTestId('courier-signature-confirm'));

    await waitFor(() => expect(screen.getByText(t.delivery.proof.refusal.storage_unavailable)).toBeOnTheScreen());
    expect(screen.queryByTestId('courier-proof-taken')).toBeNull();
  });

  it('fotoğraf kanıtı ÇİZİLİ ama kapalı ve sebebi yazılı (kamera modülü yok)', async () => {
    mockRoutes({ day: courierDay([settledStop()]) });

    await renderDelivery();

    expect(screen.getByText(t.delivery.proof.photo)).toBeOnTheScreen();
    expect(screen.getByTestId('courier-proof-photo-unavailable')).toBeOnTheScreen();
  });
});

describe('teslimat · tahsilat', () => {
  it('alan MOTORUN tutarıyla açılır, yöntem beklenenden seçilir', async () => {
    mockRoutes({ day: courierDay([courierStop(1)]) });

    await renderDelivery();

    expect(screen.getByTestId('courier-collection-amount').props.value).toBe('42,00');
    expect(screen.getByRole('button', { name: 'nakit', selected: true })).toBeOnTheScreen();
  });

  it('doğrudan giriş ve ± adımı tutarı değiştirir; CTA tutarı yazar', async () => {
    mockRoutes({ day: courierDay([courierStop(1)]) });

    await renderDelivery();
    await fireEvent.changeText(screen.getByTestId('courier-collection-amount'), '30,00');
    expect(screen.getByTestId('courier-delivery-cta')).toHaveTextContent(/30,00/);

    await fireEvent.press(screen.getByTestId('courier-collection-plus'));
    expect(screen.getByTestId('courier-collection-amount').props.value).toBe('31,00');
    await fireEvent.press(screen.getByTestId('courier-collection-minus'));
    await fireEvent.press(screen.getByTestId('courier-collection-minus'));
    expect(screen.getByTestId('courier-collection-amount').props.value).toBe('29,00');
  });

  it('eksik ödemede KISMİ rozeti çıkar; tam ödemede çıkmaz', async () => {
    mockRoutes({ day: courierDay([courierStop(1)]) });

    await renderDelivery();
    expect(screen.queryByTestId('courier-collection-partial')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('courier-collection-amount'), '30,00');
    expect(screen.getByTestId('courier-collection-partial')).toHaveTextContent(t.delivery.collection.partial);
  });

  it('nakit yasal sınırın üstünde UYARI çıkar; kart seçilince kaybolur (uyarı nakde özgüdür)', async () => {
    mockRoutes({ day: courierDay([courierStop(1, { payment: { dueAmountCents: 124_000, expectedMethod: 'cash' } })]) });

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

  it('tahsilat uca yazılamıyor: sebep ekranda ve teslim kapısı KAPALI (para yazılmadan teslim yok)', async () => {
    mockRoutes({ day: courierDay([courierStop(1, { contentSummary: '1 × A', itemCount: 1 })]) });

    await renderDelivery();
    await fireEvent.press(screen.getByTestId('courier-line-line-0'));

    expect(screen.getByTestId('courier-collection-blocked')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/deliver'))).toHaveLength(0);
  });
});

describe('teslimat · sonuç akışı (K5)', () => {
  it('İKİ ADIM: sonuç seçilir, sonra not + onay istenir', async () => {
    mockRoutes({ day: courierDay([settledStop()]) });

    await renderDelivery();
    expect(screen.queryByTestId('courier-outcome-panel')).toBeNull();

    await fireEvent.press(screen.getByTestId('courier-outcome-unreachable'));

    expect(screen.getByTestId('courier-outcome-panel')).toBeOnTheScreen();
    expect(screen.getByText(t.delivery.outcome.unreachableTitle)).toBeOnTheScreen();
    // Çipler HIZLANDIRICIDIR; serbest metin alanı da birlikte durur (doc 21, 21.8 kararı).
    expect(screen.getByTestId('courier-outcome-note')).toBeOnTheScreen();
  });

  it('NOT ZORUNLU: boş notla onay uca gitmez, alan hatası çıkar', async () => {
    mockRoutes({ day: courierDay([settledStop()]) });

    await renderDelivery();
    await fireEvent.press(screen.getByTestId('courier-outcome-refused'));
    await fireEvent.press(screen.getByTestId('courier-outcome-confirm'));

    expect(screen.getByTestId('courier-outcome-note-error')).toHaveTextContent(t.delivery.outcome.noteRequired);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/undelivered'))).toHaveLength(0);
  });

  it('çip notu doldurur ve onay uca `outcome` + `note` gönderir', async () => {
    mockRoutes({
      day: courierDay([settledStop()]),
      undelivered: { ok: { status: 'ok', outcome: 'refused', currentStatus: 'returned' } },
    });

    await renderDelivery();
    await fireEvent.press(screen.getByTestId('courier-outcome-refused'));
    await fireEvent.press(screen.getByTestId('courier-outcome-chip-çok geç geldi'));
    await fireEvent.press(screen.getByTestId('courier-outcome-confirm'));

    await waitFor(() => expect(screen.getByTestId('courier-delivery-notice')).toHaveTextContent(t.delivery.result.refused));
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
    await fireEvent.press(screen.getByTestId('courier-outcome-confirm'));

    await waitFor(() => expect(screen.getByTestId('courier-outcome-note-error')).toBeOnTheScreen());
    expect(screen.queryByTestId('courier-delivery-notice')).toBeNull();
  });
});

describe('teslimat · kapının olumsuz cevapları EKRANDA', () => {
  it('`stale` yutulmaz: siparişin ŞU ANKİ durumu ve "ikilenmedi" cümlesi yazılır', async () => {
    mockRoutes({
      day: courierDay([settledStop({ contentSummary: '1 × A', itemCount: 1 })]),
      deliver: { ok: { status: 'stale', currentStatus: 'cancelled' } },
    });

    await renderDelivery();
    await fireEvent.press(screen.getByTestId('courier-line-line-0'));
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));

    await waitFor(() => expect(screen.getByTestId('courier-delivery-notice')).toBeOnTheScreen());
    const notice = screen.getByTestId('courier-delivery-notice');
    expect(notice).toHaveTextContent(/"İptal" durumunda/);
    expect(notice).toHaveTextContent(/İKİLENMEDİ/);
    // Ekran SONUÇ ekranına dönmez: kurye tekrar deneyebilmeli.
    expect(screen.getByTestId('courier-delivery-cta')).toBeOnTheScreen();
  });

  it('`proof_required` kanalıyla birlikte ve "hiçbir kayıt yazılmadı" diye gösterilir', async () => {
    mockRoutes({
      day: courierDay([settledStop({ contentSummary: '1 × A', itemCount: 1 })]),
      deliver: { ok: { status: 'proof_required', channel: 'b2b' } },
    });

    await renderDelivery();
    await fireEvent.press(screen.getByTestId('courier-line-line-0'));
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('courier-delivery-notice')).toHaveTextContent(/\(B2B\).*HİÇBİR kayıt yazılmadı/),
    );
  });

  it('`forbidden: not_assigned` başkasının durağı olduğunu söyler', async () => {
    mockRoutes({
      day: courierDay([settledStop({ contentSummary: '1 × A', itemCount: 1 })]),
      deliver: { ok: { status: 'forbidden', reason: 'not_assigned' } },
    });

    await renderDelivery();
    await fireEvent.press(screen.getByTestId('courier-line-line-0'));
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('courier-delivery-notice')).toHaveTextContent(t.delivery.refusal.notAssigned),
    );
  });

  it('bağlantı yokken kuyruk YOKTUR: "gönderilemedi" dürüstçe yazılır', async () => {
    mockRoutes({ day: courierDay([settledStop({ contentSummary: '1 × A', itemCount: 1 })]) });
    await renderDelivery();
    await fireEvent.press(screen.getByTestId('courier-line-line-0'));

    fetchMock.mockImplementation(() => Promise.reject(new Error('ağ yok')));
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('courier-delivery-notice')).toHaveTextContent(/Bağlantı yok.*kuyruk YOK/),
    );
  });

  it('`deduped` tahsilatın İKİLENMEDİĞİNİ söyler ve teslim sonuca döner', async () => {
    mockRoutes({
      day: courierDay([settledStop({ contentSummary: '1 × A', itemCount: 1 })]),
      deliver: { ok: okDelivery({ collectedCents: 4200, collectionDeduped: true }) },
    });

    await renderDelivery();
    await fireEvent.press(screen.getByTestId('courier-line-line-0'));
    await fireEvent.press(screen.getByTestId('courier-delivery-cta'));

    await waitFor(() => expect(screen.getByTestId('courier-delivery-done')).toBeOnTheScreen());
    expect(screen.getByTestId('courier-delivery-notice')).toHaveTextContent(/para İKİLENMEDİ/);
    await fireEvent.press(screen.getByTestId('courier-delivery-done'));
    expect(mockBack).toHaveBeenCalled();
  });
});
