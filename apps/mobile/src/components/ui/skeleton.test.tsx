import { customerAppColors, customerAppRadius } from '@lezzet/design-tokens';
import { render, screen } from '@testing-library/react-native';

import { appMetrics } from '../../theme/metrics';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('zemini UYGULAMANIN fark kum tonundan alır', async () => {
    await render(<Skeleton width={96} height={12} testID="skel" />);

    expect(screen.getByTestId('skel', { includeHiddenElements: true })).toHaveStyle({ backgroundColor: customerAppColors['sand-300'] });
  });

  it('varsayılan yarıçap yüksekliğin yarısıdır (çubuk ve daire aynı kuraldan)', async () => {
    await render(<Skeleton width={138} height={138} testID="skel" />);

    expect(screen.getByTestId('skel', { includeHiddenElements: true })).toHaveStyle({ borderRadius: 69, width: 138, height: 138 });
  });

  it('istenirse resmî yarıçap setinden bir kademe alır', async () => {
    await render(<Skeleton width="100%" height={64} radius="card" testID="skel" />);

    expect(screen.getByTestId('skel', { includeHiddenElements: true })).toHaveStyle({ borderRadius: Number.parseFloat(customerAppRadius.card) });
  });

  it('nabız asgari opaklıkta başlar (ölçü katmanından)', async () => {
    await render(<Skeleton width={58} height={10} testID="skel" />);

    expect(screen.getByTestId('skel', { includeHiddenElements: true })).toHaveStyle({ opacity: appMetrics.skeleton.minOpacity });
  });

  it('ekran okuyucudan gizlidir — yer tutucu içerik değildir', async () => {
    await render(<Skeleton width={58} height={10} testID="skel" />);

    const block = screen.getByTestId('skel', { includeHiddenElements: true });
    expect(block.props.accessibilityElementsHidden).toBe(true);
    expect(block.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
