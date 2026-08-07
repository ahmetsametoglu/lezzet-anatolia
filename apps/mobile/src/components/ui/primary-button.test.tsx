import { customerAppColors, customerAppRadius, customerAppShadow, customerColors } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { PrimaryButton } from './primary-button';

describe('PrimaryButton', () => {
  it('basıldığında çağırır ve etiketi a11y adı olur', async () => {
    const onPress = jest.fn();
    await render(<PrimaryButton label="Sepete ekle" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Sepete ekle' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('engelliyken çağırmaz ve durumu a11y’ye bildirir', async () => {
    const onPress = jest.fn();
    await render(<PrimaryButton label="Siparişi tamamla" onPress={onPress} disabled />);

    const button = screen.getByRole('button', { name: 'Siparişi tamamla' });
    await fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });

  it('blok biçim: dolgu · yükseklik · yarıçap · SERT gölge temadan gelir', async () => {
    await render(<PrimaryButton label="Kaydet" onPress={jest.fn()} testID="btn" />);

    expect(screen.getByTestId('btn')).toHaveStyle({
      backgroundColor: customerColors.olive,
      borderRadius: Number.parseFloat(customerAppRadius.control),
      boxShadow: customerAppShadow.hard,
    });
  });

  it('hap biçim gölgesizdir ve hap yarıçapını taşır', async () => {
    await render(<PrimaryButton label="Tüm katalog" onPress={jest.fn()} shape="pill" testID="btn" />);

    expect(screen.getByTestId('btn')).toHaveStyle({ borderRadius: Number.parseFloat(customerAppRadius.pill) });
    expect(screen.getByTestId('btn')).not.toHaveStyle({ boxShadow: customerAppShadow.hard });
  });

  it('engelli dolgusu uygulamanın FARK değerini kullanır', async () => {
    await render(<PrimaryButton label="Uygula" onPress={jest.fn()} disabled testID="btn" />);

    expect(screen.getByTestId('btn')).toHaveStyle({ backgroundColor: customerAppColors['disabled-fill'] });
    expect(screen.getByText('Uygula')).toHaveStyle({ color: customerColors['disabled-text'] });
  });
});
