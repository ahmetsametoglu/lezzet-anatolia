import { customerColors, operationsAppColors } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { appMetrics } from '../../theme/metrics';
import { NotificationBell } from './notification-bell';

describe('NotificationBell', () => {
  it('nötr KUTUCUK ölçüsü ve dolgusu temadan gelir (ham değer yok) — v3 daireyi bıraktı', async () => {
    await render(<NotificationBell onPress={jest.fn()} accessibilityLabel="Bildirimler" count={0} testID="bell" />);

    expect(screen.getByTestId('bell')).toHaveStyle({
      width: appMetrics.size.iconButton,
      height: appMetrics.size.iconButton,
      backgroundColor: operationsAppColors['neutral-bg'],
    });
    /* Yarıçap kutunun YARISI değil `badge` durağı — geri düğmesiyle aynı köşe (00-ortak kalıbı). */
    expect(screen.getByTestId('bell')).not.toHaveStyle({ borderRadius: appMetrics.size.iconButton / 2 });
  });

  it('sayaç SIFIRDA çizilmez — boş bir rozet "0 yeni" demez', async () => {
    await render(<NotificationBell onPress={jest.fn()} accessibilityLabel="Bildirimler" count={0} testID="bell" />);

    expect(screen.queryByTestId('bell-badge')).toBeNull();
  });

  it('sayaç varsa rozet terracotta zeminde yazılır', async () => {
    await render(<NotificationBell onPress={jest.fn()} accessibilityLabel="Bildirimler" count={3} testID="bell" />);

    expect(screen.getByTestId('bell-badge')).toHaveStyle({ backgroundColor: customerColors.terracotta });
    expect(screen.getByText('3')).toBeOnTheScreen();
  });

  it('ekran okuyucuya sayı DÜĞMENİN adıyla gider (rozet ayrıca okunmaz)', async () => {
    await render(
      <NotificationBell onPress={jest.fn()} accessibilityLabel="Bildirimler, 3 yeni" count={3} testID="bell" />,
    );

    expect(screen.getByRole('button', { name: 'Bildirimler, 3 yeni' })).toBeOnTheScreen();
  });

  it('basılınca işleyici çağrılır', async () => {
    const onPress = jest.fn();
    await render(<NotificationBell onPress={onPress} accessibilityLabel="Bildirimler" count={1} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Bildirimler' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
