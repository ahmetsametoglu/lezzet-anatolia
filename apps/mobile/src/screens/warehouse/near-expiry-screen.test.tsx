import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { NearExpiryBatchContract } from '@lezzet/types';

import { NearExpiryScreen } from './near-expiry-screen';
import { resetWarehouseStatus } from './warehouse-status';

/*
  D3 EKRAN TESTİ — salt okunurluğun KANITI ve D4'e taşınan partinin doğruluğu.

  Ekranın en önemli özelliği YAPMADIĞI şey: hiçbir satırda işaretleme, onay ya da oran alanı yok
  (v2: "bu liste fiziksel ayıklama rehberidir; işaretleme yok"). Bir gün biri oraya bir kutu
  eklerse bu test kırılır.

  ── FİKSTÜR SÖKÜLDÜ (21.187) ───────────────────────────────────────────────
  Testler `NEAR_EXPIRY_FIXTURE`i okuyordu; ekran artık gerçek kapıdan besleniyor
  (`/api/v1/warehouse/near-expiry`) ve satırlar burada KAPI CEVABI olarak kuruluyor. Fark önemli:
  fikstür ekranın kendi verisiydi, bu ise sözleşmenin şekli — biri değişirse test kırılır ve
  kırılması gerekir.
*/

const mockNavigate = jest.fn();
/* Odak etkisi `useEffect`e çevriliyor (hub testiyle aynı desen): testte odak diye bir şey yok ve
   çevirmezsek hiçbir yükleme başlamaz. */
jest.mock('expo-router', () => {
  const react = jest.requireActual<{ useEffect: (effect: () => void, deps: unknown[]) => void }>('react');
  return {
    useRouter: () => ({ navigate: (href: unknown) => mockNavigate(href), back: jest.fn() }),
    useFocusEffect: (callback: () => void) => react.useEffect(callback, [callback]),
  };
});

/*
  KAPI MOCK'LANIYOR, `fetch` DEĞİL (ölçüldü 31.08).

  Ekranın sınandığı şey satırları nasıl ÇİZDİĞİ: aciliyet cümlesi, ömür çubuğunun iki hâli, imhalık
  satırın bağı. Taşıma katmanını (yetki başlığı, oturum tazeleme) bu dosya sınamıyor ve sınamamalı —
  onun kendi yeri var. `fetch` düzeyinden mock'lamak, ekran testini oturum kurulumuna bağımlı
  kılıyordu.
*/
const mockFetchNearExpiry = jest.fn<Promise<{ data: { batches: NearExpiryBatchContract[] } | null; error: string | null }>, []>();
const mockRecordAdjustment = jest.fn();
jest.mock('@/lib/api/warehouse', () => ({
  fetchNearExpiry: () => mockFetchNearExpiry(),
  recordAdjustment: (body: unknown) => mockRecordAdjustment(body),
}));

/** Kapı cevabının bir satırı — sözleşmenin şekli, ekranın değil. */
function batch(overrides: Partial<NearExpiryBatchContract> = {}): NearExpiryBatchContract {
  return {
    stockId: '00000000-0000-4000-8000-000000000301',
    batchNo: 'PRT-STR-26-0301',
    lotNumber: 'P-0698',
    productName: 'Su Böreği',
    variantLabel: 'tepsi',
    qty: 6,
    expiryDate: '2026-09-02',
    daysLeft: 2,
    remainingPercent: 18,
    decision: 'can_offer',
    belowMlor: true,
    dateType: 'DDM',
    shelfLabel: 'A-12',
    productStockQty: 24,
    ...overrides,
  };
}

const DISCARD = batch({
  stockId: '00000000-0000-4000-8000-000000000302',
  batchNo: 'PRT-STR-26-0302',
  lotNumber: 'P-0641',
  productName: 'Kaymaklı Baklava',
  variantLabel: '1 kg',
  qty: 4,
  daysLeft: -1,
  remainingPercent: 0,
  /* DLC — imhalık parti başka türlü olamaz: DDM'si geçmiş mal satılabilir, `must_discard` kararı
     yalnız DLC'den doğar. Fikstürün kendi içinde tutarlı olması şart, yoksa test var olmayan bir
     hâli sınar. */
  dateType: 'DLC',
  decision: 'must_discard',
});

/** Raf ömrü BİLİNMEYEN parti: yüzde ölçülemedi ve karar da doğmadı. */
const UNKNOWN_LIFE = batch({
  stockId: '00000000-0000-4000-8000-000000000303',
  batchNo: 'PRT-STR-26-0303',
  lotNumber: 'P-0688',
  productName: 'Kuru İncir',
  variantLabel: '500 g',
  qty: 12,
  daysLeft: 40,
  remainingPercent: null,
  decision: 'offer_open',
});

