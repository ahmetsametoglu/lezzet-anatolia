import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { IntakeScreen } from './intake-screen';
import { intakeRow } from './warehouse-fixture';
import { resetWarehouseStatus } from './warehouse-status';

/*
  D2 · TARAMA AKIŞI (Modül 23 · 23.4) — barkodun mal kabuldeki BEŞ yolu:

  · bulunan satıra ÇARPAN kadar eklenir ve toplamalıdır (iki koli = 2×çarpan)
  · SKU eşleşmesi cümlesini söyler (kaynak şeffaf — barkod kadar kesin değil)
  · PO'da olmayan ürünün kodu satır AÇMAZ (fark raporunun kümesi bozulmaz)
  · tanınmayan kod öğrenme sayfasını açar; satır seçilince kod öğretilir, 1 eklenir
  · `already_bound` yarışı: bu arada başkası öğretmişse kod kime bağlıysa oradan sayılır

  Kodun kaynağı SİMÜLASYON HAVUZUDUR (dev çipleri) — kameranın okumasıyla aynı teslim noktasından
  geçtiği ScanSheet testinde ölçülü; burada ölçülen, kodun KABUL FORMUNA nasıl işlendiği.
  Ağ fetch seviyesinde sahte: URL'e göre dallanır, cevap sözleşme şeklindedir.
*/

const mockParams: { purchaseOrderId?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
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

const PO_ID = '00000000-0000-4000-8000-000000000091';
const ROW_A = intakeRow();
const ROW_B = intakeRow({ variantId: '00000000-0000-4000-8000-000000000042', productName: 'Mısır Unu', variantLabel: '25 kg', expectedQty: 4 });
const YABANCI_VARYANT = '00000000-0000-4000-8000-000000000077';

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

type Resolved =
  | { status: 'found'; variantId: string; productName: string; variantLabel: string; kind: 'unit' | 'case'; qtyPerCode: number; source: 'barcode' | 'sku' | 'supplier_code' }
  | { status: 'unknown' };

/** Ağın senaryosu: form satırları + çözüm cevabı + (öğretme cevabı). URL'e göre dallanır. */
function withScan(resolved: Resolved, learn?: unknown) {
  fetchMock.mockImplementation((url, init) => {
    const path = String(url);
    if (path.includes('/codes/resolve')) return Promise.resolve(ok(resolved));
    if (path.endsWith('/codes')) return Promise.resolve(ok(learn ?? { status: 'ok' }));
    if (init?.method === 'POST') throw new Error(`beklenmeyen POST: ${path}`);
    return Promise.resolve(ok({ purchaseOrder: null, rows: [ROW_A, ROW_B] }));
  });
}

async function renderIntake() {
  await render(<IntakeScreen />);
  await waitFor(() => expect(screen.queryByTestId('warehouse-intake-loading')).toBeNull());
}

/** Tarama sayfasını açıp bir havuz çipine basar — kodun kendisi önemsiz, cevabı mock belirliyor. */
async function scanOnce() {
  await fireEvent.press(screen.getByTestId('warehouse-intake-scan-cta'));
  await fireEvent.press(screen.getByLabelText('Paket barkodu'));
  await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/codes/resolve'))).toBe(true));
}

function qtyOf(variantId: string): string {
  return String(screen.getByTestId(`warehouse-intake-qty-${variantId}`).props.value ?? '');
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  resetWarehouseStatus();
  mockParams.purchaseOrderId = PO_ID;
});

describe('D2 · tarama akışı', () => {
  it('koli kodu satırı bulur ve ÇARPAN kadar ekler; ikinci okuma TOPLANIR', async () => {
    withScan({ status: 'found', variantId: ROW_A.variantId, productName: ROW_A.productName, variantLabel: ROW_A.variantLabel, kind: 'case', qtyPerCode: 6, source: 'barcode' });
    await renderIntake();

    await scanOnce();
    await waitFor(() => expect(qtyOf(ROW_A.variantId)).toBe('6'));
    expect(screen.getByTestId('warehouse-intake-notice')).toHaveTextContent(/6 adet eklendi/);

    await scanOnce();
    await waitFor(() => expect(qtyOf(ROW_A.variantId)).toBe('12'));
  });

  it('SKU eşleşmesi kaynağını SÖYLER — barkod kadar kesin değil, cümle bunu taşır', async () => {
    withScan({ status: 'found', variantId: ROW_B.variantId, productName: ROW_B.productName, variantLabel: ROW_B.variantLabel, kind: 'unit', qtyPerCode: 1, source: 'sku' });
    await renderIntake();

    await scanOnce();

    await waitFor(() => expect(screen.getByTestId('warehouse-intake-notice')).toHaveTextContent(/SKU eşleşmesi/));
    expect(qtyOf(ROW_B.variantId)).toBe('1');
  });

  it('PO kaleminde OLMAYAN ürünün kodu satır AÇMAZ — yalnız söyler', async () => {
    withScan({ status: 'found', variantId: YABANCI_VARYANT, productName: 'Sahlep', variantLabel: '250 g', kind: 'unit', qtyPerCode: 1, source: 'barcode' });
    await renderIntake();

    await scanOnce();

    await waitFor(() => expect(screen.getByTestId('warehouse-intake-notice')).toHaveTextContent(/kaleminde yok/));
    // Hiçbir satıra adet DÜŞMEZ ve yeni satır doğmaz: fark raporunun kümesi siparişten gelir.
    expect(qtyOf(ROW_A.variantId)).toBe('');
    expect(qtyOf(ROW_B.variantId)).toBe('');
  });

  it('tanınmayan kod öğrenme sayfasını açar; satır seçilince öğretilir ve 1 eklenir', async () => {
    withScan({ status: 'unknown' });
    await renderIntake();

    await scanOnce();
    await waitFor(() => expect(screen.getByTestId('warehouse-intake-learn')).toBeOnTheScreen());

    await fireEvent.press(screen.getByLabelText(`${ROW_B.productName} · ${ROW_B.variantLabel}`));

    await waitFor(() => expect(qtyOf(ROW_B.variantId)).toBe('1'));
    expect(screen.getByTestId('warehouse-intake-notice')).toHaveTextContent(/öğrenildi/);
    // Öğretme isteği KODUN kendisini ve seçilen varyantı taşır.
    const learnCall = fetchMock.mock.calls.findLast((c) => String(c[0]).endsWith('/codes'));
    expect(JSON.parse(String(learnCall?.[1]?.body ?? '{}'))).toMatchObject({ variantId: ROW_B.variantId });
  });

  it('`already_bound` yarışında kod kime bağlıysa ORADAN sayılır — çift kayıt doğmaz', async () => {
    withScan(
      { status: 'unknown' },
      { status: 'already_bound', variantId: ROW_A.variantId, productName: ROW_A.productName, variantLabel: ROW_A.variantLabel },
    );
    await renderIntake();

    await scanOnce();
    await waitFor(() => expect(screen.getByTestId('warehouse-intake-learn')).toBeOnTheScreen());
    await fireEvent.press(screen.getByLabelText(`${ROW_B.productName} · ${ROW_B.variantLabel}`));

    // Depocu B'yi seçti ama kod bu arada A'ya bağlanmış: adet A'ya düşer, B'ye değil.
    await waitFor(() => expect(qtyOf(ROW_A.variantId)).toBe('1'));
    expect(qtyOf(ROW_B.variantId)).toBe('');
    expect(screen.getByTestId('warehouse-intake-notice')).toHaveTextContent(/bağlanmış/);
  });
});
