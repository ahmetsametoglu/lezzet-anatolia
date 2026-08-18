import { customerAppText, customerColors, customerText } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { emToDp } from '../../theme/parse';
import { customerStops } from '../../theme/unistyles';
import { SectionHeader } from './section-header';

// Beklenenler PAKETTEN türetilir; çeviri de temanın kullandığı çevirinin aynısı (px→dp + kademe).
const appText = customerStops(customerAppText);
const baseText = customerStops(customerText);

describe('SectionHeader', () => {
  it('yalnız üstbaşlıkla kurulabilir (başlık ve bağlantı isteğe bağlı)', async () => {
    await render(<SectionHeader eyebrow="Koleksiyonlar" />);

    expect(screen.getByText('Koleksiyonlar')).toBeOnTheScreen();
    expect(screen.queryByRole('header')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('başlık verilince header rolüyle duyurulur', async () => {
    await render(<SectionHeader eyebrow="Vitrindekiler" title="Bu haftanın seçkisi" />);

    expect(screen.getByRole('header')).toHaveTextContent('Bu haftanın seçkisi');
  });

  it('sağ bağlantı basılınca çağırır', async () => {
    const onActionPress = jest.fn();
    await render(<SectionHeader eyebrow="Vitrindekiler" actionLabel="Tüm katalog" onActionPress={onActionPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Tüm katalog' }));

    expect(onActionPress).toHaveBeenCalledTimes(1);
  });

  it('üstbaşlık UYGULAMA kademesini kullanır ve em aralığı dp’ye çevrilir', async () => {
    await render(<SectionHeader eyebrow="Hazır paketler" title="Paketler" />);

    expect(screen.getByText('Hazır paketler')).toHaveStyle({
      fontSize: appText.eyebrow,
      letterSpacing: emToDp(appText['eyebrow--letter-spacing'], appText.eyebrow),
      color: customerColors.terracotta,
    });
    expect(screen.getByRole('header')).toHaveStyle({ fontSize: baseText['h2-sm'] });
  });
});