function withBatches(batches: NearExpiryBatchContract[]): void {
  mockFetchNearExpiry.mockResolvedValue({ data: { batches }, error: null });
}

async function renderScreen(): Promise<void> {
  await render(<NearExpiryScreen />);
  await waitFor(() => expect(mockFetchNearExpiry).toHaveBeenCalled());
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockFetchNearExpiry.mockReset();
  mockRecordAdjustment.mockReset();
  mockRecordAdjustment.mockResolvedValue({
    data: { status: 'ok', result: { ok: true, referenceNo: 'IMH-STR-26-0007', lines: 1, outQty: 4, inQty: 0, outCostCents: 0, inCostCents: 0 } },
    error: null,
  });
  resetWarehouseStatus();
  withBatches([batch(), DISCARD, UNKNOWN_LIFE]);
});

describe('D3 · yakın-SKT turu', () => {
  it('bütün partiler kararlarıyla listelenir', async () => {
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0301')).toBeOnTheScreen());
    expect(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0302')).toHaveTextContent(/İMHA EDİLMELİ/);
    // Rejim satırı sebebi söylüyor: DLC geçmiş = satılamaz.
    expect(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0302')).toHaveTextContent(/geçti — satılamaz/);
    // Rozet ağırlığı düştü (tasarım 31.08): teklif hâlleri artık SESSİZ — depocuya iş vermiyorlar.
    // Teklif rozeti YOK; satır yine de listede — depocu ömrü azalan malı görmeli.
    expect(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0303')).toBeOnTheScreen();
  });

  /*
    D3 SAF DEPOCU EKRANI (kullanıcı kararı 31.08).

    Ekran iki kitleye birden konuşuyordu: fiziksel tura çıkan depocu ve fiyat kararı veren
    yönetici. Teklif rozetleri ve ömür yüzdesi depocuya iş vermiyor — teklif kararı yönetimin Y3
    ekranında, toplu veriliyor. Bu test o ayrımın KANITI: bir gün biri geri koyarsa kırılır.
  */
  it('teklif rozeti ÇİZİLMEZ — karar depocunun değil', async () => {
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0301')).toBeOnTheScreen());
    expect(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0301')).not.toHaveTextContent(/teklif/);
    expect(screen.queryByTestId('warehouse-near-expiry-PRT-STR-26-0301-verdict')).toBeNull();
  });

  it('ömür YÜZDESİ ve çubuğu çizilmez — aciliyeti kalan gün söylüyor', async () => {
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0301')).toBeOnTheScreen());
    expect(screen.queryByTestId('warehouse-near-expiry-PRT-STR-26-0301-life')).toBeNull();
    expect(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0301')).not.toHaveTextContent(/ömür %/);
    // Kalan gün DURUYOR: depocunun aciliyet ölçüsü o.
    expect(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0301')).toHaveTextContent(/2 gün/);
  });

  /*
    KALAN GÜN CÜMLESİ EKRANDA KURULUR (21.187): kapı sayı taşıyor, cümleyi sözlük yazıyor. Geçmiş
    partide sayı POZİTİF yazılır — depocu "kaç gün geçmiş" diye sorar, eksi işaretini okumaz.
  */
  it('geçmiş parti "geçti" der ve günü pozitif yazar', async () => {
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0302')).toBeOnTheScreen());
    expect(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0302')).toHaveTextContent(/1 gün \(geçti\)/);
  });

  /*
    ÜÇ HÂL AYRI AYRI SINANIR (skeleton yapısı 31.08).

    Ekran fikstürle çalışırken tek hâli vardı: dolu liste. Gerçek kapıya bağlanınca üçü birden
    doğdu ve üçü ayrı şey söylüyor — okunuyor · okunamadı · okundu ve boş. Özellikle son ikisi
    karışmamalı: "okunamadı" bir arıza, "boş" iyi haber.
  */
  it('ilk yükte SKELETON çizilir — halka değil', async () => {
    mockFetchNearExpiry.mockReturnValue(new Promise(() => undefined));
    await render(<NearExpiryScreen />);

    expect(screen.getByTestId('warehouse-near-expiry-loading')).toBeOnTheScreen();
    expect(screen.queryByTestId('warehouse-near-expiry-list')).toBeNull();
  });

  it('kapı düşerse HATA bloğu ve tekrar dene çıkar', async () => {
    mockFetchNearExpiry.mockResolvedValue({ data: null, error: 'server_error' });
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-error')).toBeOnTheScreen());
    expect(screen.queryByTestId('warehouse-near-expiry-list')).toBeNull();
  });

  it('liste BOŞSA iyi haber yazılır, hata bloğu değil', async () => {
    withBatches([]);
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-empty')).toBeOnTheScreen());
    expect(screen.queryByTestId('warehouse-near-expiry-error')).toBeNull();
  });

  /*
    İMHA ARTIK BU EKRANDA (tasarım 31.08 · akış kuralı: "eylem, kararın doğduğu ekranda durur").

    Eskiden satır depocuyu D4'e gönderiyor, orada sebebi elle "süresi geçti" diye seçtiriyordu.
    Artık düğme satırda ve çekmece YALNIZ ADET soruyor — sebep tarihten bellidir.
  */
  it('imhalık satırda İMHA düğmesi var; ötekilerde yok', async () => {
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0302-discard')).toBeOnTheScreen());
    expect(screen.queryByTestId('warehouse-near-expiry-PRT-STR-26-0301-discard')).toBeNull();
  });

  it('imha çekmecesi SEBEP SORMAZ, yalnız adet ve bağlam gösterir', async () => {
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0302-discard')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0302-discard'));

    const sheet = screen.getByTestId('warehouse-near-expiry-discard-sheet');
    expect(sheet).toHaveTextContent(/Sebep sorulmaz: süresi geçti/);
    // Bağlam: partide kalan + ürünün depodaki toplamı — "kaç düşüyorum" ile "bu ürün bitiyor mu".
    expect(sheet).toHaveTextContent(/partide 4 adet · toplam stok 24/);
  });

  /* SAYACIN RAKAMI ÇEKMECENİN İÇİNDE TUŞ TAKIMI ADIMI AÇAR (kullanıcı kararı 02.09): çekmece
     çekmece açamaz, tuş takımı aynı çekmecenin adımıdır. Canlı yazar; tavan partinin kendisi
     (4 iken "6" işlemez, "2" yazılır); "Tamam" sayaca döner ve yazılan sayı düğmede okunur. */
  it('imha adedi tuş takımı adımından yazılır; partiden fazlasını yazacak tuş işlemez', async () => {
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0302-discard')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0302-discard'));
    await fireEvent.press(screen.getByTestId('warehouse-near-expiry-discard-qty-value-hit'));

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-discard-keypad-key-2')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('warehouse-near-expiry-discard-keypad-key-6'));
    expect(screen.getByTestId('warehouse-near-expiry-discard-keypad-value')).toHaveTextContent('4 adet');
    await fireEvent.press(screen.getByTestId('warehouse-near-expiry-discard-keypad-key-2'));
    await fireEvent.press(screen.getByTestId('warehouse-near-expiry-discard-keypad-back'));

    expect(screen.getByTestId('warehouse-near-expiry-discard-qty-value')).toHaveTextContent('2');
    expect(screen.getByTestId('warehouse-near-expiry-discard-confirm')).toHaveTextContent(/2 adet/);
  });

  /* İmha bir ÇIKIŞtır ve adet POZİTİF gider: işaret miktara gömülmez (sözleşme künyesi). */
  it('imha kapıya `expired` sebebiyle ve `out` yönüyle yazılır', async () => {
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0302-discard')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0302-discard'));
    await fireEvent.press(screen.getByTestId('warehouse-near-expiry-discard-confirm'));

    await waitFor(() => expect(mockRecordAdjustment).toHaveBeenCalled());
    expect(mockRecordAdjustment).toHaveBeenCalledWith({
      lines: [{ stockId: DISCARD.stockId, qty: 4, direction: 'out' }],
      reason: 'expired',
    });
  });

  /* Ekran KAPANMAZ (tasarım): satır "imha edildi"ye döner ve referansı taşır — tur devam eder. */
  it('imha sonrası satır referansı taşır ve ekranda kalır', async () => {
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0302-discard')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0302-discard'));
    await fireEvent.press(screen.getByTestId('warehouse-near-expiry-discard-confirm'));

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0302-ref')).toHaveTextContent('IMH-STR-26-0007'));
    expect(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0302-verdict')).toHaveTextContent(/İMHA EDİLDİ/);
    expect(screen.queryByTestId('warehouse-near-expiry-PRT-STR-26-0302-discard')).toBeNull();
  });

  /*
    LOTSUZ PARTİ DE LİSTELENİR (21.187) — ve artık tireyle değil, PARTİ NUMARASIYLA (03.09):
    lot tedarikçinin numarasıdır ve boş olabilir; parti numarası bizim kimliğimizdir ve hep vardır.
    Ömrü azalan mal, lotu olmasa da rafta duruyor ve künyesi boş kalmıyor.
  */
  it('lotu olmayan parti kendi numarasıyla listelenir, düşmez', async () => {
    withBatches([batch({ lotNumber: null })]);
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-PRT-STR-26-0301')).toBeOnTheScreen());
  });
});
