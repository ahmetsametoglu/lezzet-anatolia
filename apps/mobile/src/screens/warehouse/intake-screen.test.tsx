import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { IntakeScreen } from './intake-screen';
import { intakeRow } from './warehouse-fixture';
import { resetWarehouseStatus } from './warehouse-status';

/*
  D2 EKRAN TESTİ — SKT zorunluluğu, fark özetinin YALNIZ sapan satırlar olması, lot'un bilinçli
  boşluğu, hasar notunun isteğe taşınması ve `repricedCount`ın EKRANA ÇIKMAMASI.

  Konu (tedarik siparişi) rotadan gelir; konusuz açılış da ölçülüyor — uydurma bir sevkiyat listesi
  çizilmediğinin kanıtı o test.
*/

const mockParams: { purchaseOrderId?: string; unplanned?: string } = {};
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn(), back: jest.fn(), push: mockPush }),
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

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

function lastPostBody(): { lines: { variantId: string; qty: number; expiryDate: string; lotNumber: string | null }[]; note: string | null } {
  const call = fetchMock.mock.calls.findLast((entry) => entry[1]?.method === 'POST');
  return JSON.parse(String(call?.[1]?.body ?? '{}'));
}

function withForm(rows: unknown[], receive?: unknown) {
  fetchMock.mockImplementation((_url, init) => {
    if (init?.method === 'POST') {
      return Promise.resolve(
        ok(
          receive ?? {
            status: 'ok',
            result: { ok: true, intakeId: PO_ID, stockIds: ['00000000-0000-4000-8000-000000000051'], totalAmountCents: 0 },
            warnings: [],
            differences: [],
            repricedCount: null,
          },
        ),
      );
    }
    // `purchaseOrder` 21.11d'de zorunlu anahtar oldu (IntakeFormResponseSchema) — null sözleşmece geçerli.
    return Promise.resolve(ok({ purchaseOrder: null, rows }));
  });
}

async function renderIntake() {
  await render(<IntakeScreen />);
  await waitFor(() => expect(screen.queryByTestId('warehouse-intake-loading')).toBeNull());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  resetWarehouseStatus();
  mockParams.purchaseOrderId = PO_ID;
  delete mockParams.unplanned;
});

describe('D2 · mal kabul', () => {
  it('konusuz açılırsa BEKLEYEN SEVKİYATLARI listeler — kabul formu çizilmez', async () => {
    // 24.08'e kadar burada "konu yok" yazıyordu ve mal kabule yalnız derin bağlantıyla
    // girilebiliyordu; sipariş kimliği her tazelemede değiştiği için o yol sürekli kırılıyordu.
    delete mockParams.purchaseOrderId;
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        ok({
          intakes: [{ purchaseOrderId: PO_ID, referenceNo: 'TS-26-ABC123', supplierName: 'Gaziantep', lineCount: 4 }],
        }),
      ),
    );

    await renderIntake();

    expect(screen.getByTestId(`warehouse-intake-pending-${PO_ID}`)).toBeOnTheScreen();
    expect(screen.getByText('TS-26-ABC123')).toBeOnTheScreen();
    expect(screen.queryByTestId('warehouse-intake-cta')).toBeNull();
  });

  it('bekleyen sevkiyat YOKSA uydurma liste çizilmez, boşluk söylenir', async () => {
    delete mockParams.purchaseOrderId;
    fetchMock.mockImplementation(() => Promise.resolve(ok({ intakes: [] })));

    await renderIntake();

    expect(screen.getByTestId('warehouse-intake-no-subject')).toBeOnTheScreen();
  });

  it('SKT girilmeden CTA açılmaz — kural şemada, ekran kapıyı boşuna zorlamaz', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-qty-${ROW_A.variantId}`), '10');

    expect(screen.getByTestId('warehouse-intake-cta')).toHaveTextContent(/adet \+ SKT zorunlu/);
    expect(screen.getByTestId(`warehouse-intake-expiry-state-${ROW_A.variantId}`)).toHaveTextContent('SKT gir *');
  });

  it('takvimde OLMAYAN tarih kabul edilmez — 31 Şubat sessizce kaymaz', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-qty-${ROW_A.variantId}`), '10');
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-expiry-${ROW_A.variantId}`), '31.02.2026');

    expect(screen.getByTestId(`warehouse-intake-expiry-state-${ROW_A.variantId}`)).toHaveTextContent('SKT gir *');
    expect(screen.getByTestId('warehouse-intake-cta')).toBeDisabled();
  });

  it('adet + geçerli SKT ile CTA açılır ve satır ISO tarihle gönderilir', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-qty-${ROW_A.variantId}`), '10');
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-expiry-${ROW_A.variantId}`), '12.08.2026');

    expect(screen.getByTestId('warehouse-intake-cta')).toHaveTextContent(/Kabulü kaydet/);

    await fireEvent.press(screen.getByTestId('warehouse-intake-cta'));
    await waitFor(() => expect(screen.getByTestId('warehouse-intake-notice')).toBeOnTheScreen());

    expect(lastPostBody().lines).toEqual([
      { variantId: ROW_A.variantId, qty: 10, expiryDate: '2026-08-12', lotNumber: null },
    ]);
  });

  it('fark özeti YALNIZ sapan satırı taşır — uyan satır listeye girmez', async () => {
    withForm([ROW_A, ROW_B]);

    await renderIntake();
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-qty-${ROW_A.variantId}`), '10');
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-qty-${ROW_B.variantId}`), '3');

    const diff = screen.getByTestId('warehouse-intake-differences');
    expect(diff).toHaveTextContent(/Mısır Unu · 25 kg: beklenen 4, gelen 3/);
    expect(diff).not.toHaveTextContent(/Antep Fıstığı/);
  });

  it('sapan satır varsa CTA "kısmen teslim alındı" der — kabul yine YAZILIR', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-qty-${ROW_A.variantId}`), '8');
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-expiry-${ROW_A.variantId}`), '12.08.2026');

    expect(screen.getByTestId('warehouse-intake-cta')).toHaveTextContent(/Kısmen teslim alındı/);
  });

  it('lot BİLİNÇLİ boş bırakılır — uydurma kod gitmez', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-qty-${ROW_A.variantId}`), '10');
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-expiry-${ROW_A.variantId}`), '12.08.2026');
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-lot-${ROW_A.variantId}`), 'GAZ-7120');
    await fireEvent.press(screen.getByTestId(`warehouse-intake-lot-toggle-${ROW_A.variantId}`));
    await fireEvent.press(screen.getByTestId('warehouse-intake-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-intake-notice')).toBeOnTheScreen());
    expect(lastPostBody().lines[0]?.lotNumber).toBeNull();
  });

  it('hasar notu HANGİ satıra ait olduğu yazılarak isteğe taşınır (satır notu şemada yok)', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-qty-${ROW_A.variantId}`), '10');
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-expiry-${ROW_A.variantId}`), '12.08.2026');
    await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-toggle-${ROW_A.variantId}`));
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-damage-${ROW_A.variantId}`), 'kutu ezik');
    await fireEvent.press(screen.getByTestId('warehouse-intake-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-intake-notice')).toBeOnTheScreen());
    expect(lastPostBody().note).toBe('Antep Fıstığı · 5 kg: kutu ezik');
  });

  it('raf ömrü uyarısı KAPIDAN gelir; ölçülemeyen ömür "bilinmiyor" der (sıfır DEĞİL)', async () => {
    withForm([ROW_A], {
      status: 'ok',
      result: { ok: true, intakeId: PO_ID, stockIds: ['00000000-0000-4000-8000-000000000051'], totalAmountCents: 0 },
      warnings: [{ variantId: ROW_A.variantId, remainingPercent: null }],
      differences: [],
      repricedCount: null,
    });

    await renderIntake();
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-qty-${ROW_A.variantId}`), '10');
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-expiry-${ROW_A.variantId}`), '12.08.2026');
    await fireEvent.press(screen.getByTestId('warehouse-intake-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-intake-warning')).toHaveTextContent(/raf ömrü bilinmiyor/));
    // Depo ekranı fiyat görmez: `repricedCount` hiçbir hâlde ekrana çıkmaz.
    expect(screen.queryByText(/fiyat/i)).toBeNull();
  });
});

