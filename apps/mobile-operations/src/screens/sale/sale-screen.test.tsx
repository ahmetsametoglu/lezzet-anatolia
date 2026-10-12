import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { SaleCatalogProduct, SalePlace, SaleVariant, StaffCustomerOption, StaffWarehouse } from '@lezzet/types';

import { SaleScreen } from './sale-screen';
import { SaleCartScreen } from './sale-cart-screen';
import { SaleHistoryScreen } from './sale-history-screen';
import { SaleReceiptScreen } from './sale-receipt-screen';
import { saleCopy } from './copy';
import { SaleProvider, useSaleContext } from './sale-context';
import { ToastHost } from '@lezzet/mobile-kit/src/components/ui/toast-host';
import { resetToast } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import { resetWarehouseStatus } from '@/screens/warehouse/warehouse-status';
import { chooseWarehouse, resetWarehouseChoice } from '@/lib/operations/warehouse-choice';
import type { OperationsSection } from '@/lib/operations/sections';
import { DEVICE_STORE_KEYS } from '@lezzet/mobile-kit/src/lib/storage/device-store';

/*
  Yerinde satışın para iddiaları: pazarlık fiyatı yalnız dokunulan kalemle gider, değişmeyen kalemin fiyatını sunucu çözer;
  `insufficient_here` cevabı sepeti bozmaz, personel adedi düşürüp yeniden dener. Ağ fetch düzeyinde sahte, URL'e göre dallanır.
*/

/* Cihaz deposu bellek içinde: bekleyen satış kaydı gerçek okuma/yazma yolundan geçer, yalnız SecureStore sahtedir. */
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: (key: string) => Promise.resolve(mockStore.get(key) ?? null),
  setItemAsync: (key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  },
  deleteItemAsync: (key: string) => {
    mockStore.delete(key);
    return Promise.resolve();
  },
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn(), back: jest.fn(), replace: mockReplace }),
}));

const mockSession = { access_token: 'test-token' };
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
    },
  }),
}));

/*
  Kart çizim sayacı: dokunuş ve boy cevabı kart listesini animasyonla aynı karede yeniden çizdirirse çekmece kasarak açılır.
  `PressableSurface` sahtesi ürün kartı çizimlerini sayar; iddia "dokunuştan sonra sayaç 0".
*/
const mockRowRenders = { count: 0 };
jest.mock('@lezzet/mobile-kit/src/components/ui/pressable-surface', () => {
  const React = jest.requireActual('react');
  const { Pressable } = jest.requireActual('react-native');
  return {
    PressableSurface: (props: Record<string, unknown>) => {
      if (typeof props.testID === 'string' && props.testID.startsWith('sale-product-')) mockRowRenders.count += 1;
      // `feedback`/`compact` kitin süsü — RN Pressable tanımaz, sahteye geçirilmez.
      const { children, feedback, compact, ...rest } = props;
      void feedback;
      void compact;
      return React.createElement(Pressable, rest, children);
    },
  };
});

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

const TEK_ID = '00000000-0000-4000-8000-000000000a01';
const TEK_VARYANT = '00000000-0000-4000-8000-000000000a11';
const COK_ID = '00000000-0000-4000-8000-000000000b01';
const COK_VARYANT_1 = '00000000-0000-4000-8000-000000000b11';
const COK_VARYANT_2 = '00000000-0000-4000-8000-000000000b12';

/** Sözleşme şeklinde kart — istemci Zod ile parse ediyor, eksik alan testte kırılır (doğrusu bu). */
function saleProduct(overrides: Partial<SaleCatalogProduct>): SaleCatalogProduct {
  return {
    id: TEK_ID,
    slug: 'simit',
    name: 'Simit',
    image: { url: null, crop: { x: 50, y: 50, zoom: 100 }, frames: null },
    unitLabel: '1 adet',
    variantId: TEK_VARYANT,
    purchaseMode: 'quick',
    variantCount: 1,
    priceCents: 450,
    comparisonCents: null,
    comparisonUnit: null,
    limitLabel: null,
    stockId: null,
    stockStatus: 'available',
    soldOut: false,
    availableHere: 4,
    ...overrides,
  };
}

function saleVariant(overrides: Partial<SaleVariant>): SaleVariant {
  return {
    id: COK_VARYANT_1,
    netQuantity: 500, netUnit: 'g',
    label: '500 g',
    priceCents: 900,
    comparisonCents: null,
    comparisonUnit: null,
    limitLabel: null,
    stockId: null,
    stockStatus: 'available',
    soldOut: false,
    availableHere: 6,
    ...overrides,
  };
}

const TEK = saleProduct({});
const COK = saleProduct({
  id: COK_ID,
  slug: 'baklava',
  name: 'Baklava',
  unitLabel: '',
  variantId: COK_VARYANT_1,
  purchaseMode: 'options',
  variantCount: 2,
  priceCents: 900,
});

const BOYLAR = [
  saleVariant({}),
  saleVariant({ id: COK_VARYANT_2, netQuantity: 1000, netUnit: 'g', label: '1 kg', priceCents: 1700, availableHere: 2 }),
];

/** Ağın senaryosu: katalog + boylar + kesin tutar + satış cevabı. Satışın ve kesin tutarın cevabını testin kendisi belirler. */
function withNetwork(saleResult: unknown, quoteResult: unknown = { status: 'ok', totalCents: 450 }) {
  fetchMock.mockImplementation((url, init) => {
    const path = String(url);
    if (init?.method === 'POST' && path.includes('/on-site/quote')) return Promise.resolve(ok(quoteResult));
    if (init?.method === 'POST') return Promise.resolve(ok(saleResult));
    if (path.includes('/variants')) return Promise.resolve(ok({ productId: COK_ID, name: 'Baklava', variants: BOYLAR }));
    if (path.includes('/recent')) return Promise.resolve(ok({ sales: SATISLAR }));
    return Promise.resolve(ok({ products: [TEK, COK], total: 2, nextCursor: null }));
  });
}

/** Okutma cevabı — öteki dallar `withNetwork`ten; yalnız `/scan` üstüne biniyor. */
function withScan(scanResult: unknown, saleResult: unknown = { status: 'ok' }) {
  withNetwork(saleResult);
  const temel = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url, init) =>
    String(url).includes('/sale/scan') ? Promise.resolve(ok(scanResult)) : temel(url, init),
  );
}

