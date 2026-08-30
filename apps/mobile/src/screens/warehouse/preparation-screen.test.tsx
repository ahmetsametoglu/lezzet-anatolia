import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { PreparationScreen } from './preparation-screen';
import { ITEM_A, ITEM_B, ORDER_ID, STOCK_A, STOCK_B, preparationLine, preparationOrder } from './warehouse-fixture';
import { resetWarehouseStatus } from './warehouse-status';

/*
  D1 EKRAN TESTİ — kuyruk/seçim, adet tavanı, "tamamı", eksik bildirimi, CTA'nın üç hâli, çıpalı
  kalem uyarısı ve kapının DÖRT cevabının ekrana çıkışı.

  En kritik iki iddia:
  · **gönderilen partiler motorun önerdiği partilerdir** — uydurulmuş bir `stockId`, geri çağırmanın
    dayandığı kaydı bozar;
  · **`pinned_violation` GÖSTERİLİR** — hiçbir şeyin yazılmadığını söyleyen tek cümle odur.

  23.6'DAN SONRA BU DOSYA ESKİ (KUTUSUZ) AKIŞI ÖLÇER: taze sipariş artık kutu moduyla açılıyor
  (`picking-box.test.tsx`), eski akış yalnız KUTUSUZ BAŞLANMIŞ işte yaşıyor — o yüzden onay/CTA
  testlerinin fikstürleri `pickedQty > 0` taşır (web masasından yarım gelmiş iş). Satır-düzeyi
  testler (tavan, çıpa) iki modda da aynı bileşeni kullandığından fikstürleri değişmedi.
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

/** Son POST'un gövdesi — "ne gönderdik" sorusunun tek dürüst cevabı. */
function lastPostBody(): { picks: { orderItemId: string; batches: { stockId: string; qty: number }[] }[] } {
  const call = fetchMock.mock.calls.findLast((entry) => entry[1]?.method === 'POST');
  return JSON.parse(String(call?.[1]?.body ?? '{}'));
}

function withQueue(orders: unknown[], confirm?: unknown) {
  fetchMock.mockImplementation((_url, init) => {
    if (init?.method === 'POST') {
      return Promise.resolve(ok(confirm ?? { status: 'ok', items: 1, ready: true, shortfalls: [] }));
    }
    return Promise.resolve(ok({ date: null, orders }));
  });
}

async function renderPicking() {
  await render(<PreparationScreen />);
  await waitFor(() => expect(screen.queryByTestId('warehouse-picking-loading')).toBeNull());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  resetWarehouseStatus();
});

describe('D1 · kuyruk', () => {
  it('sipariş yoksa boş durum çıkar — form açılmaz', async () => {
    withQueue([]);

    await renderPicking();

    expect(screen.getByTestId('warehouse-picking-empty')).toBeOnTheScreen();
    expect(screen.queryByTestId('warehouse-picking-cta')).toBeNull();
  });

  it('TEK sipariş doğrudan açılır (tasarımın hâli)', async () => {
    withQueue([preparationOrder()]);

    await renderPicking();

    expect(screen.getByTestId(`warehouse-picking-line-${ITEM_A}`)).toBeOnTheScreen();
  });

  it('İKİ sipariş varsa önce SEÇİM sorulur — hangi koli olduğu uydurulmaz', async () => {
    withQueue([preparationOrder(), preparationOrder({ orderId: '00000000-0000-4000-8000-000000000002' })]);

    await renderPicking();

    expect(screen.getByTestId('warehouse-picking-queue')).toBeOnTheScreen();
    expect(screen.queryByTestId(`warehouse-picking-line-${ITEM_A}`)).toBeNull();

    await fireEvent.press(screen.getByTestId(`warehouse-picking-order-${ORDER_ID}`));
    expect(screen.getByTestId(`warehouse-picking-line-${ITEM_A}`)).toBeOnTheScreen();
  });
});

