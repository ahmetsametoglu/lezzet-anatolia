import { customerColors, customerText } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { mapTokens } from '../../theme/parse';
import { TextAction } from './text-action';

// Beklenenler PAKETTEN türetilir; `mapTokens` kodun kullandığı çevirinin aynısıdır.
const baseText = mapTokens(customerText);

describe('TextAction', () => {
  it('düğme rolüyle çıkar ve basılınca çağırır', async () => {
    const onPress = jest.fn();
    await render(<TextAction label="Tüm katalog" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Tüm katalog' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ton ve yazı kademesi temadan gelir', async () => {
    await render(<TextAction label="Çıkış yap" onPress={jest.fn()} tone="terracotta" />);

    expect(screen.getByText('Çıkış yap')).toHaveStyle({
      color: customerColors.terracotta,
      fontSize: baseText.control,
    });
  });

  it('engelliyken çağırmaz ve pasif metin rengine döner', async () => {
    const onPress = jest.fn();
    await render(<TextAction label="Adresi sil" onPress={onPress} disabled />);

    await fireEvent.press(screen.getByRole('button', { name: 'Adresi sil' }));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Adresi sil' })).toBeDisabled();
    expect(screen.getByText('Adresi sil')).toHaveStyle({ color: customerColors['disabled-text'] });
  });
});
