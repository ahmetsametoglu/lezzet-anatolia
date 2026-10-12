import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

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
/* Başarı bildirimi toast'tadır, çünkü başarıda ekran kapanır; testler bu yüzden toast deposunu dinler, hata bildirimi
   ekranda kalır (`warehouse-intake-notice`). */
const mockToast = jest.fn();
/** Başarılı kabul ekranı KAPATIR — geri dönüşü ölçmek için ayrı casus. */
const mockBack = jest.fn();
jest.mock('@lezzet/mobile-kit/src/lib/toast/toast-store', () => ({
  toastSuccess: (m: string) => mockToast(m),
  toastError: (m: string) => mockToast(m),
  toastInfo: (m: string) => mockToast(m),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn(), back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockParams,
  /* Kabuk kromunun odak hizalaması; taklit modülü bütünüyle değiştirir. */
  useFocusEffect: () => undefined,
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

const PO_ID = '00000000-0000-4000-8000-000000000091';
const ROW_A = intakeRow();
const ROW_B = intakeRow({
  variantId: '00000000-0000-4000-8000-000000000042',
  productName: 'Mısır Unu',
  variantLabel: '25 kg',
  expectedQty: 4,
});

/* MLOR eşiği YANITIN alanıdır (ayardan gelir, satırın değil) — fikstür onu taşımazsa cevap
   ayrıştırılamaz ve ekran "sevkiyatlar yüklenemedi" der. Değer ayarın varsayılanı. */
const MLOR = 75;

/* Çekmece bir kare sonra çizilir: `visible` kütüphanenin `present()`ine çevrilir ve testte `fireEvent`ler aynı karede
   koştuğu için beklenir. */
async function openSheet(firstTestID: string): Promise<void> {
  await waitFor(() => expect(screen.getByTestId(firstTestID)).toBeOnTheScreen());
}

/**
 * Bir satırı sayar: "say →" satırı açar, adet kutusu çekmeceyi açar ve tek paket cetvelinden (0–24) sayı seçilir. Test
 * kullanıcının gerçek yolunu izler; yapamadığı yoldan geçen test yeşil kalırken hiçbir şey ölçmez.
 */
async function countRow(variantId: string, qty: string) {
  await fireEvent.press(screen.getByTestId(`warehouse-intake-count-${variantId}`));
  await fireEvent.press(screen.getByTestId(`warehouse-intake-qty-${variantId}`));
  const sheet = `warehouse-intake-qty-sheet-${variantId}`;
  await openSheet(`${sheet}-ruler-${qty}`);
  await fireEvent.press(screen.getByTestId(`${sheet}-ruler-${qty}`));
  await fireEvent.press(screen.getByTestId(`${sheet}-confirm`));
}

/**
 * SKT altı rakamla girilir: alan tuş takımını açar, depocu kolideki tarihi `gg aa yy` diye yazar ve "yaz"a basar; tekerlek ayrı
 * bağlantının arkasındadır (`openWheel`).
 */
async function pickExpiry(variantId: string, day: number, month: number, year: number) {
  await fireEvent.press(screen.getByTestId(`warehouse-intake-expiry-${variantId}`));
  const sheet = `warehouse-intake-expiry-sheet-${variantId}`;
  await openSheet(`${sheet}-key-1`);
  const digits = `${String(day).padStart(2, '0')}${String(month).padStart(2, '0')}${String(year).slice(2)}`;
  for (const digit of digits) await fireEvent.press(screen.getByTestId(`${sheet}-key-${digit}`));
  await fireEvent.press(screen.getByTestId(`${sheet}-confirm`));
}

/** Tekerlekli seçiciye giden yol: tuş takımı → "takvimden seç" → tekerlek. */
async function openWheel(variantId: string): Promise<string> {
  await fireEvent.press(screen.getByTestId(`warehouse-intake-expiry-${variantId}`));
  const keypad = `warehouse-intake-expiry-sheet-${variantId}`;
  await openSheet(`${keypad}-wheel`);
  await fireEvent.press(screen.getByTestId(`${keypad}-wheel`));
  const wheel = `warehouse-intake-expiry-wheel-${variantId}`;
  await openSheet(`${wheel}-month-1`);
  return wheel;
}

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

/** Sunucu ADLI hata döndürdü — ağ ayakta, cevap olumsuz. */
function serverError(): Response {
  return {
    status: 500,
    headers: { get: () => null },
    json: async () => ({ data: null, error: 'server_error' }),
  } as unknown as Response;
}

function lastPostBody(): {
  lines: { variantId: string; qty: number; expiryDate: string; lotNumber: string | null }[];
  note: string | null;
} {
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
    return Promise.resolve(ok({ purchaseOrder: null, rows, mlorPercent: MLOR }));
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
  mockToast.mockClear();
  mockBack.mockClear();
  fetchMock.mockReset();
  mockPush.mockReset();
  resetWarehouseStatus();
  mockParams.purchaseOrderId = PO_ID;
  delete mockParams.unplanned;
});

describe('D2 · mal kabul', () => {
  it('konusuz açılırsa BEKLEYEN SEVKİYATLARI listeler — kabul formu çizilmez', async () => {
    // Konusuz açılış bekleyen sevkiyatları listeler; kabul derin bağlantıya bağlı kalmasın.
    delete mockParams.purchaseOrderId;
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        ok({
          intakes: [
            { purchaseOrderId: PO_ID, referenceNo: 'TS-26-ABC123', supplierName: 'Gaziantep', lineCount: 4, status: 'sent' as const },
          ],
        }),
      ),
    );

    await renderIntake();

    expect(screen.getByTestId(`warehouse-intake-pending-${PO_ID}`)).toBeOnTheScreen();
    expect(screen.getByText('TS-26-ABC123')).toBeOnTheScreen();
    expect(screen.queryByTestId('warehouse-intake-cta')).toBeNull();
  });

  /*
    v3 KÜNYESİ LİSTEYİ ANLATIR (v3:517) — "bekleyen sevkiyatlar" bir başlık tekrarıydı; depocunun
    işe başlamadan sorduğu şey "kaç sevkiyat, toplam kaç kalem". Sayı listeden çıkıyor, ikinci bir
    özet ucu istemiyor (hub'ın aynı kuralı).
  */
  it('başlık künyesi kaç sevkiyat ve toplam kaç kalem olduğunu söyler', async () => {
    delete mockParams.purchaseOrderId;
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        ok({
          intakes: [
            { purchaseOrderId: PO_ID, referenceNo: 'TS-26-A', supplierName: 'Gaziantep', lineCount: 5, status: 'sent' as const },
            {
              purchaseOrderId: '00000000-0000-4000-8000-0000000000c2',
              referenceNo: 'TS-26-B',
              supplierName: 'Gaziantep',
              lineCount: 6,
              status: 'sent' as const,
            },
          ],
        }),
      ),
    );

    await renderIntake();

    expect(screen.getByTestId('warehouse-intake-header')).toHaveTextContent(/2 bekleyen sevkiyat · 11 kalem/);
  });

  it('liste OKUNAMADIYSA künye sayı uydurmaz — kategoriye düşer', async () => {
    delete mockParams.purchaseOrderId;
    fetchMock.mockImplementation(() => Promise.resolve(serverError()));

    await renderIntake();

    const header = screen.getByTestId('warehouse-intake-header');
    expect(header).toHaveTextContent(/bekleyen sevkiyatlar/);
    expect(header).not.toHaveTextContent(/kalem/);
  });

  /* PLANSIZ KABUL LİSTENİN SONUNDA (v3:574): beklenen adet yoktur, sayım onunla doğrulanamaz —
     kuyruğun üstünde durması onu normal yol gibi gösteriyordu. Boş hâlde ise TEK yoldur. */
  it('plansız kabul listenin SONUNDA durur — bekleyen sevkiyatların üstünde değil', async () => {
    delete mockParams.purchaseOrderId;
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        ok({ intakes: [{ purchaseOrderId: PO_ID, referenceNo: 'TS-26-A', supplierName: 'X', lineCount: 2, status: 'sent' as const }] }),
      ),
    );

    await renderIntake();

    const list = screen.getByTestId('warehouse-intake-pending');
    expect(screen.getByTestId('warehouse-intake-unplanned-cta')).toBeOnTheScreen();
    // Sıra metinden okunuyor: bekleyen sevkiyatın referansı, plansız kabulün etiketinden ÖNCE.
    expect(list).toHaveTextContent(/TS-26-A[\s\S]*Siparişsiz mal geldi/);
    // Dipnot listenin sonunda: parçalı kabulün mümkün olduğu burada söyleniyor.
    expect(list).toHaveTextContent(/Parçalı kabul mümkün/);
  });

  it('bekleyen sevkiyat yokken plansız kabul boş hâlin İÇİNDE durur', async () => {
    delete mockParams.purchaseOrderId;
    fetchMock.mockImplementation(() => Promise.resolve(ok({ intakes: [] })));

    await renderIntake();

    expect(screen.getByTestId('warehouse-intake-no-subject')).toBeOnTheScreen();
    expect(screen.getByTestId('warehouse-intake-unplanned-empty-cta')).toBeOnTheScreen();
  });

  it('bekleyen sevkiyat YOKSA uydurma liste çizilmez, boşluk söylenir', async () => {
    delete mockParams.purchaseOrderId;
    fetchMock.mockImplementation(() => Promise.resolve(ok({ intakes: [] })));

    await renderIntake();

    expect(screen.getByTestId('warehouse-intake-no-subject')).toBeOnTheScreen();
  });

  /* Form künyesi ilerlemeyi söyler (kaç kalem, kaçı tamam); "tamam" ölçüsü kayıt düğmesininkiyle aynı iki koşuldur (adet +
     SKT), ayrışsalardı künye "1 tamam" derken düğme kapalı kalırdı. */
  it('form künyesi kaç kalem ve kaçının TAMAM olduğunu söyler', async () => {
    withForm([ROW_A, ROW_B]);

    await renderIntake();
    expect(screen.getByTestId('warehouse-intake-header')).toHaveTextContent(/2 kalem · 0 tamam/);

    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 1, 12, 2026);

    expect(screen.getByTestId('warehouse-intake-header')).toHaveTextContent(/2 kalem · 1 tamam/);
  });

  /* Çevrimdışıyken okutma düğmesi söner ve sebep yazılır: kilit bir yokluk değil cevaptır. Satırlar durur, okumak
     serbesttir. */
  it('ağ düşünce okutma düğmesi SÖNER ve sebep yazılır, satırlar kalır', async () => {
    let first = true;
    fetchMock.mockImplementation(() => {
      if (first) {
        first = false;
        return Promise.resolve(
          ok({ purchaseOrder: { purchaseOrderId: PO_ID, referenceNo: 'TS-26-A', supplierName: 'X' }, rows: [ROW_A], mlorPercent: MLOR }),
        );
      }
      return Promise.reject(new Error('network down'));
    });

    await renderIntake();
    expect(screen.getByTestId('warehouse-intake-scan-cta')).toBeOnTheScreen();

    // Yazma denemesi ağa çıkar ve düşer — çevrimdışı bayrağı böyle doğar.
    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 1, 12, 2026);
    await fireEvent.press(screen.getByTestId('warehouse-intake-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-intake-locked')).toBeOnTheScreen());
    expect(screen.getByTestId('warehouse-intake-scan-cta')).toBeDisabled();
    expect(screen.getByTestId('warehouse-intake-locked')).toHaveTextContent(/iki deponun stokunu bozabilir/);
    // Satırlar YERİNDE: okumak serbest.
    expect(screen.getByTestId(`warehouse-intake-line-${ROW_A.variantId}`)).toBeOnTheScreen();
  });

  /* Sıfır beklenen iki ayrı şeydir: `expectedQty` kalandır, ısmarlanan değil; planlı siparişte sıfır kalan "beklenti
     karşılandı" demektir ve depocu ikinci turda o kaleme dokunmayacağını bilmeli. */
  it('PLANLI siparişte sıfır kalan "tamamlandı" der — sessiz kalmaz', async () => {
    withForm([intakeRow({ variantId: ROW_A.variantId, expectedQty: 0 })]);

    await renderIntake();

    expect(screen.getByTestId(`warehouse-intake-done-${ROW_A.variantId}`)).toHaveTextContent(/tamamlandı/);
  });

  it('PLANSIZ kabulde sıfır beklenen SESSİZDİR — kıyaslanacak sipariş yok', async () => {
    delete mockParams.purchaseOrderId;
    mockParams.unplanned = '1';
    fetchMock.mockImplementation(() => Promise.resolve(ok({ purchaseOrder: null, rows: [], mlorPercent: MLOR })));

    await renderIntake();

    expect(screen.queryByTestId(`warehouse-intake-done-${ROW_A.variantId}`)).toBeNull();
    delete mockParams.unplanned;
  });

  /* Elle eklenen satır da sayım çekmecesini açar: okutulan satırın adedi koddan gelir, elle eklenenin adedi sıfırdır ve
     çekmece burada daha gereklidir. */
  it('PLANSIZ kabulde aramadan eklenen ürün adet çekmecesini AÇAR', async () => {
    /* ANDROID DALI: iOS'ta çekmece arama penceresi ekrandan kalkana kadar bekliyor ve o kapı
       Reanimated'ın kapanış geri çağrısına bağlı — jest'te koşmuyor. Kapının KENDİSİ
       `intake-scan.test.tsx`te ölçülüyor; burada ölçülen şey davranışın özü: elle eklenen satır
       adet çekmecesini açar. */
    const realPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    delete mockParams.purchaseOrderId;
    mockParams.unplanned = '1';
    /* İki uç, iki cevap: form BOŞ (plansız kabul), arama tek ürün döndürüyor. Tek cevaplı bir
       mock aramaya da formun gövdesini verirdi ve liste hiç dolmazdı. */
    fetchMock.mockImplementation((url: unknown) =>
      String(url).includes('/warehouse/variants')
        ? Promise.resolve(
            ok({
              variants: [
                {
                  variantId: ROW_A.variantId,
                  productName: ROW_A.productName,
                  variantLabel: ROW_A.variantLabel,
                  sku: 'SKU-4120',
                  dateType: 'DDM',
                  shelfLifeDays: 360,
                  imageUrl: null,
                  stockQty: 12,
                  qtyPerCode: null,
                  caseSizes: [],
                },
              ],
            }),
          )
        : Promise.resolve(ok({ purchaseOrder: null, rows: [], mlorPercent: MLOR })),
    );

    await renderIntake();
    await fireEvent.press(screen.getByTestId('warehouse-intake-search-cta'));
    await fireEvent.changeText(screen.getByTestId('warehouse-intake-search-input'), 'baklava');
    await waitFor(() => expect(screen.getByTestId(`warehouse-intake-search-${ROW_A.variantId}`)).toBeTruthy());

    await fireEvent.press(screen.getByTestId(`warehouse-intake-search-${ROW_A.variantId}`));

    // Satır DOĞDU…
    await waitFor(() => expect(screen.getByTestId(`warehouse-intake-line-${ROW_A.variantId}`)).toBeTruthy());
    // …ve arama penceresi kapanınca adet çekmecesi AÇILDI (kapının kendisi `intake-scan`te ölçülü).
    await waitFor(() => expect(screen.getByTestId(`warehouse-intake-qty-sheet-${ROW_A.variantId}`)).toBeTruthy());
    delete mockParams.unplanned;
    Object.defineProperty(Platform, 'OS', { value: realPlatform, configurable: true });
  });

  it('SKT girilmeden CTA açılmaz — kural şemada, ekran kapıyı boşuna zorlamaz', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');

    /* Düğme asıl eylemi yazar; beklentiyi üstteki kapı satırı sayacıyla birlikte söyler. */
    expect(screen.getByTestId('warehouse-intake-cta')).toBeDisabled();
    expect(screen.getByTestId('warehouse-intake-gate')).toHaveTextContent(/adet \+ SKT zorunlu/);
    expect(screen.getByTestId(`warehouse-intake-expiry-state-${ROW_A.variantId}`)).toHaveTextContent('SKT gir *');
  });

  it('KAPI SATIRI kaç satırın dolduğunu sayar — depocu listeyi gezmeden görür', async () => {
    withForm([ROW_A, ROW_B]);

    await renderIntake();
    expect(screen.getByTestId('warehouse-intake-gate')).toHaveTextContent(/0\/2 satır dolu/);

    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 5, 9, 2027);

    expect(screen.getByTestId('warehouse-intake-gate')).toHaveTextContent(/1\/2 satır dolu/);
  });

  /* Siparişli kabulden plansıza geçince ekran aynı rota olduğu için yeniden kurulmaz; plansız dal önceki siparişin
     satırlarını temizlemeli, yoksa depocuya olmayan bir siparişin beklentisini gösterirdi. */
  it('PLANSIZA geçince önceki siparişin satırları TEMİZLENİR', async () => {
    withForm([ROW_A, ROW_B]);

    const view = await render(<IntakeScreen />);
    await waitFor(() => expect(screen.getByTestId(`warehouse-intake-line-${ROW_A.variantId}`)).toBeOnTheScreen());

    delete mockParams.purchaseOrderId;
    mockParams.unplanned = '1';
    view.rerender(<IntakeScreen />);

    await waitFor(() => expect(screen.queryByTestId(`warehouse-intake-line-${ROW_A.variantId}`)).toBeNull());
    expect(screen.getByTestId('warehouse-intake-unplanned-empty')).toBeOnTheScreen();
  });

  it('takvimde OLMAYAN gün seçicide HİÇ YOK — 31 Şubat yazılamıyor', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');

    /* Seçicide olmayan gün listeye hiç girmez: hata yakalanmaz, doğmaz; Şubat'a geçen seçici günü kendiliğinden kırpar
       (`date-wheel-value.test.ts`). */
    const sheet = await openWheel(ROW_A.variantId);
    await fireEvent.press(screen.getByTestId(`${sheet}-month-2`));

    expect(screen.queryByTestId(`${sheet}-day-31`)).toBeNull();
    expect(screen.queryByTestId(`${sheet}-day-29`)).toBeNull(); // 2026 artık yıl değil
    expect(screen.getByTestId(`${sheet}-day-28`)).toBeOnTheScreen();
  });

  /* Tuş takımında olmayan gün yazılabilir ama onaylanamaz: kırmızı satır söyler, düğme kapalı kalır. Aynı kabuldeki öteki
     satırın tarihi çip olarak gelir ve taslağı doldurur. */
  it('tuş takımında olmayan gün onaylanamaz; öteki satırın tarihi çip olarak gelir', async () => {
    withForm([ROW_A, ROW_B]);
    await renderIntake();

    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 12, 9, 2027);
    expect(screen.getByTestId(`warehouse-intake-expiry-state-${ROW_A.variantId}`)).toHaveTextContent('12.09.27');

    // B satırı: olmayan gün yazılır, onay kapalı kalır ve uyarı satırı kırmızı cümleyi okur.
    await countRow(ROW_B.variantId, '4');
    await fireEvent.press(screen.getByTestId(`warehouse-intake-expiry-${ROW_B.variantId}`));
    const sheet = `warehouse-intake-expiry-sheet-${ROW_B.variantId}`;
    await openSheet(`${sheet}-key-1`);
    for (const digit of '310227') await fireEvent.press(screen.getByTestId(`${sheet}-key-${digit}`));
    expect(screen.getByTestId(`${sheet}-hint`)).toHaveTextContent(/Böyle bir gün yok/);
    await fireEvent.press(screen.getByTestId(`${sheet}-confirm`));
    expect(screen.getByTestId(`warehouse-intake-expiry-state-${ROW_B.variantId}`)).toHaveTextContent('SKT gir *');

    // Geçmiş tarih de onaylanamaz: altı kez sil, geçmiş bir tarih yaz, kırmızı satır.
    for (let i = 0; i < 6; i += 1) await fireEvent.press(screen.getByTestId(`${sheet}-delete`));
    for (const digit of '010120') await fireEvent.press(screen.getByTestId(`${sheet}-key-${digit}`));
    expect(screen.getByTestId(`${sheet}-hint`)).toHaveTextContent(/Tarih geçmişte/);
    await fireEvent.press(screen.getByTestId(`${sheet}-confirm`));
    expect(screen.getByTestId(`warehouse-intake-expiry-state-${ROW_B.variantId}`)).toHaveTextContent('SKT gir *');

    // A'nın tarihi çip: dokununca taslak dolar, düğme o tarihi söyler, yaz.
    await fireEvent.press(screen.getByTestId(`${sheet}-pick-2027-09-12`));
    expect(screen.getByTestId(`${sheet}-confirm`)).toHaveTextContent('12.09.27 · yaz');
    await fireEvent.press(screen.getByTestId(`${sheet}-confirm`));
    expect(screen.getByTestId(`warehouse-intake-expiry-state-${ROW_B.variantId}`)).toHaveTextContent('12.09.27');
  });

  it('adet + geçerli SKT ile CTA açılır ve satır ISO tarihle gönderilir', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 12, 8, 2027);

    expect(screen.getByTestId('warehouse-intake-cta')).toHaveTextContent(/Kabulü kaydet/);

    await fireEvent.press(screen.getByTestId('warehouse-intake-cta'));
    await waitFor(() => expect(mockToast).toHaveBeenCalled());

    expect(lastPostBody().lines).toEqual([{ variantId: ROW_A.variantId, qty: 10, expiryDate: '2027-08-12', lotNumber: null }]);
  });

  it('fark özeti YALNIZ sapan satırı taşır — uyan satır listeye girmez', async () => {
    withForm([ROW_A, ROW_B]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');
    await countRow(ROW_B.variantId, '3');

    const diff = screen.getByTestId('warehouse-intake-differences');
    expect(diff).toHaveTextContent(/Mısır Unu · 25 kg: beklenen 4, gelen 3/);
    expect(diff).not.toHaveTextContent(/Antep Fıstığı/);
  });

  it('sapan satır varsa CTA "kısmen teslim alındı" der — kabul yine YAZILIR', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '8');
    await pickExpiry(ROW_A.variantId, 12, 8, 2027);

    expect(screen.getByTestId('warehouse-intake-cta')).toHaveTextContent(/Kısmen teslim alındı/);
  });

  it('lot BİLİNÇLİ boş bırakılır — uydurma kod gitmez', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 12, 8, 2027);

    /* Kutu boşsa lot yoktur: yazılanı temizle düğmesi siler ve boş kutu `lotNumber: null` demektir. */
    await fireEvent.press(screen.getByTestId(`warehouse-intake-lot-toggle-${ROW_A.variantId}`));
    await openSheet(`warehouse-intake-lot-${ROW_A.variantId}`);
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-lot-${ROW_A.variantId}`), 'GAZ-7120');
    await fireEvent.press(screen.getByTestId(`warehouse-intake-lot-clear-${ROW_A.variantId}`));
    await fireEvent.press(screen.getByTestId('warehouse-intake-cta'));

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(lastPostBody().lines[0]?.lotNumber).toBeNull();
  });

  /* Lot önerilerinin iki kaynağı vardır: aynı kabuldeki öteki satırların kodları ilk satırda boştur, depodaki partilerin
     kodları (`lotCandidates`) o boşluğu doldurur. Sıra ölçülür, çünkü aynı kabulde az önce yazılmış kod eldeki koliyle daha
     büyük ihtimalle aynıdır. */
  it('lot önerileri İKİ kaynaktan gelir — aynı kabuldekiler ÖNCE, depodakiler sonra', async () => {
    withForm([
      intakeRow({ variantId: ROW_A.variantId, lotCandidates: ['DEPO-1', 'DEPO-2'] }),
      intakeRow({ variantId: ROW_B.variantId, productName: ROW_B.productName, variantLabel: ROW_B.variantLabel }),
    ]);

    await renderIntake();

    // Önce ÖTEKİ satıra bir kod yazılıyor: birinci kaynak ancak böyle dolar.
    await countRow(ROW_B.variantId, '4');
    await fireEvent.press(screen.getByTestId(`warehouse-intake-lot-toggle-${ROW_B.variantId}`));
    await openSheet(`warehouse-intake-lot-${ROW_B.variantId}`);
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-lot-${ROW_B.variantId}`), 'AYNI-KABUL');

    await countRow(ROW_A.variantId, '10');
    await fireEvent.press(screen.getByTestId(`warehouse-intake-lot-toggle-${ROW_A.variantId}`));
    await openSheet(`warehouse-intake-lot-suggestion-${ROW_A.variantId}-AYNI-KABUL`);

    // Üçü de öneriliyor: biri aynı kabulden, ikisi depodan.
    expect(screen.getByTestId(`warehouse-intake-lot-suggestion-${ROW_A.variantId}-AYNI-KABUL`)).toBeOnTheScreen();
    expect(screen.getByTestId(`warehouse-intake-lot-suggestion-${ROW_A.variantId}-DEPO-1`)).toBeOnTheScreen();
    expect(screen.getByTestId(`warehouse-intake-lot-suggestion-${ROW_A.variantId}-DEPO-2`)).toBeOnTheScreen();
  });

  it('depoda kodlu parti yoksa öneri listesi SESSİZ kalır — boş bir kutu çizilmez', async () => {
    withForm([intakeRow({ variantId: ROW_A.variantId, lotCandidates: [] })]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');
    await fireEvent.press(screen.getByTestId(`warehouse-intake-lot-toggle-${ROW_A.variantId}`));

    expect(screen.queryByTestId(`warehouse-intake-lot-suggestion-${ROW_A.variantId}-DEPO-1`)).toBeNull();
  });

  it('lot ÇEKMECEDEN yazılır ve isteğe o kod gider', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 12, 8, 2027);

    /* ONAY DÜĞMESİ YOK: kutuya yazılan kod satıra CANLI işleniyor, çekmece yalnız kapanıyor. */
    await fireEvent.press(screen.getByTestId(`warehouse-intake-lot-toggle-${ROW_A.variantId}`));
    await openSheet(`warehouse-intake-lot-${ROW_A.variantId}`);
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-lot-${ROW_A.variantId}`), 'GAZ-7120');
    await fireEvent.press(screen.getByTestId('warehouse-intake-cta'));

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(lastPostBody().lines[0]?.lotNumber).toBe('GAZ-7120');
  });

  /*
    ── SATIRIN KAYNAĞI (v3:05 · `kaynakNotu`) ────────────────────────────────
    Elle sayılan satırla okutularak sayılan satır AYNI görünmemeli: ikincisinde kutunun üstündeki
    kod ile kayıt eşleşmiştir, birincisinde yalnız depocunun beyanı vardır. Adet ikisinde de aynı
    sayı olduğu için bu bilgi TÜRETİLEMEZ — satır durumunda taşınması gerekiyor.
  */
  it('elle sayılan satır "barkod okutulmadı" der — kaynak künyesi uydurulmaz', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');

    expect(screen.getByTestId(`warehouse-intake-source-${ROW_A.variantId}`)).toHaveTextContent(/barkod okutulmadı/);
    // Okutma kutusu da ÇİZİLMEZ: söyleyecek bir şey yok.
    expect(screen.queryByTestId(`warehouse-intake-scan-note-${ROW_A.variantId}`)).toBeNull();
  });

  /*
    ── ADET ÇEKMECESİ: SORU "KAÇ KOLİ", ÇARPMA EKRANIN İŞİ (v3 · `sheetAdet`) ─
    Depocu rampada 27'yi rakam rakam yazmaz, "iki koli, üç tek" der. Çarpanı ürünün kayıtlı koli
    kodu taşıyor (`caseSizes`); zihinden çarpım sayımın en sık hata kaynağıdır.
  */
  it('koli sayacı ÇARPARAK sayar ve hesabın kendisini yazar', async () => {
    const kolili = intakeRow({ expectedQty: 27, caseSizes: [{ code: '18691000023757', qtyPerCode: 12 }] });
    withForm([kolili]);
    const sheet = `warehouse-intake-qty-sheet-${kolili.variantId}`;

    await renderIntake();
    await fireEvent.press(screen.getByTestId(`warehouse-intake-count-${kolili.variantId}`));
    await fireEvent.press(screen.getByTestId(`warehouse-intake-qty-${kolili.variantId}`));

    // İki koli + üç tek paket.
    await fireEvent.press(screen.getByTestId(`${sheet}-case-18691000023757-step-increase`));
    await fireEvent.press(screen.getByTestId(`${sheet}-case-18691000023757-step-increase`));
    await fireEvent.press(screen.getByTestId(`${sheet}-ruler-3`));

    expect(screen.getByTestId(`${sheet}-total`)).toHaveTextContent('27');
    expect(screen.getByTestId(`${sheet}-sum`)).toHaveTextContent('2 × 12  +  3 tek paket  =  27 paket');

    // Kapanınca satırın adedi TOPLAMDIR — döküm çekmecenin belleği, satırın sayısı toplam.
    await fireEvent.press(screen.getByTestId(`${sheet}-confirm`));
    // Kutu "27" + altında "ADET" başlığı taşıyor; kalıp sayının kendisini arıyor.
    expect(screen.getByTestId(`warehouse-intake-qty-${kolili.variantId}`)).toHaveTextContent(/27/);
  });

  /* Sayılan koli çekmeceyi kapatıp AÇINCA da duruyor: depocunun düzeltmek istediği şey toplam
     değil, bir koli sayısıdır — döküm kaybolsaydı 27'yi elle bozmak zorunda kalırdı. */
  it('döküm çekmece yeniden açılınca DURUR', async () => {
    const kolili = intakeRow({ caseSizes: [{ code: '18691000023757', qtyPerCode: 12 }] });
    withForm([kolili]);
    const sheet = `warehouse-intake-qty-sheet-${kolili.variantId}`;

    await renderIntake();
    await fireEvent.press(screen.getByTestId(`warehouse-intake-count-${kolili.variantId}`));
    await fireEvent.press(screen.getByTestId(`warehouse-intake-qty-${kolili.variantId}`));
    await openSheet(`${sheet}-case-18691000023757-step-increase`);
    await fireEvent.press(screen.getByTestId(`${sheet}-case-18691000023757-step-increase`));
    await fireEvent.press(screen.getByTestId(`${sheet}-confirm`));

    await fireEvent.press(screen.getByTestId(`warehouse-intake-qty-${kolili.variantId}`));
    await openSheet(`${sheet}-case-18691000023757-step-value`);
    expect(screen.getByTestId(`${sheet}-case-18691000023757-step-value`)).toHaveTextContent('1');
  });

  /* "Başka koli boyu" AYRI bir katman değil, aynı çekmecenin ikinci adımı: seçilen çarpan
     doğrudan bir koli sayılır ve satır "ürüne kaydedilecek" diye görünür — sahada uydurulmuş bir
     çarpan ürüne sessizce yazılmaz. */
  it('sahada eklenen koli boyu bir koli sayar ve KAYDEDİLECEK diye işaretlenir', async () => {
    withForm([ROW_A]);
    const sheet = `warehouse-intake-qty-sheet-${ROW_A.variantId}`;

    await renderIntake();
    await fireEvent.press(screen.getByTestId(`warehouse-intake-count-${ROW_A.variantId}`));
    await fireEvent.press(screen.getByTestId(`warehouse-intake-qty-${ROW_A.variantId}`));
    /* Kayıtlı boyu olmayan üründe de ekleme satırı durur, yoksa depocu koli sayamazdı; uydurma çarpan yine yok, liste
       boştur. Toplam 10'dur, çünkü düğme beklenen adedi tek paket olarak yazar ve koli dökümü boş kalır. */
    expect(screen.getByTestId(`${sheet}-add-size`)).toBeOnTheScreen();
    expect(screen.getByTestId(`${sheet}-total`)).toHaveTextContent('10');

    await fireEvent.press(screen.getByTestId(`${sheet}-ruler-2`));
    expect(screen.getByTestId(`${sheet}-total`)).toHaveTextContent('2');
  });

  /* Beklenen adet tek dokunuşla yazılır ama otomatik değil: satır dokunulmadan önce boştur, dokunuşla beklenen adet yazılır
     ve kart açılır. Çekmece açılmaz, çünkü yazılacak sayı söylenmiştir; fark varsa adet kutusu çekmeceyi açar. */
  it('beklenen adet DOKUNUNCA yazılır; açılışta satır boş kalır', async () => {
    withForm([ROW_A]);

    await renderIntake();
    // Dokunulmadan önce: adet kutusu YOK, yani hiçbir şey beyan edilmemiş.
    expect(screen.queryByTestId(`warehouse-intake-qty-${ROW_A.variantId}`)).toBeNull();
    // Düğme sayıyı ve ne olduğunu birlikte söyler ("10 · BEKLENEN").
    expect(screen.getByTestId(`warehouse-intake-count-${ROW_A.variantId}`)).toHaveTextContent(/^10/);

    await fireEvent.press(screen.getByTestId(`warehouse-intake-count-${ROW_A.variantId}`));

    // Beklenen yazıldı, kart açıldı (SKT sorulur), çekmece AÇILMADI.
    expect(screen.getByTestId(`warehouse-intake-qty-${ROW_A.variantId}`)).toHaveTextContent(/^10/);
    expect(screen.getByTestId(`warehouse-intake-expiry-${ROW_A.variantId}`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`warehouse-intake-qty-sheet-${ROW_A.variantId}-confirm`)).toBeNull();
  });

  /* Beklenen YOKSA (kalanı bitmiş kalem) düğme yalnız kapıyı açar: yazılacak bir sayı yok. */
  it('beklenen yoksa düğme çekmeceyi açar — uydurma sayı yazılmaz', async () => {
    withForm([{ ...ROW_A, expectedQty: 0 }]);

    await renderIntake();
    await fireEvent.press(screen.getByTestId(`warehouse-intake-count-${ROW_A.variantId}`));

    await openSheet(`warehouse-intake-qty-sheet-${ROW_A.variantId}-ruler-2`);
    expect(screen.getByTestId(`warehouse-intake-qty-${ROW_A.variantId}`)).toHaveTextContent(/^—/);
  });

  /* Kısmi kayıt ikinci yoldur: koli koli gelen sevkiyatta mal geldiği kadarıyla stoğa girer, kalanı açık kalır. Düğme hepsi
     sayılıyken birincinin kötü kopyası, hiçbiri sayılmamışken boş kabule davet olacağı için yalnız arada çizilir. */
  it('hiçbir satır sayılmamışken kısmi kayıt düğmesi ÇİZİLMEZ — boş kabul davetiye olurdu', async () => {
    withForm([ROW_A, ROW_B]);

    await renderIntake();

    expect(screen.queryByTestId('warehouse-intake-partial-cta')).toBeNull();
  });

  it('bir satır sayılınca kısmi kayıt açılır ve YALNIZ sayılanı yazar', async () => {
    withForm([ROW_A, ROW_B]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 12, 8, 2027);

    await fireEvent.press(screen.getByTestId('warehouse-intake-partial-cta'));
    await waitFor(() => expect(mockToast).toHaveBeenCalled());

    const lines = lastPostBody().lines;
    expect(lines).toHaveLength(1);
    expect(lines[0]?.variantId).toBe(ROW_A.variantId);
  });

  /* Tam kabulde sonuç toast'tadır ve ekran kapanır, çünkü kapanan ekrandaki bildirimi kimse okuyamaz. Kısmi kayıtta iş
     bitmediği için ekran kapanmaz; sunucu kalanları yeniden hesapladığı için form yenilenir. */
  it('TAM kabul: toast basılır ve ekran KAPANIR', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 12, 8, 2027);
    await fireEvent.press(screen.getByTestId('warehouse-intake-cta'));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('parti'));
  });

  it('KISMİ kayıt: ekran kapanMAZ — kalan satırlar depocuyu bekliyor', async () => {
    withForm([ROW_A, ROW_B]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 12, 8, 2027);
    await fireEvent.press(screen.getByTestId('warehouse-intake-partial-cta'));

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('hepsi sayılınca kısmi kayıt düğmesi KAYBOLUR — ana düğme zaten aynı işi yapıyor', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 12, 8, 2027);

    expect(screen.queryByTestId('warehouse-intake-partial-cta')).toBeNull();
    expect(screen.getByTestId('warehouse-intake-cta')).toBeOnTheScreen();
  });

  /* Akordeon: kapalı satırda SKT alanı çizilmez, yerine özet rozeti durur; sayılmış olmak satırı açık tutmaz, açık olan tek
     satırı ekran seçer. */
  it('başka satır açılınca öncekinin FORMU kapanır — açık kart tektir', async () => {
    withForm([ROW_A, ROW_B]);

    await renderIntake();
    await countRow(ROW_A.variantId, '4');
    expect(screen.getByTestId(`warehouse-intake-expiry-${ROW_A.variantId}`)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId(`warehouse-intake-count-${ROW_B.variantId}`));

    expect(screen.queryByTestId(`warehouse-intake-expiry-${ROW_A.variantId}`)).toBeNull();
    expect(screen.getByTestId(`warehouse-intake-expiry-${ROW_B.variantId}`)).toBeOnTheScreen();
  });

  /* KAPALI KARTIN ÖZETİ: SKT kendi rozetinde TARİHİ yazar (kural değil değer), hasar varsa kendi
     rozetinde adediyle durur. Kart kapanınca girilenler görünmez olmamalı. */
  it('kapalı kart SKT tarihini ve hasar adedini rozetlerinde taşır', async () => {
    withForm([ROW_A, ROW_B]);

    await renderIntake();
    await countRow(ROW_A.variantId, '4');
    await pickExpiry(ROW_A.variantId, 12, 8, 2027);
    await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-toggle-${ROW_A.variantId}`));
    await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-${ROW_A.variantId}-qty-increase`));

    // Başka satır açılır → ROW_A kapanır ve özetini rozetlerde gösterir.
    await fireEvent.press(screen.getByTestId(`warehouse-intake-count-${ROW_B.variantId}`));

    // Rozet REJİMİ de taşır: tarih tek başına "hangi tarih" sorusunu cevaplamıyor (DLC/DDM ayrımı).
    expect(screen.getByTestId(`warehouse-intake-date-badge-${ROW_A.variantId}`)).toHaveTextContent('DDM 12.08.27');
    expect(screen.getByTestId(`warehouse-intake-damage-badge-${ROW_A.variantId}`)).toHaveTextContent('hasarlı 1');
  });

  /* Kapalı kartta da adet düzeltilir: sayılmış satırın adet kutusuna dokunmak çekmeceyi açar, kartı açmak gerekmez. */
  it('kapalı kartta adet kutusu çekmeceyi AÇAR — kartı açmaya gerek yok', async () => {
    withForm([ROW_A, ROW_B]);

    await renderIntake();
    await countRow(ROW_A.variantId, '4');
    // Başka satır açılır → ROW_A kapanır ama adedi kalır.
    await fireEvent.press(screen.getByTestId(`warehouse-intake-count-${ROW_B.variantId}`));
    expect(screen.queryByTestId(`warehouse-intake-expiry-${ROW_A.variantId}`)).toBeNull();

    await fireEvent.press(screen.getByTestId(`warehouse-intake-qty-${ROW_A.variantId}`));

    await openSheet(`warehouse-intake-qty-sheet-${ROW_A.variantId}-ruler-6`);
    await fireEvent.press(screen.getByTestId(`warehouse-intake-qty-sheet-${ROW_A.variantId}-ruler-6`));
    await fireEvent.press(screen.getByTestId(`warehouse-intake-qty-sheet-${ROW_A.variantId}-confirm`));

    // Kart hâlâ KAPALI, adet güncellendi: çekmece kartın açıklığından bağımsız.
    expect(screen.queryByTestId(`warehouse-intake-expiry-${ROW_A.variantId}`)).toBeNull();
    // Kutu rakamı ve "ADET" başlığını birlikte taşır — ölçülen şey rakamın kendisi.
    expect(screen.getByTestId(`warehouse-intake-qty-${ROW_A.variantId}`)).toHaveTextContent(/^6/);
  });

  /* Başlık satırın ANAHTARI: aynı satıra ikinci dokunuş kartı kapatır. */
  it('başlığa dokunuş kartı açar, ikinci dokunuş kapatır', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await fireEvent.press(screen.getByTestId(`warehouse-intake-row-toggle-${ROW_A.variantId}`));
    expect(screen.getByTestId(`warehouse-intake-expiry-${ROW_A.variantId}`)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId(`warehouse-intake-row-toggle-${ROW_A.variantId}`));
    expect(screen.queryByTestId(`warehouse-intake-expiry-${ROW_A.variantId}`)).toBeNull();
  });

  it('hasar SAYI ve SEBEP olarak işaretlenir; satır adıyla birlikte isteğin notuna taşınır', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 12, 8, 2027);
    await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-toggle-${ROW_A.variantId}`));
    await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-${ROW_A.variantId}-qty-increase`));
    await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-${ROW_A.variantId}-qty-increase`));
    /* Sebep çekmeceden ve tek seçimdir: kartta çip yok, sayacın sağındaki düğme listeyi açar. */
    await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-${ROW_A.variantId}-reason`));
    await openSheet(`warehouse-intake-damage-${ROW_A.variantId}-option-ezik / kırık`);
    await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-${ROW_A.variantId}-option-ezik / kırık`));
    await fireEvent.press(screen.getByTestId('warehouse-intake-cta'));

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(lastPostBody().note).toBe('Antep Fıstığı · 5 kg: hasarlı 2 · ezik / kırık');
  });

  /* HASAR KABUL EDİLEN ADEDİ AŞAMAZ: "10 paketin 12'si hasarlı" bir sayım değil, bir çelişkidir. */
  it('hasar sayacı kabul edilen adette DURUR', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '2');
    await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-toggle-${ROW_A.variantId}`));
    for (let press = 0; press < 4; press += 1) {
      await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-${ROW_A.variantId}-qty-increase`));
    }

    expect(screen.getByTestId(`warehouse-intake-damage-card-${ROW_A.variantId}`)).toHaveTextContent(/hasarlı 2/);
    expect(screen.getByTestId(`warehouse-intake-damage-card-${ROW_A.variantId}`)).toHaveTextContent(/sağlam 0/);
  });

  /* Hasar sayacının ortasındaki rakam adet çekmecesini değil tuş takımını açar, çünkü hasar paket paket işaretlenir. Canlı
     yazar ve tavan tuştadır: kabul edilen 2 iken "3" işlemez, "2" yazılır. */
  it('hasar sayacının rakamı canlı tuş takımını açar; kabul edilenden fazlasını yazacak tuş işlemez', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '2');
    await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-toggle-${ROW_A.variantId}`));
    await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-${ROW_A.variantId}-qty-value-hit`));
    await openSheet(`warehouse-intake-damage-keypad-${ROW_A.variantId}-key-3`);
    expect(screen.queryByTestId(`warehouse-intake-damage-keypad-${ROW_A.variantId}-confirm`)).toBeNull();

    await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-keypad-${ROW_A.variantId}-key-3`));
    expect(screen.getByTestId(`warehouse-intake-damage-card-${ROW_A.variantId}`)).toHaveTextContent(/hasarlı 0/);

    await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-keypad-${ROW_A.variantId}-key-2`));
    expect(screen.getByTestId(`warehouse-intake-damage-card-${ROW_A.variantId}`)).toHaveTextContent(/hasarlı 2/);
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
    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 12, 8, 2027);
    await fireEvent.press(screen.getByTestId('warehouse-intake-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-intake-warning')).toHaveTextContent(/raf ömrü bilinmiyor/));
    // Depo ekranı fiyat görmez: `repricedCount` hiçbir hâlde ekrana çıkmaz.
    expect(screen.queryByText(/fiyat/i)).toBeNull();
  });
});

