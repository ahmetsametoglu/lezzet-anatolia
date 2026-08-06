import { render, screen } from '@testing-library/react-native';

import { ScreenPlaceholder } from './screen-placeholder';

// RNTL v14 async API: `render` Promise döner ve await edilir (v14 sürüm notları).
// Assert davranış + erişilebilirlik üzerinden — stil assert edilmez (jest.setup.ts notu).
describe('ScreenPlaceholder', () => {
  it('verilen başlığı header rolüyle gösterir', async () => {
    await render(<ScreenPlaceholder title="Lezzet Anatolia" />);

    expect(screen.getByRole('header')).toHaveTextContent('Lezzet Anatolia');
  });
});
