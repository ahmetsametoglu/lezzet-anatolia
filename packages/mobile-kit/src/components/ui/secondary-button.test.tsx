import { customerAppColors, customerAppShadow, customerColors } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { SecondaryButton } from './secondary-button';

describe('SecondaryButton', () => {
  it('basıldığında çağırır', async () => {
    const onPress = jest.fn();
    await render(<SecondaryButton label="Alışverişe dön" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Alışverişe dön' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('kum tonu: kum çerçeve + mürekkep metin, blokta sert gölge', async () => {
    await render(<SecondaryButton label="Vazgeç" onPress={jest.fn()} testID="btn" />);

    expect(screen.getByTestId('btn')).toHaveStyle({
      borderColor: customerColors['sand-400'],
      boxShadow: customerAppShadow.hard,
    });
    expect(screen.getByText('Vazgeç')).toHaveStyle({ color: customerColors.ink });
  });

  it('zeytin tonu uygulamanın FARK çerçeve rengini kullanır', async () => {
    await render(<SecondaryButton label="Haber ver" onPress={jest.fn()} tone="olive" testID="btn" />);

    expect(screen.getByTestId('btn')).toHaveStyle({ borderColor: customerAppColors['olive-line'] });
    expect(screen.getByText('Haber ver')).toHaveStyle({ color: customerColors['olive-dark'] });
  });

  it('engelliyken çağırmaz, pasif çerçeveye döner ve gölgeyi bırakır', async () => {
    const onPress = jest.fn();
    await render(<SecondaryButton label="Uygula" onPress={onPress} disabled testID="btn" />);

    await fireEvent.press(screen.getByRole('button', { name: 'Uygula' }));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Uygula' })).toBeDisabled();
    expect(screen.getByTestId('btn')).toHaveStyle({ borderColor: customerColors['disabled-line'] });
    expect(screen.getByTestId('btn')).not.toHaveStyle({ boxShadow: customerAppShadow.hard });
  });
});
