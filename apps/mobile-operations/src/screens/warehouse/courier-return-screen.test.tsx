import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { CourierReturnScreen } from './courier-return-screen';
import { resetWarehouseStatus } from './warehouse-status';

/*
  D6 ekran testi: rampa listesi, üç akıbet ve adetlerin akıbetlere ayrılması, "stoğa dön"ün zorunlu notu, araçta kalanın
  kabul edilmemesi ve para alanlarının depocuya gösterilmemesi; tek dokunuş önce akıbeti, sonra mal devrini yazar.
*/

/* Bildirimler kökteki tek `ToastHost`a gider; test o yüzden basılan metni ölçer. */
const mockToast = jest.fn<void, [string]>();
jest.mock('@lezzet/mobile-kit/src/lib/toast/toast-store', () => ({
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
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
    },
  }),
}));

const COURIER_ID = '00000000-0000-4000-8000-0000000000c1';
const ORDER_ID = '00000000-0000-4000-8000-000000000401';
const ITEM_ID = '00000000-0000-4000-8000-000000000411';
const VARIANT_ID = '00000000-0000-4000-8000-000000000511';

const CARD = {
  courierId: COURIER_ID,
  courierName: 'Marc Lemoine',
  vehicleLabel: '67 LZT 01 · Frigo kamyonet',
  pendingLines: 1,
  boxesDownCount: 2,
  boxesStayCount: 9,
  freeGoodsQty: 5,
  drivingRuns: 0,
  lastReturnAt: '2026-09-04T16:20:00.000Z',
};

const DETAIL = {
  courierId: COURIER_ID,
  courierName: 'Marc Lemoine',
  vehicleLabel: '67 LZT 01 · Frigo kamyonet',
  vehicleWarehouseId: '00000000-0000-4000-8000-0000000000v1'.replace('v', 'a'),
  drivingRuns: 0,
  freeGoods: [
    { variantId: VARIANT_ID, name: 'Cevizli Baklava', variantLabel: '450 g', imageUrl: null, onVanQty: 5 },
  ],
  boxesDown: [
    { orderId: ORDER_ID, referenceNo: 'LA-26-9Q2B', customerName: 'Bistrot Lentz', boxes: [{ boxNo: 1, code: 'KUTU-1' }] },
  ],
  boxesStay: [
    {
      orderId: '00000000-0000-4000-8000-000000000402',
      referenceNo: 'LA-26-7T4D',
      customerName: 'Épicerie Ravanelli',
      boxes: [{ boxNo: 1, code: 'KUTU-2' }],
      reason: 'unreachable' as const,
      // Ulaşılamayan durak KAPANMIŞ bir seferin: kimliği var ama satır onu YAZMAMALI.
      runReferenceNo: 'SF-26-9RTMJM',
    },
    {
      orderId: '00000000-0000-4000-8000-000000000403',
      referenceNo: 'LA-26-CM44',
      customerName: 'Colmar dükkânı',
      boxes: [{ boxNo: 1, code: 'KUTU-3' }, { boxNo: 2, code: 'KUTU-4' }],
      reason: 'other_run' as const,
      runReferenceNo: 'SF-26-CM4417',
    },
  ],
  drops: [
    {
      orderId: ORDER_ID,
      referenceNo: 'LA-26-9Q2B',
      courierId: COURIER_ID,
      courierName: 'Marc Lemoine',
      note: 'kapıda reddetti — koku şüphesi',
      returnedAt: '2026-09-04T16:20:00.000Z',
      lines: [{ orderItemId: ITEM_ID, name: 'Su Böreği (500 g)', fulfilledQty: 2, pendingQty: 2, returns: [] }],
    },
  ],
};

const ADJUST_OK = {
  status: 'ok',
  restockedQty: 2,
  discardedQty: 0,
  releasedQty: 2,
  refundedAmountCents: 1800,
  paymentStatus: 'refunded',
  amountToCollectCents: 0,
};

const ACCEPT_OK = { status: 'ok', transferred: [{ variantId: VARIANT_ID, qty: 5 }], shortfalls: [], unloadedBoxes: 1 };

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

/**
 * Kapıları YOLA GÖRE karşılar: liste · detay · akıbet yazımı · kabul. Tek bir "her isteğe aynı
 * cevap" kalıbı bu ekranda çalışmaz — tek dokunuş iki AYRI uca yazıyor ve testin ölçtüğü şey tam
 * olarak hangisine ne gittiği.
 */