/** Satışı yazan istekler; kesin tutarın okunması yazım değildir ve sayılmaz. */
function salePosts() {
  return fetchMock.mock.calls.filter((entry) => entry[1]?.method === 'POST' && !String(entry[0]).includes('/on-site/quote'));
}

function postBody(): {
  lines: { variantId: string; qty: number; negotiatedUnitPriceCents?: number }[];
  paymentMethod: string;
  collectedAmountCents?: number;
  idempotencyKey?: string;
} {
  const call = salePosts().at(-1);
  return JSON.parse(String(call?.[1]?.body ?? '{}'));
}

/** Kartta "tamamla" önce kesin tutarı okur; çekmece açılınca personel kart ödemesinin alındığını onaylar. */
async function completeSale() {
  await fireEvent.press(screen.getByTestId('sale-cta'));
  await waitFor(() => expect(screen.getByTestId('sale-confirm-sheet-confirm')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('sale-confirm-sheet-confirm'));
}

/** Satış ekranı pazarlık yetkisini oturumdan okur (yönetici = Yönetim bölümü); varsayılan oturum yönetici olmayan depocudur. */
function withSession(children: ReactNode, sections: OperationsSection[] = ['warehouse']) {
  return (
    <OperationsSessionProvider
      value={{ sections, userName: 'Deniz Arslan', userEmail: 'depo@example.test', warehouses: [], resolvedWarehouseId: null }}
    >
      {children}
    </OperationsSessionProvider>
  );
}

async function renderSale(place: SalePlace = 'facility', sections: OperationsSection[] = ['warehouse'], extra?: ReactNode) {
  // Katalog + sepet AYNI sağlayıcı altında birlikte çizilir: akış testleri rota geçişini değil,
  // iki yüzeyin ORTAK durumunu sınar (gezinme expo-router'ın işi, bizim iddiamız değil).
  await render(
    withSession(
      <SaleProvider place={place}>
        <SaleScreen />
        <SaleCartScreen />
        {/* Fiş de aynı sağlayıcının altında, çünkü satış yazılınca ekran `/sale/receipt`e geçer ve sonuç orada okunur; geçişin
            kendisi de burada ölçülür. */}
        <SaleReceiptScreen />
        {/* Toast taşıyıcısı testte de çizilir, çünkü olumsuz cevaplar bu kanaldan geçer. */}
        <ToastHost />
        {extra}
      </SaleProvider>,
      sections,
    ),
  );
  await waitFor(() => expect(screen.getByTestId(`sale-product-${TEK_ID}`)).toBeTruthy());
}

const MUSTERI: StaffCustomerOption = {
  id: '00000000-0000-4000-8000-000000000c01',
  name: 'Restaurant Oberjaegerhof',
  phone: null,
  email: null,
  type: 'company',
  channel: 'b2b',
  isDraft: false,
  siret: null,
  b2bPending: false,
  credit: { termDays: 30, limitCents: 150_000, remainingCents: 124_000, overdue: false },
};

/** Seçicinin yerine geçer: seçim satış bağlamına yazılır; seçicinin kendisi bu dosyanın konusu değil. */
function MusteriSec() {
  const sale = useSaleContext();
  return <Pressable testID="test-musteri-sec" onPress={() => sale.setCustomer(MUSTERI)} />;
}

/** Tek boylu ürünü çekmeceden sepete ekler (varsayılan adet 1, fiyata dokunmadan). */
async function addSimit() {
  await fireEvent.press(screen.getByTestId(`sale-product-${TEK_ID}`));
  await waitFor(() => expect(screen.getByTestId('sale-drawer-confirm')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('sale-drawer-confirm'));
  await waitFor(() => expect(screen.getByTestId(`sale-cart-${TEK_VARYANT}`)).toBeTruthy());
}

/** Cihazda bekleyen satış kaydı — varsayılan oturumun hesabı ve tesis yeri; gün ve kimlik testten gelir. */
function bekleyenSatis(over: { key: string; createdAt: string }) {
  return {
    account: 'depo@example.test',
    place: 'facility',
    warehouseId: null,
    payment: 'cash',
    lines: [
      {
        variantId: TEK_VARYANT,
        name: 'Simit',
        qty: 1,
        listPriceCents: 450,
        negotiatedCents: null,
        availableHere: 4,
        image: { url: null, crop: { x: 50, y: 50, zoom: 100 }, frames: null },
      },
    ],
    ...over,
  };
}

/** Tahsilat türünün varsayılanı yok; satışa giden her test onu bilinçli seçer. */
async function pickCash() {
  await fireEvent.press(screen.getByTestId('sale-payment-cash'));
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockReplace.mockReset();
  // Çevrimdışı sinyali KÜRESELDİR (depo ekranlarıyla ortak); sıfırlanmazsa bir testin düşen isteği
  // sonraki testin ekranını kilitli açardı.
  resetWarehouseStatus();
  // Depo seçimi de MODÜL DÜZEYİNDE: bir testin seçtiği depo, sonrakinin adresine sessizce eklenirdi.
  resetWarehouseChoice();
  // Toast MODÜL düzeyinde: sayacı düşmezse mesaj sonraki teste sızar, süreç de kapanmaz.
  resetToast();
  mockStore.clear();
});

it('kart kalan adedi yazıyor — personel satmayı denemeden okuyor', async () => {
  withNetwork({ status: 'failed' });
  await renderSale();

  expect(screen.getByText('kalan 4')).toBeTruthy();
  // Çok boylu kart adet değil boy sayısı söyler: karar çekmecede, boy boy verilir.
  expect(screen.getByText('2 boy — dokun, seç')).toBeTruthy();
});

it('dokunulmamış fiyat İSTEKTE YOK; satış yazılınca sepet sıfırlanır ve referans okunur', async () => {
  withNetwork({ status: 'ok', orderId: TEK_ID, totalCents: 450, referenceNo: 'SP-26-0009', paymentRecorded: true });
  await renderSale();
  await addSimit();
  await pickCash();

  await fireEvent.press(screen.getByTestId('sale-cta'));
  await waitFor(() => expect(screen.getByTestId('sale-receipt-card')).toBeTruthy());

  // Nakitte onay çekmecesi yoktur: kesin tutar sorulmadan satış doğrudan gider.
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/on-site/quote'))).toBe(false);
  const body = postBody();
  expect(body.paymentMethod).toBe('cash');
  expect(body.lines).toEqual([{ variantId: TEK_VARYANT, qty: 1 }]); // negotiated alanı HİÇ yok
  // Sonuç fişte okunur: tutar, tahsilat türü ve referans bir arada.
  expect(mockReplace).toHaveBeenCalledWith('/sale/receipt');
  expect(screen.getByTestId('sale-receipt-total')).toHaveTextContent(/4,50/);
  expect(screen.getByTestId('sale-receipt-meta')).toHaveTextContent(/Nakit · SP-26-0009/);
  expect(screen.queryByTestId(`sale-cart-${TEK_VARYANT}`)).toBeNull(); // satış kapandı, sepet boş
});

it('vadeli satış müşterinin adına, havale yöntemi ve vadeli bayrağıyla gider; fiş tahsilat beklemez', async () => {
  withNetwork({ status: 'ok', orderId: TEK_ID, totalCents: 475, referenceNo: 'SP-26-0010', paymentRecorded: false });
  await renderSale('facility', ['warehouse'], <MusteriSec />);
  await fireEvent.press(screen.getByTestId('test-musteri-sec'));
  // Fiyat müşteriye göre çözülür: katalog onun adıyla yeniden okunur.
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes(`customerId=${MUSTERI.id}`))).toBe(true));
  await waitFor(() => expect(screen.getByTestId(`sale-product-${TEK_ID}`)).toBeTruthy());
  await addSimit();

  await fireEvent.press(screen.getByTestId('sale-payment-credit'));
  await fireEvent.press(screen.getByTestId('sale-cta'));
  await waitFor(() => expect(screen.getByTestId('sale-receipt-card')).toBeTruthy());

  expect(postBody()).toMatchObject({ paymentMethod: 'bank_transfer', onAccount: true });
  // Vadelide kapıda para alınmaz: kesin tutar sorulmadan satış doğrudan gider.
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/on-site/quote'))).toBe(false);
  expect(String(salePosts().at(-1)?.[0])).toContain(`customerId=${MUSTERI.id}`);
  expect(screen.getByTestId('sale-receipt-credit')).toBeTruthy();
  expect(screen.queryByTestId('sale-receipt-payment-missing')).toBeNull();
});

