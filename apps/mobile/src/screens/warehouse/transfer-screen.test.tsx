import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { StaffWarehouse } from '@lezzet/types';

import { OperationsSessionProvider } from '@/screens/operations/sections-context';

import { TransferScreen } from './transfer-screen';
import { inboundTransfer, STOCK_A } from './warehouse-fixture';
import { resetWarehouseStatus } from './warehouse-status';

/*
  D5 EKRAN TESTİ — ekranın TAMAMI tek bir ayrımın üstünde duruyor: **boş ≠ 0**.

  · boş satır kabulü BLOKLAR (v2:474),
  · `0` geçerli bir beyandır ve gönderilir ("geldi ama kayıp"),
  · kapının `incomplete` cevabı hangi satırın sayılmadığını EKRANDA gösterir,
  · `stale` ve `failed` yutulmaz.
*/

/*
  BİLDİRİM KANALI TOAST (01.09) — depo ekranlarında satır içi bildirim satırı kalktı, cümle
  kökteki tek `ToastHost`a gidiyor (ekran künyesi). Test o yüzden artık bir testID değil,
  basılan METNİ ölçüyor.
*/
const mockToast = jest.fn<void, [string]>();
jest.mock('@/lib/toast/toast-store', () => ({
  toastSuccess: (m: string) => mockToast(m),
  toastError: (m: string) => mockToast(m),
  toastInfo: (m: string) => mockToast(m),
}));


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

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
const TRANSFER = inboundTransfer();
const LINE_A = TRANSFER.lines[0]!.lineId;
const LINE_B = TRANSFER.lines[1]!.lineId;

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

function lastPostBody(): { lines: { lineId: string; receivedQty: number }[] } {
  const call = fetchMock.mock.calls.findLast((entry) => entry[1]?.method === 'POST');
  return JSON.parse(String(call?.[1]?.body ?? '{}'));
}

/*
  UÇ ÜÇ LİSTE DÖNDÜRÜYOR (v3:11 · 30.08): GELEN · YOLDA (bu depodan çıkmış) · SON KAPANANLAR.
  Fikstür üçünü de taşımalı — eksik alan, ekranın "yolda hiçbir şey yok" demesine değil, cevabı
  hiç ayrıştıramamasına yol açar.
*/
function withTransfers(transfers: unknown[], receive?: unknown, extra: { outbound?: unknown[]; closed?: unknown[] } = {}) {
  fetchMock.mockImplementation((_url, init) => {
    if (init?.method === 'POST') {
      return Promise.resolve(ok(receive ?? { status: 'ok', transferId: TRANSFER.transferId, createdBatches: 2 }));
    }
    return Promise.resolve(ok({ transfers, outbound: extra.outbound ?? [], closed: extra.closed ?? [] }));
  });
}

/** Kabul eden tesis — künyenin sağ yarısı ("… · Strasbourg Merkez"). */
const STR: StaffWarehouse = { id: 'w-str', code: 'STR', name: 'Strasbourg Merkez', kind: 'facility' };

/**
 * Ekran artık oturum künyesini okuyor (üstbaşlığın tesis kuyruğu), yani kabuk SAĞLAYICISI olmadan
 * çizilemez: sağlayıcısız çağrı sessizce boş değer DÖNMEZ, fırlatır (`sections-context` künyesi —
 * kapıyı geçmemiş bir ekranı yetkili gibi göstermemek).
 */
/**
 * Satırı ÇEKMECEDEN sayar (kitin tek adet deseni, 02.09): sayacın ortasındaki rakam adet
 * çekmecesini açar, cetvelden sayı seçilir. Eski metin alanı kalktı; test de gerçek kullanımı
 * izliyor. Sıfır da cetvelin ilk hücresidir — "0 · hiç gelmedi" kısayolu ayrıca sınanıyor.
 */
async function countLine(lineId: string, qty: number) {
  await fireEvent.press(screen.getByTestId(`warehouse-transfer-qty-${lineId}-value-hit`));
  const cell = `warehouse-transfer-qty-sheet-ruler-${qty}`;
  await waitFor(() => expect(screen.getByTestId(cell)).toBeOnTheScreen());
  await fireEvent.press(screen.getByTestId(cell));
  await fireEvent.press(screen.getByTestId('warehouse-transfer-qty-sheet-confirm'));
}

async function renderTransfer(warehouse: StaffWarehouse | null = STR) {
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
      <TransferScreen />
    </OperationsSessionProvider>,
  );
  await waitFor(() => expect(screen.queryByTestId('warehouse-transfer-loading')).toBeNull());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  resetWarehouseStatus();
});

