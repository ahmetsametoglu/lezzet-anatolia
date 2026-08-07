import { customerAppText, customerColors, customerText } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { BottomTabBar } from './bottom-tab-bar';
import { appMetrics } from '../../theme/metrics';
import { mapTokens } from '../../theme/parse';

const appText = mapTokens({ ...customerText, ...customerAppText });

const items = [
  { key: 'index', label: 'Vitrin', selected: false, onPress: jest.fn() },
  { key: 'catalog', label: 'Katalog', selected: true, onPress: jest.fn() },
  { key: 'orders', label: 'Siparişler', selected: false, onPress: jest.fn() },
  { key: 'account', label: 'Hesap', selected: false, onPress: jest.fn() },
];

describe('BottomTabBar', () => {
  it('dört sekmeyi çizer, seçili olanı terracotta yazar, ötekiler soluk kalır', async () => {
    await render(<BottomTabBar items={items} />);

    expect(screen.getByText('Katalog')).toHaveStyle({
      color: customerColors.terracotta,
      fontSize: appText.micro,
      fontWeight: appText['eyebrow--font-weight'],
    });
    expect(screen.getByText('Vitrin')).toHaveStyle({ color: customerColors.muted });
    expect(screen.getAllByRole('tab')).toHaveLength(4);
  });

  it('seçililik a11y durumuna da gider — renk farkı ekran okuyucuya ulaşmaz', async () => {
    await render(<BottomTabBar items={items} />);

    expect(screen.getByRole('tab', { name: 'Katalog', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Vitrin', selected: false })).toBeOnTheScreen();
  });

  it('basılan sekmenin işleyicisi çağrılır', async () => {
    const onPress = jest.fn();
    await render(<BottomTabBar items={[{ key: 'orders', label: 'Siparişler', selected: false, onPress }]} />);

    await fireEvent.press(screen.getByRole('tab', { name: 'Siparişler' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('çubuk zemini ve üst çizgisi temadan gelir (ham değer yok)', async () => {
    await render(<BottomTabBar items={items} testID="tabs" />);

    expect(screen.getByTestId('tabs')).toHaveStyle({
      backgroundColor: customerColors['sand-50'],
      borderTopColor: customerColors.ink,
      borderTopWidth: appMetrics.border.base,
    });
  });
});