it('pazarlık fiyatı yalnız DEĞİŞTİRİLEN kalemde gider (yönetici)', async () => {
  withNetwork({ status: 'ok', orderId: TEK_ID, totalCents: 400, referenceNo: null, paymentRecorded: true });
  await renderSale('facility', ['warehouse', 'management']);

  await fireEvent.press(screen.getByTestId(`sale-product-${TEK_ID}`));
  await waitFor(() => expect(screen.getByTestId('sale-drawer-price')).toBeTruthy());
  await fireEvent.changeText(screen.getByTestId('sale-drawer-price'), '4,00');
  await fireEvent.press(screen.getByTestId('sale-drawer-confirm'));
  await waitFor(() => expect(screen.getByTestId(`sale-cart-${TEK_VARYANT}`)).toBeTruthy());
  await pickCash();

  await fireEvent.press(screen.getByTestId('sale-cta'));
  await waitFor(() => expect(salePosts()).toHaveLength(1));

  expect(postBody().lines).toEqual([{ variantId: TEK_VARYANT, qty: 1, negotiatedUnitPriceCents: 400 }]);
});

it('yönetici olmayan personel fiyatı değiştiremez — satış liste fiyatıyla gider', async () => {
  withNetwork({ status: 'ok', orderId: TEK_ID, totalCents: 500, referenceNo: null, paymentRecorded: true });
  await renderSale();

  await fireEvent.press(screen.getByTestId(`sale-product-${TEK_ID}`));
  await waitFor(() => expect(screen.getByTestId('sale-drawer-price')).toBeTruthy());
  await fireEvent.changeText(screen.getByTestId('sale-drawer-price'), '4,00');
  await fireEvent.press(screen.getByTestId('sale-drawer-confirm'));
  await waitFor(() => expect(screen.getByTestId(`sale-cart-${TEK_VARYANT}`)).toBeTruthy());
  await pickCash();

  await fireEvent.press(screen.getByTestId('sale-cta'));
  await waitFor(() => expect(salePosts()).toHaveLength(1));

  expect(postBody().lines).toEqual([{ variantId: TEK_VARYANT, qty: 1 }]);
});

it('yetersiz stok cevabı adı ve kalanıyla görünür — sepet BOZULMAZ', async () => {
  withNetwork({ status: 'insufficient_here', lines: [{ name: 'Simit', available: 3 }] });
  await renderSale();
  await addSimit();
  await pickCash();

  await fireEvent.press(screen.getByTestId('sale-cta'));
  /* Cevap toast'ta, çünkü düğmenin üstündeki cümle bir sonraki eyleme kadar asılı kalırdı. Ölçülen şey: personel müşteriye
     "üçü var" diyebilmeli. */
  await waitFor(() => expect(screen.getByTestId('toast-message')).toBeTruthy());
  expect(screen.getByTestId('toast-message')).toHaveTextContent(/Simit \(kalan 3\)/);
  // Sepet duruyor: personel adedi düşürüp yeniden dener, her şeyi baştan seçmez.
  expect(screen.getByTestId(`sale-cart-${TEK_VARYANT}`)).toBeTruthy();
});