describe('D5 · rampada sayım', () => {
  it('yolda transfer yoksa boş durum çıkar', async () => {
    withTransfers([]);

    await renderTransfer();

    expect(screen.getByTestId('warehouse-transfer-empty')).toBeOnTheScreen();
  });

  /*
    KART ÖNİZLEMESİ (v3:1106) — referans + kalem SAYISI "bu transferde ne var" sorusunu
    cevaplamıyordu; depocu rampaya inmeden görebilmeli. Kart bir LİSTE DEĞİL: ilk üç satır çizilir
    ve KIRPILAN kalem sayısı ayrıca yazılır — sessiz kırpma, eksik bir kabule hazırlanmak olurdu.
  */
  it('kart ilk üç kalemi gösterir ve KIRPMAYI söyler', async () => {
    withTransfers([
      inboundTransfer({
        lines: [1, 2, 3, 4, 5].map((n) => ({
          lineId: `00000000-0000-4000-8000-00000000008${n}`,
          sourceStockId: STOCK_A,
          name: `Ürün ${n}`,
          dispatchedQty: n,
          receivedQty: null,
          caseSizes: [],
        })),
      }),
      inboundTransfer({ transferId: '00000000-0000-4000-8000-000000000052', referenceNo: 'TRF-B' }),
    ]);

    await renderTransfer();

    const kart = screen.getByTestId(`warehouse-transfer-row-${TRANSFER.transferId}`);
    expect(kart).toHaveTextContent(/Ürün 1/);
    expect(kart).toHaveTextContent(/Ürün 3/);
    expect(kart).not.toHaveTextContent(/Ürün 4/);
    expect(kart).toHaveTextContent(/\+2 kalem daha/);
    expect(kart).toHaveTextContent(/kabule başla/);
  });

  it('üç ya da daha az kalemde KIRPMA satırı hiç doğmaz', async () => {
    withTransfers([TRANSFER, inboundTransfer({ transferId: '00000000-0000-4000-8000-000000000052', referenceNo: 'TRF-B' })]);

    await renderTransfer();

    expect(screen.getByTestId(`warehouse-transfer-row-${TRANSFER.transferId}`)).not.toHaveTextContent(/kalem daha/);
  });

  /*
    "0 · HİÇ GELMEDİ" KISAYOLU (v3:1189) — sıfır bu ekranın en anlamlı ve en zor girilen değeri.
    Klavye açıp "0" yazmak, boş bırakmakla aynı hızda değil; oysa ikisi taban tabana zıt beyanlar
    ("koli geldi, mal yok" ↔ "saymadım"). Kısayol sıfırı bir TERCİH hâline getiriyor, bir zahmet
    olmaktan çıkarıyor.
  */
  it('"0 · hiç gelmedi" tek dokunuşla sıfır yazar ve sonra KAYBOLUR', async () => {
    withTransfers([TRANSFER]);

    await renderTransfer();
    await fireEvent.press(screen.getByTestId(`warehouse-transfer-zero-${LINE_A}`));

    expect(screen.getByTestId(`warehouse-transfer-qty-${LINE_A}-value`)).toHaveTextContent('0');
    // Aynı şeyi ikinci kez söyleten kontrol, basıldığında hiçbir şey olmadığı için bozuk görünür.
    expect(screen.queryByTestId(`warehouse-transfer-zero-${LINE_A}`)).toBeNull();
  });

  it('kural SAYIMDAN ÖNCE okunur — dipnotta değil', async () => {
    withTransfers([TRANSFER]);

    await renderTransfer();

    expect(screen.getByTestId('warehouse-transfer-rule')).toHaveTextContent(/SKT ve lot yeniden yazılmaz/);
  });

  it('BOŞ satır kabulü bloklar — CTA kapalı ve sebebini söyler', async () => {
    withTransfers([TRANSFER]);

    await renderTransfer();
    await countLine(LINE_A, 4);

    expect(screen.getByTestId('warehouse-transfer-cta')).toHaveTextContent(/boş satır kabulü bloklar/);
    expect(screen.getByTestId('warehouse-transfer-cta')).toBeDisabled();
  });

  it('SIFIR geçerli bir beyandır: satır sayılmış sayılır ve 0 olarak GÖNDERİLİR', async () => {
    withTransfers([TRANSFER]);

    await renderTransfer();
    await countLine(LINE_A, 4);
    await countLine(LINE_B, 0);

    expect(screen.getByTestId('warehouse-transfer-cta')).toHaveTextContent(/Kabulü kaydet/);

    await fireEvent.press(screen.getByTestId('warehouse-transfer-cta'));
    await waitFor(() => expect(mockToast).toHaveBeenCalled());

    expect(lastPostBody().lines).toEqual([
      { lineId: LINE_A, receivedQty: 4 },
      { lineId: LINE_B, receivedQty: 0 },
    ]);
  });

  it('kapının `incomplete` cevabı HANGİ satır olduğunu ekranda gösterir', async () => {
    withTransfers([TRANSFER], { status: 'incomplete', missingLineIds: [LINE_B], unknownLineIds: [] });

    await renderTransfer();
    await countLine(LINE_A, 4);
    await countLine(LINE_B, 2);
    await fireEvent.press(screen.getByTestId('warehouse-transfer-cta'));

    await waitFor(() =>
      expect(mockToast.mock.calls.some(([m]) => /1 satır sayılmamış/.test(m))).toBe(true),
    );
    expect(screen.getByTestId(`warehouse-transfer-line-${LINE_B}`)).toHaveTextContent(/sayılmadı/);
  });

  it('`stale` YUTULMAZ: transferin artık hangi durumda olduğu yazılır', async () => {
    withTransfers([TRANSFER], { status: 'stale', currentStatus: 'received' });

    await renderTransfer();
    await countLine(LINE_A, 4);
    await countLine(LINE_B, 2);
    await fireEvent.press(screen.getByTestId('warehouse-transfer-cta'));

    await waitFor(() =>
      expect(mockToast.mock.calls.some(([m]) => /artık yolda değil \(kabul edildi\)/.test(m))).toBe(true),
    );
  });

  it('RPC reddi AYNEN gösterilir — sabit bir metne indirgenmez', async () => {
    withTransfers([TRANSFER], { status: 'failed', message: 'receive_transfer: partide 3 var, 5 kabul edilemez' });

    await renderTransfer();
    await countLine(LINE_A, 4);
    await countLine(LINE_B, 2);
    await fireEvent.press(screen.getByTestId('warehouse-transfer-cta'));

    await waitFor(() =>
      expect(mockToast.mock.calls.some(([m]) => /partide 3 var, 5 kabul edilemez/.test(m))).toBe(true),
    );
  });
});
