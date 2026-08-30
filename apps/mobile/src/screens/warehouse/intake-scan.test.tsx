import type { z } from 'zod';
import type { ResolveCodeResponseSchema } from '@lezzet/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { IntakeScreen } from './intake-screen';
import { intakeRow } from './warehouse-fixture';
import { resetWarehouseStatus } from './warehouse-status';

/*
  D2 · TARAMA AKIŞI (Modül 23 · 23.4 · çekmece 23.08) — barkodun mal kabuldeki yolları:

  · bulunan kod ÇEKMECE açar (okutma sayım değil TANITIM): varsayılan adet okutulan birimin
    miktarı (koli → çarpan), depocu düzeltir, satıra ONAYLA yazılır ve toplamalıdır
  · SKU eşleşmesi kaynağını söyler (barkod kadar kesin değil — çekmece künyesi + onay cümlesi)
  · çekmece vazgeçilirse HİÇBİR satıra yazılmaz
  · PO'da olmayan ürünün kodu satır AÇMAZ (fark raporunun kümesi bozulmaz) — çekmece de açılmaz
  · tanınmayan kod öğrenme sayfasını açar; satır seçilince kod öğretilir, 1 eklenir
  · `already_bound` yarışı: bu arada başkası öğretmişse kod kime bağlıysa oradan sayılır

  Kodun kaynağı SİMÜLASYON HAVUZUDUR (dev çipleri) — kameranın okumasıyla aynı teslim noktasından
  geçtiği ScanSheet testinde ölçülü; burada ölçülen, kodun KABUL FORMUNA nasıl işlendiği.
  Ağ fetch seviyesinde sahte: URL'e göre dallanır, cevap sözleşme şeklindedir.
*/

const mockParams: { purchaseOrderId?: string; unplanned?: string } = {};
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

/* MLOR eşiği YANITIN alanıdır (ayardan gelir, satırın değil) — fikstür onu taşımazsa cevap
   ayrıştırılamaz ve ekran "sevkiyatlar yüklenemedi" der. Değer ayarın varsayılanı. */
const MLOR = 75;

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

/* TİP SÖZLEŞMEDEN TÜRER, elle yazılmaz (CLAUDE §1). Burada bir kopyası duruyordu ve şema
   büyüyünce (sku · dateType · shelfLifeDays) sessizce bayatladı: jest geçti, `tsc` kırıldı —
   yani fikstür gerçek cevabın şeklini kaybetmişti. */
type Resolved = z.infer<typeof ResolveCodeResponseSchema>;

/** Ağın senaryosu: form satırları + çözüm cevabı + (öğretme cevabı). URL'e göre dallanır. */
function withScan(resolved: Resolved, learn?: unknown) {
  fetchMock.mockImplementation((url, init) => {
    const path = String(url);
    if (path.includes('/codes/resolve')) return Promise.resolve(ok(resolved));
    if (path.endsWith('/codes')) return Promise.resolve(ok(learn ?? { status: 'ok' }));
    if (init?.method === 'POST') throw new Error(`beklenmeyen POST: ${path}`);
    return Promise.resolve(ok({ purchaseOrder: null, rows: [ROW_A, ROW_B], mlorPercent: MLOR }));
  });
}

async function renderIntake() {
  await render(<IntakeScreen />);
  await waitFor(() => expect(screen.queryByTestId('warehouse-intake-loading')).toBeNull());
}

/** Tarama sayfasını açıp bir havuz çipine basar — kodun kendisi önemsiz, cevabı mock belirliyor. */
async function scanOnce() {
  await fireEvent.press(screen.getByTestId('warehouse-intake-scan-cta'));
  await fireEvent.press(screen.getByLabelText('Paket'));
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
  delete mockParams.unplanned;
});

