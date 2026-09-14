import { fireEvent, render, screen } from '@testing-library/react-native';

import { OperationsIconButton } from './icon-button';

/*
  İkon düğmesinin ölçülen davranışı ERİŞİLEBİLİRLİKTİR: kutunun içinde METİN YOK, dolayısıyla adı
  yalnız `accessibilityLabel` taşır. Ad düşerse düğme ekran okuyucuda adsız bir "düğme" olur ve
  ne yaptığı hiçbir yerden okunamaz — ikonun kendisi bilerek sessizdir (`Icon` künyesi).
*/

describe('OperationsIconButton', () => {
  it('adıyla bulunur ve dokunuşu iletir', async () => {
    const onPress = jest.fn();
    await render(<OperationsIconButton icon="bell" onPress={onPress} accessibilityLabel="Bildirimler" />);

    await fireEvent.press(screen.getByRole('button', { name: 'Bildirimler' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('engelliyken çağırana ulaşmaz', async () => {
    const onPress = jest.fn();
    await render(
      <OperationsIconButton
        icon="refresh"
        onPress={onPress}
        accessibilityLabel="Yenile"
        disabled
        testID="yenile"
      />,
    );

    await fireEvent.press(screen.getByTestId('yenile'));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('zeminsiz tonda da adı ve dokunuşu korur', async () => {
    const onPress = jest.fn();
    await render(
      <OperationsIconButton icon="close" onPress={onPress} accessibilityLabel="Kapat" tone="plain" />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Kapat' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
