import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { PrinterSetupScreen } from './printer-setup-screen';
import { resetWarehouseStatus } from './warehouse-status';

/*
  BU CİHAZ · YAZICILAR (07.12 · kullanıcı kararı 29.08 · v3 yerleşimi 30.08 · tanıtma 05.09).

  · iki İŞ ayrı KARTTA duruyor (ayrım fiziksel: 4×6 kutu etiketi ↔ taşıyıcının kargo etiketi)
  · kartın tepesindeki yazıcı basımın GERÇEK hedefidir: tek aday varsa seçim sorulmadan o
  · aday iki ve daha fazlaysa liste çizilir ve dokunuş seçimi CİHAZA yazar
  · seçili aday listede KALIR ve işaretlidir — cihazın kararı geri alınabilir olmalı
  · hedef yoksa kart uyarıya döner, bedeli yazar ve AĞDA BULUNANLARI listeler
  · ağdaki yazıcıya dokunmak onu bu depoya TANITIR; adres keşiften gider, kâğıt boyu HİÇ gitmez
  · envanterin adresi eskimişse seriden bulunup sessizce ONARILIR (kullanıcı sorusu 05.09)
  · liste alınamazsa cihazdaki seçim SİLİNMEZ

  ── AĞ KEŞFİ SAHTELENİYOR, BASIM SAHTELENMİYOR ──────────────────────────────
  `printer-availability` künyesi "testlerde yazıcı akışı KAPALI kalmalı" diyor ve o kural BASIM
  içindir: iğne deneyi fiziksel bir ölçümdür, sahte yazıcıyla "geçti" demek deneyi boşa çıkarır.
  Burada sahtelenen şey KEŞİF — yani listenin ne çizdiği ve dokunuşun sunucuya ne yazdığı. Hiçbir
  test "basıldı" demiyor; `printLabel` yalnız çağrılmadığını doğrulamak için duruyor.
*/

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), navigate: jest.fn() }) }));

const mockSession = { access_token: 'test-token' };
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
    },
  }),
}));

/** Cihaz deposu native — bellek içi sahte; okuma/yazma yolu gerçek kodda koşuyor. */
const mockStore = new Map<string, string>();
jest.mock('@/lib/storage/device-store', () => ({
  DEVICE_STORE_KEYS: { printerChoice: 'lezzet.printer.choice' },
  deviceStore: {
    getItem: async (key: string) => mockStore.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStore.set(key, value);
    },
    removeItem: async (key: string) => {
      mockStore.delete(key);
    },
  },
}));

const ag: { modul: boolean; bulunan: Array<{ address: string; modelName: string; serialNumber: string | null }> } = {
  modul: false,
  bulunan: [],
};
const mockPrintLabel = jest.fn();
jest.mock('@/lib/print/printer-availability', () => ({ hasPrinterNativeModule: () => ag.modul }));
jest.mock('@/lib/print/brother', () => ({
  findNetworkPrinters: async () => ag.bulunan,
  printLabel: (...args: unknown[]) => mockPrintLabel(...args),
}));

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

const KUTU_A = { id: '00000000-0000-4000-8000-0000000000a1', name: 'Masa · QL-1110', purpose: 'box', address: '10.0.0.1', serialNumber: 'E11111', model: 'QL-1110NWB', labelSize: 'DieCutW103H164' };
const KUTU_B = { id: '00000000-0000-4000-8000-0000000000a2', name: 'Depo · QL-1110', purpose: 'box', address: '10.0.0.2', serialNumber: 'E22222', model: 'QL-1110NWB', labelSize: 'DieCutW103H164' };
const KARGO = { id: '00000000-0000-4000-8000-0000000000b1', name: 'Rampa · QL-820', purpose: 'shipping', address: '10.0.0.9', serialNumber: 'E33333', model: 'QL-820NWB', labelSize: 'RollW62' };

const kanal = (address: string, modelName: string, serialNumber: string | null = null) => ({
  address,
  modelName,
  serialNumber,
});

