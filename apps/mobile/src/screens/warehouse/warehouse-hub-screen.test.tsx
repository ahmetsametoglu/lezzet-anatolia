import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { StaffWarehouse } from '@lezzet/types';

import { resetWarehouseChoice } from '@/lib/operations/warehouse-choice';
import type { OperationsSection } from '@/lib/operations/sections';
import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import { inboundTransfer, nearExpiryBatch, preparationOrder } from './warehouse-fixture';
import { WarehouseHubScreen } from './warehouse-hub-screen';
import { resetWarehouseStatus } from './warehouse-status';

/*
  DEPO HUB EKRAN TESTİ — sayaçların KAYNAĞI, "okunamadı" ile "yok" ayrımı, çevrimdışı kilidi ve
  kapsam sorusunun ekrana çıkışı.

  HOOK TAKLİT EDİLMEZ: gerçek hook + taklit `fetch`, yani veri GERÇEKTEN sözleşmeden geçiyor
  (kurye emsali). En kritik iddia sayaçların "0" ile "bilinmiyor"u ayırması — ölçülemeyen değer
  sıfır değildir (CLAUDE §1) ve sıfır yazan bir hub depocuyu evine gönderir.
*/

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

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

function fail(error: string, status = 500): Response {
  return { status, headers: { get: () => null }, json: async () => ({ data: null, error }) } as unknown as Response;
}

/** Ağ hiç çıkmadı — `fetch` fırlatıyor; istemci bunu `network_error`a çeviriyor. */
function offline(): Promise<Response> {
  return Promise.reject(new Error('network down'));
}

function routeReplies(replies: {
  preparation?: () => Promise<Response>;
  transfers?: () => Promise<Response>;
  handover?: () => Promise<Response>;
  printers?: () => Promise<Response>;
  nearExpiry?: () => Promise<Response>;
}) {
  fetchMock.mockImplementation((url) => {
    const path = String(url);
    if (path.includes('/preparation')) return (replies.preparation ?? (() => Promise.resolve(ok({ date: null, orders: [] }))))();
    // Yazıcı okuması hub'ın ALT ŞERİDİNİ besliyor (30.08): şerit "bu cihaz" diyor ve cihazın o
    // anki kurulumunu yazıyor. Hata koşuluna katılmaz — ayar kapısıdır, günün işi değil.
    if (path.includes('/printers')) return (replies.printers ?? (() => Promise.resolve(ok({ printers: [] }))))();
    // Devir sayacı KENDİ ucundan geliyor (07.12): bekleyen kutuları hiçbir liste taşımıyor,
    // çünkü duyurulmuş siparişin kutuları hazırlık kuyruğundan çoktan düşmüştür.
    // D3 SAYAÇLARI (21.187): kart "kaç parti listede, kaçı imhalık" diyor ve sayı bu uçtan geliyor.
    if (path.includes('/near-expiry')) return (replies.nearExpiry ?? (() => Promise.resolve(ok({ batches: [] }))))();
    if (path.includes('/handover/pending')) return (replies.handover ?? (() => Promise.resolve(ok({ boxes: 0 }))))();
    /* Transfer yanıtı ÜÇ liste taşıyor (`WarehouseTransfersResponseSchema`); eksik gönderilen bir
       cevap şema kapısından geçemez ve hub'ın İKİ okuması birden düşmüş gibi görünür. */
    return (replies.transfers ?? (() => Promise.resolve(ok({ transfers: [], outbound: [], closed: [] }))))();
  });
}

/** Kapsamın çözdüğü tek tesis — depocunun günlük hâli (`seed/people.ts` → `depocu`). */
const STR: StaffWarehouse = { id: 'w-str', code: 'STR', name: 'Strasbourg Merkez', kind: 'facility' };
/** İkinci tesis — kapsam belirsizliğini ve seçiciyi doğuran hâl. */
const KEHL: StaffWarehouse = { id: 'w-kehl', code: 'KEHL', name: 'Kehl Depo', kind: 'facility' };
/** Kuryenin aracı — kapsamda VAR ama depo seçicisinde seçenek OLAMAZ. */
const VAN: StaffWarehouse = { id: 'w-van', code: 'VAN', name: 'Panelvan', kind: 'vehicle' };

