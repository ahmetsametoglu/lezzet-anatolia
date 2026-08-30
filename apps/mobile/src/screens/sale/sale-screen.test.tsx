import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { SaleCatalogProduct, SaleVariant } from '@lezzet/types';

import { SaleScreen } from './sale-screen';
import { SaleCartScreen } from './sale-cart-screen';
import { SaleHistoryScreen } from './sale-history-screen';
import { SaleReceiptScreen } from './sale-receipt-screen';
import { SaleProvider } from './sale-context';
import { resetWarehouseStatus } from '@/screens/warehouse/warehouse-status';

/*
  YERİNDE SATIŞ EKRAN TESTİ (21.119) — bu ekranın EN KRİTİK iddiaları paranın yazımıyla ilgilidir:

  · **Pazarlık yalnız DOKUNULANDA gider**: fiyat alanı liste fiyatıyla açılır; değişmediyse istekte
    `negotiatedUnitPriceCents` HİÇ olmaz (fiyatı sunucu çözer), değiştiyse tam o kalemde olur.
    Sessizce her kaleme fiyat göndermek, siparişin parasını istemciye yazdırmak olurdu.
  · **Kalan adet gösterge, karar sunucuda**: kart "kalan N" yazar; adet kalanı aşarsa çekmece
    onaylatmaz. Ama `insufficient_here` cevabı yine de gelebilir (stok o an düşmüştür) ve ekran
    onu adı + kalanıyla gösterirken SEPETİ BOZMAZ — personel adedi düşürüp yeniden dener.
  · **Çok boylu ürün boyunu çekmecede seçer** ve istek SEÇİLEN boyun kimliğini taşır.

  Ağ fetch seviyesinde sahte (mal kabul emsali): URL'e göre dallanır, cevaplar sözleşme şeklinde.
*/

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn(), back: jest.fn(), replace: mockReplace }),
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

/*
  KART ÇİZİM SAYACI (26.08 cihaz bulgusu: "çekmece kasarak açılıyor") — kasmanın ölçülen sebebi,
  dokunuşun ve boy cevabının KART LİSTESİNİ animasyonla aynı karede yeniden çizdirmesiydi.
  `PressableSurface` sahtesi ürün kartı çizimlerini sayar; iddia "dokunuştan sonra sayaç 0".
*/
const mockRowRenders = { count: 0 };
jest.mock('@/components/ui/pressable-surface', () => {
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
    image: { url: null, crop: { x: 50, y: 50, zoom: 100 } },
    unitLabel: '1 adet',
    variantId: TEK_VARYANT,
    purchaseMode: 'quick',
    variantCount: 1,
    priceCents: 450,
    comparisonCents: null,
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
    netWeightG: 500,
    label: '500 g',
    priceCents: 900,
    comparisonCents: null,
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
  saleVariant({ id: COK_VARYANT_2, netWeightG: 1000, label: '1 kg', priceCents: 1700, availableHere: 2 }),
];

/** Ağın senaryosu: katalog + boylar + satış cevabı. Satış cevabı testin kendisi belirler. */
function withNetwork(saleResult: unknown) {
  fetchMock.mockImplementation((url, init) => {
    const path = String(url);
    if (init?.method === 'POST') return Promise.resolve(ok(saleResult));
    if (path.includes('/variants')) return Promise.resolve(ok({ productId: COK_ID, name: 'Baklava', variants: BOYLAR }));
    if (path.includes('/recent')) return Promise.resolve(ok({ sales: SATISLAR }));
    return Promise.resolve(ok({ products: [TEK, COK], total: 2, nextCursor: null }));
  });
}

function postBody(): { lines: { variantId: string; qty: number; negotiatedUnitPriceCents?: number }[]; paymentMethod: string } {
  const call = fetchMock.mock.calls.findLast((entry) => entry[1]?.method === 'POST');
  return JSON.parse(String(call?.[1]?.body ?? '{}'));
}

async function renderSale() {
  // Katalog + sepet AYNI sağlayıcı altında birlikte çizilir: akış testleri rota geçişini değil,
  // iki yüzeyin ORTAK durumunu sınar (gezinme expo-router'ın işi, bizim iddiamız değil).
  await render(
    <SaleProvider>
      <SaleScreen />
      <SaleCartScreen />
      {/* Fiş de aynı sağlayıcının altında: satış yazılınca sepet ekranı `/sale/receipt`e geçiyor
          (v3:22) ve sonucun okunacağı yer artık orası — geçişin KENDİSİ de burada ölçülüyor. */}
      <SaleReceiptScreen />
    </SaleProvider>,
  );
  await waitFor(() => expect(screen.getByTestId(`sale-product-${TEK_ID}`)).toBeTruthy());
}

/** Tek boylu ürünü çekmeceden sepete ekler (varsayılan adet 1, fiyata dokunmadan). */
async function addSimit() {
  await fireEvent.press(screen.getByTestId(`sale-product-${TEK_ID}`));
  await waitFor(() => expect(screen.getByTestId('sale-drawer-confirm')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('sale-drawer-confirm'));
  await waitFor(() => expect(screen.getByTestId(`sale-cart-${TEK_VARYANT}`)).toBeTruthy());
}

/** Tahsilat türü ARTIK BİLİNÇLİ seçilir (varsayılan yok) — satışa giden her test bunu yapar. */
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

  const body = postBody();
  expect(body.paymentMethod).toBe('cash');
  expect(body.lines).toEqual([{ variantId: TEK_VARYANT, qty: 1 }]); // negotiated alanı HİÇ yok
  // Sonuç artık FİŞTE (v3:22): tutar, tahsilat türü ve referans bir arada okunuyor.
  expect(mockReplace).toHaveBeenCalledWith('/sale/receipt');
  expect(screen.getByTestId('sale-receipt-total')).toHaveTextContent(/4,50/);
  expect(screen.getByTestId('sale-receipt-meta')).toHaveTextContent(/Nakit · SP-26-0009/);
  expect(screen.queryByTestId(`sale-cart-${TEK_VARYANT}`)).toBeNull(); // satış kapandı, sepet boş
});

