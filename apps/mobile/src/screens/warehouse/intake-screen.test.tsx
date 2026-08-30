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
async function countRow(variantId: string, qty: string) {
  await fireEvent.press(screen.getByTestId(`warehouse-intake-count-${variantId}`));
  await fireEvent.changeText(screen.getByTestId(`warehouse-intake-qty-${variantId}`), qty);
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
          intakes: [{ purchaseOrderId: PO_ID, referenceNo: 'TS-26-ABC123', supplierName: 'Gaziantep', lineCount: 4, status: 'sent' as const }],
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
            { purchaseOrderId: '00000000-0000-4000-8000-0000000000c2', referenceNo: 'TS-26-B', supplierName: 'Gaziantep', lineCount: 6, status: 'sent' as const },
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
        return Promise.resolve(ok({ purchaseOrder: { purchaseOrderId: PO_ID, referenceNo: 'TS-26-A', supplierName: 'X' }, rows: [ROW_A], mlorPercent: MLOR }));
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

  it('SKT girilmeden CTA açılmaz — kural şemada, ekran kapıyı boşuna zorlamaz', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');

    expect(screen.getByTestId('warehouse-intake-cta')).toHaveTextContent(/adet \+ SKT zorunlu/);
    expect(screen.getByTestId(`warehouse-intake-expiry-state-${ROW_A.variantId}`)).toHaveTextContent('SKT gir *');
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
    await waitFor(() => expect(screen.getByTestId('warehouse-intake-notice')).toBeOnTheScreen());

    expect(lastPostBody().lines).toEqual([
      { variantId: ROW_A.variantId, qty: 10, expiryDate: '2026-08-12', lotNumber: null },
    ]);
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
    await fireEvent.changeText(screen.getByTestId(`warehouse-intake-lot-${ROW_A.variantId}`), 'GAZ-7120');
    await fireEvent.press(screen.getByTestId(`warehouse-intake-lot-toggle-${ROW_A.variantId}`));
    await fireEvent.press(screen.getByTestId('warehouse-intake-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-intake-notice')).toBeOnTheScreen());
    expect(lastPostBody().lines[0]?.lotNumber).toBeNull();
  });

  it('hasar notu HANGİ satıra ait olduğu yazılarak isteğe taşınır (satır notu şemada yok)', async () => {
    withForm([ROW_A]);

    await renderIntake();
    await countRow(ROW_A.variantId, '10');
    await pickExpiry(ROW_A.variantId, 12, 8, 2026);
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
