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
jest.mock('@/lib/api/warehouse', () => ({
  fetchNearExpiry: () => mockFetchNearExpiry(),
}));

/** Kapı cevabının bir satırı — sözleşmenin şekli, ekranın değil. */
function batch(overrides: Partial<NearExpiryBatchContract> = {}): NearExpiryBatchContract {
  return {
    stockId: '00000000-0000-4000-8000-000000000301',
    lotNumber: 'P-0698',
    productName: 'Su Böreği',
    variantLabel: 'tepsi',
    qty: 6,
    expiryDate: '2026-09-02',
    daysLeft: 2,
    remainingPercent: 18,
    decision: 'can_offer',
    belowMlor: true,
    ...overrides,
  };
}

const DISCARD = batch({
  stockId: '00000000-0000-4000-8000-000000000302',
  lotNumber: 'P-0641',
  productName: 'Kaymaklı Baklava',
  variantLabel: '1 kg',
  qty: 4,
  daysLeft: -1,
  remainingPercent: 0,
  decision: 'must_discard',
});

/** Raf ömrü BİLİNMEYEN parti: yüzde ölçülemedi ve karar da doğmadı. */
const UNKNOWN_LIFE = batch({
  stockId: '00000000-0000-4000-8000-000000000303',
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
  resetWarehouseStatus();
  withBatches([batch(), DISCARD, UNKNOWN_LIFE]);
});

describe('D3 · yakın-SKT turu', () => {
  it('bütün partiler kararlarıyla listelenir', async () => {
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-P-0698')).toBeOnTheScreen());
    expect(screen.getByTestId('warehouse-near-expiry-P-0641')).toHaveTextContent(/imha edilmeli/);
    expect(screen.getByTestId('warehouse-near-expiry-P-0688')).toHaveTextContent(/teklif AÇIK/);
  });

  /* Ömür ölçülemediğinde ÇUBUK DA çizilmez (v3, 30.08): boş bir çubuk "%0" gibi görünür ve o
     partiyi imhalık gösterirdi. Metin eşiğin neden uygulanmadığını söylüyor. */
  it('raf ömrü BİLİNMEYEN parti "%0" demez ve çubuk çizilmez', async () => {
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-P-0688')).toBeOnTheScreen());
    expect(screen.getByTestId('warehouse-near-expiry-P-0688')).toHaveTextContent(/ömür bilinmiyor — eşik uygulanmaz/);
    expect(screen.queryByTestId('warehouse-near-expiry-P-0688-life')).toBeNull();
  });

  it('ölçülen ömür hem ÇUBUKLA hem yazıyla söylenir — tek kaynaktan', async () => {
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-P-0698-life')).toBeOnTheScreen());
    expect(screen.getByTestId('warehouse-near-expiry-P-0698')).toHaveTextContent(/ömür %18/);
  });

  /*
    KALAN GÜN CÜMLESİ EKRANDA KURULUR (21.187): kapı sayı taşıyor, cümleyi sözlük yazıyor. Geçmiş
    partide sayı POZİTİF yazılır — depocu "kaç gün geçmiş" diye sorar, eksi işaretini okumaz.
  */
  it('geçmiş parti "geçti" der ve günü pozitif yazar', async () => {
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-P-0641')).toBeOnTheScreen());
    expect(screen.getByTestId('warehouse-near-expiry-P-0641')).toHaveTextContent(/1 gün \(geçti\)/);
  });

  /* İMHALIK SATIRIN KENDİ BAĞI (v3:849) — alttaki genel düğme "bir" partiyi taşır; imhalık birden
     çoksa depocu hangisinin taşındığını bilemezdi. Bağ yalnız imhalık satırda doğar. */
  it("imhalık satır kendi partisini D4'e götürür; ötekilerde bağ yoktur", async () => {
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-P-0641-to-count')).toBeOnTheScreen());
    expect(screen.queryByTestId('warehouse-near-expiry-P-0698-to-count')).toBeNull();

    await fireEvent.press(screen.getByTestId('warehouse-near-expiry-P-0641-to-count'));

    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/stock-count',
      params: { stockId: DISCARD.stockId, code: 'P-0641', name: 'Kaymaklı Baklava · 1 kg' },
    });
  });

  it('işaretleme YOK: listede tek bir dokunulabilir satır bulunmaz', async () => {
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-to-count')).toBeOnTheScreen());
    expect(screen.queryByTestId('warehouse-near-expiry-P-0641-toggle')).toBeNull();
  });

  it('"Sayım/Düzeltme →" İMHALIK partiyi taşır — D4 konusuz açılmasın', async () => {
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-to-count')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('warehouse-near-expiry-to-count'));

    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/stock-count',
      params: { stockId: DISCARD.stockId, code: 'P-0641', name: 'Kaymaklı Baklava · 1 kg' },
    });
  });

  /*
    KODSUZ PARTİ DE LİSTELENİR (21.187): lot yazılmamış olabilir ve o parti yok sayılamaz —
    ömrü azalan mal, kodu olmasa da rafta duruyor.
  */
  it('lotu olmayan parti tireyle listelenir, düşmez', async () => {
    withBatches([batch({ lotNumber: null })]);
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('warehouse-near-expiry-—')).toBeOnTheScreen());
  });
});
