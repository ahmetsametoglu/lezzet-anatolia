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

/*
  BİLDİRİM KANALI TOAST (31.08) — ekrana yapıştırılan bant söküldü, cümle kökteki tek `ToastHost`a
  gidiyor (ekran künyesi). Test o yüzden artık bir testID değil, basılan METNİ ölçüyor.
*/
const mockToast = jest.fn<void, [string]>();
jest.mock('@/lib/toast/toast-store', () => ({
  toastSuccess: (m: string) => mockToast(m),
  toastError: (m: string) => mockToast(m),
  toastInfo: (m: string) => mockToast(m),
}));

/** Toast'a basılmış cümlelerden biri kalıba uyuyor mu. */
async function expectToast(pattern: RegExp): Promise<void> {
  await waitFor(() => expect(mockToast.mock.calls.some(([message]) => pattern.test(message))).toBe(true));
}

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
  /** `?scope=done` okumasının cevabı (01.09) — bekleyen listeden AYRI: iki ayrı soru, iki ayrı liste. */
  doneOrders?: unknown[];
  open?: unknown;
  seal?: unknown;
  /** Sipariş düzeyindeki eksik beyanı (31.08) — kutu ucundan AYRI. */
  declareShort?: unknown;
  /** Kutuyu geri açma cevabı (01.09). */
  unseal?: unknown;
  resolve?: unknown;
  label?: unknown;
  /** Deponun kargo kutusu tipleri (07.12) — varsayılan BOŞ: rota testleri bu okumayı hiç görmez. */
  shippingBoxes?: unknown[];
  /** Sevk seçenekleri ve duyuru cevabı (07.12). */
  dispatchOptions?: unknown;
  announce?: unknown;
  /** Deponun yazıcı ENVANTERİ (07.12 · 29.08) — hedef artık etiket cevabından değil buradan. */
  printers?: unknown[];
}

const net: Net = { orders: [] };

fetchMock.mockImplementation((url, init) => {
  const path = String(url);
  // Kutu TİPLERİ kutulardan önce eşleşmeli: `/shipping-boxes` de `/boxes` ile bitiyor.
  if (path.endsWith('/shipping-boxes')) return Promise.resolve(ok({ boxes: net.shippingBoxes ?? [] }));
  if (path.endsWith('/printers')) return Promise.resolve(ok({ printers: net.printers ?? [] }));
  if (path.endsWith('/dispatch-options')) return Promise.resolve(ok(net.dispatchOptions));
  if (path.endsWith('/announce')) return Promise.resolve(ok(net.announce));
  if (path.includes('/codes/resolve')) return Promise.resolve(ok(net.resolve));
  if (path.endsWith('/declare-short')) return Promise.resolve(ok(net.declareShort ?? { status: 'ok', shortfalls: [] }));
  if (path.endsWith('/seal')) return Promise.resolve(ok(net.seal));
  if (path.endsWith('/unseal')) return Promise.resolve(ok(net.unseal ?? { status: 'ok', boxNo: 1, items: [] }));
  if (path.endsWith('/label')) return Promise.resolve(ok(net.label ?? { status: 'not_found' }));
  if (path.endsWith('/printed')) return Promise.resolve(ok({ status: 'ok', printedAt: '2026-08-22T20:00:00Z' }));
  if (init?.method === 'POST' && path.endsWith('/boxes')) return Promise.resolve(ok(net.open));
  if (init?.method === 'POST') throw new Error(`beklenmeyen POST: ${path}`);
  // Kapsam SORGUDAN okunuyor: gevşek bir eşleşme tamamlananlar cevabını bekleyen listeye verirdi.
  if (path.includes('scope=done')) return Promise.resolve(ok({ date: null, orders: net.doneOrders ?? [] }));
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
  await fireEvent.press(screen.getByTestId('warehouse-picking-fab'));
  await fireEvent.press(screen.getByLabelText(label));
  await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/codes/resolve'))).toBe(true));
}

/**
 * Kontrol listesinden kalemi açıp KALANIN TAMAMINI kutuya koyar — eski "tamamı ✓" düğmesinin
 * yerine geçen yol (satıra dokunmak elle düzeltmedir ve çekmece kalanla dolu gelir).
 */
async function putAll(itemId: string) {
  await fireEvent.press(screen.getByTestId(`warehouse-picking-pending-${itemId}`));
  await waitFor(() => expect(screen.getByTestId('warehouse-picking-qty-sheet-confirm')).toBeOnTheScreen());
  await fireEvent.press(screen.getByTestId('warehouse-picking-qty-sheet-confirm'));
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
  net.declareShort = undefined;
  net.resolve = undefined;
  net.label = undefined;
  net.unseal = undefined;
  net.doneOrders = undefined;
  net.shippingBoxes = undefined;
  net.dispatchOptions = undefined;
  net.announce = undefined;
  net.printers = undefined;
  mockPrinterModule.available = false;
  mockPrintLabel.mockClear();
  mockPrintLabel.mockImplementation(async () => undefined);
});

