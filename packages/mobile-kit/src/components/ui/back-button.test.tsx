import { customerColors } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { appMetrics } from '../../theme/metrics';
import { BackButton } from './back-button';

describe('BackButton', () => {
  it('a11y adını prop’tan alır (ikonun kendisi metin değildir) ve basılınca çağırır', async () => {
    const onPress = jest.fn();
    await render(<BackButton onPress={onPress} accessibilityLabel="Geri" />);

    await fireEvent.press(screen.getByRole('button', { name: 'Geri' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('çubuktaki yerleşim zeminsizdir ve dairesel ölçüsü temadan gelir', async () => {
    await render(<BackButton onPress={jest.fn()} accessibilityLabel="Geri" testID="back" />);

    expect(screen.getByTestId('back')).toHaveStyle({
      width: appMetrics.size.iconButton,
      height: appMetrics.size.iconButton,
      borderRadius: appMetrics.size.iconButton / 2,
    });
    expect(screen.getByTestId('back')).not.toHaveStyle({ backgroundColor: customerColors['sand-50'] });
  });

  it('fotoğraf üstünde krem zemin alır', async () => {
    await render(<BackButton onPress={jest.fn()} accessibilityLabel="Geri" variant="photo" testID="back" />);

    expect(screen.getByTestId('back')).toHaveStyle({ backgroundColor: customerColors['sand-50'] });
  });

  /* OPERASYON VARYANTI SÖKÜLDÜ (30.08) ve ölçümü `OperationsIconButton`a taşındı: aynı kutunun
     iki tarifi vardı (kum kutucuk), biri kitte biri burada. Bu dosya artık YALNIZ müşteri
     yüzeyinin iki yerleşimini ölçüyor — operasyon temasına hiç uzanmıyor. */
});
