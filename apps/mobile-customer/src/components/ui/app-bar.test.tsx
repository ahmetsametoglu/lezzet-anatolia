import { customerAppColors, customerAppText, customerColors, customerText } from '@lezzet/design-tokens';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { customerStops } from '@lezzet/mobile-kit/src/theme/unistyles';
import { AppBar } from './app-bar';

// Beklenenler PAKETTEN türetilir; `customerStops` temanın uyguladığı çevirinin aynısıdır
// (px→dp + bir kademe), böylece test ham değer taşımaz. Birleşim temanınkiyle aynı: ekran başlığı
// kademesi telefon görünümüyle tabana çıktı (14.09).
const appText = customerStops({ ...customerText, ...customerAppText });

describe('AppBar', () => {
  it('başlığı header rolüyle duyurur', async () => {
    await render(<AppBar title="Hazır Paket" />);

    expect(screen.getByRole('header')).toHaveTextContent('Hazır Paket');
  });

  it('sol ve sağ yuvaları olduğu gibi render eder', async () => {
    await render(<AppBar title="Talepler" left={<Text>geri</Text>} right={<Text>+ Yeni</Text>} />);

    expect(screen.getByText('geri')).toBeOnTheScreen();
    expect(screen.getByText('+ Yeni')).toBeOnTheScreen();
  });

  it('başlık kademesi native ekran başlığından (17px Lora 600), alt çizgi mürekkepten gelir', async () => {
    await render(<AppBar title="Keşif" testID="bar" />);

    expect(screen.getByRole('header')).toHaveStyle({
      fontSize: appText['screen-title'],
      color: customerColors.ink,
    });
    expect(screen.getByTestId('bar')).toHaveStyle({
      borderBottomColor: customerColors.ink,
    });
  });

  it('zemin KREM CAM (%96) — opak `sand-50` yaması kalktı (Token Kararlari #17)', async () => {
    // Çubuğun KENDİSİ bulanık yüzeydir; krem tonu onun üstündeki katmandan gelir, o yüzden
    // zemin çubuğun stilinde değil cam katmanının stilinde aranır.
    await render(<AppBar title="Keşif" testID="bar" />);

    expect(screen.getByTestId('bar-glass')).toHaveStyle({
      backgroundColor: customerAppColors['cream-glass'],
    });
  });
});