describe('D1 · kutu döngüsü', () => {
  it('taze sipariş "Kutu aç" ile başlar; kutu sunucuda doğar ve ekran açık kutuyu gösterir', async () => {
    net.orders = [preparationOrder()];
    net.open = { status: 'ok', box: preparationBox() };
    await renderPicking();

    // Kutu YOKKEN yüzen düğmenin işi okutmak değil KUTU AÇMAK (v3 · 31.08): elin gittiği yer
    // sabit, oradaki eylem ekranın hâline göre değişiyor.
    const fab = screen.getByTestId('warehouse-picking-fab');
    expect(screen.getByRole('button', { name: 'Kutu aç' })).toBeOnTheScreen();
    expect(screen.getByTestId('warehouse-picking-box-empty')).toHaveTextContent(/Kutu açılmadı/);

    // Açılış cevabından SONRA kuyruk yeniden okunacak — o okuma kutulu hâli getirsin.
    net.orders = [preparationOrder({ boxes: [preparationBox()] })];
    await fireEvent.press(fab);

    await waitFor(() => expect(screen.getByTestId('warehouse-picking-box-open')).toHaveTextContent(/KUTU 1/));
    // Kutu açıldı: aynı düğme artık OKUTUYOR, boş hâl bloğu düştü.
    expect(screen.getByRole('button', { name: 'Ürün barkodunu okut' })).toBeOnTheScreen();
    expect(screen.queryByTestId('warehouse-picking-box-empty')).toBeNull();
    // Boş kutu kapanmaz: içerik girilene dek kapatma kilitli.
    expect(screen.getByTestId('warehouse-picking-seal')).toBeDisabled();
  });

  it('okutulan koli ÇARPAN kadar ekler ama tavan motorun kapasitesidir; yabancı ürün kutuya girmez', async () => {
    net.orders = [preparationOrder({ boxes: [preparationBox()] })];
    const line = preparationLine();
    // Koli 6'lık ama motor 2 ayırabilmiş: 2 eklenir — rafta olmayan mal okutmayla da yazılamaz.
    net.resolve = {
      status: 'found', variantId: line.variantId, productName: line.productName,
      variantLabel: line.variantLabel, kind: 'case', qtyPerCode: 6, source: 'barcode', sku: 'SKU-4120', dateType: 'DDM', shelfLifeDays: 360, imageUrl: null, caseSizes: [],
    };
    await renderPicking();

    /* Çipler artık BU SİPARİŞİN kalemleri (31.08): etiket ürünün adı, kod da onun gerçek paket
       barkodu. Havuzun rol adları ("Toplama", "Yabancı ürün") toplama ekranında artık yok. */
    await scanChip('Fıstıklı Baklava · 1 kg');
    /* OKUTMA DOĞRUDAN YAZMAZ, ÇEKMECEYİ AÇAR ve adet KALANLA dolu gelir (v3 · 31.08). Koli 6'lık
       ama motor 2 ayırabilmiş: çekmece 2 ile açılır — rafta olmayan mal okutmayla da yazılamaz.
       Koli çarpanı burada bilerek kullanılmıyor (hook künyesi): sayıyı bir insan onaylayacaksa
       doğru varsayılan "daha ne kadar lazım"dır. */
    await waitFor(() => expect(screen.getByTestId('warehouse-picking-qty-sheet-qty-value')).toHaveTextContent('2'));
    /* BARKOD EŞLEŞMESİ SESSİZ (kullanıcı kararı 31.08): çekmece ürünün adıyla açılıyor ve satır
       zaten sayıyor — "bulundu" cümlesi aynı haberi üçüncü kez vermekti. Cümle YALNIZ SKU/tedarikçi
       kodu eşleşmesinde kalıyor (hook künyesi: orada söylenen şey eşleşmenin kesinlik derecesi). */
    expect(mockToast).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('warehouse-picking-qty-sheet-confirm'));
    await waitFor(() => expect(screen.getByTestId('warehouse-picking-box-open')).toHaveTextContent(/2\/2/));

    // Siparişte olmayan ürün: ANINDA durdurulur, hiçbir satıra düşmez (tasarım: "bu siparişte yok").
    net.resolve = {
      status: 'found', variantId: '00000000-0000-4000-8000-000000000077', productName: 'Sahlep',
      variantLabel: '250 g', kind: 'unit', qtyPerCode: 1, source: 'barcode', sku: 'SKU-4120', dateType: 'DDM', shelfLifeDays: 360, imageUrl: null, caseSizes: [],
    };
    /* Yabancı ürün için AYRI bir çip yok — çip yalnız tetikleyici, cevabı `net.resolve` veriyor:
       aynı çip başka bir varyant döndürdüğünde ret dalı aynen koşuyor. */
    await scanChip('Fıstıklı Baklava · 1 kg');
    await expectToast(/bu siparişte yok/);
    // Çekmece HİÇ açılmadı ve kutunun içi değişmedi.
    expect(screen.queryByTestId('warehouse-picking-qty-sheet-confirm')).toBeNull();
    expect(screen.getByTestId('warehouse-picking-box-open')).toHaveTextContent(/2\/2/);
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
    };
    // Envanter BOŞ — kart önizleme hâlinde kalır, basım hiç denenmez. (Hedef 29.08'den beri
    // etiket cevabından değil `/printers`ten geliyor.)
    net.printers = [];
    await renderPicking();

    await putAll(ITEM_A);
    const seal = screen.getByTestId('warehouse-picking-seal');
    expect(seal).toHaveTextContent(/Kutuyu kapat/);
    await fireEvent.press(seal);

    await expectToast(/sipariş HAZIR/);
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
    // Depoda o iş için TEK yazıcı → seçim sorulmaz, hedef kendiliğinden o (`resolvePrinter`).
    const printer = { id: '00000000-0000-4000-8000-0000000000e1', name: 'Masa · QL-1110', purpose: 'box' as const, address: '192.168.1.90', model: 'QL-1110NWB', labelSize: 'DieCutW103H164' };
    net.orders = [preparationOrder({ boxes: [preparationBox()] })];
    net.seal = { status: 'ok', boxNo: 1, ready: true, missing: [], shortfalls: [] };
    net.label = {
      status: 'ok',
      label: {
        code: 'KT-26-4K2M9P7HWX', boxNo: 1, boxCount: 1, referenceNo: 'LZA-26-3M8C',
        parcelName: 'Restaurant Bosphore', routeName: 'Kuzey rotası', deliveryType: 'route',
        deliveryDate: '2026-08-24', paymentMethod: null, items: [],
      },
    };
    net.printers = [printer];
    await renderPicking();

    await putAll(ITEM_A);
    await fireEvent.press(screen.getByTestId('warehouse-picking-seal'));

    await waitFor(() => expect(screen.getByTestId('warehouse-picking-label-print')).toHaveTextContent(/Etiket basıldı \(QL-1110NWB\)/));
    // PNG yerel dosyadan basıldı (SDK yalnız file:// basar) ve hedef ENVANTERDEN geldi.
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
    };
    // Yanlış rulo BİLEREK: SDK'nın `SetLabelSizeError`ı 23.5'te ölçülen gerçek reddin kendisi.
    net.printers = [{ id: '00000000-0000-4000-8000-0000000000e1', name: 'Masa', purpose: 'box', address: '192.168.1.90', model: 'QL-1110NWB', labelSize: 'RollW62' }];
    await renderPicking();

    await putAll(ITEM_A);
    await fireEvent.press(screen.getByTestId('warehouse-picking-seal'));

    // Kapanış yazıldı (sipariş HAZIR cümlesi), basım düştü — ikisi AYRI gerçek.
    await expectToast(/sipariş HAZIR/);
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

    await putAll(ITEM_A);
    // Kapanış cevabından sonra kuyruk yeniden okunur: kutu artık KAPALI, sipariş yarım.
    net.orders = [
      preparationOrder({
        lines: [preparationLine({ orderedQty: 5, pickedQty: 2 })],
        boxes: [preparationBox({ sealedAt: '2026-08-22T10:00:00Z', items: [{ orderItemId: ITEM_A, qty: 2 }] })],
      }),
    ];
    /* Eksik kalsa da "Kutuyu kapat" HİÇ SORMAZ (kullanıcı kararı 31.08): beyansız kapanış, sipariş
       `preparing`de kalır ve depocu ikinci kutuyu açar — yaygın hâl bu ve sorusuz olmalı. */
    await fireEvent.press(screen.getByTestId('warehouse-picking-seal'));

    await expectToast(/eksik kalan var/i);
    /* KAPANAN KUTU KARTI (v3:349) — v2 tek satırlık özetti; v3 kutunun İÇİNDEKİNİ ve QR'ını da
       yazıyor. İkisi de sözleşmede zaten var ve ikisi de bir soruya cevap: "yanlış kutuyu mu
       kapattım" ve "bu karton hangi etiketle gidecek". Kapalı kutu geri açılamaz — blok bir
       KAYITTIR, düzeltilecek bir şey değil. İçerik kalem ADIYLA yazılır: "2 ürün" neyin
       kapandığını söylemez. */
    const sealed = screen.getByTestId('warehouse-picking-box-1');
    expect(sealed).toHaveTextContent(/Kutu 1/);
    expect(sealed).toHaveTextContent(/KT-26-4K2M9P7HWX · 2 adet/);
    // İçerik kalem ADIYLA (ve artık kendi satırında, adet sağda).
    expect(sealed).toHaveTextContent(/Fıstıklı Baklava/);
    // Kutu kapandı: yüzen düğme yine "kutu aç"a döndü ve boş hâl bloğu geri geldi.
    expect(screen.getByRole('button', { name: 'Kutu aç' })).toBeOnTheScreen();
    expect(screen.getByTestId('warehouse-picking-box-empty')).toBeOnTheScreen();
    /* KAPALI kutudan gelen adet satırda söylenir — bunu söyleyen başka bir yer yok. Kalem AÇIK
       kutuda olsaydı yazılmazdı: o blok zaten "2/5" diyor ve aynı sayıyı iki kez yazmak, ekrandaki
       rakam kalabalığını artırmaktan başka bir şey yapmıyor (kullanıcı bulgusu 31.08). */
    expect(screen.getByTestId(`warehouse-picking-pending-${ITEM_A}`)).toHaveTextContent(/kapalı kutuda 2/);
    // Sağda kalan ve istenen AYRI okunur — bölü işareti yok: 5 istenen − 2 kutulanan = 3 kalan.
    expect(screen.getByTestId(`warehouse-picking-pending-${ITEM_A}`)).toHaveTextContent(/3\s*kalan/);
    expect(screen.getByTestId(`warehouse-picking-pending-${ITEM_A}`)).toHaveTextContent(/5 istenen/);
  });

  /*
    EKSİK BEYANI AYRI BİR EYLEM (kullanıcı kararı 31.08) — ne satırda bir bağlantı, ne de her
    kapanışta çıkan bir soru.

    İki tur sürdü. Önce satırdaki "eksik bildir" bağlantısı söküldü: kalem adının hemen altındaydı,
    yanlışlıkla tıklanıyordu ve tek başına hiçbir şey yapmadığı için ne işe yaradığı okunmuyordu.
    Yerine kapanışın önüne bir onay kondu — ama o da yanlış yere düştü: depocu ikinci kutuyu açmak
    için o ekrandan günde onlarca kez geçiyor ve "Eksikleri bildir" düğmesi normal yolun üstünde
    kalıyordu (*"bu ekran yanlışlıkla eksik bildir kapata müsait"*).

    Bugünkü bölüşüm niyete göre: **Kutuyu kapat** sormaz, **Eksikleri bildirerek kapat** ayrı bir
    eylemdir ve onayı o ister. Eksik yine konan adetten TÜRÜYOR — beyan edilen şey miktar değil,
    "rafta yok" kararı.
  */
  it('eksikleri bildirme ayrı eylemdir, ÖNCE sorar; beyan `declareShort` ile gider', async () => {
    net.orders = [preparationOrder({ boxes: [preparationBox()], lines: [preparationLine({ orderedQty: 5 })] })];
    net.seal = { status: 'ok', boxNo: 1, ready: true, missing: [], shortfalls: [] };
    await renderPicking();

    // Öneri 2 taşıyor, sipariş 5 — kalanın tamamı konsa bile 3 adet eksik kalıyor.
    await putAll(ITEM_A);
    expect(screen.queryByTestId(`warehouse-picking-short-${ITEM_A}`)).toBeNull();

    // "Kutuyu kapat" hiçbir şey SORMAZ; soru yalnız bildirme eyleminin önünde.
    await fireEvent.press(screen.getByTestId('warehouse-picking-declare-short'));

    // Soru eksikleri TEK TEK sayar: "3 kalem eksik" hangileri olduğunu söylemez.
    await waitFor(() => expect(screen.getByTestId('warehouse-picking-seal-confirm')).toBeOnTheScreen());
    const sheet = screen.getByTestId('warehouse-picking-seal-confirm');
    expect(sheet).toHaveTextContent(/3 adet eksik/);
    await fireEvent.press(screen.getByTestId('warehouse-picking-seal-confirm-confirm'));

    /* Beyan artık KUTU ucuna değil, SİPARİŞ ucuna gidiyor (`/orders/:id/declare-short`) — son kutu
       kapandıktan sonra mühürlenecek kutu kalmıyor ve eski yol sessizce hiçbir şey yapmıyordu
       (cihazda ölçüldü 31.08). */
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/declare-short'))).toBe(true),
    );
  });

  /*
    ONAYDAN VAZGEÇMEK HİÇBİR ŞEY KAPATMAZ (kullanıcı kararı 31.08).

    Çekmece "Kutuyu kapat"ın önünde dururken iptalin anlamı "beyansız kapat"tı — iki ayrı eylem tek
    dokunuşta gizleniyordu. Çekmece artık kendi düğmesiyle açılıyor ve iptalin karşılığı yalnız
    vazgeçmek: hiçbir istek gitmez, kutu açık kalır.
  */
  it('beyan onayından VAZGEÇMEK hiçbir şey göndermez — kutu açık kalır', async () => {
    net.orders = [preparationOrder({ boxes: [preparationBox()], lines: [preparationLine({ orderedQty: 5 })] })];
    net.seal = { status: 'ok', boxNo: 1, ready: false, missing: [{ itemId: ITEM_A, missingQty: 3 }], shortfalls: [] };
    await renderPicking();

    await putAll(ITEM_A);
    await fireEvent.press(screen.getByTestId('warehouse-picking-declare-short'));
    await waitFor(() => expect(screen.getByTestId('warehouse-picking-seal-confirm-cancel')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('warehouse-picking-seal-confirm-cancel'));

    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/seal'))).toBe(false);
    expect(screen.getByTestId('warehouse-picking-box-open')).toBeOnTheScreen();
  });

  /*
    KAPALI KUTUNUN MENÜSÜ (kullanıcı isteği 01.09) — uzun basmayla açılır, iki eylem taşır.

    Kapanan kutu bir KAYITTIR ve kısa dokunuş bir şey yapmaz; ama kayıt düzeltilebilir olmalı:
    etiket yırtılır, yanlış kartona yapışır, kutuya yanlış ürün girer. Yazılımın "artık olmaz"
    demesi depocuyu kaydın DIŞINDA çalışmaya iter — o gün kayıt gerçeği anlatmayı bırakır.
  */
  it('kapalı kutuya UZUN BASMAK menüyü açar; "geri aç" kutu ucuna gider', async () => {
    net.orders = [
      preparationOrder({
        lines: [preparationLine({ orderedQty: 2, pickedQty: 2 })],
        boxes: [preparationBox({ sealedAt: '2026-08-22T10:00:00Z', items: [{ orderItemId: ITEM_A, qty: 2 }] })],
      }),
    ];
    await renderPicking();

    // Kısa dokunuş menüyü AÇMAZ: kart bir kayıt, bir düğme değil.
    await fireEvent.press(screen.getByTestId('warehouse-picking-box-1'));
    expect(screen.queryByTestId('warehouse-picking-box-menu-reopen')).toBeNull();

    await fireEvent(screen.getByTestId('warehouse-picking-box-1'), 'longPress');
    await waitFor(() => expect(screen.getByTestId('warehouse-picking-box-menu-reopen')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('warehouse-picking-box-menu-reopen'));

    // İSTEK KUTUNUN KİMLİĞİNE gider ve GÖVDESİZDİR: kalan dağılımı sunucu kurar, telefon
    // "şu kadarı kaldı" iddiası taşımaz (sözleşme künyesi).
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/unseal'))).toBe(true));
    await expectToast(/geri açıldı/);
  });

  /*
    GERİ AÇILAN KUTU BOŞALMAZ (kullanıcı bulgusu 01.09).

    Cihazda görülen şuydu: kutu geri açıldı, içi TAMAMEN boşaldı. Sunucu satırları gerçekten
    serbest bırakıyor ve bırakmak zorunda ("açık kutu = taslak" değişmezi, künyesi 0048'de) — ama
    dökümü cevapta GERİ VERİYOR ve telefon onu açık kutunun taslağına yazıyor.

    Test yazımı DEĞİL, ekrandaki hâli ölçüyor: kutu açık görünüyor mu, içinde o kalem duruyor mu,
    ve bir sonraki kapanış o adedi mi gönderiyor. Dökümün kaybolması bu üçünde de kendini gösterir.
  */
  it('geri açılan kutunun İÇİNDEKİLER taslağa geri yazılır — kutu boşalmaz', async () => {
    net.orders = [
      preparationOrder({
        lines: [preparationLine({ orderedQty: 2, pickedQty: 2 })],
        boxes: [preparationBox({ sealedAt: '2026-08-22T10:00:00Z', items: [{ orderItemId: ITEM_A, qty: 2 }] })],
      }),
    ];
    net.unseal = { status: 'ok', boxNo: 1, items: [{ orderItemId: ITEM_A, qty: 2 }] };
    await renderPicking();

    await fireEvent(screen.getByTestId('warehouse-picking-box-1'), 'longPress');
    await waitFor(() => expect(screen.getByTestId('warehouse-picking-box-menu-reopen')).toBeOnTheScreen());

    /* Geri açma sonrası kuyruk artık kutuyu AÇIK ve kalemi toplanmamış gösteriyor — sunucunun
       `record_preparation` ile yazdığı yeni gerçek. Taslak boş kalsaydı ekran da bunu gösterirdi. */
    net.orders = [
      preparationOrder({
        lines: [preparationLine({ orderedQty: 2, pickedQty: 0 })],
        boxes: [preparationBox({ sealedAt: null, items: [] })],
      }),
    ];
    await fireEvent.press(screen.getByTestId('warehouse-picking-box-menu-reopen'));

    await waitFor(() => expect(screen.getByTestId('warehouse-picking-box-open')).toBeOnTheScreen());
    // Kutunun sayacı içeriği söyler: iki adet duruyor, sıfır değil.
    expect(screen.getByTestId('warehouse-picking-box-open')).toHaveTextContent(/2 adet/);

    // Ve kapanış O ADEDİ gönderir: taslak yalnız ekranda değil, gönderilen gövdede de var.
    net.seal = { status: 'ok', boxNo: 1, ready: true, missing: [], shortfalls: [] };
    await fireEvent.press(screen.getByTestId('warehouse-picking-seal'));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/seal'))).toBe(true));
    const body = lastBodyOf('/seal') as { picks: Array<{ orderItemId: string; batches: Array<{ qty: number }> }> };
    expect(body.picks[0]?.batches.reduce((sum, batch) => sum + batch.qty, 0)).toBe(2);
  });

  /*
    AÇIK KUTU VARKEN GERİ AÇMA REDDEDİLİR (ölçüldü 01.09 · cihazda).

    Ekran açık kutuyu TEKİL biliyor (`boxes.find(sealedAt === null)`) ve doldurulmakta olan kutunun
    içeriğini tek bir taslakta tutuyor. Cihazda ölçülen: Kutu 2 açıkken Kutu 1 geri açıldı,
    veritabanında iki kutu da açık kaldı, ekran yalnız birini çizdi ve öteki erişilemez bir kayda
    dönüştü — taslak da yanlış kutuya yazılabilirdi.

    Kural VERİDE duruyor (0048) ve uygulama katmanı isteği zaten göndermiyor; bu test EKRANIN
    payını sınıyor: ret sebebiyle ve KUTU NUMARASIYLA yazılıyor mu. Numarasız bir ret depocuyu
    aramaya gönderirdi.
  */
  it('siparişin başka kutusu AÇIKSA geri açma reddedilir — sebebi kutu numarasıyla yazılır', async () => {
    net.orders = [
      preparationOrder({
        lines: [preparationLine({ orderedQty: 2, pickedQty: 2 })],
        boxes: [
          preparationBox({ sealedAt: '2026-08-22T10:00:00Z', items: [{ orderItemId: ITEM_A, qty: 2 }] }),
          preparationBox({ boxId: '00000000-0000-4000-8000-0000000000b2', boxNo: 2, code: 'KT-26-IKINCI', sealedAt: null }),
        ],
      }),
    ];
    net.unseal = { status: 'other_box_open', boxNo: 2 };
    await renderPicking();

    await fireEvent(screen.getByTestId('warehouse-picking-box-1'), 'longPress');
    await waitFor(() => expect(screen.getByTestId('warehouse-picking-box-menu-reopen')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('warehouse-picking-box-menu-reopen'));

    await expectToast(/Kutu 2 zaten açık/);
  });

  /*
    SON KUTU KAPANINCA EKRAN SİPARİŞİ BIRAKMAZ (kullanıcı bulgusu 01.09).

    Sipariş `ready`ye geçince hazırlık kuyruğundan düşüyor. Eskiden tazeleme tam o an koşuyor,
    `order` `null` oluyor, ekran kuyruk dalına atlıyordu — ve **yeni açılmış etiket çekmecesi o
    dalda çizilmediği için kapanıyordu**. Basım düştüğünde "etiket alınamadı" haberi ve "yeniden
    bas" düğmesi okunmadan siliniyordu.

    Cevap tazelemeyi geciktirmek DEĞİL (denendi, cihazda daha kötü çıktı: çekmecenin arkasında
    kutu hâlâ "açık" görünüyordu), kapsamı TAMAMLANANLARA almak: `ready` sipariş orada yaşıyor ve
    seçim korunuyor.
  */
  it('son kutu kapanınca kapsam TAMAMLANANLARA geçer — sipariş ekranda kalır, etiket çekmecesi durur', async () => {
    const bitmis = preparationOrder({
      status: 'ready',
      lines: [preparationLine({ orderedQty: 2, pickedQty: 2 })],
      boxes: [preparationBox({ sealedAt: '2026-08-22T10:00:00Z', items: [{ orderItemId: ITEM_A, qty: 2 }] })],
    });
    net.orders = [preparationOrder({ lines: [preparationLine({ orderedQty: 2 })], boxes: [preparationBox()] })];
    net.seal = { status: 'ok', boxNo: 1, ready: true, missing: [], shortfalls: [] };
    net.label = {
      status: 'ok',
      label: {
        code: 'KT-26-4K2M9P7HWX', boxNo: 1, boxCount: 1, referenceNo: 'LZA-26-3M8C', parcelName: 'Restaurant Bosphore',
        routeName: null, deliveryType: 'route', deliveryDate: '2026-08-09', paymentMethod: null,
        items: [{ name: 'Fıstıklı Baklava · 1 kg', qty: 2 }],
      },
    };
    await renderPicking();
    await putAll(ITEM_A);

    /* Kapanıştan SONRAKİ okuma: bekleyen liste BOŞ (sipariş düştü), tamamlananlarda ise var.
       Ekran kuyruk dalına atlarsa sipariş künyesi de etiket çekmecesi de kaybolur. */
    net.orders = [];
    net.doneOrders = [bitmis];
    await fireEvent.press(screen.getByTestId('warehouse-picking-seal'));

    await waitFor(() => expect(screen.getByTestId('warehouse-picking-label-sheet')).toBeOnTheScreen());
    // Sipariş HÂLÂ açık: kapanan kutu salt-okunur şeritte duruyor, kuyruk listesi çizilmiyor.
    expect(screen.getByTestId('warehouse-picking-box-1')).toBeOnTheScreen();
    expect(screen.queryByTestId('warehouse-picking-queue')).toBeNull();
  });

  it('menüdeki "etiketi yeniden yazdır" O KUTUNUN etiketini okur', async () => {
    net.orders = [
      preparationOrder({
        lines: [preparationLine({ orderedQty: 2, pickedQty: 2 })],
        boxes: [preparationBox({ sealedAt: '2026-08-22T10:00:00Z', items: [{ orderItemId: ITEM_A, qty: 2 }] })],
      }),
    ];
    await renderPicking();

    await fireEvent(screen.getByTestId('warehouse-picking-box-1'), 'longPress');
    await waitFor(() => expect(screen.getByTestId('warehouse-picking-box-menu-reprint')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('warehouse-picking-box-menu-reprint'));

    /* Eskiden "yeniden bas" YALNIZ o turda kapanan kutuyu tanıyordu (`printTarget`) ve ekran
       yenilenince kayboluyordu; artık istek kutunun kendi kimliğiyle gidiyor. */
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes(`${preparationBox().boxId}/label`))).toBe(true),
    );
  });

  it('eksik YOKKEN kapanış hiç sormaz — her kapanışta onay, onayı refleks yapar', async () => {
    net.orders = [preparationOrder({ boxes: [preparationBox()] })];
    net.seal = { status: 'ok', boxNo: 1, ready: true, missing: [], shortfalls: [] };
    await renderPicking();

    await putAll(ITEM_A);
    await fireEvent.press(screen.getByTestId('warehouse-picking-seal'));

    expect(screen.queryByTestId('warehouse-picking-seal-confirm-confirm')).toBeNull();
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/seal'))).toBe(true));
  });

  it('kutusuz BAŞLANMIŞ iş kutu moduna girmez — şerit yok, eski CTA duruyor', async () => {
    net.orders = [preparationOrder({ lines: [preparationLine({ pickedQty: 1 })] })];
    await renderPicking();

    expect(screen.queryByTestId('warehouse-picking-boxes')).toBeNull();
    // Yüzen okutma düğmesi de yok: kutusuz akışta okutmanın gideceği kutu yok.
    expect(screen.queryByTestId('warehouse-picking-fab')).toBeNull();
    expect(screen.getByTestId('warehouse-picking-cta')).toHaveTextContent(/Kalem kalem say/);
  });
});

