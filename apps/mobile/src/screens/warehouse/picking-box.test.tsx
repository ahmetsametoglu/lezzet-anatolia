import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { PreparationScreen } from './preparation-screen';
import { ITEM_A, STOCK_A, preparationBox, preparationLine, preparationOrder } from './warehouse-fixture';
import { resetWarehouseStatus } from './warehouse-status';

/*
  D1 · KUTU DÖNGÜSÜ (23.6, karar §1.4) — beş iddia:

  · taze sipariş kutu moduyla açılır: CTA "Kutu aç", basınca kutu SUNUCUDA doğar ve kuyruk yeniden
    okunur (yerel taklit yok)
  · okutulan kod satıra ÇARPAN kadar ekler ama tavan MOTORUN kapasitesidir; siparişte olmayan ürün
    ANINDA reddedilir ve hiçbir satıra düşmez
  · kapanış BU kutunun dağılımını gönderir (kümülatif değil — birleşim sunucuda) ve `ready`
    cümlesini yazar
  · eksikli kapanış "yeni kutu" yolunu açar: kapalı kutu özetlenir, CTA "Yeni kutu aç (Kutu 2)"
  · kutusuz BAŞLANMIŞ iş (web masasından yarım) kutu moduna GİRMEZ — eski akış aynen
    (`preparation-screen.test.tsx` onu ölçüyor)

  Kod kaynağı simülasyon havuzu çipi (ScanSheet testi iki kaynağın aynı teslim noktasından
  geçtiğini ölçüyor); ağ fetch seviyesinde sahte, URL'e göre dallanır.
*/

