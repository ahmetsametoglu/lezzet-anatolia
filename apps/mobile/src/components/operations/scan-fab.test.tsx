import { fireEvent, render, screen } from '@testing-library/react-native';

import { OperationsScanFab } from './scan-fab';

/*
  FAB'ın ölçülebilir sözü İKİ TANE, ve ikisi de görsel değil davranışsal:

  1. **Adı taşır** — daire metinsizdir (`OperationsIconButton`ın aynı gerekçesi); ad düşerse
     ekran okuyucuda adsız bir düğme kalır.
  2. **Kapalıyken ÇİZİLİR ama çağırana ulaşmaz** — bu, gizlemek yerine söndürme kararının kendisi
     (komponent künyesi). Gizlenseydi test "yok" derdi; burada "var ama basılmıyor" aranıyor,
     çünkü çevrimdışı depocuya söylenmesi gereken cümle "şimdi olmaz", "burada yok" değil.

  Renk ve konum SINANMIYOR: Jest stil işlemez (`PressableSurface` künyesindeki `grow` notunun
  aynı sınırı) ve sınanmış gibi görünen bir stil iddiası, sınanmamış olduğunu saklar.
*/

describe('OperationsScanFab', () => {
  it('adıyla bulunur ve dokunuşu iletir', async () => {
    const onPress = jest.fn();
    await render(<OperationsScanFab icon="scan" onPress={onPress} accessibilityLabel="Ürün barkodunu okut" />);

    await fireEvent.press(screen.getByRole('button', { name: 'Ürün barkodunu okut' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('kapalıyken ekranda DURUR ama çağırana ulaşmaz', async () => {
    const onPress = jest.fn();
    await render(
      <OperationsScanFab
        icon="scan"
        onPress={onPress}
        accessibilityLabel="Ürün barkodunu okut"
        disabled
        testID="okut-fab"
      />,
    );

    // Gizlenmedi: çevrimdışı hâlin cümlesi "şimdi olmaz", "burada yok" değil.
    expect(screen.getByTestId('okut-fab')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('okut-fab'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('eylem tonunda da aynı düğmedir — ton adı ve dokunuşu değiştirmez', async () => {
    const onPress = jest.fn();
    await render(
      <OperationsScanFab icon="packages" onPress={onPress} accessibilityLabel="Kutu aç" tone="action" />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Kutu aç' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