it('çok boylu ürün boyunu çekmecede seçer — istek SEÇİLEN boyun kimliğini taşır', async () => {
  withNetwork({ status: 'ok', orderId: COK_ID, totalCents: 1700, referenceNo: null, paymentRecorded: true });
  await renderSale();

  await fireEvent.press(screen.getByTestId(`sale-product-${COK_ID}`));
  await waitFor(() => expect(screen.getByTestId(`sale-variant-${COK_VARYANT_2}`)).toBeTruthy());
  await fireEvent.press(screen.getByTestId(`sale-variant-${COK_VARYANT_2}`));
  await fireEvent.press(screen.getByTestId('sale-drawer-confirm'));
  await waitFor(() => expect(screen.getByTestId(`sale-cart-${COK_VARYANT_2}`)).toBeTruthy());
  await pickCash();

  await fireEvent.press(screen.getByTestId('sale-cta'));
  await waitFor(() => expect(salePosts()).toHaveLength(1));

  expect(postBody().lines).toEqual([{ variantId: COK_VARYANT_2, qty: 1 }]);
});

it('tahsilat türü SEÇİLMEDEN satış yazılamaz — para yazan alanda varsayılan yok', async () => {
  /*
    Kartla tahsil edilip "nakit" yazılan satış sefer kapanışının nakit beklentisini sessizce bozar; önseçim olsaydı satış hiç
    dokunmadan kapanırdı. Bu yüzden tür seçilmeden sepet doluyken bile CTA kapalı ve tek POST atılmaz.
  */
  withNetwork({ status: 'ok', orderId: TEK_ID, totalCents: 450, referenceNo: null, paymentRecorded: true });
  await renderSale();
  await addSimit();

  expect(screen.getByText(saleCopy.cta.pickPayment)).toBeTruthy();
  await fireEvent.press(screen.getByTestId('sale-cta'));
  expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(false);

  // Seçim gelince aynı düğme satışı yazar — ve başarıda seçim SIFIRLANIR (miras yok).
  await pickCash();
  await fireEvent.press(screen.getByTestId('sale-cta'));
  await waitFor(() => expect(screen.getByTestId('sale-receipt-card')).toBeTruthy());
  expect(postBody().paymentMethod).toBe('cash');
  // Referanssız satışta fiş SUSMAZ, "referanssız" der — boş bir alan bırakmak soru doğururdu.
  expect(screen.getByTestId('sale-receipt-meta')).toHaveTextContent(/Nakit · referanssız/);
  expect(screen.queryByTestId(`sale-cart-${TEK_VARYANT}`)).toBeNull(); // satış kapandı, sepet boşaldı
});

it('kartla satış para alınmadan YAZILMAZ: kesin tutar onay çekmecesinde, vazgeçilirse satış gitmez, onaylanınca o tutarla yazılır', async () => {
  // Sepetin tahmini 4,50; kesin tutar sunucudan farklı gelir ve çekmece onu söyler.
  withNetwork(
    { status: 'ok', orderId: TEK_ID, totalCents: 512, referenceNo: 'SP-26-0020', paymentRecorded: true },
    { status: 'ok', totalCents: 512 },
  );
  await renderSale();
  await addSimit();
  await fireEvent.press(screen.getByTestId('sale-payment-card'));

  await fireEvent.press(screen.getByTestId('sale-cta'));
  await waitFor(() => expect(screen.getByTestId('sale-confirm-sheet-confirm')).toBeTruthy());
  expect(screen.getByText(/Kartla 5,12/)).toBeTruthy();
  expect(salePosts()).toHaveLength(0);

  await fireEvent.press(screen.getByTestId('sale-confirm-sheet-cancel'));
  await waitFor(() => expect(screen.queryByTestId('sale-confirm-sheet-confirm')).toBeNull());
  expect(salePosts()).toHaveLength(0);
  expect(screen.getByTestId(`sale-cart-${TEK_VARYANT}`)).toBeTruthy();

  await completeSale();
  await waitFor(() => expect(screen.getByTestId('sale-receipt-card')).toBeTruthy());
  expect(salePosts()).toHaveLength(1);
  expect(postBody()).toMatchObject({ paymentMethod: 'card', collectedAmountCents: 512 });
});

it('karta dokunmak KART LİSTESİNİ yeniden çizdirmez — çekmece animasyonu listeyle yarışmaz', async () => {
  /*
    Çok boylu kart en ağır yol: dokunuş çekmeceyi açar VE boy çağrısı atar; eski kodda ikisi de
    tüm listeyi yeniden çizdiriyordu (animasyonla aynı karede — cihazda kasma olarak görüldü).
    `memo` + kararlı `onOpen` ile ikisinde de kartlara dokunulmaz.
  */
  withNetwork({ status: 'failed' });
  await renderSale();

  mockRowRenders.count = 0;
  await fireEvent.press(screen.getByTestId(`sale-product-${COK_ID}`));
  await waitFor(() => expect(screen.getByTestId(`sale-variant-${COK_VARYANT_2}`)).toBeTruthy());

  expect(mockRowRenders.count).toBe(0);
});

it('sayaç kalanda durur — tek boylu kartın çekmecesi boy sormaz, adet kitin sayacı', async () => {
  withNetwork({ status: 'failed' });
  await renderSale();

  await fireEvent.press(screen.getByTestId(`sale-product-${TEK_ID}`));
  await waitFor(() => expect(screen.getByTestId('sale-drawer-qty-value')).toBeTruthy());
  // Tek boylu: "BOY SEÇ" bölümü yok, boy başlıkta.
  expect(screen.queryByText('BOY SEÇ')).toBeNull();
  // Kalan 4 → beş kez artır: sayaç 4'te söner, 5'e çıkmaz; fazla adet uyarısı hiç doğmaz.
  for (let i = 0; i < 5; i += 1) {
    await fireEvent.press(screen.getByLabelText('Satılan adet — artır'));
  }
  expect(screen.getByTestId('sale-drawer-qty-value')).toHaveTextContent('4');
  expect(screen.queryByTestId('sale-drawer-overstock')).toBeNull();
  expect(screen.getByTestId('sale-drawer-confirm')).not.toBeDisabled();
});