async function renderHub() {
  await render(
    <OperationsSessionProvider
      value={{
        sections: ['warehouse'],
        userName: 'Ayşe K.',
        userEmail: 'ayse@lezzetanatolia.fr',
        warehouses: [STR],
        resolvedWarehouseId: STR.id,
      }}
    >
      <WarehouseHubScreen />
    </OperationsSessionProvider>,
  );
  await waitFor(() => expect(screen.queryByTestId('warehouse-hub-loading')).toBeNull());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  resetWarehouseStatus();
  /* Seçim de modül düzeyinde durur ve dosyalar arası sızar: bir testte seçilen depo, sonraki
     testin isteğine sessizce bir `?warehouseId=` eklerdi (`warehouse-choice.ts` künyesi). */
  resetWarehouseChoice();
});

describe('depo hub', () => {
  it('sekiz işin hepsi çizilir — D1 kartı, altı ızgara kutucuğu, yazıcı şeridi', async () => {
    routeReplies({});

    await renderHub();

    for (const key of ['picking', 'intake', 'near-expiry', 'adjustment', 'transfer', 'return', 'sale', 'handover', 'printers']) {
      expect(screen.getByTestId(`warehouse-hub-${key}`)).toBeOnTheScreen();
    }
  });

  /*
    D3 KARTI GERÇEK SAYIYI YAZAR (21.187) — fikstür söküldü.

    İki hâl ayrı ölçülüyor çünkü ikisi ayrı şey söylüyor: sayı GELDİYSE kaç parti ve kaçı imhalık
    yazılır; OKUNAMADIYSA "okunamadı" der ve kart dikkat rengine geçmez. "0 parti" demek,
    listeyi okuyamadığımız hâlde "iş yok" demekti (CLAUDE §1).
  */
  it('D3 kartı parti ve imhalık sayısını yazar', async () => {
    routeReplies({
      nearExpiry: () =>
        Promise.resolve(
          ok({
            batches: [
              nearExpiryBatch({ decision: 'can_offer' }),
              nearExpiryBatch({ stockId: '00000000-0000-4000-8000-000000000402', decision: 'must_discard' }),
            ],
          }),
        ),
    });

    await renderHub();

    await waitFor(() => expect(screen.getByTestId('warehouse-hub-near-expiry')).toHaveTextContent(/2 parti listede/));
    expect(screen.getByTestId('warehouse-hub-near-expiry')).toHaveTextContent(/1 imhalık/);
  });

  it('D3 sayacı OKUNAMAZSA kart sayı uydurmaz', async () => {
    routeReplies({ nearExpiry: () => Promise.resolve(fail('server_error')) });

    await renderHub();

    await waitFor(() => expect(screen.getByTestId('warehouse-hub-near-expiry')).toHaveTextContent(/okunamadı/));
  });

  /*
    ÖZET KARTI (v3, 30.08) — hub'ın tepesindeki üç sayı. Yeni bir uç İSTEMİYOR: üçü de bölümün
    zaten okuduğu veriden çıkıyor. "Yarım kutu" mühürlenmemiş kutusu olan SİPARİŞTİR
    (`sealedAt === null`) — kutuyu değil siparişi sayıyoruz, çünkü bitirilecek şey siparişin
    kendisidir.
  */
  it('özet kartının üç sayısı zaten okunan veriden türer', async () => {
    routeReplies({
      preparation: () =>
        Promise.resolve(
          ok({
            date: null,
            orders: [
              preparationOrder(),
              preparationOrder({ orderId: '00000000-0000-4000-8000-000000000002', lineCount: 3, pickedLineCount: 1 }),
            ],
          }),
        ),
      handover: () => Promise.resolve(ok({ boxes: 3 })),
    });

    await renderHub();

    expect(screen.getByTestId('warehouse-hub-overview-orders')).toHaveTextContent('2');
    expect(screen.getByTestId('warehouse-hub-overview-shipments')).toHaveTextContent('3');
    // Fikstürün kutuları mühürlü — yarım kutu yok.
    expect(screen.getByTestId('warehouse-hub-overview-half')).toHaveTextContent('0');
  });

  it('mühürlenmemiş kutusu olan sipariş YARIM sayılır ve önizlemede söylenir', async () => {
    routeReplies({
      preparation: () =>
        Promise.resolve(
          ok({
            date: null,
            orders: [
              preparationOrder({
                boxes: [
                  {
                    boxId: '00000000-0000-4000-8000-0000000000b1',
                    boxNo: 1,
                    code: 'KT-0001',
                    sealedAt: null,
                    items: [],
                    shippingBoxId: null,
                  },
                ],
              }),
            ],
          }),
        ),
    });

    await renderHub();

    expect(screen.getByTestId('warehouse-hub-overview-half')).toHaveTextContent('1');
    expect(screen.getByTestId('warehouse-hub-picking-preview')).toHaveTextContent(/yarım kutu açık/);
  });

  /*
    D1 ÖNİZLEMESİ — kart bir LİSTE DEĞİL, "içeride ne var" cümlesidir. İlk İKİ sipariş çizilir;
    üçüncü satır kartı listeye çevirir ve altındaki ızgarayı ekrandan atardı.
  */
  it('D1 kartı ilk iki siparişi gösterir, üçüncüyü GÖSTERMEZ', async () => {
    routeReplies({
      preparation: () =>
        Promise.resolve(
          ok({
            date: null,
            orders: [
              preparationOrder({ orderId: '00000000-0000-4000-8000-000000000001', referenceNo: 'LZA-BIR' }),
              preparationOrder({ orderId: '00000000-0000-4000-8000-000000000002', referenceNo: 'LZA-IKI' }),
              preparationOrder({ orderId: '00000000-0000-4000-8000-000000000003', referenceNo: 'LZA-UC' }),
            ],
          }),
        ),
    });

    await renderHub();

    const preview = screen.getByTestId('warehouse-hub-picking-preview');
    expect(preview).toHaveTextContent(/LZA-BIR/);
    expect(preview).toHaveTextContent(/LZA-IKI/);
    expect(preview).not.toHaveTextContent(/LZA-UC/);
    // Rozet TÜM kuyruğu sayar — önizlemenin kırptığı sayıyı değil.
    expect(screen.getByTestId('warehouse-hub-picking-badge')).toHaveTextContent('3');
  });

  it('transfer kutucuğu gelen transferi söyler', async () => {
    routeReplies({
      transfers: () => Promise.resolve(ok({ transfers: [inboundTransfer()], outbound: [], closed: [] })),
    });

    await renderHub();

    expect(screen.getByTestId('warehouse-hub-transfer')).toHaveTextContent(/TRF-COL-26-0007 yolda/);
  });

  it('başlığın bağlam satırı personeli ve bölümü söyler', async () => {
    routeReplies({});

    await renderHub();

    expect(screen.getByTestId('warehouse-hub-header-context')).toHaveTextContent('Ayşe K. · Depo');
  });

  /*
    KARGO DEVRİ SAYACI (07.12 · tasarım §8.6) — hub'ın "listeden say" kuralının TEK istisnası.

    Bekleyen kutuları hiçbir liste taşımıyor: duyurulmuş bir siparişin kutuları hazırlık
    kuyruğundan düşmüştür ve gelen transferlerle ilgisi yok. Sayaç bu yüzden kendi ucundan geliyor.
  */
  it('devir kutucuğu KENDİ ucundan sayıyor — sayı hem kutucukta hem özet kartında', async () => {
    routeReplies({ handover: () => Promise.resolve(ok({ boxes: 4 })) });

    await renderHub();

    expect(screen.getByTestId('warehouse-hub-handover')).toHaveTextContent(/4 kutu taşıyıcıyı bekliyor/);
    expect(screen.getByTestId('warehouse-hub-overview-shipments')).toHaveTextContent('4');
  });

  it('devirde sıfır ile OKUNAMADI ayrı cümleler — "rampa boş" yanlış bir izdir', async () => {
    routeReplies({ handover: () => Promise.resolve(ok({ boxes: 0 })) });
    await renderHub();

    // Alt metin küçük harfle: kutucukların deseni ("yolda transfer yok"), cümle değil etiket.
    expect(screen.getByTestId('warehouse-hub-handover')).toHaveTextContent(/rampa boş — bekleyen kutu yok/);
    expect(screen.getByTestId('warehouse-hub-overview-shipments')).toHaveTextContent('0');
  });

  it('devir sayacı DÜŞERSE hub ayakta kalır — bir rozet, iki listeyi gizlemez', async () => {
    routeReplies({ handover: () => Promise.resolve(fail('server_error')) });

    await renderHub();

    // Sayaç bir kutucuğun alt metnidir: düşmesi hub'ı kullanılamaz yapmaz.
    expect(screen.queryByTestId('warehouse-hub-error')).toBeNull();
    expect(screen.getByTestId('warehouse-hub-handover')).toHaveTextContent(/okunamadı/);
    expect(screen.getByTestId('warehouse-hub-picking')).toBeOnTheScreen();
    // Özet kartında da SIFIR yazılmaz — ölçülemeyen değer sıfır değildir (CLAUDE §1).
    expect(screen.getByTestId('warehouse-hub-overview-shipments')).toHaveTextContent('—');
  });

  it('boş liste "yok" der; OKUNAMAYAN liste "yüklenemedi" — ikisi ayrı şeydir', async () => {
    routeReplies({ preparation: () => Promise.resolve(fail('server_error')) });

    await renderHub();

    expect(screen.getByTestId('warehouse-hub-picking')).toHaveTextContent(/yüklenemedi/);
    expect(screen.queryByTestId('warehouse-hub-picking-badge')).toBeNull();
    // Okunamayan kuyruk özet kartında da "—": iki sayı birden bilinmiyor.
    expect(screen.getByTestId('warehouse-hub-overview-orders')).toHaveTextContent('—');
    expect(screen.getByTestId('warehouse-hub-overview-half')).toHaveTextContent('—');
    /* Öteki okuma ayakta ve cümlesi ÖLÇTÜĞÜ ŞEYİ söylüyor (30.08): uç yalnız GELEN transferleri
       döndürüyor, o yüzden boşluk "yolda transfer yok" değil "kabul bekleyen transfer yok".
       Ölçüldü — yerel veride iki transfer yolda ama ikisi de bu depodan ÇIKIYOR; eski cümle
       "hiçbir şey yolda değil" diye okunuyordu ve yanlıştı. */
    expect(screen.getByTestId('warehouse-hub-transfer')).toHaveTextContent(/kabul bekleyen transfer yok/);
  });

  it('kuyruk BOŞSA kart "kuyruk boş" der ve önizleme hiç doğmaz', async () => {
    routeReplies({});

    await renderHub();

    expect(screen.getByTestId('warehouse-hub-picking')).toHaveTextContent(/kuyruk boş/);
    expect(screen.queryByTestId('warehouse-hub-picking-preview')).toBeNull();
    expect(screen.getByTestId('warehouse-hub-overview-orders')).toHaveTextContent('0');
  });

  it('İKİ okuma da düşerse hata bloğu çıkar — liste çizilmez', async () => {
    routeReplies({
      preparation: () => Promise.resolve(fail('server_error')),
      transfers: () => Promise.resolve(fail('server_error')),
      handover: () => Promise.resolve(fail('server_error')),
    });

    await renderHub();

    expect(screen.getByTestId('warehouse-hub-error')).toBeOnTheScreen();
    expect(screen.queryByTestId('warehouse-hub-list')).toBeNull();
  });

  it('bağlantı yoksa kilit uyarısı ÇIKAR (v2:290) — kuyruk sözü verilmez', async () => {
    routeReplies({ preparation: offline, transfers: offline, handover: offline });

    await renderHub();

    expect(screen.getByTestId('warehouse-hub-offline')).toHaveTextContent(/çevrimdışı yapılamaz/);
  });

  it('bir okuma geçtiyse hat AÇIKTIR — kilit uyarısı çıkmaz (cevabın kendisi kanıt)', async () => {
    routeReplies({
      preparation: offline,
      transfers: () => Promise.resolve(ok({ transfers: [], outbound: [], closed: [] })),
    });

    await renderHub();

    expect(screen.queryByTestId('warehouse-hub-offline')).toBeNull();
  });

  /*
    ÜSTBAŞLIĞIN KUYRUĞU (v3:37 · 30.08) — "DEPO · STRASBOURG MERKEZ".

    İki iddia birden: ad GELDİĞİNDE yazılır, gelmediğinde ÜSTBAŞLIK KUYRUKSUZ KALIR. İkincisi
    birincisinden önemli — uydurma bir tesis adı, depocuya yanlış deponun ekranındaymış gibi
    güvence verir ve bu, ekranın güvenilirliğini kökten kaybetmesidir (CLAUDE §1).
  */
  it('üstbaşlık çalışılan tesisin adını yazar', async () => {
    routeReplies({});

    await renderHub();

    expect(screen.getByTestId('warehouse-hub-header')).toHaveTextContent(/DEPO · STRASBOURG MERKEZ/);
  });

  it('tesis adı YOKSA üstbaşlık kuyruksuz kalır — uydurma bir şehir adı yazılmaz', async () => {
    routeReplies({});

    await render(
      <OperationsSessionProvider
        value={{
          sections: ['warehouse'],
          userName: 'Ayşe K.',
          userEmail: 'ayse@lezzetanatolia.fr',
          // Kapsam okunamadı: liste boş, çözüm yok.
          warehouses: [],
          resolvedWarehouseId: null,
        }}
      >
        <WarehouseHubScreen />
      </OperationsSessionProvider>,
    );
    await waitFor(() => expect(screen.queryByTestId('warehouse-hub-loading')).toBeNull());

    expect(screen.getByTestId('warehouse-hub-header')).toHaveTextContent(/DEPO/);
    expect(screen.getByTestId('warehouse-hub-header')).not.toHaveTextContent(/DEPO ·/);
  });

  /*
    KAPSAM BELİRSİZ EKRANI (v3:1043) — hub'ın bu dalı o ekranın kendisidir (ayrı rota yok).
    Şablon "Para bölümüne geç" düğmesini SABİT yazıyor; sabit yazmak, para yetkisi olmayan bir
    depocuya açamayacağı bir kapı göstermek olurdu — o kapı "yetkin yok" diye geri atardı.
    Çıkışlar personelin GERÇEKTEN açık bölümlerinden doğuyor.
  */
  it('kapsam belirsizken AÇIK olan öteki bölümlere çıkış verilir', async () => {
    routeReplies({
      preparation: () => Promise.resolve(fail('warehouse_required', 400)),
      transfers: () => Promise.resolve(fail('warehouse_required', 400)),
      handover: () => Promise.resolve(fail('warehouse_required', 400)),
    });

    await render(
      <OperationsSessionProvider
        value={{
          sections: ['warehouse', 'money'],
          userName: 'Ayşe D.',
          userEmail: 'ayse@lezzetanatolia.fr',
          warehouses: [STR, KEHL],
          resolvedWarehouseId: null,
        }}
      >
        <WarehouseHubScreen />
      </OperationsSessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('warehouse-scope-block')).toBeOnTheScreen());

    expect(screen.getByTestId('warehouse-scope-to-money')).toHaveTextContent(/Para bölümüne geç/);
    // Kendi bölümüne çıkış verilmez: zaten oradayız ve kapalı.
    expect(screen.queryByTestId('warehouse-scope-to-warehouse')).toBeNull();
    /* KARARIN YENİ HÂLİ YAZILI (30.08): depo artık SEÇİLEBİLİR ama kendiliğinden seçilmez.
       Eski iddia ("Depo seçtirme bilinçli olarak yoktur") kullanıcı bulgusuyla düştü — seçenek
       sunmayan ekran, iki depolu personeli çıkışsız bırakıyordu. */
    expect(screen.getByTestId('operations-section-warehouse')).toHaveTextContent(
      /Depo kendiliğinden SEÇİLMEZ/,
    );
  });

  /*
    KAPSAM SEÇİCİSİ (kullanıcı bulgusu 30.08) — arızanın kendisi ve kapanışı.

    Ölçülen hâl: iki tesisli personel bloğa düşüyor ve çıkış yolu yok. Kapı doğruydu, ekran
    dürüsttü; eksik olan CEVAPTI. Aşağıdaki üç test o cevabın üç yarısını çiviliyor: liste geliyor,
    araç listeye girmiyor, seçim isteğe `?warehouseId=` olarak yazılıyor.
  */
  describe('kapsam seçicisi', () => {
    /** Kapsamı iki tesis + bir araç olan personel — `hepsi@lezzetanatolia.fr` hâli. */
    const renderAmbiguous = async () => {
      routeReplies({
        preparation: () => Promise.resolve(fail('warehouse_required', 400)),
        transfers: () => Promise.resolve(fail('warehouse_required', 400)),
        handover: () => Promise.resolve(fail('warehouse_required', 400)),
      });

      await render(
        <OperationsSessionProvider
          value={{
            sections: ['warehouse'],
            userName: 'Emre Yıldız',
            userEmail: 'hepsi@lezzetanatolia.fr',
            warehouses: [STR, KEHL, VAN],
            resolvedWarehouseId: null,
          }}
        >
          <WarehouseHubScreen />
        </OperationsSessionProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('warehouse-scope-block')).toBeOnTheScreen());
    };

    it('kapsamdaki TESİSLER seçenek olarak çizilir — araç ÇİZİLMEZ', async () => {
      await renderAmbiguous();

      // Kutu ad + KOD taşıyor ("Strasbourg MerkezSTR"), o yüzden içerik ARANIR, eşitlenmez: iki
      // tesisin adı benzediğinde seçimi ayıran şey koddur.
      expect(screen.getByTestId(`warehouse-scope-pick-${STR.id}`)).toHaveTextContent(new RegExp(STR.name));
      expect(screen.getByTestId(`warehouse-scope-pick-${STR.id}`)).toHaveTextContent(new RegExp(STR.code));
      expect(screen.getByTestId(`warehouse-scope-pick-${KEHL.id}`)).toHaveTextContent(new RegExp(KEHL.name));
      // Araç bir DEPO değildir: "bugün hangi depodayım" sorusunun cevabı bir panelvan olamaz.
      expect(screen.queryByTestId(`warehouse-scope-pick-${VAN.id}`)).toBeNull();
    });

    it('seçenek varken cümle ATAMA BEKLE değil SEÇ olur — soru doğru kişiye sorulur', async () => {
      await renderAmbiguous();

      expect(screen.getByTestId('operations-section-warehouse')).toHaveTextContent(/Bugün hangi depodasın/);
      // Eski cümle ("yönetici seni bir depoya atadığında…") burada YANLIŞTI: atama zaten yapılmış.
      expect(screen.getByTestId('operations-section-warehouse')).not.toHaveTextContent(/Yönetici seni bir depoya/);
    });

    it('seçilen depo isteğe `?warehouseId=` olarak yazılır — ve blok kalkar', async () => {
      await renderAmbiguous();

      // Seçimden SONRAKİ okumalar başarılı: kapı artık hangi depo olduğunu biliyor.
      routeReplies({});
      fireEvent.press(screen.getByTestId(`warehouse-scope-pick-${KEHL.id}`));

      await waitFor(() => expect(screen.queryByTestId('warehouse-scope-block')).toBeNull());

      const urls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(urls.some((url) => url.includes(`warehouseId=${KEHL.id}`))).toBe(true);
      // Seçilmeyen tesis hiçbir isteğe yazılmaz — seçim bir tercih değil, KAYDIN bağlamıdır.
      expect(urls.some((url) => url.includes(`warehouseId=${STR.id}`))).toBe(false);
    });
  });

  /*
    KAPSAM BLOĞUNUN İKİ HÜKMÜ — kapsam GERÇEKTEN belirsizken (iki tesis).

    İkisi de eskiden tek tesisli fikstürle (`renderHub`) koşuyordu; artık koşamaz ve koşmaması
    DOĞRU: tek tesiste soru hiç sorulmuyor (01.09), üstelik o hâlde kapının `warehouse_required`
    demesi de imkânsız — adrese türetilmiş kimlik yazılıyor. Hükümler değişmedi, yalnız gerçekten
    doğabilecekleri kapsama taşındı.
  */
  const renderTwoFacilityAmbiguous = async (sections: OperationsSection[]) => {
    routeReplies({
      preparation: () => Promise.resolve(fail('warehouse_required', 400)),
      transfers: () => Promise.resolve(fail('warehouse_required', 400)),
      handover: () => Promise.resolve(fail('warehouse_required', 400)),
    });

    await render(
      <OperationsSessionProvider
        value={{
          sections,
          userName: 'Ayşe K.',
          userEmail: 'ayse@lezzetanatolia.fr',
          warehouses: [STR, KEHL],
          resolvedWarehouseId: null,
        }}
      >
        <WarehouseHubScreen />
      </OperationsSessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('warehouse-scope-block')).toBeOnTheScreen());
  };

  it('tek bölümlü personelde çıkış yolu HİÇ doğmaz — gösterilecek kapı yok', async () => {
    await renderTwoFacilityAmbiguous(['warehouse']);

    for (const section of ['courier', 'management', 'money']) {
      expect(screen.queryByTestId(`warehouse-scope-to-${section}`)).toBeNull();
    }
  });

  it('kapı "hangi depo" diye sorarsa liste ÇİZİLMEZ — yanlış deponun işi gösterilmez', async () => {
    await renderTwoFacilityAmbiguous(['warehouse']);

    expect(screen.queryByTestId('warehouse-hub-list')).toBeNull();
  });

  it('TEK tesiste soru hiç sorulmaz — kapı sorsa bile (kullanıcı kararı 01.09)', async () => {
    /* Ölçülen saçmalık: tek satırlık bir liste ve üstünde "birden fazla depoda çalışıyorsun".
       `renderHub` kapsamı tek tesis (`[STR]`); blok artık hiç doğmuyor, hub kendi işini çiziyor. */
    routeReplies({});

    await renderHub();

    expect(screen.queryByTestId('warehouse-scope-block')).toBeNull();
    expect(screen.getByTestId('warehouse-hub-picking')).toBeOnTheScreen();
  });

  /*
    ── YAZICI ŞERİDİ CİHAZIN HÂLİNİ SÖYLER (görsel ajanı farkı #4, 30.08) ─────
    Şerit "bu cihaz" diyor; tasarım oraya kurulumu yazıyor ("kutu etiketi QL-1110NWB · kargo
    etiketi tanımsız"), bizde ne işe yaradığını anlatan bir cümle vardı — ayarı açmadan hiçbir
    şey öğretmiyordu. Ölçülen üç hâl, üçü de tohumun kendi hâlleri (STR iki · KEHL tek · COLMAR
    hiç) ve dördüncüsü ölçüm düşüşü.
  */
  it('yazıcı şeridi AMAÇ BAŞINA yazıyor — tanımsız olan yarım ayrıca söylenir', async () => {
    routeReplies({
      printers: () =>
        Promise.resolve(
          ok({
            printers: [
              // Kimlik GERÇEK bir uuid: şema `z.string().uuid()` istiyor ve "p1" gibi kısa bir
              // damga sessizce ayrıştırmayı düşürüyor — cevap boş gelmiş gibi görünüyordu.
              {
                id: '00000000-0000-4000-8000-000000000001',
                name: 'Masa · QL-1110',
                purpose: 'box',
                address: '10.0.0.1',
                model: 'QL-1110NWB',
                labelSize: 'DieCutW103H164',
              },
            ],
          }),
        ),
    });

    await renderHub();

    // Kutu yazıcısı VAR, kargo YOK: sayı ("1 yazıcı") bu bilgiyi taşımazdı — depocunun sorusu
    // "kaç tane" değil, "kargo etiketi basabilir miyim".
    // Düzenli ifade: bu kurulumda `toHaveTextContent` dizgeyi TAM eşleştiriyor, alt dize aramıyor.
    expect(screen.getByTestId('warehouse-hub-printers-state')).toHaveTextContent(/QL-1110NWB/);
    expect(screen.getByTestId('warehouse-hub-printers-state')).toHaveTextContent(/tanımsız/);
  });

  it('yazıcı okuması DÜŞERSE açıklamaya düşer — "tanımsız" YAZMAZ', async () => {
    routeReplies({ printers: () => Promise.resolve(fail('server_error', 500)) });

    await renderHub();

    /* Ölçülemeyen ile tanımsız AYRI (CLAUDE §1): okuma düştüğünde "tanımsız" yazmak, kurulmamış
       bir yazıcıyı kurulmuş gibi değil, KURULUMU BİLİNMEYEN cihazı bilinir gibi gösterirdi. */
    expect(screen.getByTestId('warehouse-hub-printers-state')).not.toHaveTextContent(/tanımsız/);
  });
});
