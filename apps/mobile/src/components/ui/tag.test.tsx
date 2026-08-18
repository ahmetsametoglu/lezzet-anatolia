import {
  customerAppColors,
  customerAppRadius,
  customerAppShadow,
  customerAppText,
  customerColors,
} from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Tag } from './tag';
import { emToDp } from '../../theme/parse';
import { customerStops } from '../../theme/unistyles';

// Beklenenler PAKETTEN türetilir; `customerStops` temanın uyguladığı çevirinin aynısıdır
// (px→dp + bir kademe), böylece test ham değer taşımaz.
const appText = customerStops(customerAppText);

describe('Tag', () => {
  it('etiketi gösterir ve dokunulamayan rozette düğme rolü ÜRETMEZ', async () => {
    await render(<Tag label="12,90 €" />);

    expect(screen.getByText('12,90 €')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('onPress verilince düğme olur, etiketi a11y adı olarak taşır ve basılınca çağırır', async () => {
    const onPress = jest.fn();
    await render(<Tag label="Sepete +" tone="cream" onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Sepete +' });
    await fireEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renk ve yarıçap TEMADAN gelir (ton başına)', async () => {
    await render(<Tag label="TOPTAN" tone="ink" testID="tag" />);

    expect(screen.getByTestId('tag')).toHaveStyle({
      backgroundColor: customerColors.ink,
      borderRadius: Number.parseFloat(customerAppRadius.badge),
    });
    expect(screen.getByText('TOPTAN')).toHaveStyle({ color: customerColors['sand-50'] });
  });

  it('sand tonu uygulamanın YENİ kum kademesini kullanır', async () => {
    await render(<Tag label="✦ 240" tone="sand" testID="tag" />);

    expect(screen.getByTestId('tag')).toHaveStyle({ backgroundColor: customerAppColors['sand-150'] });
  });

  it('gölge istendiğinde ROZET gölgesini aynen uygular (Token Kararlari #16)', async () => {
    // `soft` DEĞİL: rozet fotoğrafın üstünde yüzer ve 1 px yükseklik orada görünmüyordu.
    await render(<Tag label="9,90 €" shadow testID="tag" />);

    expect(screen.getByTestId('tag')).toHaveStyle({ boxShadow: customerAppShadow.badge });
  });

  it('yazı kademesi ROZETİN kendisidir — devşirilmiş kademe karışımı değil', async () => {
    await render(<Tag label="9,90 €" testID="tag" />);

    expect(screen.getByText('9,90 €')).toHaveStyle({
      fontSize: appText.badge,
      // `.06em` × 12,5 dp = 0,75 dp — çeviri `emToDp`de, tek yerde.
      letterSpacing: emToDp(appText['badge--letter-spacing'], appText.badge),
    });
  });

  it('dönüş açısı prop’tan gelir', async () => {
    await render(<Tag label="İNDİRİM" rotate={-7} testID="tag" />);

    expect(screen.getByTestId('tag')).toHaveStyle({ transform: [{ rotate: '-7deg' }] });
  });
});