it('okutmayla gelen adet kalanı aşınca çekmece onaylatmaz ve sebebini söyler', async () => {
  /* Sayaç `+`yı kalanda söndürür; kalanın ÜSTÜNDE bir adet yalnız okutmayla gelir — koli çarpanı
     (6) kalandan (2) büyük. Sessizce kırpılmaz: kurye kolinin tamamını satamayacağını görür. */
  withScan({ status: 'ok', product: COK, variant: BOYLAR[1], qtyPerCode: 6 });
  await renderSale();

  await fireEvent.press(screen.getByTestId('sale-scan-fab'));
  await fireEvent(screen.getByTestId('sale-scan-sheet'), 'scan', 'KOLI-1KG');

  await waitFor(() => expect(screen.getByTestId('sale-drawer-overstock')).toBeTruthy());
  expect(screen.getByTestId('sale-drawer-qty-value')).toHaveTextContent('6');
  expect(screen.getByTestId('sale-drawer-confirm')).toBeDisabled();
  await fireEvent.press(screen.getByTestId('sale-drawer-confirm'));
  expect(screen.queryByTestId(`sale-cart-${COK_VARYANT_2}`)).toBeNull(); // sepete yazılmadı
});

// Okutma tek yerdedir; akışta ikinci bir okutma düğmesi aynı işin iki yolunu gösterirdi.
it('okutma YALNIZ yüzen dairededir — ekranda ikinci okutma düğmesi yok', async () => {
  withNetwork({ status: 'failed' });
  await renderSale();

  expect(screen.getAllByLabelText(saleCopy.scanCta)).toHaveLength(1);
});

it('yüzen daire okutmayı açar; simülasyon çipinin altında okutulacak ÜRÜNÜN ADI yazar', async () => {
  /* Yerinde satışta da barkod düğmesi var ve çiplerde ürün adı yazar. Ad aynı `/sale/scan` ucundan çözülür: çipin altındaki ad,
     basınca açılacak çekmecenin başlığıdır. */
  withScan({ status: 'ok', product: COK, variant: { ...BOYLAR[1], availableHere: 12 }, qtyPerCode: 6 });
  await renderSale();

  await fireEvent.press(screen.getByTestId('sale-scan-fab'));
  await waitFor(() => expect(screen.getByTestId('sale-scan-sheet')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('scan-dev-chip-name-8691000007919')).toHaveTextContent('Baklava · 1 kg'));
});

const SATISLAR = [
  {
    orderId: '00000000-0000-4000-8000-000000000c01',
    referenceNo: 'LA-26-TEST01',
    totalCents: 1120,
    paymentMethod: 'cash',
    createdAt: '2026-08-26T13:30:00.000Z',
    lineCount: 2,
    sellerName: 'Marc Lemoine',
  },
  {
    orderId: '00000000-0000-4000-8000-000000000c02',
    referenceNo: null,
    totalCents: 500,
    paymentMethod: 'card',
    createdAt: '2026-08-26T12:00:00.000Z',
    lineCount: 1,
    sellerName: null,
  },
];

/** Kapsamı tek tesis olan personel; künyenin tesis adını yazdığı hâl. */
const STR: StaffWarehouse = { id: 'w-str', code: 'STR', name: 'Strasbourg Merkez', kind: 'facility' };

/**
 * Geçmiş ekranı oturum künyesini okur, yani kabuk sağlayıcısı olmadan çizilemez: sağlayıcısız çağrı boş değer dönmez, fırlatır
 * (`sections-context`). Kapıyı geçmemiş bir ekranı yetkili gibi göstermemenin bedeli bu.
 */
async function renderHistory(warehouse: StaffWarehouse | null = null) {
  await render(
    <OperationsSessionProvider
      value={{
        sections: ['warehouse'],
        userName: 'Deniz Arslan',
        userEmail: 'depo@lezzetanatolia.fr',
        warehouses: warehouse === null ? [] : [warehouse],
        resolvedWarehouseId: warehouse?.id ?? null,
      }}
    >
      {/* Sağlayıcı burada da sarar, çünkü ekran satış yerini okur (`useSalePlace`); uygulamada zaten `sale/_layout`ın altında
          durur. */}
      <SaleProvider place="facility">
        <SaleHistoryScreen />
      </SaleProvider>
    </OperationsSessionProvider>,
  );
}

it('SON SATIŞLAR kim sattıysa onu söylüyor — iz yoksa uydurmuyor', async () => {
  withNetwork({ status: 'failed' });
  await renderHistory();
  await waitFor(() => expect(screen.getByTestId(`sale-history-${SATISLAR[0]!.orderId}`)).toBeTruthy());

  expect(screen.getByText('LA-26-TEST01')).toBeTruthy();
  // Ad künyenin yanında, öneksiz: aranan şey adın kendisidir.
  expect(screen.getByText('Marc Lemoine')).toBeTruthy();
  // Aktörsüz kayıt "bilinmiyor" der — boş bırakmaz, ad da uydurmaz.
  expect(screen.getByText('satan bilinmiyor')).toBeTruthy();
  expect(screen.getByText('referanssız')).toBeTruthy();
  // Listenin NE OLDUĞU dipnotta: "kim sattı"nın tek cevabı bu liste.
  expect(screen.getByTestId('sale-history-footnote')).toHaveTextContent(/tek cevabı bu liste/);
});

/*
  Künye tesisin adıyla, çünkü ad listenin süzgecidir: uç `listRecentDoorSales(db, warehouseId)` ile okur. Çok depolu personele
  hangi tesisin kasasına baktığını söylememek iki tesisin satışlarını tek listeymiş gibi okuturdu.
*/
it('SON SATIŞLAR künyesi hangi tesisin kasası olduğunu söyler', async () => {
  withNetwork({ status: 'failed' });
  await renderHistory(STR);
  await waitFor(() => expect(screen.getByTestId(`sale-history-${SATISLAR[0]!.orderId}`)).toBeTruthy());

  expect(screen.getByTestId('sale-history-header')).toHaveTextContent(/Strasbourg Merkez/);
});

it('tesis adı yoksa künye KUYRUKSUZ kalır — uydurma bir tesis yazılmaz', async () => {
  withNetwork({ status: 'failed' });
  await renderHistory();
  await waitFor(() => expect(screen.getByTestId(`sale-history-${SATISLAR[0]!.orderId}`)).toBeTruthy());

  expect(screen.getByTestId('sale-history-header')).not.toHaveTextContent(/Strasbourg/);
});