/*
  KUYRUK SATIRI v3'e GEÇTİ (v3:256-320) — satır artık üç bilgi katmanı taşıyor: referans,
  künye (müşteri · kanal · kulvar) ve İLERLEME (çubuk + cümle). v2'de tek satırlık bir alt metin
  vardı ve "hangi işi açsam" sorusu ancak sipariş açılınca cevaplanıyordu.

  DURUM RENGİ İLE CÜMLE AYNI KURALI İZLER (`queueStateOf` künyesi): yarım → terracotta,
  tamam → zeytin, başlanmamış → gri. Şablonun beş örnek satırı kendi içinde tutarsızdı; çoğunluğun
  kuralı alındı ve seçim yazıldı.
*/
describe('D1 · kuyruk satırı (v3)', () => {
  const IKINCI = '00000000-0000-4000-8000-000000000002';

  it('satır üç katmanı da söyler: referans, künye, ilerleme', async () => {
    withQueue([
      preparationOrder({ referenceNo: 'LZA-BIR', customerName: 'Restaurant Bosphore', lineCount: 2, pickedLineCount: 1 }),
      preparationOrder({ orderId: IKINCI }),
    ]);

    await renderPicking();

    const row = screen.getByTestId(`warehouse-picking-order-${ORDER_ID}`);
    // Düzenli ifade, dizge DEĞİL: `toHaveTextContent` dizgeyi TAM eşleştiriyor ve satırın metni
    // üç katmanın birleşimi ("LZA-BIRRestaurant Bosphore · B2B…").
    expect(row).toHaveTextContent(/LZA-BIR/);
    expect(row).toHaveTextContent(/Restaurant Bosphore · B2B · kurye rotası/);
    // Yarım iş: "1/2 · yarım" — sayının yanında NE OLDUĞU da yazılı.
    expect(row).toHaveTextContent(/1\/2 · yarım/);
  });

  it('üç durum ÜÇ AYRI cümle: yarım · hazır · başlanmamış', async () => {
    withQueue([
      preparationOrder({ referenceNo: 'YARIM', lineCount: 2, pickedLineCount: 1 }),
      preparationOrder({ orderId: IKINCI, referenceNo: 'HAZIR', lineCount: 3, pickedLineCount: 3 }),
      preparationOrder({ orderId: '00000000-0000-4000-8000-000000000003', referenceNo: 'YENI', lineCount: 1, pickedLineCount: 0 }),
    ]);

    await renderPicking();

    expect(screen.getByTestId(`warehouse-picking-order-${ORDER_ID}`)).toHaveTextContent(/1\/2 · yarım/);
    expect(screen.getByTestId(`warehouse-picking-order-${IKINCI}`)).toHaveTextContent(/3\/3 hazır/);
    expect(screen.getByTestId('warehouse-picking-order-00000000-0000-4000-8000-000000000003')).toHaveTextContent(
      /0\/1 kalem/,
    );
  });

  /* KARGO rozeti bir SÜS DEĞİL: taşıyıcı kulvarında kutu TİPİ sorulacak (07.12) ve depocu bunu
     listeyi açmadan bilmeli — yanlış kutuyla başlanan hazırlık geri alınmaz. */
  it('KARGO rozeti YALNIZ taşıyıcı kulvarında çizilir', async () => {
    withQueue([
      preparationOrder({ deliveryType: 'shipping' }),
      preparationOrder({ orderId: IKINCI, deliveryType: 'route' }),
    ]);

    await renderPicking();

    expect(screen.getByTestId(`warehouse-picking-order-${ORDER_ID}-shipping`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`warehouse-picking-order-${IKINCI}-shipping`)).toBeNull();
    expect(screen.getByTestId(`warehouse-picking-order-${ORDER_ID}`)).toHaveTextContent(/taşıyıcı/);
  });

  it('başlık KUYRUĞU anlatır: kaç iş, kaçı yarım', async () => {
    withQueue([
      preparationOrder({ lineCount: 2, pickedLineCount: 1 }),
      preparationOrder({ orderId: IKINCI }),
    ]);

    await renderPicking();

    expect(screen.getByTestId('warehouse-picking-header')).toHaveTextContent(/2 sipariş bekliyor · 1 yarım/);
  });
});

