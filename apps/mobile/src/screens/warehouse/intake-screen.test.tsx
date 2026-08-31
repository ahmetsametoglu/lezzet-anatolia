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
/* SONUÇ ARTIK TOAST'TA (30.08): başarı bildirimi ekrandan kabuğa taşındı — ekran kapandığı için
   şeritte kalamıyordu. Testler bu yüzden toast deposunu dinliyor; hata bildirimi hâlâ ekranda ve
   `warehouse-intake-notice` ile ölçülüyor. */
const mockToast = jest.fn();
/** Başarılı kabul ekranı KAPATIR — geri dönüşü ölçmek için ayrı casus. */
const mockBack = jest.fn();
jest.mock('@/lib/toast/toast-store', () => ({
  toastSuccess: (m: string) => mockToast(m),
  toastError: (m: string) => mockToast(m),
  toastInfo: (m: string) => mockToast(m),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn(), back: mockBack, push: mockPush }),
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
const ROW_B = intakeRow({
  variantId: '00000000-0000-4000-8000-000000000042',
  productName: 'Mısır Unu',
  variantLabel: '25 kg',
  expectedQty: 4,
});

/* MLOR eşiği YANITIN alanıdır (ayardan gelir, satırın değil) — fikstür onu taşımazsa cevap
   ayrıştırılamaz ve ekran "sevkiyatlar yüklenemedi" der. Değer ayarın varsayılanı. */
const MLOR = 75;

/*
  SKT ARTIK SEÇİCİYLE giriliyor (v3 · `00-ortak` → `openSkt`, 30.08): alan bir `TextInput` değil,
  üç sütunlu seçiciyi açan düğme. Testler kapıdaki GERÇEK yolu izliyor — alana dokun, gün/ay/yıl
  seç, "yaz". Metin yazmak artık var olmayan bir yolu ölçerdi.

  **"31 Şubat" testi de bu yüzden değişti:** seçicide o gün LİSTEDE HİÇ YOK, yani yazılamıyor.
  İddia korunuyor ama yeri değişti: kural artık `date-wheel-value.test.ts`te ("gün sütunu ayın
  gerçek uzunluğu kadar").
*/
/*
  SATIR KAPALI BAŞLAR (v3:05, 30.08): sayılmamış satırda adet alanı YOK, sağda kesikli "say →"
  var. Düğme satırı AÇAR, adedi yazmaz — otomatik doldurma "saydım" ile "dokundum"u eşitlerdi.
*/
/**
 * Bir satırı sayar: "say →" ile satırı açar, ADET kutusuna dokunur, çekmecenin TEK PAKET
 * cetvelinden sayıyı seçer ve kapatır.
 *
 * Yardımcı 30.08'de İKİNCİ kez değişti çünkü etkileşim yine değişti. Önce cihaz klavyesinden tuş
 * takımına geçmişti; oysa tuş takımı PARANIN çekmecesidir (`keypadAcik`) — adedin çekmecesi
 * (`sheetAdet`) hiç tuş taşımaz, koli sayacı ve tek paket cetvelinden kurulur. Test kapıdaki
 * GERÇEK yolu izlemeli: kullanıcının yapamadığı bir yoldan geçen test, yeşil kalırken hiçbir şey
 * ölçmez.
 *
 * Cetvel 0–24 arası; daha büyük adetler koli sayacıyla girilir (`countCases`).
 */
async function countRow(variantId: string, qty: string) {
  await fireEvent.press(screen.getByTestId(`warehouse-intake-count-${variantId}`));
  await fireEvent.press(screen.getByTestId(`warehouse-intake-qty-${variantId}`));
  const sheet = `warehouse-intake-qty-sheet-${variantId}`;
  await fireEvent.press(screen.getByTestId(`${sheet}-ruler-${qty}`));
  await fireEvent.press(screen.getByTestId(`${sheet}-confirm`));
}

async function pickExpiry(variantId: string, day: number, month: number, year: number) {
  await fireEvent.press(screen.getByTestId(`warehouse-intake-expiry-${variantId}`));
  const sheet = `warehouse-intake-expiry-sheet-${variantId}`;
  await fireEvent.press(screen.getByTestId(`${sheet}-year-${year}`));
  await fireEvent.press(screen.getByTestId(`${sheet}-month-${month}`));
  await fireEvent.press(screen.getByTestId(`${sheet}-day-${day}`));
  await fireEvent.press(screen.getByTestId(`${sheet}-confirm`));
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
    // 24.08'e kadar burada "konu yok" yazıyordu ve mal kabule yalnız derin bağlantıyla
    // girilebiliyordu; sipariş kimliği her tazelemede değiştiği için o yol sürekli kırılıyordu.
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

  /*
    FORM KÜNYESİ İLERLEMEYİ SÖYLER (v3:598) — "tedarik siparişi · 2 kalem · 1 tamam".
    "gönderildi" bir kategoriydi ve depocu zaten oraya gönderildiği için girmişti; kaçının bittiği
    ise her satırdan sonra değişen tek sayı. "Tamam" ölçüsü CTA'nınkiyle AYNI iki koşuldur (adet +
    SKT) — ayrışsalardı künye "1 tamam" derken CTA "adet + SKT zorunlu" demeye devam ederdi.
  */
  it('form künyesi kaç kalem ve kaçının TAMAM olduğunu söyler', async () => {
    withForm([ROW_A, ROW_B]);

    await renderIntake();
    expect(screen.getByTestId('warehouse-intake-header')).toHaveTextContent(/2 kalem · 0 tamam/);

    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 1, 12, 2026);

    expect(screen.getByTestId('warehouse-intake-header')).toHaveTextContent(/2 kalem · 1 tamam/);
  });

  /* ÇEVRİMDIŞI: SEBEP YAZILIR, DÜĞME GİZLENMEZ (v3:610). Eskiden okutma düğmesi sessizce
     çizilmiyordu; depocu "düğme nerede" diye arıyordu. Kilit bir yokluk değil, bir cevaptır —
     ve neden yazılamayacağını da söylüyor. Satırlar duruyor: okumak serbest. */
  it('ağ düşünce okutma düğmesinin YERİNE sebep yazılır, satırlar kalır', async () => {
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
    expect(screen.queryByTestId('warehouse-intake-scan-cta')).toBeNull();
    expect(screen.getByTestId('warehouse-intake-locked')).toHaveTextContent(/iki deponun stokunu bozabilir/);
    // Satırlar YERİNDE: okumak serbest.
    expect(screen.getByTestId(`warehouse-intake-line-${ROW_A.variantId}`)).toBeOnTheScreen();
  });

  /*
    SIFIR BEKLENEN İKİ AYRI ŞEY DEMEK (ölçüldü 30.08, yerel veritabanından). `expectedQty`
    KALANDIR (`purchase_order_progress.missing_qty`), ısmarlanan değil: beş kalemlik bir siparişte
    dördü tamamen alınmıştı ve dördü de künyesiz çizilmişti — plansız kabuldeki "beklenti yok"
    hâliyle birebir aynı görünüyordu. Planlı siparişte sıfır kalan "beklenti KARŞILANDI" demektir
    ve depocu ikinci turda o kaleme dokunmayacağını bilmeli.
  */
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

  /*
    ELLE EKLENEN SATIR DA SAYIM ÇEKMECESİNİ AÇAR (kullanıcı bulgusu 30.08).

    Okutmada çekmece zaten açılıyordu; aramadan seçilen üründe açılmıyordu ve bu, aynı sonuca
    varan iki yoldan birini yarım bırakmaktı. Üstelik burada çekmece DAHA gerekli: okutulan satırın
    adedi kodun kendisinden yazılıyor, elle eklenenin adedi SIFIR.

    Test kapıyı da ölçüyor: iOS'ta arama çekmecesi ekrandan kalkmadan adet çekmecesi açılmaz
    (iki `Modal` aynı pencerede sunulamıyor — `intake-scan.test.tsx`teki aynı kapı).
  */
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

    /* DÜĞME ASIL EYLEMİ YAZAR, KAPIYI ÜSTTEKİ SATIR SÖYLER (Komponent Envanteri M1e, 30.08).
       Eskiden bu beklenti düğmenin ETİKETİNDEYDİ; tasarım karesinde düğme pasifken de "Kabulü
       kaydet" yazıyor ve eksik olan şey üstteki gri satırda duruyor — sayacıyla birlikte. */
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

  /* CİHAZDA GÖRÜLDÜ 30.08: PO'lu kabulden siparişsize geçince ekran bir önceki siparişin
     satırlarıyla açılıyordu ("beklenen 36 · GZT-1005" yazan bir SİPARİŞSİZ kabul). Ekran aynı
     rota olduğu için yeniden kurulmuyor; plansız dal satırları temizlemek zorunda. Beklenen adet
     plansızda YOKTUR ve o satırlar depocuya olmayan bir siparişi vaat ediyordu. */
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

    /* Eski hâlde "31.02.2026" YAZILABİLİYOR ve ekran onu reddediyordu. Seçicide o gün listeye hiç
       girmiyor: hata yakalanmıyor, DOĞMUYOR. Şubat'a geçen seçici günü de kendiliğinden kırpıyor
       (`date-wheel-value.test.ts` — "ay kısaldığında gün son güne iner"). */
    const sheet = `warehouse-intake-expiry-sheet-${ROW_A.variantId}`;
    await fireEvent.press(screen.getByTestId(`warehouse-intake-expiry-${ROW_A.variantId}`));
    await fireEvent.press(screen.getByTestId(`${sheet}-month-2`));

    expect(screen.queryByTestId(`${sheet}-day-31`)).toBeNull();
    expect(screen.queryByTestId(`${sheet}-day-29`)).toBeNull(); // 2026 artık yıl değil
    expect(screen.getByTestId(`${sheet}-day-28`)).toBeOnTheScreen();
  });

  it('adet + geçerli SKT ile CTA açılır ve satır ISO tarihle gönderilir', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 12, 8, 2026);

    expect(screen.getByTestId('warehouse-intake-cta')).toHaveTextContent(/Kabulü kaydet/);

    await fireEvent.press(screen.getByTestId('warehouse-intake-cta'));
    await waitFor(() => expect(mockToast).toHaveBeenCalled());

    expect(lastPostBody().lines).toEqual([{ variantId: ROW_A.variantId, qty: 10, expiryDate: '2026-08-12', lotNumber: null }]);
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
    await pickExpiry(ROW_A.variantId, 12, 8, 2026);

    expect(screen.getByTestId('warehouse-intake-cta')).toHaveTextContent(/Kısmen teslim alındı/);
  });

  it('lot BİLİNÇLİ boş bırakılır — uydurma kod gitmez', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 12, 8, 2026);

    /* KUTU BOŞSA LOT YOKTUR (kullanıcı kararı 30.08): "Lot yok" diye ayrı bir düğme kalmadı —
       yazılanı TEMİZLE düğmesi siler ve boş kutu zaten `lotNumber: null` demektir. */
    await fireEvent.press(screen.getByTestId(`warehouse-intake-lot-toggle-${ROW_A.variantId}`));
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-lot-${ROW_A.variantId}`), 'GAZ-7120');
    await fireEvent.press(screen.getByTestId(`warehouse-intake-lot-clear-${ROW_A.variantId}`));
    await fireEvent.press(screen.getByTestId('warehouse-intake-cta'));

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(lastPostBody().lines[0]?.lotNumber).toBeNull();
  });

  it('lot ÇEKMECEDEN yazılır ve isteğe o kod gider', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 12, 8, 2026);

    /* ONAY DÜĞMESİ YOK: kutuya yazılan kod satıra CANLI işleniyor, çekmece yalnız kapanıyor. */
    await fireEvent.press(screen.getByTestId(`warehouse-intake-lot-toggle-${ROW_A.variantId}`));
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
    await fireEvent.press(screen.getByTestId(`${sheet}-case-18691000023757-step-increase`));
    await fireEvent.press(screen.getByTestId(`${sheet}-confirm`));

    await fireEvent.press(screen.getByTestId(`warehouse-intake-qty-${kolili.variantId}`));
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
    /* KAYITLI BOYU OLMAYAN ÜRÜNDE DE EKLEME KAPISI DURUR (düzeltildi 30.08, cihaz bulgusu).
       Eskiden bölüm hiç çizilmiyordu ve bu satır onu ölçüyordu; kapatılan şey gerekçesinden
       fazlaydı — depocu kayıtlı boyu olmayan üründe koli SAYAMIYORDU. Uydurma çarpan yasağı
       yerinde duruyor: liste boş, önceden sayılmış hiçbir koli yok, yalnız ekleme satırı var. */
    expect(screen.getByTestId(`${sheet}-add-size`)).toBeOnTheScreen();
    expect(screen.getByTestId(`${sheet}-total`)).toHaveTextContent('0');

    await fireEvent.press(screen.getByTestId(`${sheet}-ruler-2`));
    expect(screen.getByTestId(`${sheet}-total`)).toHaveTextContent('2');
  });

  /*
    ── KISMİ KAYIT: İKİNCİ YOL (v3:05 · `act.kismiKabul`) ────────────────────
    Rampada koli koli gelen bir sevkiyatta "her satırı say" beklemesi gerçek dışı: mal geldiği
    kadarıyla stoğa girmeli, kalanı açık kalmalı. İstek gövdesi zaten sayılmamış satırı atlıyordu;
    eksik olan tek şey `complete` kilidiydi.

    Düğmenin KOŞULU bizim kararımız (tasarım hep çiziyor): hepsi sayılıyken ikinci düğme
    birinciyle aynı şeyi daha kötü yapar, hiçbiri sayılmamışken kapıya boş bir kabul gönderir.
  */
  it('hiçbir satır sayılmamışken kısmi kayıt düğmesi ÇİZİLMEZ — boş kabul davetiye olurdu', async () => {
    withForm([ROW_A, ROW_B]);

    await renderIntake();

    expect(screen.queryByTestId('warehouse-intake-partial-cta')).toBeNull();
  });

  it('bir satır sayılınca kısmi kayıt açılır ve YALNIZ sayılanı yazar', async () => {
    withForm([ROW_A, ROW_B]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 12, 8, 2026);

    await fireEvent.press(screen.getByTestId('warehouse-intake-partial-cta'));
    await waitFor(() => expect(mockToast).toHaveBeenCalled());

    const lines = lastPostBody().lines;
    expect(lines).toHaveLength(1);
    expect(lines[0]?.variantId).toBe(ROW_A.variantId);
  });

  /*
    SONUÇ TOAST'TA, EKRAN KAPANIR (kullanıcı bulgusu 30.08).

    Eskiden başarı ekrandaki yeşil şeritte yazıyordu ve ekran açık kalıyordu: kullanıcının
    gördüğü şey "hiçbir şey olmadı" idi. Şimdi tam kabulde ekran kapanıyor — kapanan ekrandaki
    şeridi kimse okuyamayacağı için bildirim kabuğun toast katmanına taşındı.

    KISMİ KAYIT AYRI: orada iş bitmedi, ekran KAPANMAZ; sunucu kalanları yeniden hesapladığı için
    form yenilenir.
  */
  it('TAM kabul: toast basılır ve ekran KAPANIR', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 12, 8, 2026);
    await fireEvent.press(screen.getByTestId('warehouse-intake-cta'));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('parti'));
    // Şerit ARTIK BAŞARI için çizilmiyor — hata dalının kendi testi var.
    expect(screen.queryByTestId('warehouse-intake-notice')).toBeNull();
  });

  it('KISMİ kayıt: ekran kapanMAZ — kalan satırlar depocuyu bekliyor', async () => {
    withForm([ROW_A, ROW_B]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 12, 8, 2026);
    await fireEvent.press(screen.getByTestId('warehouse-intake-partial-cta'));

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('hepsi sayılınca kısmi kayıt düğmesi KAYBOLUR — ana düğme zaten aynı işi yapıyor', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 12, 8, 2026);

    expect(screen.queryByTestId('warehouse-intake-partial-cta')).toBeNull();
    expect(screen.getByTestId('warehouse-intake-cta')).toBeOnTheScreen();
  });

  /* HASAR ARTIK SAYI + SEBEP (v3:05, düzeltildi 30.08). Eskiden serbest bir not kutusu vardı ve
     bu test onu dolduruyordu; tasarımda öyle bir alan hiç yok — hasar, kabul edilen adedin
     İÇİNDEN sayaçla işaretleniyor ve sebep çiplerden seçiliyor. Sözleşmede satır başına hasar
     alanı olmadığı için üçü isteğin tek notunda, satır adı yazılarak birleşiyor. */
  it('hasar SAYI ve SEBEP olarak işaretlenir; satır adıyla birlikte isteğin notuna taşınır', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 12, 8, 2026);
    await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-toggle-${ROW_A.variantId}`));
    await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-qty-${ROW_A.variantId}-increase`));
    await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-qty-${ROW_A.variantId}-increase`));
    /* Sebep artık çekmeceden ve TEK seçim (kullanıcı kararı 30.08): kartta çip yok, sayacın
       sağındaki düğme listeyi açıyor. */
    await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-reason-${ROW_A.variantId}`));
    await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-reason-option-${ROW_A.variantId}-ezik / kırık`));
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
      await fireEvent.press(screen.getByTestId(`warehouse-intake-damage-qty-${ROW_A.variantId}-increase`));
    }

    expect(screen.getByTestId(`warehouse-intake-damage-card-${ROW_A.variantId}`)).toHaveTextContent(/hasarlı 2/);
    expect(screen.getByTestId(`warehouse-intake-damage-card-${ROW_A.variantId}`)).toHaveTextContent(/sağlam 0/);
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
    await pickExpiry(ROW_A.variantId, 12, 8, 2026);
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
                // Tarih rejimi ve raf ömrü ARAMA satırında da var (30.08): okutmayla açılan satırla
                // aynı alanları taşımalı, yoksa aynı listede biri ömür uyarısı üretir öteki üretmez.
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
    /* "beklenen 0" YAZILMAZ: olmayan bir beklentiyi sıfır diye göstermek, ölçülemeyeni sıfıra
       düşürmektir (CLAUDE §1). v3 ile satır artık SUSMUYOR, beklentinin YOKLUĞUNU söylüyor
       (v3:770) — sayı değil kelime. İddia bu yüzden iki yönlü: cümle var, RAKAM yok. */
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
