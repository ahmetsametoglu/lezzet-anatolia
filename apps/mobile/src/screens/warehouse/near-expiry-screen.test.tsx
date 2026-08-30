import { fireEvent, render, screen } from '@testing-library/react-native';

import { NearExpiryScreen } from './near-expiry-screen';
import { discardCandidate, NEAR_EXPIRY_FIXTURE } from './near-expiry-fixture';

/*
  D3 EKRAN TESTİ — salt okunurluğun KANITI ve D4'e taşınan partinin doğruluğu.

  Ekranın en önemli özelliği YAPMADIĞI şey: hiçbir satırda işaretleme, onay ya da oran alanı yok
  (v2: "bu liste fiziksel ayıklama rehberidir; işaretleme yok"). Bir gün biri oraya bir kutu
  eklerse bu test kırılır.
*/

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: (href: unknown) => mockNavigate(href), back: jest.fn() }),
}));

beforeEach(() => {
  mockNavigate.mockReset();
});

describe('D3 · yakın-SKT turu', () => {
  it('bütün partiler kararlarıyla listelenir', async () => {
    await render(<NearExpiryScreen />);

    for (const batch of NEAR_EXPIRY_FIXTURE) {
      expect(screen.getByTestId(`warehouse-near-expiry-${batch.code}`)).toBeOnTheScreen();
    }
    expect(screen.getByTestId('warehouse-near-expiry-P-0641')).toHaveTextContent(/imha edilmeli/);
  });

  /* Ömür ölçülemediğinde ÇUBUK DA çizilmez (v3, 30.08): boş bir çubuk "%0" gibi görünür ve o
     partiyi imhalık gösterirdi. Metin eşiğin neden uygulanmadığını söylüyor. */
  it('raf ömrü BİLİNMEYEN parti "%0" demez ve çubuk çizilmez', async () => {
    await render(<NearExpiryScreen />);

    const row = screen.getByTestId('warehouse-near-expiry-P-0688');
    expect(row).toHaveTextContent(/ömür bilinmiyor — eşik uygulanmaz/);
    expect(row).toHaveTextContent(/karar yok/);
    expect(screen.queryByTestId('warehouse-near-expiry-P-0688-life')).toBeNull();
  });

  it('ölçülen ömür hem ÇUBUKLA hem yazıyla söylenir — tek kaynaktan', async () => {
    await render(<NearExpiryScreen />);

    expect(screen.getByTestId('warehouse-near-expiry-P-0698-life')).toBeOnTheScreen();
    expect(screen.getByTestId('warehouse-near-expiry-P-0698')).toHaveTextContent(/ömür %18/);
  });

  /* İMHALIK SATIRIN KENDİ BAĞI (v3:849) — alttaki genel düğme "bir" partiyi taşır; imhalık birden
     çoksa depocu hangisinin taşındığını bilemezdi. Bağ yalnız imhalık satırda doğar. */
  it('imhalık satır kendi partisini D4\'e götürür; ötekilerde bağ yoktur', async () => {
    await render(<NearExpiryScreen />);

    expect(screen.getByTestId('warehouse-near-expiry-P-0641-to-count')).toBeOnTheScreen();
    expect(screen.queryByTestId('warehouse-near-expiry-P-0698-to-count')).toBeNull();

    await fireEvent.press(screen.getByTestId('warehouse-near-expiry-P-0641-to-count'));

    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/stock-count',
      params: { stockId: '00000000-0000-4000-8000-000000000302', code: 'P-0641', name: 'Kaymaklı Baklava · 1 kg' },
    });
  });

  it('işaretleme YOK: listede tek bir dokunulabilir satır bulunmaz', async () => {
    await render(<NearExpiryScreen />);

    // Ekranda tek düğme vardır ve o geri düğmesi + D4 geçişidir; satırların hiçbiri değil.
    expect(screen.queryByTestId('warehouse-near-expiry-P-0641-toggle')).toBeNull();
    expect(screen.getByTestId('warehouse-near-expiry-to-count')).toBeOnTheScreen();
  });

  it('"Sayım/Düzeltme →" İMHALIK partiyi taşır — D4 konusuz açılmasın', async () => {
    await render(<NearExpiryScreen />);
    await fireEvent.press(screen.getByTestId('warehouse-near-expiry-to-count'));

    const candidate = discardCandidate(NEAR_EXPIRY_FIXTURE);
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/stock-count',
      params: { stockId: candidate?.stockId, code: candidate?.code, name: candidate?.name },
    });
  });
});