jest.mock('expo-router', () => {
  const react = jest.requireActual<{ useEffect: (effect: () => void, deps: unknown[]) => void }>('react');
  return {
    useRouter: () => ({ navigate: jest.fn(), back: jest.fn() }),
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

/**
 * Basım dikişi sahte (23.7): jest'te native modül yok — `available` bayrağı testin anahtarı.
 * `printLabel`/`downloadLabelPng` modül seviyesinde mock'lanır; PrintProbe'un kullandığı öteki
 * ihracatlar da (arama/iğne deneyi) boş sahtelerle taşınır ki import kırılmasın.
 */
const mockPrinterModule = { available: false };
jest.mock('@/lib/print/printer-availability', () => ({
  hasPrinterNativeModule: () => mockPrinterModule.available,
}));
const mockPrintLabel = jest.fn<Promise<void>, [string, unknown]>(async () => undefined);
jest.mock('@/lib/print/brother', () => ({
  printLabel: (uri: string, printer: unknown) => mockPrintLabel(uri, printer),
  findNetworkPrinters: jest.fn(async () => []),
  printNeedleTest: jest.fn(async () => 'RollW62'),
}));
jest.mock('@/lib/print/label-file', () => ({
  downloadLabelPng: async (boxId: string) => `file:///cache/box-label-${boxId}.png`,
}));

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

interface Net {
  /** Kuyruğun O ANKİ hâli — açılış/kapanış sonrası `load()` bunu yeniden okur, test aralarda değiştirir. */
  orders: unknown[];
  open?: unknown;
  seal?: unknown;
  resolve?: unknown;
  label?: unknown;
}

const net: Net = { orders: [] };

fetchMock.mockImplementation((url, init) => {
  const path = String(url);
  if (path.includes('/codes/resolve')) return Promise.resolve(ok(net.resolve));
  if (path.endsWith('/seal')) return Promise.resolve(ok(net.seal));
  if (path.endsWith('/label')) return Promise.resolve(ok(net.label ?? { status: 'not_found' }));
  if (path.endsWith('/printed')) return Promise.resolve(ok({ status: 'ok', printedAt: '2026-08-22T20:00:00Z' }));
  if (init?.method === 'POST' && path.endsWith('/boxes')) return Promise.resolve(ok(net.open));
  if (init?.method === 'POST') throw new Error(`beklenmeyen POST: ${path}`);
  return Promise.resolve(ok({ date: null, orders: net.orders }));
});

/** Son POST'un gövdesi — "ne gönderdik" sorusunun tek dürüst cevabı. */
function lastBodyOf(suffix: string): Record<string, unknown> {
  const call = fetchMock.mock.calls.findLast((entry) => String(entry[0]).endsWith(suffix));
  return JSON.parse(String(call?.[1]?.body ?? '{}'));
}

async function renderPicking() {
  await render(<PreparationScreen />);
  await waitFor(() => expect(screen.queryByTestId('warehouse-picking-loading')).toBeNull());
}

async function scanChip(label: string) {
  await fireEvent.press(screen.getByTestId('warehouse-picking-scan'));
  await fireEvent.press(screen.getByLabelText(label));
  await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/codes/resolve'))).toBe(true));
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockClear();
  resetWarehouseStatus();
  net.orders = [];
  net.open = undefined;
  net.seal = undefined;
  net.resolve = undefined;
  net.label = undefined;
  mockPrinterModule.available = false;
  mockPrintLabel.mockClear();
  mockPrintLabel.mockImplementation(async () => undefined);
});

describe('D1 · kutu döngüsü', () => {
  it('taze sipariş "Kutu aç" ile başlar; kutu sunucuda doğar ve ekran açık kutuyu gösterir', async () => {
    net.orders = [preparationOrder()];
    net.open = { status: 'ok', box: preparationBox() };
    await renderPicking();

    const cta = screen.getByTestId('warehouse-picking-cta');
    expect(cta).toHaveTextContent(/Kutu aç/);
    expect(cta).not.toBeDisabled();

    // Açılış cevabından SONRA kuyruk yeniden okunacak — o okuma kutulu hâli getirsin.
    net.orders = [preparationOrder({ boxes: [preparationBox()] })];
    await fireEvent.press(cta);

    await waitFor(() => expect(screen.getByTestId('warehouse-picking-box-open')).toHaveTextContent(/KUTU 1/));
    expect(screen.getByTestId('warehouse-picking-scan')).toBeOnTheScreen();
    // Boş kutu kapanmaz: içerik girilene dek CTA kilitli.
    expect(screen.getByTestId('warehouse-picking-cta')).toBeDisabled();
  });

  it('okutulan koli ÇARPAN kadar ekler ama tavan motorun kapasitesidir; yabancı ürün kutuya girmez', async () => {
    net.orders = [preparationOrder({ boxes: [preparationBox()] })];
    const line = preparationLine();
    // Koli 6'lık ama motor 2 ayırabilmiş: 2 eklenir — rafta olmayan mal okutmayla da yazılamaz.
    net.resolve = {
      status: 'found', variantId: line.variantId, productName: line.productName,
      variantLabel: line.variantLabel, kind: 'case', qtyPerCode: 6, source: 'barcode', imageUrl: null,
    };
    await renderPicking();

    await scanChip('Paket barkodu');
    await waitFor(() => expect(String(screen.getByTestId(`warehouse-picking-qty-${ITEM_A}`).props.value)).toBe('2'));
    expect(screen.getByTestId('warehouse-picking-notice')).toHaveTextContent(/\+2 adet kutuda/);

    // Siparişte olmayan ürün: ANINDA durdurulur, hiçbir satıra düşmez (tasarım: "bu siparişte yok").
    net.resolve = {
      status: 'found', variantId: '00000000-0000-4000-8000-000000000077', productName: 'Sahlep',
      variantLabel: '250 g', kind: 'unit', qtyPerCode: 1, source: 'barcode', imageUrl: null,
    };
    await scanChip('Paket barkodu');
    await waitFor(() => expect(screen.getByTestId('warehouse-picking-notice')).toHaveTextContent(/bu siparişte yok/));
    expect(String(screen.getByTestId(`warehouse-picking-qty-${ITEM_A}`).props.value)).toBe('2');
  });

  it('kapanış BU kutunun dağılımını gönderir, `ready` cümlesini ve ETİKET önizlemesini yazar', async () => {
    net.orders = [preparationOrder({ boxes: [preparationBox()] })];
    net.seal = { status: 'ok', boxNo: 1, ready: true, missing: [], shortfalls: [] };
    // Etiket içeriği SUNUCUDAN (23.7) — tutar alanı yok, sözleşme taşımıyor.
    net.label = {
      status: 'ok',
      label: {
        code: 'KT-26-4K2M9P7HWX', boxNo: 1, boxCount: 1, referenceNo: 'LZA-26-3M8C',
        parcelName: 'Restaurant Bosphore', routeName: 'Kuzey rotası', deliveryType: 'route',
        deliveryDate: '2026-08-24', paymentMethod: 'cash',
        items: [{ name: 'Fıstıklı Baklava · 1 kg', qty: 2 }],
      },
      // Yazıcı tanımsız — kart önizleme hâlinde kalır, basım hiç denenmez.
      printer: null,
    };
    await renderPicking();

    await fireEvent.press(screen.getByTestId(`warehouse-picking-all-${ITEM_A}`));
    const cta = screen.getByTestId('warehouse-picking-cta');
    expect(cta).toHaveTextContent(/Kutuyu KAPAT/);
    await fireEvent.press(cta);

    await waitFor(() => expect(screen.getByTestId('warehouse-picking-notice')).toHaveTextContent(/sipariş HAZIR/));
    // Gönderilen dağılım BU kutunun (kümülatif değil) ve motorun önerdiği partiden.
    expect(lastBodyOf('/seal')).toMatchObject({
      picks: [{ orderItemId: ITEM_A, batches: [{ stockId: STOCK_A, qty: 2 }] }],
    });
    // Etiket kartı: QR kodu, döküm ve tahsilat YÖNTEMİ (tutar asla) — yazıcı tanımsız, önizleme.
    const card = screen.getByTestId('warehouse-picking-label');
    expect(card).toHaveTextContent(/KT-26-4K2M9P7HWX/);
    expect(card).toHaveTextContent(/2 × Fıstıklı Baklava/);
    expect(card).toHaveTextContent(/Tahsilat: nakit/);
    // Basım hiç denenmedi: yazıcı `null` — kart "Depolar'dan tanımlanır" önizleme dilinde.
    expect(mockPrintLabel).not.toHaveBeenCalled();
    expect(card).toHaveTextContent(/Yazıcı tanımlı değil/);
  });

  it('yazıcı ayarlıysa kapanış etiketi KENDİLİĞİNDEN basar: PNG sunucudan, damga başarıdan sonra', async () => {
    mockPrinterModule.available = true;
    const printer = { address: '192.168.1.90', model: 'QL-1110NWB', labelSize: 'DieCutW103H164' };
    net.orders = [preparationOrder({ boxes: [preparationBox()] })];
    net.seal = { status: 'ok', boxNo: 1, ready: true, missing: [], shortfalls: [] };
    net.label = {
      status: 'ok',
      label: {
        code: 'KT-26-4K2M9P7HWX', boxNo: 1, boxCount: 1, referenceNo: 'LZA-26-3M8C',
        parcelName: 'Restaurant Bosphore', routeName: 'Kuzey rotası', deliveryType: 'route',
        deliveryDate: '2026-08-24', paymentMethod: null, items: [],
      },
      printer,
    };
    await renderPicking();

    await fireEvent.press(screen.getByTestId(`warehouse-picking-all-${ITEM_A}`));
    await fireEvent.press(screen.getByTestId('warehouse-picking-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-picking-label-print')).toHaveTextContent(/Etiket basıldı \(QL-1110NWB\)/));
    // PNG yerel dosyadan basıldı (SDK yalnız file:// basar) ve hedef AYARDAN geldi.
    expect(mockPrintLabel).toHaveBeenCalledWith('file:///cache/box-label-00000000-0000-4000-8000-0000000000b1.png', printer);
    // Damga başarıdan SONRA vuruldu — niyet sayılmaz (05.08 dersi).
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/printed'))).toBe(true);
    // Yeniden basım eli: yırtılan etiketin yolu.
    expect(screen.getByTestId('warehouse-picking-label-reprint')).toBeTruthy();
  });

  it('basım reddi kutu kapanışını GERİ ÇEKMEZ: cümle AYNEN yazılır, "yeniden bas" beklemede', async () => {
    mockPrinterModule.available = true;
    mockPrintLabel.mockImplementation(async () => {
      throw new Error('Print failed: SetLabelSizeError');
    });
    net.orders = [preparationOrder({ boxes: [preparationBox()] })];
    net.seal = { status: 'ok', boxNo: 1, ready: true, missing: [], shortfalls: [] };
    net.label = {
      status: 'ok',
      label: {
        code: 'KT-26-4K2M9P7HWX', boxNo: 1, boxCount: 1, referenceNo: 'LZA-26-3M8C',
        parcelName: 'Restaurant Bosphore', routeName: 'Kuzey rotası', deliveryType: 'route',
        deliveryDate: '2026-08-24', paymentMethod: null, items: [],
      },
      printer: { address: '192.168.1.90', model: 'QL-1110NWB', labelSize: 'RollW62' },
    };
    await renderPicking();

    await fireEvent.press(screen.getByTestId(`warehouse-picking-all-${ITEM_A}`));
    await fireEvent.press(screen.getByTestId('warehouse-picking-cta'));

    // Kapanış yazıldı (sipariş HAZIR cümlesi), basım düştü — ikisi AYRI gerçek.
    await waitFor(() => expect(screen.getByTestId('warehouse-picking-notice')).toHaveTextContent(/sipariş HAZIR/));
    await waitFor(() =>
      expect(screen.getByTestId('warehouse-picking-label-print')).toHaveTextContent(/Basım düştü: Print failed: SetLabelSizeError/),
    );
    // Damga YOK: kâğıt çıkmadı, niyet damgalanmaz.
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/printed'))).toBe(false);

    // "Yeniden bas" ikinci denemeyi koşturur — bu kez tutar.
    mockPrintLabel.mockImplementation(async () => undefined);
    await fireEvent.press(screen.getByTestId('warehouse-picking-label-reprint'));
    await waitFor(() => expect(screen.getByTestId('warehouse-picking-label-print')).toHaveTextContent(/Etiket basıldı/));
  });

  it('eksikli kapanış "yeni kutu" yolunu açar: kapalı kutu özetlenir, CTA sıradaki kutuyu önerir', async () => {
    const openBox = preparationBox();
    net.orders = [preparationOrder({ lines: [preparationLine({ orderedQty: 5 })], boxes: [openBox] })];
    net.seal = { status: 'ok', boxNo: 1, ready: false, missing: [{ itemId: ITEM_A, missingQty: 3 }], shortfalls: [] };
    await renderPicking();

    await fireEvent.press(screen.getByTestId(`warehouse-picking-all-${ITEM_A}`));
    // Kapanış cevabından sonra kuyruk yeniden okunur: kutu artık KAPALI, sipariş yarım.
    net.orders = [
      preparationOrder({
        lines: [preparationLine({ orderedQty: 5, pickedQty: 2 })],
        boxes: [preparationBox({ sealedAt: '2026-08-22T10:00:00Z', items: [{ orderItemId: ITEM_A, qty: 2 }] })],
      }),
    ];
    await fireEvent.press(screen.getByTestId('warehouse-picking-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-picking-notice')).toHaveTextContent(/eksik kalan var/i));
    expect(screen.getByTestId('warehouse-picking-box-1')).toHaveTextContent(/Kutu 1 kapalı · 2 ürün/);
    const cta = screen.getByTestId('warehouse-picking-cta');
    expect(cta).toHaveTextContent(/Yeni kutu aç \(Kutu 2\)/);
    // Kutulu siparişte yarım işin alt cümlesi "önceki kutularda" der — "yerine geçer" DEMEZ:
    // birleşimi sunucu kurar, önceki kutuların kaydı üstüne yazılmaz.
    expect(screen.getByTestId(`warehouse-picking-previous-${ITEM_A}`)).toHaveTextContent(/önceki kutularda 2/);
  });

  it('kutusuz BAŞLANMIŞ iş kutu moduna girmez — şerit yok, eski CTA duruyor', async () => {
    net.orders = [preparationOrder({ lines: [preparationLine({ pickedQty: 1 })] })];
    await renderPicking();

    expect(screen.queryByTestId('warehouse-picking-boxes')).toBeNull();
    expect(screen.queryByTestId('warehouse-picking-scan')).toBeNull();
    expect(screen.getByTestId('warehouse-picking-cta')).toHaveTextContent(/Kalem kalem say/);
  });
});