/*
  HAZIRLIK KÂĞIDININ QR'I (10.1) — masada basılan kâğıt buradan telefona bağlanıyor.

  Kâğıdın rolü 25.08'de değişti: artık doldurulmuyor, OKUTULUYOR (`design/KARARLAR.md`). Depocu
  kâğıdı alıyor, sağ üstteki karekodu okutuyor ve sipariş burada açılıyor. Zincirin bu ucu
  kırılırsa kâğıdın üstündeki üç adımlık talimat yalan söyler — ve arıza sessizdir: okutma bir şey
  yapmaz, depocu kamerayı suçlar.
*/
describe('D1 · kuyruk okutması (hazırlık kâğıdı)', () => {
  /**
   * İki sipariş, İKİ FARKLI KALEM: kuyruk dalının açılması için ikisi şart (tek sipariş doğrudan
   * açılıyor), farklı kalem ise iddianın kendisi — "bir sipariş açıldı" ile "DOĞRU sipariş açıldı"
   * ancak böyle ayrılır. Aynı kalemle iki fikstürde her iki okutma da testi geçerdi.
   */
  const ikiSiparis = () => [
    preparationOrder(),
    preparationOrder({
      orderId: '00000000-0000-4000-8000-000000000002',
      referenceNo: 'LZA-26-9XQ2',
      lines: [preparationLine({ itemId: ITEM_B, productName: 'Şöbiyet', variantLabel: '500 g' })],
    }),
  ];

  it('okutulan REFERANS o siparişi açar', async () => {
    withQueue(ikiSiparis());
    await renderPicking();

    await fireEvent.press(screen.getByTestId('warehouse-picking-queue-scan'));
    // Simülasyon çipi kuyruğun kendi referansını taşıyor (`devCodes`) — kâğıdı okutmanın aynısı.
    await fireEvent.press(screen.getByLabelText('LZA-26-3M8C'));

    expect(screen.getByTestId(`warehouse-picking-line-${ITEM_A}`)).toBeOnTheScreen();
  });

  it('İKİNCİ referans İKİNCİ siparişi açar — kod hangi kâğıtsa o', async () => {
    withQueue(ikiSiparis());
    await renderPicking();

    await fireEvent.press(screen.getByTestId('warehouse-picking-queue-scan'));
    await fireEvent.press(screen.getByLabelText('LZA-26-9XQ2'));

    expect(screen.getByTestId(`warehouse-picking-line-${ITEM_B}`)).toBeOnTheScreen();
    // Asıl iddia: ÖTEKİ siparişin kalemi ekranda YOK. "Bir şey açıldı" yeterli değil.
    expect(screen.queryByTestId(`warehouse-picking-line-${ITEM_A}`)).toBeNull();
  });

  it('okutma listeyi GİZLEMEZ — kâğıtsız çalışan elle seçebilir', async () => {
    withQueue(ikiSiparis());
    await renderPicking();

    // Düğme listenin üstünde ama listenin yerine geçmiyor: kâğıt bir kolaylık, tek yol değil.
    expect(screen.getByTestId('warehouse-picking-queue-scan')).toBeOnTheScreen();
    expect(screen.getByTestId(`warehouse-picking-order-${ORDER_ID}`)).toBeOnTheScreen();
  });
});