/*
  İlk yük iskeletle çizilir, halkayla değil; ayıran iz rol: halka (`LoadingState`) kendini `progressbar` diye tanıtır, iskelet
  tanıtmaz. Metne ya da testID'ye bakmak yetmezdi, çünkü ikisi de aynı "Yükleniyor…" cümlesini taşıyor.
*/
describe('ilk yük iskeleti (06.09)', () => {
  /*
    Cevabı BEKLETMEK şart: `render` efektleri boşaltıyor ve normal sahte ağ aynı karede cevap
    verdiği için yükleme hâli hiç gözlemlenemiyordu. Elle çözülen bir söz, o hâli açık tutuyor —
    zamanlamaya bahis oynayan bir `sleep` değil, belirlenimci bir kapı.
  */
  function withPendingNetwork(): () => void {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    fetchMock.mockImplementation((url) => {
      const path = String(url);
      const body = path.includes('/recent')
        ? ok({ sales: SATISLAR })
        : ok({ products: [TEK, COK], total: 2, nextCursor: null });
      return gate.then(() => body);
    });
    return release;
  }

  it('KATALOG iskeletle açılır — halka çizilmez', async () => {
    const release = withPendingNetwork();
    await render(
      withSession(
        <SaleProvider place="facility">
          <SaleScreen />
        </SaleProvider>,
      ),
    );

    expect(screen.getByTestId('sale-loading')).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar')).toBeNull();

    // Ve veri gelince iskelet gerçekten kalkıyor — sonsuza kadar duran bir iskelet de arızadır.
    release();
    await waitFor(() => expect(screen.getByTestId(`sale-product-${TEK_ID}`)).toBeTruthy());
    expect(screen.queryByTestId('sale-loading')).toBeNull();
  });

  it('GEÇMİŞ de iskeletle açılır — halka çizilmez', async () => {
    const release = withPendingNetwork();
    await render(
      <OperationsSessionProvider
        value={{
          sections: ['warehouse'],
          userName: 'Deniz Arslan',
          userEmail: 'depo@lezzetanatolia.fr',
          warehouses: [],
          resolvedWarehouseId: null,
        }}
      >
        <SaleProvider place="facility">
          <SaleHistoryScreen />
        </SaleProvider>
      </OperationsSessionProvider>,
    );

    expect(screen.getByTestId('sale-history-loading')).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar')).toBeNull();

    release();
    await waitFor(() => expect(screen.getByTestId(`sale-history-${SATISLAR[0]!.orderId}`)).toBeTruthy());
    expect(screen.queryByTestId('sale-history-loading')).toBeNull();
  });
});