function withGates(options: { couriers?: unknown[]; detail?: unknown; adjust?: unknown; accept?: unknown } = {}) {
  fetchMock.mockImplementation((input, init) => {
    const url = String(input);
    if (init?.method === 'POST') {
      return Promise.resolve(ok(url.includes('/courier-return/') ? (options.accept ?? ACCEPT_OK) : (options.adjust ?? ADJUST_OK)));
    }
    if (/\/courier-return\/[^/?]+/.test(url)) return Promise.resolve(ok(options.detail ?? DETAIL));
    return Promise.resolve(ok({ couriers: options.couriers ?? [CARD] }));
  });
}

/** Gövdesi okunan son POST — hangi uca gittiğiyle birlikte. */
function lastPost(match: string) {
  const call = fetchMock.mock.calls.findLast((entry) => entry[1]?.method === 'POST' && String(entry[0]).includes(match));
  return JSON.parse(String(call?.[1]?.body ?? '{}'));
}

/** Listeden bir kuryenin detayına gir — ekranın gerçek yolu (kart → detay). */
async function openCourier(courierId: string = COURIER_ID) {
  await fireEvent.press(await screen.findByTestId(`warehouse-return-courier-${courierId}`));
  await screen.findByTestId(`warehouse-return-line-${ITEM_ID}`);
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockToast.mockReset();
  mockBack.mockReset();
  resetWarehouseStatus();
});

