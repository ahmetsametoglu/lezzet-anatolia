import { customerAppColors, customerAppRadius, customerAppShadow, customerColors } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Tag } from './tag';

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

  it('gölge istendiğinde token dizgesini aynen uygular', async () => {
    await render(<Tag label="9,90 €" shadow testID="tag" />);

    expect(screen.getByTestId('tag')).toHaveStyle({ boxShadow: customerAppShadow.soft });
  });

  it('dönüş açısı prop’tan gelir', async () => {
    await render(<Tag label="İNDİRİM" rotate={-7} testID="tag" />);

    expect(screen.getByTestId('tag')).toHaveStyle({ transform: [{ rotate: '-7deg' }] });
  });
});
