import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { SaleCatalogProduct, SaleVariant } from '@lezzet/types';

import { SaleScreen } from './sale-screen';

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

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn(), back: jest.fn() }),
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
    return Promise.resolve(ok({ products: [TEK, COK], total: 2, nextCursor: null }));
  });
}

function postBody(): { lines: { variantId: string; qty: number; negotiatedUnitPriceCents?: number }[]; paymentMethod: string } {
  const call = fetchMock.mock.calls.findLast((entry) => entry[1]?.method === 'POST');
  return JSON.parse(String(call?.[1]?.body ?? '{}'));
}

async function renderSale() {
  await render(<SaleScreen />);
  await waitFor(() => expect(screen.getByTestId(`sale-product-${TEK_ID}`)).toBeTruthy());
}

/** Tek boylu ürünü çekmeceden sepete ekler (varsayılan adet 1, fiyata dokunmadan). */
async function addSimit() {
  await fireEvent.press(screen.getByTestId(`sale-product-${TEK_ID}`));
  await waitFor(() => expect(screen.getByTestId('sale-drawer-confirm')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('sale-drawer-confirm'));
  await waitFor(() => expect(screen.getByTestId(`sale-cart-${TEK_VARYANT}`)).toBeTruthy());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
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

  await fireEvent.press(screen.getByTestId('sale-cta'));
  await waitFor(() => expect(screen.getByTestId('sale-notice')).toBeTruthy());

  const body = postBody();
  expect(body.paymentMethod).toBe('cash');
  expect(body.lines).toEqual([{ variantId: TEK_VARYANT, qty: 1 }]); // negotiated alanı HİÇ yok
  expect(screen.getByTestId('sale-notice').props.children).toContain('SP-26-0009');
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

  await fireEvent.press(screen.getByTestId('sale-cta'));
  await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(true));

  expect(postBody().lines).toEqual([{ variantId: TEK_VARYANT, qty: 1, negotiatedUnitPriceCents: 400 }]);
});

it('yetersiz stok cevabı adı ve kalanıyla görünür — sepet BOZULMAZ', async () => {
  withNetwork({ status: 'insufficient_here', lines: [{ name: 'Simit', available: 3 }] });
  await renderSale();
  await addSimit();

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

  await fireEvent.press(screen.getByTestId('sale-cta'));
  await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(true));

  expect(postBody().lines).toEqual([{ variantId: COK_VARYANT_2, qty: 1 }]);
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