/*
  PLANSIZ KABUL (23.13) — PO'suz gelen mal. PO'lu kabulün TERSİ iki noktada: satır kümesi yok
  (depocu kurar) ve beklenen adet yok (kıyaslanacak sipariş yok).
*/
describe('D2 · plansız kabul', () => {
  beforeEach(() => {
    delete mockParams.purchaseOrderId;
    mockParams.unplanned = '1';
  });

  it('boş başlar ve ürünü ARAMADAN ekler — beklenen adet YAZILMAZ', async () => {
    fetchMock.mockImplementation((url) => {
      if (String(url).includes('/warehouse/variants')) {
        return Promise.resolve(
          ok({
            variants: [
              {
                variantId: ROW_A.variantId,
                productName: ROW_A.productName,
                variantLabel: ROW_A.variantLabel,
                sku: 'SKU-1',
                imageUrl: null,
                qtyPerCode: null,
              },
            ],
          }),
        );
      }
      throw new Error(`beklenmeyen istek: ${String(url)}`);
    });

    await render(<IntakeScreen />);
    // Sunucudan form OKUNMAZ: plansızda cevabı baştan bilinen bir soru sorulmaz.
    await waitFor(() => expect(screen.getByTestId('warehouse-intake-unplanned-empty')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('warehouse-intake-search-cta'));
    await fireEvent.changeText(screen.getByTestId('warehouse-intake-search-input'), 'baklava');
    await waitFor(() => expect(screen.getByTestId(`warehouse-intake-search-${ROW_A.variantId}`)).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId(`warehouse-intake-search-${ROW_A.variantId}`));

    await waitFor(() => expect(screen.getByTestId(`warehouse-intake-line-${ROW_A.variantId}`)).toBeOnTheScreen());
    // "beklenen 0" YAZILMAZ: olmayan bir beklentiyi sıfır diye göstermek, ölçülemeyeni sıfıra
    // düşürmektir (CLAUDE §1).
    expect(screen.queryByText(/beklenen/)).toBeNull();
  });

  it('bekleyen sevkiyat listesinden plansız kabule geçilir', async () => {
    delete mockParams.unplanned;
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        ok({ intakes: [{ purchaseOrderId: PO_ID, referenceNo: 'TS-26-A', supplierName: 'X', lineCount: 2 }] }),
      ),
    );

    await renderIntake();
    await fireEvent.press(screen.getByTestId('warehouse-intake-unplanned-cta'));

    expect(mockPush).toHaveBeenCalledWith('/intake?unplanned=1');
  });
});
