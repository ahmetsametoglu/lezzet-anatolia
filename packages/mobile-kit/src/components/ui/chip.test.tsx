import { customerAppRadius, customerColors, customerRadius } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Chip } from './chip';

describe('Chip', () => {
  it('basılınca çağırır', async () => {
    const onPress = jest.fn();
    await render(<Chip label="Tümü" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Tümü' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('seçililiği a11y durumuna yazar (renk farkı ekran okuyucuya ulaşmaz)', async () => {
    await render(<Chip label="Zeytinyağı" onPress={jest.fn()} selected />);

    expect(screen.getByRole('button', { name: 'Zeytinyağı' })).toBeSelected();
  });

  it('seçili/seçilmemiş renk çifti temadan gelir', async () => {
    await render(<Chip label="Baharat" onPress={jest.fn()} selected testID="chip" />);

    expect(screen.getByTestId('chip')).toHaveStyle({
      backgroundColor: customerColors.olive,
      borderColor: customerColors.olive,
    });
    expect(screen.getByText('Baharat')).toHaveStyle({ color: customerColors.card });
  });

  it('seçilmemiş çip dolgusuzdur, çerçevesi mürekkeptir', async () => {
    await render(<Chip label="Tatlı" onPress={jest.fn()} testID="chip" />);

    expect(screen.getByTestId('chip')).toHaveStyle({
      backgroundColor: 'transparent',
      borderColor: customerColors.ink,
    });
  });

  it('iki yarıçap kademesi: kontrol (uygulama seti) ⟷ yumuşak (taban)', async () => {
    await render(<Chip label="×5" onPress={jest.fn()} testID="a" />);
    expect(screen.getByTestId('a')).toHaveStyle({ borderRadius: Number.parseFloat(customerAppRadius.control) });

    await render(<Chip label="×10" onPress={jest.fn()} shape="soft" testID="b" />);
    expect(screen.getByTestId('b')).toHaveStyle({ borderRadius: Number.parseFloat(customerRadius.soft) });
  });

  it('engelliyken çağırmaz', async () => {
    const onPress = jest.fn();
    await render(<Chip label="Perşembe" onPress={onPress} disabled />);

    await fireEvent.press(screen.getByRole('button', { name: 'Perşembe' }));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Perşembe' })).toBeDisabled();
  });
});