it('pazarlık fiyatı yalnız DEĞİŞTİRİLEN kalemde gider', async () => {
  withNetwork({ status: 'ok', orderId: TEK_ID, totalCents: 400, referenceNo: null, paymentRecorded: true });
  await renderSale();

  await fireEvent.press(screen.getByTestId(`sale-product-${TEK_ID}`));
  await waitFor(() => expect(screen.getByTestId('sale-drawer-price')).toBeTruthy());
  await fireEvent.changeText(screen.getByTestId('sale-drawer-price'), '4,00');
  await fireEvent.press(screen.getByTestId('sale-drawer-confirm'));
  await waitFor(() => expect(screen.getByTestId(`sale-cart-${TEK_VARYANT}`)).toBeTruthy());
  await pickCash();

  await fireEvent.press(screen.getByTestId('sale-cta'));
  await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(true));

  expect(postBody().lines).toEqual([{ variantId: TEK_VARYANT, qty: 1, negotiatedUnitPriceCents: 400 }]);
});

it('yetersiz stok cevabı adı ve kalanıyla görünür — sepet BOZULMAZ', async () => {
  withNetwork({ status: 'insufficient_here', lines: [{ name: 'Simit', available: 3 }] });
  await renderSale();
  await addSimit();
  await pickCash();

  await fireEvent.press(screen.getByTestId('sale-cta'));
  await waitFor(() => expect(screen.getByTestId('sale-notice')).toBeTruthy());

  expect(screen.getByTestId('sale-notice').props.children).toContain('Simit (kalan 3)');
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
  await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(true));

  expect(postBody().lines).toEqual([{ variantId: COK_VARYANT_2, qty: 1 }]);
});

it('tahsilat türü SEÇİLMEDEN satış yazılamaz — para yazan alanda varsayılan yok', async () => {
  /*
    Kullanıcı bulgusu 26.08: "Nakit" önseçiliydi ve satış hiç dokunmadan kapanabiliyordu. Kartla
    tahsil edilip "nakit" yazılan satış, sefer kapanışının nakit beklentisini sessizce bozar —
    seçim artık bilinçli: sepet doluyken bile CTA kapalı, tek POST atılamaz.
  */
  withNetwork({ status: 'ok', orderId: TEK_ID, totalCents: 450, referenceNo: null, paymentRecorded: true });
  await renderSale();
  await addSimit();

  expect(screen.getByText('Tahsilat türünü seçin — nakit mi kart mı?')).toBeTruthy();
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

it('adet kalanı aşınca çekmece onaylatmaz ve sebebini söyler', async () => {
  withNetwork({ status: 'failed' });
  await renderSale();

  await fireEvent.press(screen.getByTestId(`sale-product-${TEK_ID}`));
  await waitFor(() => expect(screen.getByTestId('sale-drawer-qty')).toBeTruthy());
  // Kalan 4 → beş kez artır: 1'den 6'ya. İnce ayar düğmesi tek tek sayar.
  for (let i = 0; i < 5; i += 1) {
    await fireEvent.press(screen.getByLabelText('adedi artır'));
  }

  await waitFor(() => expect(screen.getByTestId('sale-drawer-overstock')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('sale-drawer-confirm'));
  expect(screen.queryByTestId(`sale-cart-${TEK_VARYANT}`)).toBeNull(); // sepete yazılmadı
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

it('SON SATIŞLAR kim sattıysa onu söylüyor — iz yoksa uydurmuyor', async () => {
  withNetwork({ status: 'failed' });
  await render(<SaleHistoryScreen />);
  await waitFor(() => expect(screen.getByTestId(`sale-history-${SATISLAR[0]!.orderId}`)).toBeTruthy());

  expect(screen.getByText('LA-26-TEST01')).toBeTruthy();
  // Ad künyenin YANINDA, önekiz (v3:21): aranan şey adın kendisidir.
  expect(screen.getByText('Marc Lemoine')).toBeTruthy();
  // Aktörsüz kayıt "bilinmiyor" der — boş bırakmaz, ad da uydurmaz.
  expect(screen.getByText('satan bilinmiyor')).toBeTruthy();
  expect(screen.getByText('referanssız')).toBeTruthy();
  // Listenin NE OLDUĞU dipnotta: "kim sattı"nın tek cevabı bu liste.
  expect(screen.getByTestId('sale-history-footnote')).toHaveTextContent(/tek cevabı bu liste/);
});

describe('çevrimdışı kilidi (v3:20)', () => {
  /*
    Kilit DEPONUNKİYLE aynı sinyalden okunuyor: yerinde satış zaten depo kapsamlı bir yazmadır.
    Ölçülen şey ikisinin AYNI ağ düşüşüne aynı anda tepki verdiği — sepete ekleme de, satış yazma
    da kapanıyor ve ikisi de sebebini söylüyor.
  */
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
