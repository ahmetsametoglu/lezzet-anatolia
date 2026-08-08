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

  it('raf ömrü BİLİNMEYEN parti "%0" demez — ölçülemeyen değer sıfır değildir', async () => {
    await render(<NearExpiryScreen />);

    const row = screen.getByTestId('warehouse-near-expiry-P-0688');
    expect(row).toHaveTextContent(/raf ömrü bilinmiyor/);
    expect(row).toHaveTextContent(/karar yok/);
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