/* Plansız kabul: siparişsiz gelen mal; satır kümesi yoktur (depocu kurar) ve beklenen adet yoktur (kıyaslanacak sipariş
   yok). */
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
                // Tarih rejimi ve raf ömrü arama satırında da vardır: okutmayla açılan satırla aynı alanları taşımazsa aynı
                // listede biri ömür uyarısı üretir, öteki üretmez.
                dateType: 'DDM',
                shelfLifeDays: 360,
                imageUrl: null,
                // Satırın künyesi "SKU-1 · stok 24" olur (v3 tasarımı): depocunun ilk sorusu
                // "bu üründen bende var mı" ve cevabı KENDİ deposunun sayısıdır.
                stockQty: 24,
                qtyPerCode: null,
                // Koli boyu da aynı gerekçeyle arama satırında: aramadan eklenen satır adet
                // çekmecesini açacak ve o çekmece "kaç koli geldi" diye soracak.
                caseSizes: [],
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
    /* "beklenen 0" yazılmaz, olmayan beklentiyi sıfır göstermek ölçülemeyeni sıfıra düşürmektir (CLAUDE §1). İddia iki
       yönlüdür: cümle var, rakam yok. */
    expect(screen.getByTestId(`warehouse-intake-none-${ROW_A.variantId}`)).toHaveTextContent(/beklenen yok/);
    expect(screen.queryByText(/beklenen \d/)).toBeNull();
  });

  /* Plansız kabulün BAŞLIĞI ayrı (v3:756): "Mal Kabul" beklenen adetlerle çalışılan ekranın adı;
     siparişsiz mal onun bir kipi değil, başka bir iş. */
  it('plansız kabulün kendi başlığı var — "Mal Kabul" değil', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(ok({ purchaseOrder: null, rows: [], mlorPercent: MLOR })));

    await render(<IntakeScreen />);
    await waitFor(() => expect(screen.getByTestId('warehouse-intake-unplanned-empty')).toBeOnTheScreen());

    expect(screen.getByTestId('warehouse-intake-header')).toHaveTextContent(/Siparişsiz Mal/);
  });

  it('bekleyen sevkiyat listesinden plansız kabule geçilir', async () => {
    delete mockParams.unplanned;
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        ok({ intakes: [{ purchaseOrderId: PO_ID, referenceNo: 'TS-26-A', supplierName: 'X', lineCount: 2, status: 'sent' as const }] }),
      ),
    );

    await renderIntake();
    await fireEvent.press(screen.getByTestId('warehouse-intake-unplanned-cta'));

    expect(mockPush).toHaveBeenCalledWith('/intake?unplanned=1');
  });
});