describe('D6 · rampa listesi', () => {
  /* Liste kurye eksenlidir: aynı gün iki kurye dönebilir, ekran tek kuryeyle açılsaydı ikincisine cevap veremezdi. */
  it('kartta İŞ ve ARAÇTAKİLER ayrı satırda, plaka künyede', async () => {
    withGates();

    await render(<CourierReturnScreen />);

    expect(await screen.findByTestId(`warehouse-return-work-${COURIER_ID}`)).toHaveTextContent(
      '1 kalem akıbet bekliyor · 2 kutu inecek',
    );
    expect(screen.getByText('araçta 5 adet serbest ürün · 9 kutu kalacak')).toBeOnTheScreen();
    expect(screen.getByText('67 LZT 01 · Frigo kamyonet')).toBeOnTheScreen();
  });

  /* SÜRÜLEN SEFER DEPOCUNUN KARARINA GİRER: aracı bugün boşalmayacak kuryeden malın tamamını
     devralmak yanlış olur. Sıfırsa cümle HİÇ kurulmaz — "0 sefer sürülüyor" bilgi değil gürültü. */
  it('sürülen sefer varsa uyarı yazılır, yoksa cümle hiç kurulmaz', async () => {
    withGates({ couriers: [{ ...CARD, drivingRuns: 1 }] });

    await render(<CourierReturnScreen />);

    expect(await screen.findByTestId(`warehouse-return-driving-${COURIER_ID}`)).toHaveTextContent(
      '1 sefer sürülüyor — araç bugün boşalmayabilir',
    );
  });

  it('sefer sürülmüyorsa uyarı YOK', async () => {
    withGates();

    await render(<CourierReturnScreen />);
    await screen.findByTestId(`warehouse-return-courier-${COURIER_ID}`);

    expect(screen.queryByTestId(`warehouse-return-driving-${COURIER_ID}`)).toBeNull();
  });

  /* KURYESİZ DÖNÜŞ (kargo/tezgâh yolu) kendi kümesinde: kuryesi olmayan sipariş de akıbet bekler
     ama aracı ve kutusu yoktur. Adres parçası `unassigned` — kimliği `null` olduğu için. */
  it('kuryesiz dönüşler ayrı kümede ve sebebini yazar', async () => {
    withGates({
      couriers: [
        { ...CARD, courierId: null, courierName: null, vehicleLabel: null, boxesDownCount: 0, boxesStayCount: 0, freeGoodsQty: 0, pendingLines: 2 },
      ],
    });

    await render(<CourierReturnScreen />);

    expect(await screen.findByTestId('warehouse-return-courier-unassigned')).toHaveTextContent(
      /kuryeye hiç atanmamış/,
    );
    expect(screen.getByText('KURYE ATANMAMIŞ')).toBeOnTheScreen();
  });

  it('boş rampa nereden dolacağını söyler', async () => {
    withGates({ couriers: [] });

    await render(<CourierReturnScreen />);

    expect(await screen.findByTestId('warehouse-return-empty')).toHaveTextContent(/Rampada bekleyen kurye yok/);
  });

  /* Geri: DETAYDAN LİSTEYE, hub'a DEĞİL. D5'te ölçülen kusurun aynısı burada da doğardı. */
  it('detaydan geri LİSTEYE döner, kabuğa değil', async () => {
    withGates();

    await render(<CourierReturnScreen />);
    await openCourier();
    await fireEvent.press(screen.getByLabelText('Geri'));

    expect(await screen.findByTestId(`warehouse-return-courier-${COURIER_ID}`)).toBeOnTheScreen();
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe('D6 · kurye dönüşü kabulü', () => {
  /* Üç akıbetin bedeli seçimden önce, düğmelerin altında her zaman yazılı: depocu partinin düşeceğini seçmeden öğrenmeli. */
  it('üç akıbetin bedeli SEÇİMDEN ÖNCE yazılı — imhanın partiyi düşürdüğü dahil', async () => {
    withGates();

    await render(<CourierReturnScreen />);
    await openCourier();

    const hint = screen.getByTestId(`warehouse-return-hint-${ITEM_ID}`);
    expect(hint).toHaveTextContent(/Stoğa dön: sebep notu zorunlu/);
    expect(hint).toHaveTextContent(/İmha: parti düşer/);
    expect(hint).toHaveTextContent(/Jest: mal müşteride kaldı/);
  });

  it('akıbet işaretlenmeden CTA kapalıdır', async () => {
    withGates();

    await render(<CourierReturnScreen />);
    await openCourier();

    expect(screen.getByTestId('warehouse-return-cta')).toHaveTextContent(/akıbet işaretle/);
    expect(screen.getByTestId('warehouse-return-cta')).toBeDisabled();
  });

  it('"stoğa dön" NOT ister — not boşken CTA açılmaz', async () => {
    withGates();

    await render(<CourierReturnScreen />);
    await openCourier();
    await fireEvent.press(screen.getByTestId(`warehouse-return-restock-${ITEM_ID}`));

    expect(screen.getByTestId(`warehouse-return-note-block-${ITEM_ID}`)).toBeOnTheScreen();
    expect(screen.getByTestId('warehouse-return-cta')).toBeDisabled();

    await fireEvent.changeText(screen.getByTestId(`warehouse-return-note-${ITEM_ID}`), 'soğuk zincir kesintisiz');
    expect(screen.getByTestId('warehouse-return-cta')).not.toBeDisabled();
  });

  it('imha HEDEF değeri sıfırlar ve not istemez', async () => {
    withGates();

    await render(<CourierReturnScreen />);
    await openCourier();
    await fireEvent.press(screen.getByTestId(`warehouse-return-discard-${ITEM_ID}`));
    await fireEvent.press(screen.getByTestId('warehouse-return-cta'));

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(lastPost(`/returns/${ORDER_ID}`).adjustments).toEqual([
      { orderItemId: ITEM_ID, fulfilledQty: 0, returnDisposition: 'discard', note: null },
    ]);
  });

  it('jestte adet KORUNUR — mal müşteride kaldı, yalnız kayıt düşer', async () => {
    withGates();

    await render(<CourierReturnScreen />);
    await openCourier();
    await fireEvent.press(screen.getByTestId(`warehouse-return-goodwill-${ITEM_ID}`));
    await fireEvent.press(screen.getByTestId('warehouse-return-cta'));

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(lastPost(`/returns/${ORDER_ID}`).adjustments[0]).toMatchObject({ fulfilledQty: 2, goodwillQty: 2 });
  });

  it('adetler ayrı işaretlenince tek istek iki payı sıralı taşır; toplam tutmadan CTA kapalı', async () => {
    withGates();

    await render(<CourierReturnScreen />);
    await openCourier();
    await fireEvent.press(screen.getByTestId(`warehouse-return-split-toggle-${ITEM_ID}`));
    await fireEvent.press(screen.getByTestId(`warehouse-return-split-discard-${ITEM_ID}`));
    await fireEvent.press(screen.getByTestId('warehouse-return-split-sheet-ruler-1'));
    await fireEvent.press(screen.getByTestId('warehouse-return-split-sheet-confirm'));

    expect(screen.getByTestId(`warehouse-return-split-summary-${ITEM_ID}`)).toHaveTextContent('1 / 2 adet işaretlendi');
    expect(screen.getByTestId('warehouse-return-cta')).toBeDisabled();

    await fireEvent.press(screen.getByTestId(`warehouse-return-split-restock-${ITEM_ID}`));
    await fireEvent.press(screen.getByTestId('warehouse-return-split-sheet-ruler-1'));
    await fireEvent.press(screen.getByTestId('warehouse-return-split-sheet-confirm'));
    await fireEvent.changeText(screen.getByTestId(`warehouse-return-note-${ITEM_ID}`), 'ambalaj sağlam');
    await fireEvent.press(screen.getByTestId('warehouse-return-cta'));

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(lastPost(`/returns/${ORDER_ID}`).adjustments).toEqual([
      { orderItemId: ITEM_ID, fulfilledQty: 1, returnDisposition: 'restock', note: 'ambalaj sağlam' },
      { orderItemId: ITEM_ID, fulfilledQty: 0, returnDisposition: 'discard', note: 'ambalaj sağlam' },
    ]);
  });

  /*
    TEK DOKUNUŞ, İKİ YAZIM — akıbet siparişe, mal devri kuryeye. Devir isteği sayılan adedi taşır
    ve kutu beklenenle (araçta kayıtlı) dolu açıldığı için normal günde o sayı beklenenin aynısıdır.
  */
  it('CTA hem akıbeti hem MAL DEVRİNİ yazar; devir sayılan adedi taşır', async () => {
    withGates();

    await render(<CourierReturnScreen />);
    await openCourier();
    await fireEvent.press(screen.getByTestId(`warehouse-return-discard-${ITEM_ID}`));
    await fireEvent.press(screen.getByTestId('warehouse-return-cta'));

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(lastPost(`/courier-return/${COURIER_ID}`)).toEqual({
      freeGoods: [{ variantId: VARIANT_ID, returnedQty: 5 }],
    });
    expect(mockToast.mock.calls.some(([m]) => /1 kutu indi, 5 adet depoya devredildi/.test(m))).toBe(true);
  });

  /* EKSİK SAYIM SESSİZ DEĞİL: fark araç deposunda açık kalır ve sayım/düşüm kapatır. */
  it('eksik dönen mal SÖYLENİR — sessizce yutulmaz', async () => {
    withGates({
      accept: { status: 'ok', transferred: [{ variantId: VARIANT_ID, qty: 3 }], shortfalls: [{ variantId: VARIANT_ID, expectedQty: 5, returnedQty: 3 }], unloadedBoxes: 1 },
    });

    await render(<CourierReturnScreen />);
    await openCourier();
    await fireEvent.press(screen.getByTestId(`warehouse-return-discard-${ITEM_ID}`));
    await fireEvent.press(screen.getByTestId('warehouse-return-cta'));

    await waitFor(() => expect(mockToast.mock.calls.some(([m]) => /araçta açık kaldı/.test(m))).toBe(true));
  });

  it('beklenenden fazlası kapıda REDDEDİLİR ve sebebi yazılır', async () => {
    withGates({ accept: { status: 'not_enough', variantId: VARIANT_ID, available: 5 } });

    await render(<CourierReturnScreen />);
    await openCourier();
    await fireEvent.press(screen.getByTestId(`warehouse-return-discard-${ITEM_ID}`));
    await fireEvent.press(screen.getByTestId('warehouse-return-cta'));

    await waitFor(() =>
      expect(mockToast.mock.calls.some(([m]) => /Araçta o kadar mal kayıtlı değil \(5 adet\)/.test(m))).toBe(true),
    );
  });

  it('para alanları depocuya GÖSTERİLMEZ; `refundBlocked` ise SÖYLENİR', async () => {
    withGates({ adjust: { ...ADJUST_OK, paymentStatus: 'paid', refundBlocked: 'provider_unavailable' } });

    await render(<CourierReturnScreen />);
    await openCourier();
    await fireEvent.press(screen.getByTestId(`warehouse-return-discard-${ITEM_ID}`));
    await fireEvent.press(screen.getByTestId('warehouse-return-cta'));

    await waitFor(() => expect(mockToast.mock.calls.some(([m]) => /sağlayıcısı bağlı değil/.test(m))).toBe(true));
    expect(screen.queryByText(/18,00/)).toBeNull();
    expect(screen.queryByText(/€/)).toBeNull();
  });

  /* ARAÇTA KALAN yalnız LİSTELENİR: dokunulabilir çizmek olmayan bir eylemi varmış gibi
     göstermek olurdu (v2:505 · v3:14). */
  it('araçta kalan kutu sebebiyle yazılır ama kabul edilmez', async () => {
    withGates();

    await render(<CourierReturnScreen />);
    await openCourier();

    const stay = screen.getByTestId('warehouse-return-box-stay-00000000-0000-4000-8000-000000000402');
    expect(stay).toHaveTextContent(/1 kutu · ulaşılamadı — araçta kalır/);
    /* Kimlik sebebe göre: ulaşılamayan kutu bir müşterinindir ve depocu onu siparişle ayırır; sefer kodu yalnız "başka
       seferin yükü" satırında ayırt edicidir. */
    expect(stay).toHaveTextContent(/Épicerie Ravanelli · LA-26-7T4D/);
    expect(screen.queryByTestId('warehouse-return-restock-00000000-0000-4000-8000-000000000402')).toBeNull();

    // BAŞKA SEFERİN yükünde ayırt edici olan SEFER — orada sefer kodu doğru cevap.
    expect(screen.getByTestId('warehouse-return-box-stay-00000000-0000-4000-8000-000000000403')).toHaveTextContent(
      /SF-26-CM4417/,
    );
  });

  /* Akıbeti yazılmış adet seçici çizmez: ikinci kez gönderilen `restock` stoğa iki kez yazardı. */
  it('akıbeti yazılmış satır SALT-OKUNUR — çip yok, sonuç adetleriyle yazılı', async () => {
    withGates({
      detail: {
        ...DETAIL,
        drops: [
          {
            ...DETAIL.drops[0],
            lines: [
              {
                ...DETAIL.drops[0]!.lines[0],
                pendingQty: 0,
                returns: [
                  { qty: 1, disposition: 'restock', note: 'soğuk zincir kesintisiz' },
                  { qty: 1, disposition: 'discard', note: null },
                ],
              },
            ],
          },
        ],
      },
    });

    await render(<CourierReturnScreen />);
    await fireEvent.press(await screen.findByTestId(`warehouse-return-courier-${COURIER_ID}`));

    expect(await screen.findByTestId(`warehouse-return-written-${ITEM_ID}`)).toHaveTextContent(
      'akıbeti yazıldı: 1 Stoğa dön · 1 İmha',
    );
    expect(screen.queryByTestId(`warehouse-return-restock-${ITEM_ID}`)).toBeNull();
    // Beyan geri okunur: görünmezse zorunlu not bir form töreni olurdu.
    expect(screen.getByTestId(`warehouse-return-written-note-${ITEM_ID}`)).toHaveTextContent(
      /soğuk zincir kesintisiz/,
    );
  });

  /* Sürülen seferde devir durur: araç bugün boşalmıyor ve dolu açılan sayaç yola çıkacak kuryenin malını elinden alırdı. */
  it('sürülen seferde sayaç SIFIRDAN açılır ve sebebi yazılır', async () => {
    withGates({ detail: { ...DETAIL, drivingRuns: 1 } });

    await render(<CourierReturnScreen />);
    await openCourier();

    expect(screen.getByTestId('warehouse-return-driving-hold')).toHaveTextContent(/araçta kalan mal devredilmez/);
    expect(screen.getByTestId(`warehouse-return-qty-${VARIANT_ID}-value`)).toHaveTextContent('0');
    // Özet de sıfırı söyler: "araçta kayıtlı 5 · sayılan 0".
    expect(screen.getByTestId('warehouse-return-free-summary')).toHaveTextContent(/araçta kayıtlı 5 · sayılan 0/);
  });

  /* Bayat ekran kapıda durur: adetler başka kayıtla yazılmışsa kapı hiçbir satır yazmadan reddeder ve ekran tazelenir. */
  it('`already_marked` reddi adıyla söylenir ve ekran tazelenir', async () => {
    withGates({ adjust: { status: 'already_marked', orderItemId: ITEM_ID } });

    await render(<CourierReturnScreen />);
    await openCourier();
    await fireEvent.press(screen.getByTestId(`warehouse-return-discard-${ITEM_ID}`));
    await fireEvent.press(screen.getByTestId('warehouse-return-cta'));

    await waitFor(() =>
      expect(mockToast.mock.calls.some(([m]) => /başka bir kayıtla yazılmış/.test(m))).toBe(true),
    );
    // Ekran DETAYDA kalır (listeye kaçmaz) ve detayı yeniden okur — bayat satırlar tazelensin.
    expect(screen.getByTestId(`warehouse-return-line-${ITEM_ID}`)).toBeOnTheScreen();
    const detayCagrisi = fetchMock.mock.calls.filter(
      (c) => /\/courier-return\/[^/?]+/.test(String(c[0])) && c[1]?.method !== 'POST',
    );
    expect(detayCagrisi.length).toBeGreaterThan(1);
  });

  it('`stale` YUTULMAZ: sipariş artık düzeltilemez cümlesi ekranda', async () => {
    withGates({ adjust: { status: 'stale', currentStatus: 'cancelled' } });

    await render(<CourierReturnScreen />);
    await openCourier();
    await fireEvent.press(screen.getByTestId(`warehouse-return-discard-${ITEM_ID}`));
    await fireEvent.press(screen.getByTestId('warehouse-return-cta'));

    await waitFor(() =>
      expect(mockToast.mock.calls.some(([m]) => /artık bu durumda düzeltilemez/.test(m))).toBe(true),
    );
  });
});
