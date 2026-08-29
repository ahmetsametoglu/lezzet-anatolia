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
  it('altı iş satırı da çizilir — sayacı olmayanlar dahil', async () => {
    routeReplies({});

    await renderHub();

    for (const key of ['picking', 'intake', 'near-expiry', 'adjustment', 'transfer', 'return']) {
      expect(screen.getByTestId(`warehouse-hub-${key}`)).toBeOnTheScreen();
    }
  });

  it('sayaçlar LİSTEDEN sayılır — yarım sipariş ayrıca söylenir', async () => {
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
      transfers: () => Promise.resolve(ok({ transfers: [inboundTransfer()] })),
    });

    await renderHub();

    expect(screen.getByTestId('warehouse-hub-picking-badge')).toHaveTextContent('2');
    expect(screen.getByTestId('warehouse-hub-picking')).toHaveTextContent(/2 sipariş bekliyor · 1 yarım/);
    expect(screen.getByTestId('warehouse-hub-transfer')).toHaveTextContent(/TRF-COL-26-0007 yolda/);
  });

  /*
    KARGO DEVRİ SAYACI (07.12 · tasarım §8.6) — hub'ın "listeden say" kuralının TEK istisnası.

    Bekleyen kutuları hiçbir liste taşımıyor: duyurulmuş bir siparişin kutuları hazırlık
    kuyruğundan düşmüştür ve gelen transferlerle ilgisi yok. Sayaç bu yüzden kendi ucundan geliyor.
  */
  it('devir satırı KENDİ ucundan sayıyor — rozet ve cümle birlikte', async () => {
    routeReplies({ handover: () => Promise.resolve(ok({ boxes: 4 })) });

    await renderHub();

    expect(screen.getByTestId('warehouse-hub-handover-badge')).toHaveTextContent('4');
    expect(screen.getByTestId('warehouse-hub-handover')).toHaveTextContent(/4 kutu taşıyıcıyı bekliyor/);
  });

  it('devirde sıfır ile OKUNAMADI ayrı cümleler — "rampa boş" yanlış bir izdir', async () => {
    routeReplies({ handover: () => Promise.resolve(ok({ boxes: 0 })) });
    await renderHub();

    // Sıfırda rozet YOK: rozet bir işe çağrıdır, olmayan işe çağırmaz.
    expect(screen.queryByTestId('warehouse-hub-handover-badge')).toBeNull();
    // Alt metin küçük harfle: hub satırlarının deseni ("yolda transfer yok"), cümle değil etiket.
    expect(screen.getByTestId('warehouse-hub-handover')).toHaveTextContent(/rampa boş — bekleyen kutu yok/);
  });

  it('devir sayacı DÜŞERSE hub ayakta kalır — bir rozet, iki listeyi gizlemez', async () => {
    routeReplies({ handover: () => Promise.resolve(fail('server_error')) });

    await renderHub();

    // Sayaç bir rozettir: düşmesi hub'ı kullanılamaz yapmaz, yalnız o satırın rakamını söylemez.
    expect(screen.queryByTestId('warehouse-hub-error')).toBeNull();
    expect(screen.getByTestId('warehouse-hub-handover')).toHaveTextContent(/okunamadı/);
    expect(screen.getByTestId('warehouse-hub-picking')).toBeOnTheScreen();
  });

  it('boş liste "yok" der; OKUNAMAYAN liste "okunamadı" — ikisi ayrı şeydir', async () => {
    routeReplies({ preparation: () => Promise.resolve(fail('server_error')) });

    await renderHub();

    expect(screen.getByTestId('warehouse-hub-picking')).toHaveTextContent(/okunamadı/);
    expect(screen.queryByTestId('warehouse-hub-picking-badge')).toBeNull();
    // Öteki okuma ayakta: "yolda transfer yok" bir GERÇEKTİR, okunamamış değil.
    expect(screen.getByTestId('warehouse-hub-transfer')).toHaveTextContent(/yolda transfer yok/);
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
