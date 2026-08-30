import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AdjustmentScreen } from './adjustment-screen';
import { toRequestLine } from './use-adjustment.hook';
import { STOCK_A } from './warehouse-fixture';
import { resetWarehouseStatus } from './warehouse-status';

/*
  D4 EKRAN TESTİ — bu ekranın EN KRİTİK iddiası işaretin YÖNE çevrilmesidir.

  Ekranda eksi "stoktan düştü"dür (operatörün dili); kayıtta adet DAİMA POZİTİF ve yön ayrı alanda
  (`direction: 'out' | 'in'` — 06.14, stok hareket defteri). Sessiz bir yön hatası burada stoğu
  düşürmek yerine ARTIRIR ve kimse fark etmez — o yüzden hem saf çevirinin hem gönderilen gövdenin
  testi var.

  **27.08'de sözleşme değişti, iddia değişmedi.** Kapı eskiden işaretli tek sayı alıyordu (`+` düşüm
  · `−` geri ekleme) ve çeviri bir işaret çevirmesiydi. Yön açık alana çıktı çünkü işaretin miktara
  gömülü olması rapor tarafında ölçülmüş bir arızaya yol açmıştı: girişlerle çıkışlar aynı toplamda
  eriyor, "Çıkışlar" sekmesi dönem toplamını eksi gösteriyordu. Testin sorduğu soru aynı kaldı —
  *ekranın eksisi kayıtta gerçekten "stoktan düş" mü oluyor?*

  Diğer iddialar: `return_restock` seçeneğinin HİÇ ÇİZİLMEMESİ, fazlanın yalnız sayım farkında ve
  NOTLA yazılabilmesi, belge numarasının kayıttan ÖNCE uydurulmaması ve RPC reddinin aynen gösterimi.
*/

const mockParams: Record<string, string> = { stockId: STOCK_A, code: 'P-0641', name: 'Kaymaklı Baklava · 1 kg' };
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: (href: unknown) => mockNavigate(href), back: jest.fn() }),
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

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

function lastPostBody(): { lines: { stockId: string; qty: number }[]; reason: string; note: string | null } {
  const call = fetchMock.mock.calls.findLast((entry) => entry[1]?.method === 'POST');
  return JSON.parse(String(call?.[1]?.body ?? '{}'));
}

function withResult(result?: unknown) {
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      ok(
        result ?? {
          status: 'ok',
          /* Kapının cevabı İKİ YÖNÜ AYRI taşıyor (06.14): tek satırlık bu ekranda yalnız biri
             dolar. Düşüm senaryosu — `outQty` 4, `inQty` 0. */
          result: {
            ok: true,
            referenceNo: 'IMH-STR-26-0004',
            lines: 1,
            outQty: 4,
            inQty: 0,
            outCostCents: 1600,
            inCostCents: 0,
          },
        },
      ),
    ),
  );
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  resetWarehouseStatus();
  mockParams.stockId = STOCK_A;
});

describe('D4 · işaret → yön çevrimi', () => {
  it('ekranın eksisi kayıtta "out" olur, artısı "in"', () => {
    expect(toRequestLine(STOCK_A, -4)).toEqual({ stockId: STOCK_A, qty: 4, direction: 'out' });
    expect(toRequestLine(STOCK_A, 2)).toEqual({ stockId: STOCK_A, qty: 2, direction: 'in' });
  });

  /* ADET DAİMA POZİTİF: yön ayrı alanda taşındığı için miktarda işaret KALMAMALI — kalsaydı aynı
     bilgi iki yerde dururdu ve ayrıştıkları gün hangisinin doğru olduğunu söyleyecek yer olmazdı
     (sözleşmenin kendi kuralı: `qty: z.number().int().positive()`, negatif adet REDDEDİLİR). */
  it('adet hiçbir yönde negatif göndermez', () => {
    expect(toRequestLine(STOCK_A, -4).qty).toBeGreaterThan(0);
    expect(toRequestLine(STOCK_A, 2).qty).toBeGreaterThan(0);
  });
});

