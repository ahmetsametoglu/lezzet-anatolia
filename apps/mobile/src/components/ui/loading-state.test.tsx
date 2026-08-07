import { customerAppColors, customerColors } from '@lezzet/design-tokens';
import { render, screen } from '@testing-library/react-native';

import { appMetrics } from '../../theme/metrics';
import { LoadingState } from './loading-state';

describe('LoadingState', () => {
  it('progressbar rolüyle ve meşgul durumuyla duyurulur', async () => {
    await render(<LoadingState accessibilityLabel="Yükleniyor" />);

    const indicator = screen.getByRole('progressbar', { name: 'Yükleniyor' });
    expect(indicator).toBeOnTheScreen();
    expect(indicator).toBeBusy();
  });

  it('isteğe bağlı metni gösterir', async () => {
    await render(<LoadingState accessibilityLabel="Yükleniyor" label="Yükleniyor…" />);

    expect(screen.getByText('Yükleniyor…')).toBeOnTheScreen();
  });

  it('halka izi UYGULAMANIN fark kum tonundan, üst yay zeytinden gelir', async () => {
    await render(<LoadingState accessibilityLabel="Yükleniyor" testID="spinner" />);

    // Halka, satırın tek Animated çocuğudur.
    const ring = screen.getByTestId('spinner').children[0];
    expect(ring).toHaveStyle({
      borderColor: customerAppColors['sand-300'],
      borderTopColor: customerColors.olive,
      width: appMetrics.size.spinnerMd,
    });
  });

  it('üç boyut kademesi ölçü katmanından gelir', async () => {
    await render(<LoadingState accessibilityLabel="Yükleniyor" size="sm" testID="spinner" />);

    expect(screen.getByTestId('spinner').children[0]).toHaveStyle({
      width: appMetrics.size.spinnerSm,
      height: appMetrics.size.spinnerSm,
    });
  });
});