/*
  KARGO KUTUSU TİPİ (07.12) — kutu açılmadan önceki tek soru.

  Ölçülen dört iddia, dördü de "soru DOĞRU ZAMANDA sorulsun" ekseninde:
  · rota siparişinde soru HİÇ doğmaz (kutu araca biner, taşıyıcıya değil) ve tipler okunmaz bile
  · kargo siparişinde CTA çekmeceyi açar; seçilen tip AÇILIŞ GÖVDESİNE yazılır
  · atlama kapısı tipsiz açar — listede olmayan bir karton kullanılıyor olabilir
  · depoda hiç tip yoksa akış DURMAZ ama uyarı sürekli görünür: ölçüsüz kapanan kutu, etiket
    satın alınırken ön koşula takılır ve o an kartonu geri açmak gerekir
*/
describe('D1 · kargo kutusu tipi', () => {
  const ORTA = {
    id: '00000000-0000-4000-8000-0000000000c1',
    name: 'Orta karton',
    lengthMm: 400,
    widthMm: 300,
    heightMm: 250,
    tareG: 220,
    maxContentG: 20_000,
  };

  it('ROTA siparişinde tip sorulmaz — CTA kutuyu doğrudan açar, tipler hiç okunmaz', async () => {
    net.orders = [preparationOrder()];
    net.open = { status: 'ok', box: preparationBox() };
    await renderPicking();

    await fireEvent.press(screen.getByTestId('warehouse-picking-fab'));

    await waitFor(() => expect(lastBodyOf('/boxes')).toEqual({ shippingBoxId: null }));
    expect(screen.queryByTestId('warehouse-picking-box-type-sheet')).toBeNull();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/shipping-boxes'))).toBe(false);
  });

  it('KARGO siparişinde CTA çekmeceyi açar; seçilen tip açılış gövdesine yazılır', async () => {
    net.orders = [preparationOrder({ deliveryType: 'shipping' })];
    net.shippingBoxes = [ORTA];
    net.open = { status: 'ok', box: preparationBox({ shippingBoxId: ORTA.id }) };
    await renderPicking();

    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/shipping-boxes'))).toBe(true));
    await fireEvent.press(screen.getByTestId('warehouse-picking-fab'));

    // Ölçü satırı SANTİMDİR: veri mm ama depocu kartonu "40×30×25" diye tanıyor.
    expect(screen.getByTestId(`warehouse-picking-box-type-${ORTA.id}`)).toHaveTextContent(/40×30×25 cm/);
    expect(screen.getByTestId(`warehouse-picking-box-type-${ORTA.id}`)).toHaveTextContent(/en çok 20 kg/);

    net.orders = [preparationOrder({ deliveryType: 'shipping', boxes: [preparationBox({ shippingBoxId: ORTA.id })] })];
    await fireEvent.press(screen.getByTestId(`warehouse-picking-box-type-${ORTA.id}`));

    await waitFor(() => expect(lastBodyOf('/boxes')).toEqual({ shippingBoxId: ORTA.id }));
    // Seçim açık kutunun künyesinde GÖRÜNÜR: açıldıktan sonra düzeltme yolu yok, depocu yanlış
    // kartona doldurmaya başlamadan görmeli.
    await waitFor(() => expect(screen.getByTestId('warehouse-picking-box-open')).toHaveTextContent(/Orta karton/));
  });

  it('atlama kapısı TİPSİZ açar — listede olmayan bir karton kullanılıyor olabilir', async () => {
    net.orders = [preparationOrder({ deliveryType: 'shipping' })];
    net.shippingBoxes = [ORTA];
    net.open = { status: 'ok', box: preparationBox() };
    await renderPicking();

    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/shipping-boxes'))).toBe(true));
    await fireEvent.press(screen.getByTestId('warehouse-picking-fab'));
    await fireEvent.press(screen.getByTestId('warehouse-picking-box-type-skip'));

    await waitFor(() => expect(lastBodyOf('/boxes')).toEqual({ shippingBoxId: null }));
  });

  it('depoda hiç tip yoksa akış DURMAZ ama uyarı sürekli görünür', async () => {
    net.orders = [preparationOrder({ deliveryType: 'shipping' })];
    net.shippingBoxes = [];
    net.open = { status: 'ok', box: preparationBox() };
    await renderPicking();

    await waitFor(() => expect(screen.getByTestId('warehouse-picking-box-type-missing')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('warehouse-picking-fab'));

    // Çekmece hiç açılmaz: cevabı olmayan bir soru sormak, depocuyu boş bir listeye bakmaya zorlar.
    expect(screen.queryByTestId('warehouse-picking-box-type-skip')).toBeNull();
    await waitFor(() => expect(lastBodyOf('/boxes')).toEqual({ shippingBoxId: null }));
  });
});

/*
  SEVK — kutu kapandıktan sonraki adım (07.12 · Faz 1.3).

  Dört iddia, hepsi "doğru anda, doğru cümle" ekseninde:
  · rota siparişinde sevk kartı HİÇ doğmaz
  · kargo siparişinde son kutu kapanınca kart doğar — ve sipariş kuyruktan DÜŞSE de kalır
  · seçenek listesi gerçek kolileri anlatır; seçim duyuruya gider ve takip numaraları yazılır
  · ön koşul tutmazsa SEBEP yazılır ("olmadı" değil)

  Yazıcı modülü jest'te yok (`mockPrinterModule.available = false`), yani basım hiç denenmiyor ve
  kart bunu SÖYLÜYOR — sessiz kalmak "bastı" sanılırdı.
*/
describe('D1 · sevk (kargoya ver)', () => {
  /** Son kutuyu kapatıp `ready` döndüren kısa yol — sevk teklifi tam bu anda doğuyor. */
  async function sonKutuyuKapat(deliveryType: 'route' | 'shipping') {
    net.orders = [preparationOrder({ deliveryType, boxes: [preparationBox()] })];
    net.seal = { status: 'ok', boxNo: 1, ready: true, missing: [], shortfalls: [] };
    await renderPicking();
    await putAll(ITEM_A);
    // Kapanıştan sonra kuyruk yeniden okunuyor: `ready` sipariş listeden DÜŞÜYOR.
    net.orders = [];
    await fireEvent.press(screen.getByTestId('warehouse-picking-seal'));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/seal'))).toBe(true));
  }

  it('ROTA siparişinde sevk kartı HİÇ doğmaz — kutu araca biner, taşıyıcıya değil', async () => {
    await sonKutuyuKapat('route');
    expect(screen.queryByTestId('warehouse-dispatch')).toBeNull();
  });

  it('KARGO siparişinde kart doğar ve sipariş kuyruktan düşse de KALIR', async () => {
    await sonKutuyuKapat('shipping');

    // Kuyruk boş döndü (sipariş `ready`), ekran kuyruk görünümünde — kart yine burada.
    await waitFor(() => expect(screen.getByTestId('warehouse-dispatch')).toBeOnTheScreen());
    expect(screen.getByTestId('warehouse-dispatch-start')).toBeOnTheScreen();
  });

  it('seçenek listesi GERÇEK kolileri anlatır; seçim duyuruya gider ve takip numaraları yazılır', async () => {
    await sonKutuyuKapat('shipping');
    net.dispatchOptions = {
      status: 'ok',
      parcelCount: 2,
      totalWeightG: 7400,
      homeOnly: false,
      options: [
        { code: 'chronopost:classic', carrierName: 'Chronopost', name: 'Classic', priceCents: 1348, leadTimeHours: 72, lastMile: 'home_delivery', tracked: true },
        { code: 'mr:point', carrierName: 'Mondial Relay', name: 'Point', priceCents: 1050, leadTimeHours: null, lastMile: 'service_point', tracked: true },
      ],
    };
    await fireEvent.press(screen.getByTestId('warehouse-dispatch-start'));

    // Başlıkta koli sayısı ve ağırlık: depocu elindekiyle ekrandakini karşılaştırabilsin.
    await waitFor(() => expect(screen.getByTestId('warehouse-dispatch-sheet')).toBeOnTheScreen());
    expect(screen.getByText(/2 koli · 7,4 kg/)).toBeOnTheScreen();
    // Süresi BİLDİRİLMEYEN seçenek gizlenmiyor, "bilinmiyor" yazıyor (CLAUDE §1).
    expect(screen.getByText(/teslim süresi bildirilmiyor/)).toBeOnTheScreen();

    net.announce = {
      status: 'ok',
      shipmentId: '00000000-0000-4000-8000-0000000000f1',
      parcels: [
        { boxId: '00000000-0000-4000-8000-0000000000b1', trackingNumber: 'CH0001', labelKey: 'k1' },
        { boxId: '00000000-0000-4000-8000-0000000000b2', trackingNumber: 'CH0002', labelKey: 'k2' },
      ],
      labelFailures: [],
    };
    await fireEvent.press(screen.getByTestId('warehouse-dispatch-option-chronopost:classic'));

    await waitFor(() => expect(screen.getByTestId('warehouse-dispatch-done')).toBeOnTheScreen());
    expect(screen.getByText('CH0001')).toBeOnTheScreen();
    expect(screen.getByText('CH0002')).toBeOnTheScreen();
    // Yazıcı modülü bu derlemede yok — kart bunu SÖYLÜYOR, sessiz kalıp "bastı" sandırmıyor.
    expect(screen.getByText(/yazıcı modülü yok/)).toBeOnTheScreen();
  });

  /*
    LİSTE DARALTILDIYSA SÖYLENİR (Faz 2 · kullanıcı kararı 29.08).

    Bayrak sunucuda 29.08'den beri üretiliyordu ama sözleşmede karşılığı yoktu ve `.parse` onu her
    cevapta siliyordu — depocu daraltılmış listeye TAM liste diye bakıyordu. Test iki şeyi birden
    tutuyor: uyarının çizilmesini ve BOŞ listenin doğru sebebi söylemesini.
  */
  it('ücretsiz kargoda liste EVE daraltıldığını söyler', async () => {
    await sonKutuyuKapat('shipping');
    net.dispatchOptions = {
      status: 'ok',
      parcelCount: 1,
      totalWeightG: 3200,
      homeOnly: true,
      options: [
        { code: 'colissimo:home', carrierName: 'Colissimo', name: 'Domicile', priceCents: 892, leadTimeHours: 48, lastMile: 'home_delivery', tracked: true },
      ],
    };
    await fireEvent.press(screen.getByTestId('warehouse-dispatch-start'));

    await waitFor(() => expect(screen.getByTestId('warehouse-dispatch-sheet')).toBeOnTheScreen());
    expect(screen.getByText(/koli EVE gider/)).toBeOnTheScreen();
  });

  it('daraltma listeyi BOŞALTTIYSA sebep taşıyıcıda değil kuralda aranır', async () => {
    await sonKutuyuKapat('shipping');
    net.dispatchOptions = { status: 'ok', parcelCount: 1, totalWeightG: 3200, homeOnly: true, options: [] };
    await fireEvent.press(screen.getByTestId('warehouse-dispatch-start'));

    await waitFor(() => expect(screen.getByTestId('warehouse-dispatch-sheet')).toBeOnTheScreen());
    // "uygun servis çıkmadı" tek başına depocuyu koliye/taşıyıcıya baktırırdı; sebep KURAL.
    expect(screen.getByText(/teslimat noktaları ücretsiz kargoda kullanılmıyor/)).toBeOnTheScreen();
  });

  it('daraltma YOKSA uyarı hiç çizilmez — her listeye asılan not okunmaz olurdu', async () => {
    await sonKutuyuKapat('shipping');
    net.dispatchOptions = {
      status: 'ok',
      parcelCount: 1,
      totalWeightG: 3200,
      homeOnly: false,
      options: [
        { code: 'mr:point', carrierName: 'Mondial Relay', name: 'Point', priceCents: 1050, leadTimeHours: null, lastMile: 'service_point', tracked: true },
      ],
    };
    await fireEvent.press(screen.getByTestId('warehouse-dispatch-start'));

    await waitFor(() => expect(screen.getByTestId('warehouse-dispatch-sheet')).toBeOnTheScreen());
    expect(screen.queryByText(/koli EVE gider/)).toBeNull();
  });

  it('ön koşul tutmazsa SEBEP yazılır — "olmadı" değil', async () => {
    await sonKutuyuKapat('shipping');
    net.dispatchOptions = { status: 'unmeasured', variantIds: ['00000000-0000-4000-8000-000000000031'] };

    await fireEvent.press(screen.getByTestId('warehouse-dispatch-start'));

    await waitFor(() => expect(screen.getByTestId('warehouse-dispatch-blocked')).toBeOnTheScreen());
    expect(screen.getByTestId('warehouse-dispatch-blocked')).toHaveTextContent(/ambalaj ağırlığı yazılmamış/);
    // Çekmece hiç açılmadı: cevabı olmayan bir listeyi göstermek boş bir seçim ekranı olurdu.
    expect(screen.queryByTestId('warehouse-dispatch-sheet')).toBeNull();
  });
});