describe('çevrimdışı kilidi (v3:20)', () => {
  /*
    Kilit DEPONUNKİYLE aynı sinyalden okunuyor: yerinde satış zaten depo kapsamlı bir yazmadır.
    Ölçülen şey ikisinin AYNI ağ düşüşüne aynı anda tepki verdiği — sepete ekleme de, satış yazma
    da kapanıyor ve ikisi de sebebini söylüyor.
  */
  /*
    Barkod okutma sepete doğrudan yazmaz: kartla açılan aynı çekmece boy seçili ve adet koli çarpanıyla açılır. Kurye adedi görüp
    onaylar; 12'lik koli barkodunu okutan biri sepetinde sessizce 12 kalem bulmamalı.
  */
  it('OKUTMA çekmeceyi açar — okutulan boy seçili, adet koli çarpanı', async () => {
    /* Kalan 12: koli çarpanı (6) kalanı aşmamalı, yoksa sınanan şey okutma değil stok kilidi olur. */
    withScan({ status: 'ok', product: COK, variant: { ...BOYLAR[1], availableHere: 12 }, qtyPerCode: 6 });
    await renderSale();

    await fireEvent.press(screen.getByTestId('sale-scan-fab'));
    await fireEvent(screen.getByTestId('sale-scan-sheet'), 'scan', 'KOLI-1KG');

    await waitFor(() => expect(screen.getByTestId('sale-drawer-confirm')).toBeTruthy());
    // Boy sorulmaz: başlıkta durur, çip yok; adet 6 ile açılır.
    expect(screen.getByText('Baklava · 1 kg')).toBeTruthy();
    expect(screen.queryByTestId(`sale-variant-${COK_VARYANT_2}`)).toBeNull();
    expect(screen.queryByTestId(`sale-variant-${COK_VARYANT_1}`)).toBeNull();
    expect(screen.getByTestId('sale-drawer-qty-value')).toHaveTextContent('6');

    await fireEvent.press(screen.getByTestId('sale-drawer-confirm'));
    await waitFor(() => expect(screen.getByTestId(`sale-cart-${COK_VARYANT_2}`)).toBeTruthy());
    expect(screen.getByTestId(`sale-cart-${COK_VARYANT_2}`)).toHaveTextContent(/6 ×/);
  });

  it('TANINMAYAN kod sepete hiçbir şey koymaz, sebebini toast söyler', async () => {
    withScan({ status: 'unknown_code' });
    await renderSale();

    await fireEvent.press(screen.getByTestId('sale-scan-fab'));
    await fireEvent(screen.getByTestId('sale-scan-sheet'), 'scan', 'YOK-123');

    await waitFor(() => expect(screen.getByTestId('toast-message')).toHaveTextContent(/Kod tanınmadı/));
    expect(screen.queryByTestId('sale-drawer-confirm')).toBeNull();
  });

  it('ARAÇTA OLMAYAN ürün okutulunca adıyla reddedilir', async () => {
    withScan({ status: 'not_here', name: 'Kara Orman Pastası' });
    await renderSale('van');

    await fireEvent.press(screen.getByTestId('sale-scan-fab'));
    await fireEvent(screen.getByTestId('sale-scan-sheet'), 'scan', 'KOP-1');

    await waitFor(() => expect(screen.getByTestId('toast-message')).toHaveTextContent(/Kara Orman Pastası araçta yok/));
  });

  it('ağ düşünce hem satış yazma hem sepete ekleme kapanır ve sebebini söyler', async () => {
    withNetwork({ status: 'ok', orderId: TEK_ID, totalCents: 450, referenceNo: null, paymentRecorded: true });
    await renderSale();
    await addSimit();
    await pickCash();

    // Katalog yüklendi, sepet dolu — buraya kadar hat açık.
    expect(screen.queryByTestId('sale-offline-hint')).toBeNull();

    // Satış isteği AĞA HİÇ ÇIKAMIYOR: sinyal bunu ölçer, tahmin etmez.
    fetchMock.mockImplementation(() => Promise.reject(new Error('network down')));
    await fireEvent.press(screen.getByTestId('sale-cta'));

    await waitFor(() => expect(screen.getByTestId('sale-offline-hint')).toBeTruthy());
    expect(screen.getByTestId('sale-cta')).toHaveTextContent('Satış yazma kapalı');
    expect(screen.getByTestId('sale-cta')).toBeDisabled();
    // Sepet BOZULMAZ: hat gelince aynı kalemlerle yeniden denenir.
    expect(screen.getByTestId(`sale-cart-${TEK_VARYANT}`)).toBeTruthy();

    // Aynı düşüş katalog tarafını da kilitler — çekmecedeki "Sepete ekle" kapanır.
    await fireEvent.press(screen.getByTestId(`sale-product-${TEK_ID}`));
    await waitFor(() => expect(screen.getByTestId('sale-drawer-offline')).toBeTruthy());
    expect(screen.getByTestId('sale-drawer-confirm')).toHaveTextContent('Sepete ekleme kapalı');
    // Kapalı GÖRÜNMEK yetmez, kapalı OLMALI: etiketi değişip basılabilen bir düğme, en kötü hâl.
    expect(screen.getByTestId('sale-drawer-confirm')).toBeDisabled();
  });

  /** Satış isteği ağa çıkar ama cevap telefona ulaşmaz; kesin tutar dahil öteki istekler geçer. */
  function losePostAnswer(hat: NonNullable<ReturnType<typeof fetchMock.getMockImplementation>>) {
    fetchMock.mockImplementation((url, init) =>
      init?.method === 'POST' && !String(url).includes('/on-site/quote') ? Promise.reject(new Error('network down')) : hat(url, init),
    );
  }

  it('cevabı kaybolan satış aynı sepetle yeniden tamamlanınca AYNI kimliği taşır; sonraki satış yeni kimlikle gider', async () => {
    withNetwork({ status: 'ok', orderId: TEK_ID, totalCents: 450, referenceNo: 'SP-26-0010', paymentRecorded: true });
    const hat = fetchMock.getMockImplementation()!;
    await renderSale();
    await addSimit();
    await pickCash();

    losePostAnswer(hat);
    await fireEvent.press(screen.getByTestId('sale-cta'));
    await waitFor(() => expect(screen.getByTestId('sale-offline-hint')).toBeTruthy());
    const ilk = postBody().idempotencyKey;

    fetchMock.mockImplementation(hat);
    await act(async () => resetWarehouseStatus());
    await fireEvent.press(screen.getByTestId('sale-cta'));
    await waitFor(() => expect(screen.getByTestId('sale-receipt-card')).toBeTruthy());
    expect(ilk).toEqual(expect.any(String));
    expect(postBody().idempotencyKey).toBe(ilk);

    // Yazılmış satışın kimliğini taşıyan yeni satış, sunucudan eski satışın cevabını alır ve kendisi yazılmazdı.
    await addSimit();
    await pickCash();
    await fireEvent.press(screen.getByTestId('sale-cta'));
    await waitFor(() => expect(salePosts()).toHaveLength(3));
    expect(postBody().idempotencyKey).not.toBe(ilk);
  });

  it('bağlantı koptuktan sonra sepet kilitlenir; vazgeçilince yeni satış yeni kimlikle gider', async () => {
    withNetwork({ status: 'ok', orderId: TEK_ID, totalCents: 900, referenceNo: 'SP-26-0011', paymentRecorded: true });
    const hat = fetchMock.getMockImplementation()!;
    await renderSale();
    await addSimit();
    await fireEvent.press(screen.getByTestId('sale-payment-card'));

    losePostAnswer(hat);
    await completeSale();
    await waitFor(() => expect(screen.getByTestId('sale-unresolved-hint')).toBeTruthy());
    const ilk = postBody().idempotencyKey;
    // Uygulama kapanırsa geri yüklenecek kayıt cihazda, gönderilen kimlik ve kartla alındığı onaylanan tutarla durur.
    expect(JSON.parse(mockStore.get(DEVICE_STORE_KEYS.pendingSale) ?? '{}')).toMatchObject({
      key: ilk,
      payment: 'card',
      collectedAmountCents: 450,
    });

    fetchMock.mockImplementation(hat);
    await act(async () => resetWarehouseStatus());
    // Sunucu aynı kimlikle gelen farklı sepete ilk satışı döndürür; bu yüzden sonucu bilinmeyen sepet değiştirilemez.
    await fireEvent.press(screen.getByTestId(`sale-product-${TEK_ID}`));
    await waitFor(() => expect(screen.getByTestId('sale-drawer-unresolved')).toBeTruthy());
    expect(screen.getByTestId('sale-drawer-confirm')).toBeDisabled();
    expect(screen.getByTestId(`sale-cart-remove-${TEK_VARYANT}`)).toBeDisabled();
    expect(screen.getByTestId('sale-payment-locked')).toHaveTextContent('Kart');

    await fireEvent.press(screen.getByTestId('sale-unresolved-discard'));
    await fireEvent.press(screen.getByTestId('sale-unresolved-discard-sheet-confirm'));
    await waitFor(() => expect(screen.queryByTestId(`sale-cart-${TEK_VARYANT}`)).toBeNull());
    expect(mockStore.has(DEVICE_STORE_KEYS.pendingSale)).toBe(false);

    await addSimit();
    await fireEvent.press(screen.getByTestId('sale-payment-card'));
    await completeSale();
    await waitFor(() => expect(screen.getByTestId('sale-receipt-card')).toBeTruthy());
    expect(postBody().idempotencyKey).not.toBe(ilk);
  });

  it('cihazda bekleyen satış ekran açılınca kilitli sepetle döner ve AYNI kimlikle tamamlanır', async () => {
    withNetwork({ status: 'ok', orderId: TEK_ID, totalCents: 450, referenceNo: 'SP-26-0012', paymentRecorded: true });
    mockStore.set(DEVICE_STORE_KEYS.pendingSale, JSON.stringify(bekleyenSatis({ key: 'sale-bugun', createdAt: new Date().toISOString() })));

    await renderSale();

    await waitFor(() => expect(screen.getByTestId(`sale-cart-${TEK_VARYANT}`)).toBeTruthy());
    expect(screen.getByTestId('sale-unresolved-hint')).toBeTruthy();
    expect(screen.getByTestId('sale-payment-locked')).toHaveTextContent('Nakit');
    await fireEvent.press(screen.getByTestId('sale-cta'));
    await waitFor(() => expect(screen.getByTestId('sale-receipt-card')).toBeTruthy());
    expect(postBody()).toMatchObject({ idempotencyKey: 'sale-bugun', lines: [{ variantId: TEK_VARYANT, qty: 1 }], paymentMethod: 'cash' });
    expect(mockStore.has(DEVICE_STORE_KEYS.pendingSale)).toBe(false);
  });

  it('başka günde kalan bekleyen satış geri yüklenmez ve gönderilmez; bir kez uyarılır, kayıt silinir', async () => {
    withNetwork({ status: 'ok', orderId: TEK_ID, totalCents: 450, referenceNo: 'SP-26-0013', paymentRecorded: true });
    mockStore.set(
      DEVICE_STORE_KEYS.pendingSale,
      JSON.stringify(bekleyenSatis({ key: 'sale-dun', createdAt: new Date(Date.now() - 86_400_000).toISOString() })),
    );

    await renderSale();

    await waitFor(() => expect(screen.getByText(/Önceki bir satışın sonucu bilinmiyor/)).toBeTruthy());
    expect(screen.queryByTestId(`sale-cart-${TEK_VARYANT}`)).toBeNull();
    expect(mockStore.has(DEVICE_STORE_KEYS.pendingSale)).toBe(false);
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(false);
  });
});

