import { customerColors, customerText } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { EmptyState } from './empty-state';
import { PrimaryButton } from './primary-button';

describe('EmptyState', () => {
  it('başlığı header rolüyle duyurur, açıklama ve yuvalar isteğe bağlıdır', async () => {
    await render(<EmptyState title="Sepetiniz boş" />);

    expect(screen.getByRole('header')).toHaveTextContent('Sepetiniz boş');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('ikon ve eylem yuvalarını render eder', async () => {
    await render(
      <EmptyState
        title="Sepetiniz boş"
        description="Anadolu'nun lezzetleri sizi bekliyor."
        icon={<Text>ikon</Text>}
        action={<PrimaryButton label="Kataloğa göz at" onPress={jest.fn()} shape="pill" />}
      />,
    );

    expect(screen.getByText('ikon')).toBeOnTheScreen();
    expect(screen.getByText("Anadolu'nun lezzetleri sizi bekliyor.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Kataloğa göz at' })).toBeOnTheScreen();
  });

  it('misafir varyantı aynı iskelettir — fark yalnız içerikte (eylem yuvası)', async () => {
    const onPress = jest.fn();
    await render(
      <EmptyState
        title="Hoş geldiniz"
        action={<PrimaryButton label="Hızlı doğrulama" onPress={onPress} shape="pill" />}
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Hızlı doğrulama' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('başlık ve açıklama kademeleri temadan gelir', async () => {
    await render(<EmptyState title="Aradığınızı bulamadık" description="Farklı bir yazım deneyin." />);

    expect(screen.getByRole('header')).toHaveStyle({
      fontSize: Number.parseFloat(customerText['card-title-sm']),
      color: customerColors.ink,
    });
    expect(screen.getByText('Farklı bir yazım deneyin.')).toHaveStyle({
      fontSize: Number.parseFloat(customerText.note),
      color: customerColors.muted,
    });
  });
});