describe('D4 · sayım / düzeltme', () => {
  it('partisiz açılırsa form ÇİZİLMEZ — neyin düşeceği belirsiz bir kayıt yazılmaz', async () => {
    mockParams.stockId = '';
    withResult();

    await render(<AdjustmentScreen />);

    expect(screen.getByTestId('warehouse-adjustment-no-subject')).toBeOnTheScreen();
    expect(screen.queryByTestId('warehouse-adjustment-cta')).toBeNull();
  });

  /* ÇIKIŞ YOLU BLOĞUN İÇİNDE (v3:914): "hangi parti" diye sorup cevabın nerede olduğunu
     söylememek, depocuyu geri tuşuna mahkûm ederdi. Şablonun ikinci yolu ("parti etiketini okut")
     bugün yazılamadı — parti etiketini çözen bir uç yok; uyuşmazlık defterinde. */
  it('partisiz açılışta ÇIKIŞ YOLU verilir — cevabın bulunduğu ekrana', async () => {
    mockParams.stockId = '';
    withResult();

    await render(<AdjustmentScreen />);
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-to-near-expiry'));

    expect(mockNavigate).toHaveBeenCalledWith('/near-expiry');
  });

  it('DÖRT sebep çizilir; "iade stoğa döndü" depocuya AÇILMAZ', async () => {
    withResult();

    await render(<AdjustmentScreen />);

    for (const reason of ['expired', 'damaged', 'count_diff', 'lost']) {
      expect(screen.getByTestId(`warehouse-adjustment-reason-${reason}`)).toBeOnTheScreen();
    }
    expect(screen.queryByTestId('warehouse-adjustment-reason-return_restock')).toBeNull();
  });

  it('belge numarası kayıttan ÖNCE uydurulmaz, SONRA gerçeği yazılır', async () => {
    withResult();

    await render(<AdjustmentScreen />);
    expect(screen.getByTestId('warehouse-adjustment-ref')).toHaveTextContent(/kayıttan sonra verilir/);

    await fireEvent.press(screen.getByTestId('warehouse-adjustment-reason-expired'));
    await fireEvent.changeText(screen.getByTestId('warehouse-adjustment-qty'), '-4');
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-adjustment-ref')).toHaveTextContent('IMH-STR-26-0004'));
  });

  it('DÜŞÜM gövdeye POZİTİF adet ve "out" yönüyle gider', async () => {
    withResult();

    await render(<AdjustmentScreen />);
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-reason-expired'));
    await fireEvent.changeText(screen.getByTestId('warehouse-adjustment-qty'), '-4');
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-adjustment-notice')).toBeOnTheScreen());
    /* Operatör "−4" yazdı (stoktan düştü); kayda giden `qty: 4, direction: 'out'`. Ekranın dili
       değişmedi, kaydınki 06.14'te değişti — çeviri `toRequestLine`da ve yukarıda ayrıca testli. */
    expect(lastPostBody()).toEqual({
      lines: [{ stockId: STOCK_A, qty: 4, direction: 'out' }],
      reason: 'expired',
      note: null,
    });
  });

  it('FAZLA yalnız sayım farkında yazılabilir — başka sebeple uyarı çıkar ve CTA kapalı kalır', async () => {
    withResult();

    await render(<AdjustmentScreen />);
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-reason-lost'));
    await fireEvent.changeText(screen.getByTestId('warehouse-adjustment-qty'), '2');

    expect(screen.getByTestId('warehouse-adjustment-surplus-warning')).toBeOnTheScreen();
    expect(screen.getByTestId('warehouse-adjustment-cta')).toBeDisabled();
  });

  it('FAZLA sayım farkında NOTLA yazılır; not boşken CTA kapalıdır', async () => {
    withResult();

    await render(<AdjustmentScreen />);
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-reason-count_diff'));
    await fireEvent.changeText(screen.getByTestId('warehouse-adjustment-qty'), '2');

    expect(screen.getByTestId('warehouse-adjustment-note-block')).toBeOnTheScreen();
    expect(screen.getByTestId('warehouse-adjustment-cta')).toBeDisabled();

    await fireEvent.changeText(screen.getByTestId('warehouse-adjustment-note'), 'sayımda 2 adet fazla çıktı');
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-adjustment-notice')).toBeOnTheScreen());
    /* GÖVDE YÖNÜ AÇIKÇA SÖYLER: ekranda "+2" (sayımda fazla çıktı) → kayıtta `qty: 2` ve
       `direction: 'in'`. Eskiden bu satır `qty: -2` idi; yön işarete gömülüydü. */
    expect(lastPostBody()).toEqual({
      lines: [{ stockId: STOCK_A, qty: 2, direction: 'in' }],
      reason: 'count_diff',
      note: 'sayımda 2 adet fazla çıktı',
    });
  });

  it('RPC reddi AYNEN gösterilir — "partide 3 var, 5 düşülemez" (21.11c)', async () => {
    withResult({ status: 'failed', message: 'adjust_stock_batch: partide 3 adet var, 5 adet düşülemez' });

    await render(<AdjustmentScreen />);
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-reason-expired'));
    await fireEvent.changeText(screen.getByTestId('warehouse-adjustment-qty'), '-5');
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('warehouse-adjustment-notice')).toHaveTextContent(/partide 3 adet var, 5 adet düşülemez/),
    );
  });

  it('kapsam dışı parti EKRANDA görünür — hangi partinin dışarıda kaldığı kaybolmaz', async () => {
    withResult({ status: 'forbidden', reason: 'out_of_scope', stockIds: [STOCK_A] });

    await render(<AdjustmentScreen />);
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-reason-damaged'));
    await fireEvent.changeText(screen.getByTestId('warehouse-adjustment-qty'), '-1');
    await fireEvent.press(screen.getByTestId('warehouse-adjustment-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('warehouse-adjustment-notice')).toHaveTextContent(/başka deponun/),
    );
  });
});