describe('fiş (v3:22)', () => {
  it('kasa ayarsızsa fiş SUSMAZ — satış yazıldı ama para deftere geçmedi', async () => {
    withNetwork({ status: 'ok', orderId: TEK_ID, totalCents: 450, referenceNo: 'SP-26-0011', paymentRecorded: false });
    await renderSale();
    await addSimit();
    await pickCash();

    await fireEvent.press(screen.getByTestId('sale-cta'));

    await waitFor(() => expect(screen.getByTestId('sale-receipt-payment-missing')).toBeTruthy());
    expect(screen.getByTestId('sale-receipt-payment-missing')).toHaveTextContent(/DEFTERE GEÇMEDİ/);
    // Satış yine de KAPANDI: tutar ve referans fişte duruyor, sepet boşaldı.
    expect(screen.getByTestId('sale-receipt-meta')).toHaveTextContent(/SP-26-0011/);
  });

  it('fiş yokken sayfa uydurmaz — ne olduğunu söyler', async () => {
    withNetwork({ status: 'failed' });
    await renderSale();

    expect(screen.getByTestId('sale-receipt-empty')).toBeTruthy();
    expect(screen.queryByTestId('sale-receipt-card')).toBeNull();
  });
});

describe('araçtan satış (01.09 · kullanıcı kararı)', () => {
  /*
    Kuryenin seçtiği depo rota deposudur, satış deposu araçtır: ikisi aynı parametreye (`?warehouseId=`) yazılsa sunucunun
    kuralı devreye girmez ve kurye aracı yerine ana deponun kataloğunu görür. Bu yüzden satış yeri adreste ve açık.
  */
  it('araç yüzeyi depo seçimini TAŞIMAZ, yerini SÖYLER', async () => {
    withNetwork({ status: 'failed' });
    chooseWarehouse('00000000-0000-4000-8000-0000000000fa'); // personelin seçtiği rota deposu
    await renderSale('van');

    const catalogUrl = String(fetchMock.mock.calls.find(([url]) => String(url).includes('/sale/catalog'))?.[0]);
    expect(catalogUrl).toContain('place=van');
    expect(catalogUrl).not.toContain('warehouseId=');
  });

  it('KAPI yüzeyi seçilen depoyu taşımaya devam eder — iki yüzey ayrışmaz', async () => {
    withNetwork({ status: 'failed' });
    chooseWarehouse('00000000-0000-4000-8000-0000000000fa');
    await renderSale('facility');

    const catalogUrl = String(fetchMock.mock.calls.find(([url]) => String(url).includes('/sale/catalog'))?.[0]);
    expect(catalogUrl).toContain('warehouseId=00000000-0000-4000-8000-0000000000fa');
  });

  it('BOŞ ARAÇ bir arama sonucu değil, bir durumdur — çıkışını da gösterir', async () => {
    /* "Eşleşen ürün yok" cümlesi kuryeyi olmayan bir ürünü aramaya gönderirdi; doğru cümle malın nereden geleceğini söyler. */
    fetchMock.mockImplementation(() => Promise.resolve(ok({ products: [], total: 0, nextCursor: null })));
    await render(
      withSession(
        <SaleProvider place="van">
          <SaleScreen />
        </SaleProvider>,
      ),
    );

    await waitFor(() => expect(screen.getByTestId('sale-van-empty')).toBeTruthy());
    expect(screen.getByTestId('sale-van-empty')).toHaveTextContent(/Araca serbest ürün/);
    expect(screen.queryByTestId('sale-search-empty')).toBeNull();
  });
});

describe('kapı satışı kapalı depo', () => {
  it('QUALITE deposunda sebep söylenir; tekrar dene ve okutma çizilmez', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        status: 403,
        headers: { get: () => null },
        json: async () => ({ data: null, error: 'door_sale_closed' }),
      } as unknown as Response),
    );
    await render(
      withSession(
        <SaleProvider place="facility">
          <SaleScreen />
        </SaleProvider>,
      ),
    );

    await waitFor(() => expect(screen.getByTestId('sale-closed')).toBeTruthy());
    expect(screen.getByTestId('sale-closed')).toHaveTextContent(/QUALITE/);
    expect(screen.queryByTestId('sale-retry')).toBeNull();
    expect(screen.queryByTestId('sale-scan-fab')).toBeNull();
  });
});
