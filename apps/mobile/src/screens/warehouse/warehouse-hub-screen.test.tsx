import { render, screen, waitFor } from '@testing-library/react-native';

import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import { inboundTransfer, preparationOrder } from './warehouse-fixture';
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
}) {
  fetchMock.mockImplementation((url) => {
    const path = String(url);
    if (path.includes('/preparation')) return (replies.preparation ?? (() => Promise.resolve(ok({ date: null, orders: [] }))))();
    // Devir sayacı KENDİ ucundan geliyor (07.12): bekleyen kutuları hiçbir liste taşımıyor,
    // çünkü duyurulmuş siparişin kutuları hazırlık kuyruğundan çoktan düşmüştür.
    if (path.includes('/handover/pending')) return (replies.handover ?? (() => Promise.resolve(ok({ boxes: 0 }))))();
    return (replies.transfers ?? (() => Promise.resolve(ok({ transfers: [] }))))();
  });
}

async function renderHub() {
  await render(
    <OperationsSessionProvider
      value={{ sections: ['warehouse'], userName: 'Ayşe K.', userEmail: 'ayse@lezzetanatolia.fr' }}
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
    routeReplies({ transfers: () => Promise.resolve(ok({ transfers: [inboundTransfer()] })) });

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
    routeReplies({ preparation: offline, transfers: () => Promise.resolve(ok({ transfers: [] })) });

    await renderHub();

    expect(screen.queryByTestId('warehouse-hub-offline')).toBeNull();
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
        value={{ sections: ['warehouse', 'money'], userName: 'Ayşe D.', userEmail: 'ayse@lezzetanatolia.fr' }}
      >
        <WarehouseHubScreen />
      </OperationsSessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('warehouse-scope-block')).toBeOnTheScreen());

    expect(screen.getByTestId('warehouse-scope-to-money')).toHaveTextContent(/Para bölümüne geç/);
    // Kendi bölümüne çıkış verilmez: zaten oradayız ve kapalı.
    expect(screen.queryByTestId('warehouse-scope-to-warehouse')).toBeNull();
    // Kararın kendisi yazılı: depo SEÇTİRİLMİYOR.
    expect(screen.getByTestId('operations-section-warehouse')).toHaveTextContent(/Depo seçtirme bilinçli olarak yoktur/);
  });

  it('tek bölümlü personelde çıkış yolu HİÇ doğmaz — gösterilecek kapı yok', async () => {
    routeReplies({
      preparation: () => Promise.resolve(fail('warehouse_required', 400)),
      transfers: () => Promise.resolve(fail('warehouse_required', 400)),
      handover: () => Promise.resolve(fail('warehouse_required', 400)),
    });

    await renderHub();

    expect(screen.getByTestId('warehouse-scope-block')).toBeOnTheScreen();
    for (const section of ['courier', 'management', 'money']) {
      expect(screen.queryByTestId(`warehouse-scope-to-${section}`)).toBeNull();
    }
  });

  it('kapı "hangi depo" diye sorarsa liste ÇİZİLMEZ — yanlış deponun işi gösterilmez', async () => {
    routeReplies({
      preparation: () => Promise.resolve(fail('warehouse_required', 400)),
      transfers: () => Promise.resolve(fail('warehouse_required', 400)),
      handover: () => Promise.resolve(fail('warehouse_required', 400)),
    });

    await renderHub();

    expect(screen.getByTestId('warehouse-scope-block')).toBeOnTheScreen();
    expect(screen.queryByTestId('warehouse-hub-list')).toBeNull();
  });
});