describe('D1 · sayım', () => {
  it('CTA sayım bitmeden KAPALIDIR', async () => {
    withQueue([preparationOrder({ lines: [preparationLine({ pickedQty: 1 })] })]);

    await renderPicking();

    expect(screen.getByTestId('warehouse-picking-cta')).toHaveTextContent(/Kalem kalem say/);
    expect(screen.getByTestId('warehouse-picking-cta')).toBeDisabled();
  });

  it('"tamamı" motorun kapasitesine kadar doldurur ve CTA "Sipariş HAZIR"a döner', async () => {
    withQueue([preparationOrder({ lines: [preparationLine({ pickedQty: 1 })] })]);

    await renderPicking();
    await fireEvent.press(screen.getByTestId(`warehouse-picking-all-${ITEM_A}`));

    expect(screen.getByTestId(`warehouse-picking-qty-${ITEM_A}`).props.value).toBe('2');
    expect(screen.getByTestId('warehouse-picking-cta')).toHaveTextContent(/Sipariş HAZIR/);
  });

  it('adet MOTORUN kapasitesini aşamaz — rafta olmayan mal yazılamaz', async () => {
    withQueue([preparationOrder({ lines: [preparationLine({ orderedQty: 5, shortfallQty: 3 })] })]);

    await renderPicking();
    await fireEvent.changeText(screen.getByTestId(`warehouse-picking-qty-${ITEM_A}`), '5');

    // Öneri 2 adet taşıyor; 5 yazılsa da tavan 2'dir.
    expect(screen.getByTestId(`warehouse-picking-qty-${ITEM_A}`).props.value).toBe('2');
    expect(screen.getByTestId(`warehouse-picking-line-${ITEM_A}`)).toHaveTextContent(/raf eksiği: 3/);
  });

  it('"eksik bildir" CTA kapısını açar ama cümlesini DEĞİŞTİRİR — sipariş hazır olmaz', async () => {
    withQueue([preparationOrder({ lines: [preparationLine({ pickedQty: 1 })] })]);

    await renderPicking();
    await fireEvent.press(screen.getByTestId(`warehouse-picking-short-${ITEM_A}`));

    expect(screen.getByTestId('warehouse-picking-cta')).toHaveTextContent(/Hazırlanıyor/);
  });

  it('çıpalı kalem UYARIYI taşır — indirimli teklifin partisi bellidir', async () => {
    withQueue([preparationOrder({ lines: [preparationLine({ pinnedStockId: STOCK_A })] })]);

    await renderPicking();

    expect(screen.getByTestId(`warehouse-picking-pinned-${ITEM_A}`)).toBeOnTheScreen();
  });

  it('daha önce yazılmış adet SÖYLENİR — yeni kayıt onun yerine geçer', async () => {
    withQueue([preparationOrder({ lines: [preparationLine({ pickedQty: 1 })] })]);

    await renderPicking();

    expect(screen.getByTestId(`warehouse-picking-previous-${ITEM_A}`)).toHaveTextContent(/önceden 1 yazılmış/);
  });
});