const net: { printers: unknown[] } = { printers: [] };
/** POST'lar yakalanıyor: tanıtmanın ne YAZDIĞI bu testlerin asıl iddiası. */
const posts: Array<Record<string, unknown>> = [];

fetchMock.mockImplementation((_url, init) => {
  if (String(init?.method ?? 'GET') === 'POST') {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    posts.push(body);
    const printer = {
      id: '00000000-0000-4000-8000-0000000000ff',
      name: (body.name as string) ?? (body.model as string),
      purpose: body.purpose,
      address: body.address,
      serialNumber: body.serialNumber,
      model: body.model,
      labelSize: 'RollW62',
    };
    return Promise.resolve(ok({ status: 'ok', printer, created: true }));
  }
  return Promise.resolve(ok({ printers: net.printers }));
});

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockClear();
  mockPrintLabel.mockClear();
  resetWarehouseStatus();
  mockStore.clear();
  net.printers = [];
  posts.length = 0;
  ag.modul = false;
  ag.bulunan = [];
});

async function ekran() {
  await render(<PrinterSetupScreen />);
  await waitFor(() => expect(screen.queryByTestId('warehouse-printers-loading')).toBeNull());
}

describe('bu cihaz · yazıcılar', () => {
  it('iki iş iki KARTTA; tek aday varsa hedef sorulmadan o yazıcıdır ve seçenek listesi çizilmez', async () => {
    net.printers = [KUTU_A, KARGO];
    await ekran();

    // Kartın tepesi hedefi ADIYLA söylüyor — hangi makineye basıldığını bilmek, seçmek kadar önemli.
    expect(screen.getByTestId('warehouse-printers-target-box')).toHaveTextContent(KUTU_A.name);
    expect(screen.getByTestId('warehouse-printers-target-shipping')).toHaveTextContent(KARGO.name);
    // Seçenek yoksa soru da yok: liste bloğu hiç çizilmiyor, ekran susuyor.
    expect(screen.queryByTestId('warehouse-printers-options-box')).toBeNull();
    // Hedefi olan kartta test düğmesi var — kâğıt harcayan fiil yalnız hedefe bağlı.
    expect(screen.getByTestId(`warehouse-printers-test-${KUTU_A.id}`)).toBeOnTheScreen();
  });

  it('İKİ aday varsa liste çizilir ve dokunuş seçimi CİHAZA yazar', async () => {
    net.printers = [KUTU_A, KUTU_B, KARGO];
    await ekran();

    // İki aday + seçim yok = hedef YOK, yani kart TANIMSIZ ve listeyi çiziyor. Tek adaylı kargo
    // kartının hedefi var, o sessiz.
    expect(screen.getByTestId(`warehouse-printers-option-${KUTU_A.id}`)).toBeOnTheScreen();
    expect(screen.queryByTestId('warehouse-printers-options-shipping')).toBeNull();
    // İki adaydan birini yazılımın seçmesi, kâğıdın hangi odadan çıkacağına kodun karar vermesi
    // olurdu.
    expect(screen.getByTestId('warehouse-printers-target-box')).toHaveTextContent('Tanımlı değil');

    await fireEvent.press(screen.getByTestId(`warehouse-printers-option-${KUTU_B.id}`));

    await waitFor(() => expect(mockStore.get('lezzet.printer.choice')).toContain(KUTU_B.id));
    // Seçim yalnız cihaz deposuna yazıldı: sunucuya YAZMA isteği hiç atılmadı.
    expect(posts).toHaveLength(0);
    await waitFor(() => expect(screen.getByTestId('warehouse-printers-target-box')).toHaveTextContent(KUTU_B.name));
  });

  it('HEDEF BELLİ OLUNCA kart susar; değiştirmenin yolu ÇEKMECEDE açık kalır', async () => {
    /* Tasarımın tanımlı kartı sessizdir (v3:1015-1024): ikon, ad, "bağlı · Wi-Fi", "test bas" ve
       sonuç cümlesi — altında liste yok. Kod bir ara tanımlı kartta da liste çiziyordu ve kurulum
       bittikten sonra bile ekran konuşuyordu (kullanıcı bulgusu 05.09). Liste çekmeceye taşındı:
       nadir yapılan iş, dinlenme hâlini kirletmez. */
    net.printers = [KUTU_A, KUTU_B, KARGO];
    mockStore.set('lezzet.printer.choice', JSON.stringify({ box: KUTU_B.id }));
    ag.modul = true;
    ag.bulunan = [kanal('10.0.0.1', 'QL-1110NWB', 'E11111')];
    await ekran();

    // Hedef belli → kart sessiz: ne liste, ne ağda bulunanlar.
    expect(screen.getByTestId('warehouse-printers-target-box')).toHaveTextContent(KUTU_B.name);
    expect(screen.queryByTestId('warehouse-printers-options-box')).toBeNull();

    await fireEvent.press(screen.getByTestId('warehouse-printers-change-box'));

    // Çekmecede AYNI liste: seçili satır işaretli KALIYOR (karar geri alınabilir olmalı) ve
    // ikinci aday hâlâ seçilebilir.
    const cekmece = await screen.findByTestId('warehouse-printers-sheet-options');
    expect(cekmece).toBeOnTheScreen();
    expect(screen.getByTestId(`warehouse-printers-option-${KUTU_B.id}`)).toHaveTextContent(/seçili/);
    expect(screen.getByTestId(`warehouse-printers-option-${KUTU_A.id}`)).toHaveTextContent(/seç$/);
  });

  it('o iş için yazıcı YOKSA kart eksikliği bedeliyle söyler ve AĞDA BULUNANLARI listeler', async () => {
    /* v3 eksikliği SONUCUYLA söylüyor (30.08): "Tanımlı değil" tek başına bir durum bildirimiydi,
       "etiket alınsa da basılamaz" ise bedelini yazıyor — depocu kargo etiketini alıp elinde
       kalmasın diye. 05.09'a kadar kart bir de "Depolar ekranından tanımlanır" diyordu ve orası
       WEB'di: yazıcının önünde telefonla duran depocunun yapabileceği hiçbir şey yoktu. */
    net.printers = [KUTU_A];
    ag.modul = true;
    ag.bulunan = [kanal('10.0.0.9', 'QL-820NWB', 'E33333')];
    await ekran();

    const kargo = screen.getByTestId('warehouse-printers-shipping');
    expect(kargo).toHaveTextContent(/Tanımlı değil/);
    expect(kargo).toHaveTextContent(/etiket alınsa da basılamaz/);
    expect(screen.getByTestId('warehouse-printers-box')).not.toHaveTextContent(/Tanımlı değil/);
    // Hedefsiz kartta test düğmesi YOK: basılacak bir yazıcı yokken "test bas" yalan söylerdi.
    expect(screen.queryByTestId(`warehouse-printers-test-${KARGO.id}`)).toBeNull();

    // Ağda görülen yazıcı listede: modeliyle VE adresiyle — aynı modelden iki cihaz olabilir.
    const satir = await screen.findByTestId('warehouse-printers-options-shipping-new-10.0.0.9');
    expect(satir).toHaveTextContent(/QL-820NWB/);
    expect(satir).toHaveTextContent(/10\.0\.0\.9/);
    expect(satir).toHaveTextContent(/tanıt/);
  });

  it('ağdaki yazıcıya dokunmak onu TANITIR: adres keşiften gider, kâğıt boyu gövdede HİÇ yok', async () => {
    ag.modul = true;
    ag.bulunan = [kanal('10.0.0.9', 'QL-820NWB', 'E33333')];
    await ekran();

    await fireEvent.press(await screen.findByTestId('warehouse-printers-options-shipping-new-10.0.0.9'));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      purpose: 'shipping',
      model: 'QL-820NWB',
      address: '10.0.0.9',
      serialNumber: 'E33333',
    });
    // Kâğıt boyu İSTEMCİDEN GİTMİYOR: kural sunucuda tek yerde (`defaultLabelSizeFor`); istemcinin
    // göndermesi ikinci bir kaynak açardı ve bir gün ayrışırlardı.
    expect(posts[0]).not.toHaveProperty('labelSize');
    // Tanıtma bir BASIM DEĞİL: kâğıt harcanmadı (kullanıcı kararı 05.09 — "modelden varsay").
    expect(mockPrintLabel).not.toHaveBeenCalled();
    expect(screen.getByTestId('warehouse-printers-notice-shipping')).toHaveTextContent(/tanıtıldı/);
  });

  it('ENVANTERDE OLAN yazıcı "tanıt" diye sunulmaz — eşleşme SERİDEN, adres değişse bile', async () => {
    // 05.09'da ölçülen arızanın kendisi: envanterde `10.0.0.9`, gerçek yazıcı `10.0.0.77`.
    net.printers = [KARGO];
    ag.modul = true;
    ag.bulunan = [kanal('10.0.0.77', 'QL-820NWB', 'E33333')];
    await ekran();

    // Aynı cihaz olduğu için ikinci bir satır olarak sunulmuyor.
    expect(screen.queryByTestId('warehouse-printers-options-shipping-new-10.0.0.77')).toBeNull();
    // Ve "ağda görünmüyor" DEMİYOR: eski kural adresten eşleştiği için burada kaybederdi.
    expect(await screen.findByTestId(`warehouse-printers-link-${KARGO.id}`)).toHaveTextContent('bağlı · Wi-Fi');
  });

  it('eskimiş adres sessizce ONARILIR — sunucuya taze adres yazılır (kullanıcı sorusu 05.09)', async () => {
    net.printers = [KARGO];
    ag.modul = true;
    ag.bulunan = [kanal('10.0.0.77', 'QL-820NWB', 'E33333')];
    await ekran();

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      purpose: 'shipping',
      model: 'QL-820NWB',
      address: '10.0.0.77',
      serialNumber: 'E33333',
      // Ad DEĞİŞMİYOR: adresi düzelten bir dokunuş, insanın verdiği adı model adına çevirmemeli.
      name: 'Rampa · QL-820',
    });
  });

  it('adresi doğru olan yazıcı için onarım YAZILMAZ — her açılış sunucuya yazmaz', async () => {
    net.printers = [KARGO];
    ag.modul = true;
    ag.bulunan = [kanal(KARGO.address, 'QL-820NWB', 'E33333')];
    await ekran();

    await waitFor(() => expect(screen.getByTestId(`warehouse-printers-link-${KARGO.id}`)).toBeOnTheScreen());
    expect(posts).toHaveLength(0);
  });

  it('kâğıdını bilmediğimiz model listede kalır ama dokunulamaz', async () => {
    // Aynı ağda gerçekten duruyordu (ölçüldü 05.09): A4 lazer çok-işlevli, etiket yazıcısı değil.
    ag.modul = true;
    ag.bulunan = [kanal('10.0.0.5', 'MFC-9330CDW', 'E99999')];
    await ekran();

    const satir = await screen.findByTestId('warehouse-printers-options-box-new-10.0.0.5');
    expect(satir).toHaveTextContent(/kâğıdı bilinmiyor/);

    await fireEvent.press(satir);
    // Gizlemek depocuya "ağımdaki cihaz neden listede yok" dedirtirdi; dokundurmak kesin bir redde
    // yollardı. Satır duruyor, eylem yok.
    expect(posts).toHaveLength(0);
  });

  it('"yeniden tara" ağı YENİDEN tarar ve o arada tanıtılmış yazıcıyı da getirir', async () => {
    ag.modul = true;
    ag.bulunan = [];
    await ekran();

    expect(screen.getByTestId('warehouse-printers-options-box-none')).toHaveTextContent(/Ağda yazıcı bulunamadı/);

    // Yazıcı bu arada açıldı — ve başka bir telefon envantere KARGO yazıcısını tanıttı.
    ag.bulunan = [kanal('10.0.0.1', 'QL-1110NWB', 'E11111')];
    net.printers = [KARGO];
    await fireEvent.press(screen.getByTestId('warehouse-printers-options-box-rescan'));

    // Tarama AĞI tazeledi: kutu kartı hâlâ tanımsız (bulunan yazıcı envanterde yok) ve onu listeliyor.
    await waitFor(() => expect(screen.getByTestId('warehouse-printers-options-box-new-10.0.0.1')).toBeOnTheScreen());
    // …ve ENVANTERİ de: yalnız ağı taramak, BAŞKASININ tanıttığı yazıcıyı göstermezdi.
    expect(screen.getByTestId('warehouse-printers-target-shipping')).toHaveTextContent(KARGO.name);
  });

  it('ağ TARANAMADIYSA "bulunamadı" demez — ölçemediğini söyler', async () => {
    ag.modul = false;
    await ekran();

    // Boş dizi ile `null` ayrı şeyler: biri "kimse yok", öteki "tarayamadım" (CLAUDE §1).
    expect(screen.getByTestId('warehouse-printers-options-box-none')).toHaveTextContent(/yazıcı modülü yok/);
  });

  /* HER İŞİN KENDİ SONUCU (v3:1024, 1039): seçim bir tercih değil, bir DAVRANIŞ belirliyor ve
     ikisinin bedeli ayrı — ortak bir dipnot ikisini de yarım anlatırdı. */
  it('her kart kendi sonucunu yazar — kutu kendiliğinden basar, kargo iptal olmaz', async () => {
    net.printers = [KUTU_A];
    await ekran();

    expect(screen.getByTestId('warehouse-printers-box')).toHaveTextContent(/kendiliğinden basar/);
    expect(screen.getByTestId('warehouse-printers-shipping')).toHaveTextContent(/basım düşse bile iptal olmaz/);
  });

  /* İLK YÜK İSKELET, HALKA DEĞİL (kullanıcı kararı 30.08): halka yerleşim tutmaz — söndüğü an
     sayfa zıplar. Ölçülen şey "bir gösterge var mı" değil, YER TUTUYOR MU: kutuların yüksekliği
     yerini tuttukları iş kartının ölçüsünde olmalı. */
  it('ilk yük İSKELET çiziyor ve kutular kartın ölçüsünde yer tutuyor', async () => {
    fetchMock.mockImplementationOnce(() => new Promise<Response>(() => {}));
    await render(<PrinterSetupScreen />);

    const iskelet = await screen.findByTestId('warehouse-printers-loading');
    const yerTutucular = iskelet.children
      .filter((child): child is Exclude<(typeof iskelet.children)[number], string> => typeof child !== 'string')
      .map((child) => Number(StyleSheet.flatten(child.props.style)?.height))
      .filter((height) => Number.isFinite(height));

    // İki kart = iki kutu; her biri gerçek kart yüksekliğinde (ölçüm: tasarımın kutu kartı 128 dp).
    expect(yerTutucular).toHaveLength(2);
    for (const height of yerTutucular) expect(height).toBeGreaterThan(100);
    expect(screen.getByText('Yazıcılar yükleniyor…')).toBeOnTheScreen();
  });

  it('liste alınamazsa seçim SİLİNMEZ — cihazda ne varsa duruyor', async () => {
    mockStore.set('lezzet.printer.choice', JSON.stringify({ box: KUTU_B.id }));
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('ağ yok')));
    await ekran();

    expect(screen.getByTestId('warehouse-printers-error')).toBeOnTheScreen();
    expect(mockStore.get('lezzet.printer.choice')).toContain(KUTU_B.id);
  });
});
