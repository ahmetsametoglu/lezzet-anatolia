import { customerAppColors, customerColors } from '@lezzet/design-tokens';
import { render, screen } from '@testing-library/react-native';

import { appMetrics } from '../../theme/metrics';
import { AvatarThumb } from './avatar-thumb';

describe('AvatarThumb', () => {
  it('fotoğraf yokken baş harfi gösterir ve image rolüyle adlandırılır', async () => {
    await render(<AvatarThumb initial="A" accessibilityLabel="Ayşe Yılmaz" />);

    expect(screen.getByText('A')).toBeOnTheScreen();
    expect(screen.getByRole('image', { name: 'Ayşe Yılmaz' })).toBeOnTheScreen();
  });

  it('fotoğraf verilince baş harfi göstermez', async () => {
    await render(<AvatarThumb initial="A" accessibilityLabel="Zeytinyağı" photoUri="https://cdn/x.jpg" />);

    expect(screen.queryByText('A')).toBeNull();
  });

  it('üç boyut kademesi ölçü katmanından gelir', async () => {
    await render(<AvatarThumb initial="B" accessibilityLabel="Büyük" size="lg" testID="a" />);

    expect(screen.getByTestId('a')).toHaveStyle({
      width: appMetrics.size.avatarLg,
      height: appMetrics.size.avatarLg,
      borderRadius: appMetrics.size.avatarLg / 2,
    });
  });

  it('nötr ton kum zemin, zeytin ton olumlu bant zemini kullanır', async () => {
    await render(<AvatarThumb initial="C" accessibilityLabel="Kum" testID="sand" />);
    expect(screen.getByTestId('sand')).toHaveStyle({ backgroundColor: customerAppColors['sand-300'] });

    await render(<AvatarThumb initial="D" accessibilityLabel="Zeytin" tone="olive" testID="olive" />);
    expect(screen.getByTestId('olive')).toHaveStyle({ backgroundColor: customerColors['olive-bg'] });
    expect(screen.getByText('D')).toHaveStyle({ color: customerColors['olive-dark'] });
  });

  it('yığın varyantı komşusunun üstüne biner ve krem halka alır', async () => {
    await render(<AvatarThumb initial="E" accessibilityLabel="Yığın" stacked testID="a" />);

    expect(screen.getByTestId('a')).toHaveStyle({
      marginLeft: -appMetrics.space.lg,
      borderWidth: appMetrics.border.ring,
      borderColor: customerColors['sand-50'],
    });
  });
});