describe('D1 · gönderim', () => {
  it('gönderilen partiler MOTORUN önerdiği partilerdir, sırasıyla', async () => {
    withQueue([
      preparationOrder({
        lines: [
          preparationLine({
            orderedQty: 3,
            pickedQty: 1,
            suggestion: [
              { stockId: STOCK_A, qty: 2, expiryDate: '2026-08-12', areaName: null },
              { stockId: STOCK_B, qty: 1, expiryDate: '2026-08-18', areaName: null },
            ],
          }),
        ],
      }),
    ]);

    await renderPicking();
    await fireEvent.press(screen.getByTestId(`warehouse-picking-all-${ITEM_A}`));
    await fireEvent.press(screen.getByTestId('warehouse-picking-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-picking-notice')).toBeOnTheScreen());
    expect(lastPostBody().picks).toEqual([
      { orderItemId: ITEM_A, batches: [{ stockId: STOCK_A, qty: 2 }, { stockId: STOCK_B, qty: 1 }] },
    ]);
  });

  it('yarım iş HATA DEĞİL: `ready:false` "sürüyor" der ve eksik tavsiyesi yazılır', async () => {
    withQueue([preparationOrder({ lines: [preparationLine({ pickedQty: 1 }), preparationLine({ itemId: ITEM_B })] })], {
      status: 'ok',
      items: 2,
      ready: false,
      shortfalls: [{ itemId: ITEM_B, suggestion: { action: 'ask_customer', reason: 'high_value', missingQty: 1 } }],
    });

    await renderPicking();
    await fireEvent.press(screen.getByTestId(`warehouse-picking-all-${ITEM_A}`));
    await fireEvent.press(screen.getByTestId(`warehouse-picking-all-${ITEM_B}`));
    await fireEvent.press(screen.getByTestId('warehouse-picking-cta'));

    await waitFor(() => expect(screen.getByTestId('warehouse-picking-notice')).toBeOnTheScreen());
    const notice = screen.getByTestId('warehouse-picking-notice');
    expect(notice).toHaveTextContent(/Hazırlanıyor.*sürüyor/);
    expect(notice).toHaveTextContent(/1 adet eksik — değerli kalem; öneri: müşteriye sorulsun/);
  });

  it('`pinned_violation` GÖSTERİLİR — hiçbir satır yazılmadı', async () => {
    withQueue([preparationOrder({ lines: [preparationLine({ pickedQty: 1 })] })], { status: 'pinned_violation', itemId: ITEM_A, requiredStockId: STOCK_B });

    await renderPicking();
    await fireEvent.press(screen.getByTestId(`warehouse-picking-all-${ITEM_A}`));
    await fireEvent.press(screen.getByTestId('warehouse-picking-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('warehouse-picking-notice')).toHaveTextContent(/çıpalı partiden verilmeli/),
    );
  });

  it('kapsam dışı sipariş 200 ile gelir ve EKRANDA görünür', async () => {
    withQueue([preparationOrder({ lines: [preparationLine({ pickedQty: 1 })] })], { status: 'forbidden', reason: 'out_of_scope' });

    await renderPicking();
    await fireEvent.press(screen.getByTestId(`warehouse-picking-all-${ITEM_A}`));
    await fireEvent.press(screen.getByTestId('warehouse-picking-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('warehouse-picking-notice')).toHaveTextContent(/başka deponun/),
    );
  });
});

/*
  KALEM SATIRI v3'e GEÇTİ (v3:373-410) — üç ekleme, üçü de zaten VAR OLAN veriyi ekrana çıkarıyor:

  · ADIM SATIRI: sıra numarası + rafın adı ("1 · A-1"). `suggestion[].areaName` sözleşmede vardı ve
    hiçbir ekranda çizilmiyordu (ölçüldü 30.08) — depocu rafı listede değil kafasında arıyordu.
  · MOTOR ÖNERİSİ rozeti: sayının nereden geldiğini söyler; önerisiz kalemde HİÇ doğmaz.
  · ÇEVRİMDIŞI SAYIM KİLİDİ: sayaç soluklaştırılmaz, yerine konan adet yazılır.
*/
describe('D1 · kalem satırı (v3)', () => {
  it('adım satırı sıra numarasını ve RAFI söyler', async () => {
    withQueue([preparationOrder()]);

    await renderPicking();

    expect(screen.getByTestId(`warehouse-picking-step-${ITEM_A}`)).toHaveTextContent(/1 · A-1/);
  });

  it('raf BİLİNMİYORSA uydurulmaz — yalnız sıra numarası yazılır', async () => {
    withQueue([
      preparationOrder({
        lines: [preparationLine({ suggestion: [{ stockId: STOCK_A, qty: 2, expiryDate: '2026-08-12', areaName: null }] })],
      }),
    ]);

    await renderPicking();

    const step = screen.getByTestId(`warehouse-picking-step-${ITEM_A}`);
    expect(step).toHaveTextContent(/1\. kalem/);
    expect(step).not.toHaveTextContent(/·/);
  });

  it('MOTOR ÖNERİSİ rozeti önerisi OLAN kalemde çizilir, olmayanda çizilmez', async () => {
    withQueue([
      preparationOrder({
        lines: [preparationLine(), preparationLine({ itemId: ITEM_B, suggestion: [] })],
      }),
    ]);

    await renderPicking();

    expect(screen.getByTestId(`warehouse-picking-line-${ITEM_A}`)).toHaveTextContent(/MOTOR ÖNERİSİ/);
    expect(screen.getByTestId(`warehouse-picking-line-${ITEM_B}`)).not.toHaveTextContent(/MOTOR ÖNERİSİ/);
  });

  /* Çevrimdışı bayrağı ancak ağa çıkan bir çağrı DÜŞÜNCE doğar; en doğal yol onay denemesidir —
     ağ yoksa hiçbir şey yazılmaz ve ekran kilide geçer. */
  it('ağ düşünce sayaç YERİNE konan adet yazılır — alan soluklaştırılmaz', async () => {
    fetchMock.mockImplementation((_url, init) => {
      if (init?.method === 'POST') return Promise.reject(new Error('network down'));
      return Promise.resolve(ok({ date: null, orders: [preparationOrder()] }));
    });

    await renderPicking();
    expect(screen.getByTestId(`warehouse-picking-qty-${ITEM_A}`)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId(`warehouse-picking-all-${ITEM_A}`));
    await fireEvent.press(screen.getByTestId('warehouse-picking-cta'));

    await waitFor(() => expect(screen.getByTestId(`warehouse-picking-locked-${ITEM_A}`)).toBeOnTheScreen());
    expect(screen.queryByTestId(`warehouse-picking-qty-${ITEM_A}`)).toBeNull();
    expect(screen.getByTestId(`warehouse-picking-locked-${ITEM_A}`)).toHaveTextContent(/sayım kapalı/);
  });
});

describe('D1 · koliye yazılacak ad (23.3 — mobil şeridin işareti)', () => {
  it('alıcı hesabın sahibinden FARKLIYSA yazılır; aynıysa satır hiç çizilmez', async () => {
    withQueue([preparationOrder({ recipientName: 'Claire Weber' })]);
    await renderPicking();

    expect(screen.getByTestId('warehouse-picking-parcel')).toHaveTextContent('Koliye: Claire Weber');
  });

  it('alıcı müşteriyle aynı kişiyse (boşluk/harf farkı dahil) tekrar yazılmaz', async () => {
    withQueue([preparationOrder({ recipientName: ' restaurant bosphore ' })]);
    await renderPicking();

    expect(screen.queryByTestId('warehouse-picking-parcel')).toBeNull();
  });
});

/*
  KARGODA KUTUSUZ ONAY REDDİ (28.08 · Faz 1.5) — ekranın ULAŞABİLDİĞİ bir hâl.

  Normalde kargo siparişi kutu moduyla açılıyor ve kutusuz CTA hiç çizilmiyor. Ama **web
  masasından yarım başlamış** bir kargo siparişi (kutusuz `pickedQty > 0`) kutu moduna GİRMİYOR
  (23.6'nın kalem düzeyinde karışım yasağı) ve o hâlde eski CTA çıkıyor. Kapı onu reddediyor;
  ekranın cevabı olmalı, yoksa depocu "hiçbir şey olmadı" sanır.
*/
describe('D1 · kargoda kutusuz onay', () => {
  it('kapı reddedince SEBEP yazılır — "hiçbir şey olmadı" sessizliği yok', async () => {
    withQueue(
      [preparationOrder({ deliveryType: 'shipping', lines: [preparationLine({ pickedQty: 1 })] })],
      { status: 'box_required' },
    );
    await renderPicking();

    await fireEvent.changeText(screen.getByTestId(`warehouse-picking-qty-${ITEM_A}`), '2');
    await fireEvent.press(screen.getByTestId('warehouse-picking-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('warehouse-picking-notice')).toHaveTextContent(/kutusuz kapatılamaz/),
    );
    // Çare de yazılıyor: "kutu aç, doldur, kapat" — ret bir çıkmaz değil bir yönlendirme.
    expect(screen.getByTestId('warehouse-picking-notice')).toHaveTextContent(/kutu aç/i);
  });
});