describe('D2 · tarama akışı', () => {
  it('koli kodu ÇEKMECE açar (varsayılan çarpan), onayla yazılır; ikinci okuma TOPLANIR', async () => {
    withScan({ status: 'found', variantId: ROW_A.variantId, productName: ROW_A.productName, variantLabel: ROW_A.variantLabel, kind: 'case', qtyPerCode: 6, source: 'barcode', sku: 'SKU-4120', dateType: 'DDM' as const, shelfLifeDays: 360, imageUrl: null });
    await renderIntake();

    await scanOnce();
    // Satıra HENÜZ yazılmadı: adet kararı çekmecenin — varsayılan, kolinin çarpanı.
    await waitFor(() => expect(screen.getByTestId('warehouse-intake-scanned-qty-value')).toHaveTextContent('6'));
    expect(qtyOf(ROW_A.variantId)).toBe('');

    await fireEvent.press(screen.getByTestId('warehouse-intake-scanned-confirm'));
    await waitFor(() => expect(qtyOf(ROW_A.variantId)).toBe('6'));
    expect(screen.getByTestId('warehouse-intake-notice')).toHaveTextContent(/6 adet eklendi/);

    // İkinci koli: depocu ince ayarla 7'ye çıkarır — onayda TOPLANIR (6 + 7).
    await scanOnce();
    await waitFor(() => expect(screen.getByTestId('warehouse-intake-scanned-qty-value')).toHaveTextContent('6'));
    await fireEvent.press(screen.getByTestId('warehouse-intake-scanned-qty-increase'));
    await fireEvent.press(screen.getByTestId('warehouse-intake-scanned-confirm'));
    await waitFor(() => expect(qtyOf(ROW_A.variantId)).toBe('13'));
  });

  it('SKU eşleşmesi kaynağını SÖYLER — barkod kadar kesin değil, cümle bunu taşır', async () => {
    withScan({ status: 'found', variantId: ROW_B.variantId, productName: ROW_B.productName, variantLabel: ROW_B.variantLabel, kind: 'unit', qtyPerCode: 1, source: 'sku', sku: 'SKU-4120', dateType: 'DDM' as const, shelfLifeDays: 360, imageUrl: null });
    await renderIntake();

    await scanOnce();
    await waitFor(() => expect(screen.getByTestId('warehouse-intake-scanned-qty-value')).toHaveTextContent('1'));
    await fireEvent.press(screen.getByTestId('warehouse-intake-scanned-confirm'));

    await waitFor(() => expect(screen.getByTestId('warehouse-intake-notice')).toHaveTextContent(/SKU eşleşmesi/));
    expect(qtyOf(ROW_B.variantId)).toBe('1');
  });

  it('çekmeceden VAZGEÇİLİRSE hiçbir satıra yazılmaz', async () => {
    withScan({ status: 'found', variantId: ROW_A.variantId, productName: ROW_A.productName, variantLabel: ROW_A.variantLabel, kind: 'case', qtyPerCode: 6, source: 'barcode', sku: 'SKU-4120', dateType: 'DDM' as const, shelfLifeDays: 360, imageUrl: null });
    await renderIntake();

    await scanOnce();
    await waitFor(() => expect(screen.getByTestId('warehouse-intake-scanned-qty-value')).toHaveTextContent('6'));
    // Örtü erişilebilirlik ağacından gizli (yalnız işaretçi kısayolu) — sorguya bunu söylemek gerek.
    await fireEvent.press(screen.getByTestId('warehouse-intake-scanned-scrim', { includeHiddenElements: true }));

    expect(qtyOf(ROW_A.variantId)).toBe('');
    expect(screen.queryByTestId('warehouse-intake-notice')).toBeNull();
  });

  it('PO kaleminde OLMAYAN ürünün kodu satır AÇMAZ — çekmece de açılmaz, yalnız söyler', async () => {
    withScan({ status: 'found', variantId: YABANCI_VARYANT, productName: 'Sahlep', variantLabel: '250 g', kind: 'unit', qtyPerCode: 1, source: 'barcode', sku: 'SKU-4120', dateType: 'DDM' as const, shelfLifeDays: 360, imageUrl: null });
    await renderIntake();

    await scanOnce();

    await waitFor(() => expect(screen.getByTestId('warehouse-intake-notice')).toHaveTextContent(/kaleminde yok/));
    // Hiçbir satıra adet DÜŞMEZ ve yeni satır doğmaz: fark raporunun kümesi siparişten gelir.
    expect(screen.queryByTestId('warehouse-intake-scanned-qty-value')).toBeNull();
    expect(qtyOf(ROW_A.variantId)).toBe('');
    expect(qtyOf(ROW_B.variantId)).toBe('');
  });

  it('tanınmayan kod TEKİL olarak öğretilir — çarpan 1, satıra 1 eklenir', async () => {
    withScan({ status: 'unknown' });
    await renderIntake();

    await scanOnce();
    await waitFor(() => expect(screen.getByTestId('warehouse-intake-learn')).toBeOnTheScreen());

    await fireEvent.press(screen.getByLabelText(`${ROW_B.productName} · ${ROW_B.variantLabel}`));
    // 2. adım varsayılanı TEKİL: koli olduğunu ancak depocu bilir, tersini varsaymak her pakete
    // uydurma bir çarpan yazmak olurdu.
    await fireEvent.press(screen.getByTestId('warehouse-intake-learn-confirm'));

    await waitFor(() => expect(qtyOf(ROW_B.variantId)).toBe('1'));
    expect(screen.getByTestId('warehouse-intake-notice')).toHaveTextContent(/öğrenildi/);
    const learnCall = fetchMock.mock.calls.findLast((c) => String(c[0]).endsWith('/codes'));
    expect(JSON.parse(String(learnCall?.[1]?.body ?? '{}'))).toMatchObject({
      variantId: ROW_B.variantId,
      kind: 'unit',
      qtyPerCode: 1,
    });
  });

  it('KOLİ olarak öğretilen kod ÇARPANIYLA yazılır ve satıra o kadar eklenir (23.12)', async () => {
    // 23.08'e kadar her öğretilen kod 1 adetlikti: kapı `kind`/`qtyPerCode` alıyordu ama ekran
    // göndermiyordu. Sonuç sessiz ve kalıcıydı — koli her okutmada 1 sayılırdı.
    withScan({ status: 'unknown' });
    await renderIntake();

    await scanOnce();
    await waitFor(() => expect(screen.getByTestId('warehouse-intake-learn')).toBeOnTheScreen());
    await fireEvent.press(screen.getByLabelText(`${ROW_B.productName} · ${ROW_B.variantLabel}`));

    await fireEvent.press(screen.getByTestId('warehouse-intake-learn-case'));
    // Çarpan 1'den başlar; iki artırma = 3 adetlik koli.
    await fireEvent.press(screen.getByTestId('warehouse-intake-learn-qty-increase'));
    await fireEvent.press(screen.getByTestId('warehouse-intake-learn-qty-increase'));
    await fireEvent.press(screen.getByTestId('warehouse-intake-learn-confirm'));

    await waitFor(() => expect(qtyOf(ROW_B.variantId)).toBe('3'));
    const learnCall = fetchMock.mock.calls.findLast((c) => String(c[0]).endsWith('/codes'));
    expect(JSON.parse(String(learnCall?.[1]?.body ?? '{}'))).toMatchObject({
      variantId: ROW_B.variantId,
      kind: 'case',
      qtyPerCode: 3,
    });
  });

  it('koli seçilip çarpan 1 kalırsa öğretme kapısı AÇILMAZ — "1 adetlik koli" bir beyan değil, eksik cevaptır', async () => {
    withScan({ status: 'unknown' });
    await renderIntake();

    await scanOnce();
    await waitFor(() => expect(screen.getByTestId('warehouse-intake-learn')).toBeOnTheScreen());
    await fireEvent.press(screen.getByLabelText(`${ROW_B.productName} · ${ROW_B.variantLabel}`));
    await fireEvent.press(screen.getByTestId('warehouse-intake-learn-case'));
    await fireEvent.press(screen.getByTestId('warehouse-intake-learn-confirm'));

    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/codes'))).toBe(false);
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
    await fireEvent.press(screen.getByTestId('warehouse-intake-learn-confirm'));

    // Depocu B'yi seçti ama kod bu arada A'ya bağlanmış: adet A'ya düşer, B'ye değil.
    await waitFor(() => expect(qtyOf(ROW_A.variantId)).toBe('1'));
    expect(qtyOf(ROW_B.variantId)).toBe('');
    expect(screen.getByTestId('warehouse-intake-notice')).toHaveTextContent(/bağlanmış/);
  });
});

