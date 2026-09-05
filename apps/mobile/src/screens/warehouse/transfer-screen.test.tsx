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


/** Kabuğa dönüş sayacı: detaydan geri LİSTEYE döner, hub'a değil — o iddia ancak bununla ölçülür. */
const mockBack = jest.fn();
jest.mock('expo-router', () => {
  const react = jest.requireActual<{ useEffect: (effect: () => void, deps: unknown[]) => void }>('react');
  return {
    useRouter: () => ({ navigate: jest.fn(), back: mockBack }),
    // Konu seçiliyken iOS kaydırması kapatılır (`use-subject-back`, `setOptions`); testte sessiz.
    useNavigation: () => ({ setOptions: () => {} }),
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

function lastPostBody(): {
  lines: { lineId: string; receivedQty: number }[];
  declaration?: { reason: string; note: string | null } | null;
} {
  const call = fetchMock.mock.calls.findLast((entry) => entry[1]?.method === 'POST');
  return JSON.parse(String(call?.[1]?.body ?? '{}'));
}

/*
  UÇ ÜÇ LİSTE DÖNDÜRÜYOR (v3:11 · 30.08): GELEN · YOLDA (bu depodan çıkmış) · SON KAPANANLAR.
  Fikstür üçünü de taşımalı — eksik alan, ekranın "yolda hiçbir şey yok" demesine değil, cevabı
  hiç ayrıştıramamasına yol açar.
*/
function withTransfers(
  transfers: unknown[],
  receive?: unknown,
  extra: { outbound?: unknown[]; closed?: unknown[]; detail?: unknown } = {},
) {
  fetchMock.mockImplementation((url, init) => {
    if (init?.method === 'POST') {
      return Promise.resolve(
        ok(receive ?? { status: 'ok', transferId: TRANSFER.transferId, createdBatches: 2, shortfall: null, excess: null }),
      );
    }
    /* SALT OKUMA DETAYI KENDİ TURUNU İSTİYOR (05.09) — adres liste ucunun ALTINDA (`/transfers/:id`),
       yani taklit URL'e bakmak ZORUNDA: bakmasaydı detay isteği liste gövdesini alır ve şema kapısına
       takılıp sessizce "hata" hâline düşerdi. Kalıp sorgu dizesini de KABUL EDİYOR — istemci adrese
       `?warehouseId=` ekliyor ve `$` çıpası tek başına tutmuyordu (ölçüldü). */
    if (/\/transfers\/[0-9a-f-]{36}(\?|$)/.test(String(url))) return Promise.resolve(ok(extra.detail ?? transferDetail()));
    return Promise.resolve(ok({ transfers, outbound: extra.outbound ?? [], closed: extra.closed ?? [] }));
  });
}

/** Salt-okuma detayı — kalem şekli rampa satırıyla AYNI sözleşmeden (`InboundTransferLineSchema`). */
function transferDetail(over: Record<string, unknown> = {}) {
  return {
    transferId: '00000000-0000-4000-8000-000000000054',
    referenceNo: 'TRF-KEHL-26-0002',
    fromWarehouseId: '00000000-0000-4000-8000-000000000063',
    toWarehouseId: '00000000-0000-4000-8000-000000000060',
    status: 'received',
    dispatchedAt: '2026-09-02T09:00:00.000Z',
    note: null,
    lines: [
      {
        lineId: '00000000-0000-4000-8000-0000000000a1',
        sourceStockId: '00000000-0000-4000-8000-0000000000b1',
        productName: 'Fıstıklı Baklava',
        variantLabel: '450 g',
        imageUrl: null,
        lotNumber: 'GAZ-7120',
        expiryDate: '2026-12-01',
        dispatchedQty: 6,
        receivedQty: 4,
        caseSizes: [],
      },
      {
        lineId: '00000000-0000-4000-8000-0000000000a2',
        sourceStockId: '00000000-0000-4000-8000-0000000000b2',
        productName: 'Şöbiyet',
        variantLabel: '',
        imageUrl: null,
        lotNumber: null,
        expiryDate: '2026-11-15',
        dispatchedQty: 4,
        receivedQty: null,
        caseSizes: [],
      },
    ],
    ...over,
  };
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
  // ADET KUTUSU (21.254): sayılmamış satırda ilk dokunuş "sevk edildiği kadar geldi" beyanıdır (kutu
  // dolar, çekmece açılmaz); dolu kutuya dokunuş çekmeceyi açar. Yardımcı iki hâli de sürer.
  const box = () => screen.getByTestId(`warehouse-transfer-qty-${lineId}`);
  await fireEvent.press(box());
  if (screen.queryByTestId('warehouse-transfer-qty-sheet-confirm') === null) await fireEvent.press(box());
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

/**
 * Detaya LİSTEDEN girilir (kullanıcı kararı 04.09): tek gelen transfer de kendiliğinden açılmaz,
 * karta basılır. Eski otomatik açılma, tek gelen varken YOLDA ve SON KAPANANLAR'ı görülmez
 * kılıyordu — testler de gerçek yolu izliyor.
 */
async function openTransfer(transferId: string = TRANSFER.transferId) {
  await fireEvent.press(screen.getByTestId(`warehouse-transfer-row-${transferId}`));
  await waitFor(() => expect(screen.getByTestId('warehouse-transfer-lines')).toBeOnTheScreen());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  // Toast sayacı da testler arası sıfırlanır: "hiçbir şey gönderilmedi" iddiası önceki testin
  // toast'ını görmemeli.
  mockToast.mockReset();
  mockBack.mockReset();
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
          productName: `Ürün ${n}`,
          variantLabel: '',
          imageUrl: null,
          lotNumber: null,
          expiryDate: '2027-01-01',
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
    TEK GELEN DE KENDİLİĞİNDEN AÇILMAZ (kullanıcı kararı 04.09, 21.250) — ölçüldü: STR deposunda bir
    gelen ve iki giden varken ekran doğrudan sayıma giriyor, geri tuşu hub'a dönüyordu; giden
    sevkiyatlar hiç görülemiyordu. Tasarım (`screenshots/Depo/Transfer/01-Liste`) listeyi her
    zaman gösterir; detaya "kabule başla" ile girilir, geri LİSTEYE döner.
  */
  it('tek gelen varken liste yine görünür; detaya karttan girilir, geri tuşu listeye döner', async () => {
    withTransfers([TRANSFER], undefined, {
      outbound: [
        {
          transferId: '00000000-0000-4000-8000-000000000053',
          referenceNo: 'TRF-STR-26-0010',
          toWarehouseId: '00000000-0000-4000-8000-000000000063',
          toWarehouseName: 'Kehl — sınır deposu',
          dispatchedAt: '2026-09-04T09:45:00.000Z',
          lineCount: 1,
          etaDate: '2026-09-05',
          ageDays: 0,
          ageTone: 'ok',
          lateDays: 0,
        },
      ],
    });

    await renderTransfer();

    expect(screen.queryByTestId('warehouse-transfer-lines')).toBeNull();
    expect(screen.getByTestId(`warehouse-transfer-row-${TRANSFER.transferId}`)).toBeOnTheScreen();
    expect(screen.getByTestId('warehouse-transfer-outbound')).toHaveTextContent(/TRF-STR-26-0010/);

    await openTransfer();
    await fireEvent.press(screen.getByTestId('warehouse-transfer-header-back'));

    expect(screen.queryByTestId('warehouse-transfer-lines')).toBeNull();
    expect(screen.getByTestId('warehouse-transfer-outbound')).toBeOnTheScreen();
    expect(mockBack).not.toHaveBeenCalled();

    // Hub'a yalnız listeden çıkılır.
    await fireEvent.press(screen.getByTestId('warehouse-transfer-header-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  /*
    "0 · HİÇ GELMEDİ" KISAYOLU YOK (kullanıcı kararı 04.09) — v3:1189'un çipi klavyeli girişin
    zahmetine karşıydı; adet çekmecesinde sıfır cetvelin ilk hücresi (02.09), çip aynı işi ikinci
    kez söylüyordu. Boş ≠ 0 kuralı yerinde: sıfır çekmeceden girilir ve satır sayılmış sayılır.
  */
  it('"0 · hiç gelmedi" kısayolu yok — sıfır ÇEKMECEDEN girilir ve satır sayılmış sayılır', async () => {
    withTransfers([TRANSFER]);

    await renderTransfer();
    await openTransfer();

    expect(screen.queryByTestId(`warehouse-transfer-zero-${LINE_A}`)).toBeNull();
    await countLine(LINE_A, 0);
    expect(screen.getByTestId(`warehouse-transfer-qty-${LINE_A}-value`)).toHaveTextContent('0');
    // Sıfır satır kendi cümlesini söyler: "hiç gelmedi", eksiği sevk edilenin tamamı.
    expect(screen.getByTestId(`warehouse-transfer-line-short-${LINE_A}`)).toHaveTextContent('hiç gelmedi · 4 eksik kayıp yazılacak');
  });

  /*
    KESİKLİ KUTU = TEK DOKUNUŞLA "SEVK EDİLDİĞİ KADAR GELDİ" (21.254, D2'nin "beklenen" düğmesinin
    kuralı): rampada en sık gerçek budur; altı kalem altı dokunuş. Dokunuş BEYANDIR, kutu kendiliğinden
    dolmaz — sayılmamış satır soluk ve kesikli durur.
  */
  it('sayılmamış satırın kutusu sevk edilen adedi DAVET olarak gösterir; tek dokunuş onu beyan eder', async () => {
    withTransfers([TRANSFER]);

    await renderTransfer();
    await openTransfer();

    const hidden = { includeHiddenElements: true };
    expect(screen.getByTestId(`warehouse-transfer-qty-${LINE_A}-value`)).toHaveTextContent('4');
    // Altyazı D2 ile aynı kelime: rampada sevk edilen, BEKLENENDİR ("SEVK EDİLEN" kutuya sığmıyordu, 04.09).
    expect(screen.getByTestId(`warehouse-transfer-qty-${LINE_A}-caption`, hidden)).toHaveTextContent('BEKLENEN');
    expect(screen.getByTestId('warehouse-transfer-cta')).toBeDisabled();

    await fireEvent.press(screen.getByTestId(`warehouse-transfer-qty-${LINE_A}`));
    await fireEvent.press(screen.getByTestId(`warehouse-transfer-qty-${LINE_B}`));

    expect(screen.getByTestId(`warehouse-transfer-qty-${LINE_A}-value`)).toHaveTextContent('4');
    expect(screen.getByTestId(`warehouse-transfer-qty-${LINE_A}-caption`, hidden)).toHaveTextContent('ADET');
    expect(screen.queryByTestId('warehouse-transfer-qty-sheet-confirm')).toBeNull();
    expect(screen.getByTestId('warehouse-transfer-cta')).toHaveTextContent('Kabulü kaydet');
    expect(screen.getByTestId('warehouse-transfer-cta')).not.toBeDisabled();
  });

  it('kural SAYIMDAN ÖNCE okunur — dipnotta değil', async () => {
    withTransfers([TRANSFER]);

    await renderTransfer();
    await openTransfer();

    expect(screen.getByTestId('warehouse-transfer-rule')).toHaveTextContent(/SKT ve lot yeniden yazılmaz/);
  });

  it('BOŞ satır kabulü bloklar — CTA kapalı ve sebebini söyler', async () => {
    withTransfers([TRANSFER]);

    await renderTransfer();
    await openTransfer();
    await countLine(LINE_A, 4);

    expect(screen.getByTestId('warehouse-transfer-cta')).toHaveTextContent(/boş satır kabulü bloklar/);
    expect(screen.getByTestId('warehouse-transfer-cta')).toBeDisabled();
  });

  it('SIFIR geçerli bir beyandır: satır sayılmış sayılır ve 0 olarak GÖNDERİLİR — beyan çekmecesinden', async () => {
    withTransfers([TRANSFER]);

    await renderTransfer();
    await openTransfer();
    await countLine(LINE_A, 4);
    await countLine(LINE_B, 0);

    // Sıfır bir EKSİKTİR (04.09): düğme beyanı taşır, ilk dokunuş çekmeceyi açar, ikincisi yazar.
    expect(screen.getByTestId('warehouse-transfer-cta')).toHaveTextContent(/Kabulü kaydet · 2 eksik beyanıyla/);

    await fireEvent.press(screen.getByTestId('warehouse-transfer-cta'));
    await waitFor(() => expect(screen.getByTestId('warehouse-transfer-declare-cta')).toBeOnTheScreen());
    expect(fetchMock.mock.calls.some((entry) => entry[1]?.method === 'POST')).toBe(false);

    await fireEvent.press(screen.getByTestId('warehouse-transfer-declare-cta'));
    await waitFor(() => expect(mockToast).toHaveBeenCalled());

    expect(lastPostBody()).toEqual({
      lines: [
        { lineId: LINE_A, receivedQty: 4 },
        { lineId: LINE_B, receivedQty: 0 },
      ],
      declaration: { reason: 'transfer_shortfall', note: null },
    });
  });

  it('kapının `incomplete` cevabı HANGİ satır olduğunu ekranda gösterir', async () => {
    withTransfers([TRANSFER], { status: 'incomplete', missingLineIds: [LINE_B], unknownLineIds: [] });

    await renderTransfer();
    await openTransfer();
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
    await openTransfer();
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
    await openTransfer();
    await countLine(LINE_A, 4);
    await countLine(LINE_B, 2);
    await fireEvent.press(screen.getByTestId('warehouse-transfer-cta'));

    await waitFor(() =>
      expect(mockToast.mock.calls.some(([m]) => /partide 3 var, 5 kabul edilemez/.test(m))).toBe(true),
    );
  });

  /*
    EKSİK BEYANI (kullanıcı kararı 04.09) — cihazda ölçülen üç açığın testleri:
    · künye "Strasbourg — ana depo" diyordu ("Strasbourg'dan geldi" gibi okunuyordu),
    · sevk edilen 5 iken 6 girilebiliyor, ret sunucudan fonksiyon adıyla geliyordu,
    · "Kabul yazıldı — 1 parti açıldı" beş birim kaybı yutuyordu.
  */
  it('künye "kaynak → alan" der; satırda lot ve SKT yazar', async () => {
    withTransfers([TRANSFER]);

    await renderTransfer();
    await openTransfer();

    expect(screen.getByTestId('warehouse-transfer-header')).toHaveTextContent(/Colmar Şube → Strasbourg Merkez/);
    // Künye TEK SATIR (21.254): sevk edilen · lot · SKT — D2'nin "beklenen 30 · GZT-1013" kalıbı.
    expect(screen.getByTestId(`warehouse-transfer-line-lot-${LINE_A}`)).toHaveTextContent('sevk edilen 4 · lot L2667-2 · SKT 25.04.27');
    // Lotsuz partide "lot" kelimesi hiç yazılmaz — olmayan bir bilgi boş bir etiketle gösterilmez.
    expect(screen.getByTestId(`warehouse-transfer-line-lot-${LINE_B}`)).toHaveTextContent('sevk edilen 2 · SKT 01.12.26');
    // Ürün karesi (04.09): kapaklı satır resmini, kapaksız satır monogramını çizer — ikisinde de kare var.
    // Kare DEKORATİF (a11y ağacından çıkar), sorgu gizli öğeleri de görmeli.
    const hidden = { includeHiddenElements: true };
    expect(screen.getByTestId(`warehouse-transfer-thumb-${LINE_A}`, hidden)).toBeOnTheScreen();
    expect(screen.getByTestId(`warehouse-transfer-thumb-${LINE_B}`, hidden)).toHaveTextContent('KK');
  });

  /*
    FAZLA ENGELLENMEZ, UYARILIR (kullanıcı kararı 04.09, 21.253) — eskiden tavan sevk edilen adetti.
    Gönderen dört sanıp beş koymuş olabilir; rampada sayılan gerçektir. Satır "N fazla" der, panel
    fazlayı gösterir, çekmecede sebep çipi YOK (fazlanın sebebi olmaz), kabul fazlayı beyanla yazar.
  */
  it('FAZLA: artı tavanda durmaz, satır "1 fazla" der, beyan sebepsiz gider, toast fazlayı ve SAY belgesini söyler', async () => {
    withTransfers([TRANSFER], {
      status: 'ok',
      transferId: TRANSFER.transferId,
      createdBatches: 2,
      shortfall: null,
      excess: { qty: 1, referenceNo: 'SAY-STR-26-0003', lines: [{ lineId: LINE_B, dispatchedQty: 2, receivedQty: 3 }] },
    });

    await renderTransfer();
    await openTransfer();
    await countLine(LINE_A, 4);
    // Künefe: sevk edilen 2 — çekmeceden ÜÇ; tavan yok, kutu kiremit rakamla "3 · ADET" der.
    await countLine(LINE_B, 3);
    expect(screen.getByTestId(`warehouse-transfer-qty-${LINE_B}-value`)).toHaveTextContent('3');
    expect(screen.getByTestId(`warehouse-transfer-line-excess-${LINE_B}`)).toHaveTextContent('1 fazla · stoğa fazla yazılacak');
    expect(screen.queryByTestId(`warehouse-transfer-line-short-${LINE_B}`)).toBeNull();

    expect(screen.getByTestId('warehouse-transfer-excess-total')).toHaveTextContent('1 birim fazla');
    expect(screen.queryByTestId('warehouse-transfer-shortfall-total')).toBeNull();
    expect(screen.getByTestId('warehouse-transfer-cta')).toHaveTextContent('Kabulü kaydet · 1 fazla beyanıyla');

    await fireEvent.press(screen.getByTestId('warehouse-transfer-cta'));
    await waitFor(() => expect(screen.getByTestId('warehouse-transfer-declare-excess-qty')).toHaveTextContent('1'));
    expect(screen.queryByTestId('warehouse-transfer-declare-reason-damaged')).toBeNull();

    await fireEvent.press(screen.getByTestId('warehouse-transfer-declare-cta'));
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(lastPostBody()).toEqual({
      lines: [
        { lineId: LINE_A, receivedQty: 4 },
        { lineId: LINE_B, receivedQty: 3 },
      ],
      declaration: { reason: null, note: null },
    });
    expect(mockToast.mock.calls.some(([m]) => /2 parti açıldı · 1 birim fazla stoğa yazıldı · SAY-STR-26-0003/.test(m))).toBe(true);
  });

  it('bir satır EKSİK öteki FAZLA: düğme ikisini sayar, çekmecede iki büyük rakam, sebep eksik için gider', async () => {
    withTransfers([TRANSFER], {
      status: 'ok',
      transferId: TRANSFER.transferId,
      createdBatches: 2,
      shortfall: { qty: 1, referenceNo: 'IMH-STR-26-0014', lines: [{ lineId: LINE_A, dispatchedQty: 4, receivedQty: 3 }] },
      excess: { qty: 2, referenceNo: 'SAY-STR-26-0004', lines: [{ lineId: LINE_B, dispatchedQty: 2, receivedQty: 4 }] },
    });

    await renderTransfer();
    await openTransfer();
    await countLine(LINE_A, 3);
    await countLine(LINE_B, 4);

    expect(screen.getByTestId('warehouse-transfer-cta')).toHaveTextContent('Kabulü kaydet · 1 eksik, 2 fazla beyanıyla');
    await fireEvent.press(screen.getByTestId('warehouse-transfer-cta'));
    await waitFor(() => expect(screen.getByTestId('warehouse-transfer-declare-qty')).toHaveTextContent('1'));
    expect(screen.getByTestId('warehouse-transfer-declare-excess-qty')).toHaveTextContent('2');
    await fireEvent.press(screen.getByTestId('warehouse-transfer-declare-reason-damaged'));
    await fireEvent.press(screen.getByTestId('warehouse-transfer-declare-cta'));

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(lastPostBody().declaration).toEqual({ reason: 'damaged', note: null });
    expect(
      mockToast.mock.calls.some(([m]) =>
        /1 birim eksik kayıp yazıldı · IMH-STR-26-0014 · 2 birim fazla stoğa yazıldı · SAY-STR-26-0004/.test(m),
      ),
    ).toBe(true);
  });

  it('eksik yoksa çekmece YOK — kabul tek dokunuşla, beyansız yazılır', async () => {
    withTransfers([TRANSFER]);

    await renderTransfer();
    await openTransfer();
    await countLine(LINE_A, 4);
    await countLine(LINE_B, 2);

    expect(screen.queryByTestId('warehouse-transfer-shortfall')).toBeNull();
    expect(screen.getByTestId('warehouse-transfer-cta')).toHaveTextContent('Kabulü kaydet');

    await fireEvent.press(screen.getByTestId('warehouse-transfer-cta'));
    await waitFor(() => expect(mockToast).toHaveBeenCalled());

    expect(screen.queryByTestId('warehouse-transfer-declare-cta')).toBeNull();
    expect(lastPostBody().declaration).toBeNull();
    expect(mockToast.mock.calls.some(([m]) => /Kabul yazıldı — 2 parti açıldı\.$/.test(m))).toBe(true);
  });

  it('EKSİK: satır kendi eksiğini söyler, özet paneli kaydetmeden önce çıkar, beyan sebep ve notla gider, toast belgeyi söyler', async () => {
    withTransfers([TRANSFER], {
      status: 'ok',
      transferId: TRANSFER.transferId,
      createdBatches: 2,
      shortfall: { qty: 1, referenceNo: 'IMH-STR-26-0013', lines: [{ lineId: LINE_A, dispatchedQty: 4, receivedQty: 3 }] },
      excess: null,
    });

    await renderTransfer();
    await openTransfer();
    await countLine(LINE_A, 3);
    // Sayım bitmeden özet YOK: yarım sayımın eksiği bir beyan değil, bir bilinmezdir.
    expect(screen.queryByTestId('warehouse-transfer-shortfall')).toBeNull();
    expect(screen.getByTestId(`warehouse-transfer-line-short-${LINE_A}`)).toHaveTextContent('1 eksik · kayıp olarak yazılacak');

    await countLine(LINE_B, 2);
    expect(screen.getByTestId('warehouse-transfer-shortfall')).toHaveTextContent(/Mantı · 500 g/);
    expect(screen.getByTestId('warehouse-transfer-shortfall')).toHaveTextContent(/4 gönderildi · 3 geldi/);
    expect(screen.getByTestId('warehouse-transfer-shortfall-total')).toHaveTextContent('1 birim eksik');
    expect(screen.getByTestId('warehouse-transfer-shortfall')).toHaveTextContent(/TRF-COL-26-0007 transferine bağlanır/);
    expect(screen.getByTestId('warehouse-transfer-cta')).toHaveTextContent('Kabulü kaydet · 1 eksik beyanıyla');

    await fireEvent.press(screen.getByTestId('warehouse-transfer-cta'));
    await waitFor(() => expect(screen.getByTestId('warehouse-transfer-declare-qty')).toHaveTextContent('1'));
    await fireEvent.press(screen.getByTestId('warehouse-transfer-declare-reason-damaged'));
    await fireEvent.changeText(screen.getByTestId('warehouse-transfer-declare-note'), '  mühür açıktı ');
    await fireEvent.press(screen.getByTestId('warehouse-transfer-declare-cta'));

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(lastPostBody().declaration).toEqual({ reason: 'damaged', note: 'mühür açıktı' });
    expect(
      mockToast.mock.calls.some(([m]) => /2 parti açıldı · 1 birim eksik kayıp yazıldı · IMH-STR-26-0013/.test(m)),
    ).toBe(true);
  });

  it('vazgeç çekmeceyi kapatır, hiçbir şey gönderilmez', async () => {
    withTransfers([TRANSFER]);

    await renderTransfer();
    await openTransfer();
    await countLine(LINE_A, 3);
    await countLine(LINE_B, 2);
    await fireEvent.press(screen.getByTestId('warehouse-transfer-cta'));
    await waitFor(() => expect(screen.getByTestId('warehouse-transfer-declare-cancel')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('warehouse-transfer-declare-cancel'));

    expect(fetchMock.mock.calls.some((entry) => entry[1]?.method === 'POST')).toBe(false);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('liste TASARIMIN KARTI: gelen kartta "GELDİ", yoldakinde rota + durum + tahmini gün, kapananda rota adla, eksik ADET ve belgeyle', async () => {
    withTransfers([TRANSFER, inboundTransfer({ transferId: '00000000-0000-4000-8000-000000000052', referenceNo: 'TRF-B' })], undefined, {
      outbound: [
        {
          transferId: '00000000-0000-4000-8000-000000000053',
          referenceNo: 'TRF-STR-26-0005',
          toWarehouseId: '00000000-0000-4000-8000-000000000063',
          toWarehouseName: 'Kehl — sınır deposu',
          dispatchedAt: '2026-08-30T09:00:00.000Z',
          lineCount: 1,
          etaDate: '2026-08-31',
          ageDays: 4,
          ageTone: 'late',
          lateDays: 3,
        },
      ],
      closed: [
        {
          transferId: '00000000-0000-4000-8000-000000000054',
          referenceNo: 'TRF-KEHL-26-0002',
          fromWarehouseId: '00000000-0000-4000-8000-000000000063',
          toWarehouseId: '00000000-0000-4000-8000-000000000060',
          direction: 'in',
          status: 'received',
          closedAt: '2026-09-03T17:00:00.000Z',
          lineCount: 2,
          shortLineCount: 2,
          shortQty: 5,
          shortfallReferenceNo: 'IMH-STR-26-0013',
          excessQty: 0,
          excessReferenceNo: null,
          counterpartKind: 'facility',
          counterpartName: 'Kehl — sınır deposu',
        },
        {
          transferId: '00000000-0000-4000-8000-000000000055',
          referenceNo: 'TRF-STR-26-0012',
          fromWarehouseId: '00000000-0000-4000-8000-000000000060',
          toWarehouseId: '00000000-0000-4000-8000-000000000064',
          direction: 'out',
          status: 'received',
          closedAt: '2026-09-03T14:00:00.000Z',
          lineCount: 1,
          shortLineCount: 0,
          shortQty: 0,
          shortfallReferenceNo: null,
          // Fazla kabul (21.253): sonuç "+2 adet" — tam kabul değil, fark.
          excessQty: 2,
          excessReferenceNo: 'SAY-STR-26-0002',
          counterpartKind: 'vehicle',
          counterpartName: 'Kurye aracı 1',
        },
      ],
    });

    await renderTransfer();

    // Gelen kart (v3): rota + durum rozeti — "YOLDA" bir olgu, tasarımın "GELDİ"si değildi (04.09).
    expect(screen.getByTestId(`warehouse-transfer-route-${TRANSFER.transferId}`)).toHaveTextContent('Colmar Şube → Strasbourg Merkez');
    expect(screen.getByTestId(`warehouse-transfer-status-${TRANSFER.transferId}`)).toHaveTextContent('YOLDA');
    expect(screen.getByTestId(`warehouse-transfer-row-${TRANSFER.transferId}`)).not.toHaveTextContent(/2 kalem · /);
    // Yoldaki kart: rota adla; sağda YALNIZ OLGU — durum ve çıktığı gün. "tahmini" ve "gecikti" yok
    // (kullanıcı kararı 04.09: tahmin ya da doğrulanamayan bilgi ekrana yazılmaz).
    expect(screen.getByTestId('warehouse-transfer-outbound-status-00000000-0000-4000-8000-000000000053')).toHaveTextContent('yolda');
    expect(screen.getByTestId('warehouse-transfer-outbound-00000000-0000-4000-8000-000000000053')).toHaveTextContent(
      /Strasbourg Merkez → Kehl — sınır deposu · 1 kalem/,
    );
    expect(screen.getByTestId('warehouse-transfer-outbound-00000000-0000-4000-8000-000000000053')).toHaveTextContent(/çıktı 30\.08/);
    expect(screen.getByTestId('warehouse-transfer-outbound-00000000-0000-4000-8000-000000000053')).not.toHaveTextContent(/tahmini|gecikti/);
    // Kapanan satır: iki ucun adı (araç dâhil), tarih yılsız, eksik adet ve belge.
    expect(screen.getByTestId('warehouse-transfer-closed-result-00000000-0000-4000-8000-000000000054')).toHaveTextContent('−5 adet');
    expect(screen.getByTestId('warehouse-transfer-closed-00000000-0000-4000-8000-000000000054')).toHaveTextContent(
      /Kehl — sınır deposu → Strasbourg Merkez · 2 kalem · 03\.09 · eksik IMH-STR-26-0013/,
    );
    expect(screen.getByTestId('warehouse-transfer-closed-00000000-0000-4000-8000-000000000055')).toHaveTextContent(
      /Strasbourg Merkez → Kurye aracı 1 · 1 kalem · 03\.09/,
    );
    expect(screen.getByTestId('warehouse-transfer-closed-result-00000000-0000-4000-8000-000000000055')).toHaveTextContent('+2 adet');
  });

  /*
    SALT OKUMA DETAYI (kullanıcı isteği 05.09) — "detaylarını görebilmeli ama değiştirememeliyim".
    Testin taşıdığı iki iddia var ve ikincisi asıl olan: satır AÇILIYOR, ve açılan şey YAZMIYOR.
  */
  const KAPANAN = '00000000-0000-4000-8000-000000000054';
  const YOLDAKI = '00000000-0000-4000-8000-000000000053';

  const listeyle = async () =>
    withTransfers([TRANSFER], undefined, {
      outbound: [
        {
          transferId: YOLDAKI,
          referenceNo: 'TRF-STR-26-0005',
          toWarehouseId: '00000000-0000-4000-8000-000000000063',
          toWarehouseName: 'Kehl — sınır deposu',
          dispatchedAt: '2026-08-30T09:00:00.000Z',
          lineCount: 1,
          etaDate: '2026-08-31',
          ageDays: 4,
          ageTone: 'late',
          lateDays: 3,
        },
      ],
      closed: [
        {
          transferId: KAPANAN,
          referenceNo: 'TRF-KEHL-26-0002',
          fromWarehouseId: '00000000-0000-4000-8000-000000000063',
          toWarehouseId: '00000000-0000-4000-8000-000000000060',
          direction: 'in',
          status: 'received',
          closedAt: '2026-09-03T17:00:00.000Z',
          lineCount: 2,
          shortLineCount: 1,
          shortQty: 2,
          shortfallReferenceNo: null,
          excessQty: 0,
          excessReferenceNo: null,
          counterpartKind: 'facility',
          counterpartName: 'Kehl — sınır deposu',
        },
      ],
    });

  it('KAPANAN satır açılır: kalemler, lot/SKT ve sevk edilen ↔ sayılan görünür', async () => {
    await listeyle();
    await renderTransfer();

    await fireEvent.press(screen.getByTestId(`warehouse-transfer-closed-${KAPANAN}`));

    await waitFor(() => expect(screen.getByTestId('warehouse-transfer-detail-line-00000000-0000-4000-8000-0000000000a1')).toBeOnTheScreen());
    const satir = screen.getByTestId('warehouse-transfer-detail-line-00000000-0000-4000-8000-0000000000a1');
    expect(satir).toHaveTextContent(/Fıstıklı Baklava/);
    expect(satir).toHaveTextContent(/GAZ-7120/);
    expect(satir).toHaveTextContent(/6/);
    expect(satir).toHaveTextContent(/4/);
  });

  /* `null` ≠ `0` (0042): sayılmamış satır "sayılmadı" der, "0" DEMEZ — yoldaki bir kayıtta bütün
     satırlar öyledir ve "0" yazmak henüz sayılmamış bir sevkiyatı KAYIP gibi okuturdu. */
  it('sayılmamış satır "sayılmadı" der, sıfır yazmaz', async () => {
    await listeyle();
    await renderTransfer();

    await fireEvent.press(screen.getByTestId(`warehouse-transfer-closed-${KAPANAN}`));

    await waitFor(() => expect(screen.getByTestId('warehouse-transfer-detail-line-00000000-0000-4000-8000-0000000000a2')).toBeOnTheScreen());
    const satir = screen.getByTestId('warehouse-transfer-detail-line-00000000-0000-4000-8000-0000000000a2');
    expect(satir).toHaveTextContent(/sayılmadı/);
    expect(satir).not.toHaveTextContent(/\b0\b/);
  });

  it('YOLDAKİ satır da açılır — bölüm eylemsiz ama okunabilir', async () => {
    await listeyle();
    await renderTransfer();

    await fireEvent.press(screen.getByTestId(`warehouse-transfer-outbound-${YOLDAKI}`));

    await waitFor(() => expect(screen.getByTestId('warehouse-transfer-detail-line-00000000-0000-4000-8000-0000000000a1')).toBeOnTheScreen());
  });

  /* ASIL İDDİA: açılan şey YAZMIYOR. Kabul akışının üç işareti de bulunmamalı — adet kutusu,
     çekmece onayı ve CTA. Biri bile çizilseydi kapanmış bir kayıt sayılabilir görünürdü. */
  it('detay SALT OKUMA: adet kutusu, sayım çekmecesi ve kaydet düğmesi YOK', async () => {
    await listeyle();
    await renderTransfer();

    await fireEvent.press(screen.getByTestId(`warehouse-transfer-closed-${KAPANAN}`));
    await waitFor(() => expect(screen.getByTestId('warehouse-transfer-detail-line-00000000-0000-4000-8000-0000000000a1')).toBeOnTheScreen());

    expect(screen.queryByTestId('warehouse-transfer-qty-00000000-0000-4000-8000-0000000000a1')).toBeNull();
    expect(screen.queryByTestId('warehouse-transfer-qty-sheet-confirm')).toBeNull();
    expect(screen.queryByTestId('warehouse-transfer-cta')).toBeNull();
    // Ve hiçbir yazma isteği doğmadı.
    expect(fetchMock.mock.calls.some((entry) => entry[1]?.method === 'POST')).toBe(false);
  });

  it('detay turu düşerse hata bloğu çıkar — liste yerinde kalır', async () => {
    await listeyle();
    fetchMock.mockImplementation((url) => {
      if (/\/transfers\/[0-9a-f-]{36}(\?|$)/.test(String(url))) return Promise.reject(new Error('network'));
      return Promise.resolve(ok({ transfers: [TRANSFER], outbound: [], closed: [{
        transferId: KAPANAN,
        referenceNo: 'TRF-KEHL-26-0002',
        fromWarehouseId: '00000000-0000-4000-8000-000000000063',
        toWarehouseId: '00000000-0000-4000-8000-000000000060',
        direction: 'in',
        status: 'received',
        closedAt: '2026-09-03T17:00:00.000Z',
        lineCount: 2,
        shortLineCount: 0,
        shortQty: 0,
        shortfallReferenceNo: null,
        excessQty: 0,
        excessReferenceNo: null,
        counterpartKind: 'facility',
        counterpartName: 'Kehl — sınır deposu',
      }] }));
    });
    await renderTransfer();

    await fireEvent.press(screen.getByTestId(`warehouse-transfer-closed-${KAPANAN}`));

    await waitFor(() => expect(screen.getByTestId('warehouse-transfer-detail-error')).toBeOnTheScreen());
    expect(screen.getByTestId(`warehouse-transfer-closed-${KAPANAN}`)).toBeOnTheScreen();
  });
});