/*
  PLANSIZ KABULÜN BOŞ HÂLİ — cihaz turunda bulunan sessiz arıza (25.08).

  Ekranın plansız-boş dalı erken dönüyor ve öğrenme çekmecesi yalnız ANA dalda çiziliyordu.
  Sonuç: plansız kabulde İLK okutma tanınmayan bir kod olduğunda `setLearn` çalışıyor, state
  doğru kuruluyor ve ekran hiç kıpırdamıyordu. Testler bunu görmüyordu çünkü hepsi PO'lu kabulde
  koşuyor (`mockParams.purchaseOrderId` dolu) — yani dal hiç uyanmıyordu.

  Gerçek cihazda TANINMAYAN etiketi okutulup ölçüldü: ekran kıpırdamadı, uyarı da çıkmadı.
  Depocu böyle bir hâlde kamerayı suçlar ve kâğıdı defalarca okutur.
*/
describe('D2 · plansız kabulün boş hâli', () => {
  /** Plansız mod: PO yok, `unplanned=1`. Boş hâl bu ikisinin birleşimiyle doğuyor. */
  function unplannedMode() {
    delete mockParams.purchaseOrderId;
    mockParams.unplanned = '1';
  }

  it('TANINMAYAN kod ilk okutmada öğrenme çekmecesini AÇAR — ekran sessiz kalmaz', async () => {
    unplannedMode();
    // Plansızda form BOŞ gelir: satır kümesi yok, ilk satırı okutma açacak.
    fetchMock.mockImplementation((url, init) => {
      const path = String(url);
      if (path.includes('/codes/resolve')) return Promise.resolve(ok({ status: 'unknown' }));
      if (init?.method === 'POST') throw new Error(`beklenmeyen POST: ${path}`);
      return Promise.resolve(ok({ purchaseOrder: null, rows: [], mlorPercent: MLOR }));
    });
    await render(<IntakeScreen />);
    await waitFor(() => expect(screen.queryByTestId('warehouse-intake-loading')).toBeNull());

    // Boş hâl çizildi mi — dalın gerçekten uyandığının kanıtı.
    expect(screen.getByTestId('warehouse-intake-unplanned-empty')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('warehouse-intake-scan-cta'));
    await fireEvent.press(screen.getByLabelText('Tanınmayan'));

    // ASIL İDDİA: çekmece görünür. Yoksa okutma hiçbir iz bırakmaz.
    await waitFor(() => expect(screen.getByTestId('warehouse-intake-learn')).toBeOnTheScreen());
  });

  it('ADAY LİSTESİ BOŞKEN çekmece aramaya yönlendirir — "satırı seçin" deyip boşluk göstermez', async () => {
    /*
      Cihazda görüldü (25.08): çekmece açıldı ama altı boştu — "Satırı seçin" cümlesi seçilecek
      hiçbir şey olmadan duruyordu. Plansız kabulde İLK okutma tanınmayan bir kodsa aday kümesi
      zaten boştur; o hâlde doğru cevap "seç" değil "önce bulalım".
    */
    unplannedMode();
    fetchMock.mockImplementation((url, init) => {
      const path = String(url);
      if (path.includes('/codes/resolve')) return Promise.resolve(ok({ status: 'unknown' }));
      if (init?.method === 'POST') throw new Error(`beklenmeyen POST: ${path}`);
      return Promise.resolve(ok({ purchaseOrder: null, rows: [], mlorPercent: MLOR }));
    });
    await render(<IntakeScreen />);
    await waitFor(() => expect(screen.queryByTestId('warehouse-intake-loading')).toBeNull());

    await fireEvent.press(screen.getByTestId('warehouse-intake-scan-cta'));
    await fireEvent.press(screen.getByLabelText('Tanınmayan'));
    await waitFor(() => expect(screen.getByTestId('warehouse-intake-learn')).toBeOnTheScreen());

    // Arama düğmesi ÇİZİLİR: çıkış yolu çekmecenin içinde olmalı, başka ekranda değil.
    expect(screen.getByTestId('warehouse-intake-learn-search')).toBeOnTheScreen();
    // Ve satır seçtiren liste YOKTUR — olmayan bir seçim sunulmaz.
    expect(screen.queryByTestId('warehouse-intake-learn-confirm')).toBeNull();
  });
});
