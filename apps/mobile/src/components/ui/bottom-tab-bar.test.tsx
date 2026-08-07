import { customerAppColors, customerAppText, customerColors, customerText } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { BottomTabBar, type BottomTabItem } from './bottom-tab-bar';
import { appMetrics } from '../../theme/metrics';
import { mapTokens } from '../../theme/parse';

const appText = mapTokens({ ...customerText, ...customerAppText });

const items: BottomTabItem[] = [
  { key: 'index', label: 'Vitrin', icon: 'home', selected: false, onPress: jest.fn() },
  { key: 'catalog', label: 'Katalog', icon: 'catalog', selected: true, onPress: jest.fn() },
  { key: 'orders', label: 'Siparişler', icon: 'orders', selected: false, onPress: jest.fn() },
  { key: 'account', label: 'Hesap', icon: 'account', selected: false, onPress: jest.fn() },
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
    await render(<BottomTabBar items={[{ key: 'orders', label: 'Siparişler', icon: 'orders', selected: false, onPress }]} />);

    await fireEvent.press(screen.getByRole('tab', { name: 'Siparişler' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('çubuğun üst çizgisi temadan gelir; zemin KREM CAM katmanındadır (ham değer yok)', async () => {
    // Token Kararlari #17: çubuğun kendisi bulanık yüzey, krem tonu onun üstündeki katmandan
    // gelir — o yüzden zemin `testID`li kutuda DEĞİL, kardeşi olan cam katmanındadır.
    await render(<BottomTabBar items={items} testID="tabs" />);

    expect(screen.getByTestId('tabs')).toHaveStyle({
      borderTopColor: customerColors.ink,
      borderTopWidth: appMetrics.border.base,
    });
  });

  it('her sekme kendi ikonunu çizer — ikon a11y ağacında GÖRÜNMEZ (etiket zaten konuşuyor)', async () => {
    await render(<BottomTabBar items={items} />);

    // İkonlar ekran okuyucudan gizli: `tab` rolündeki dört düğmenin adı yalnız etiketten gelir.
    expect(screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual([
      'Vitrin',
      'Katalog',
      'Siparişler',
      'Hesap',
    ]);
  });

  it('seçili sekmenin ikonu yukarı kalkıp büyür — DURUM vurgusu (basılı geri bildirimden ayrı)', async () => {
    await render(<BottomTabBar items={items} testID="tabs" />);

    // Seçili sekme "Katalog"; dönüşüm ikonun SARMALAYICISINDA (ilk çocuk).
    const selected = screen.getByTestId('tabs-catalog').children[0];
    expect(selected).toHaveStyle({
      transform: [{ translateY: appMetrics.tabSelected.lift }, { scale: appMetrics.tabSelected.scale }],
    });
    expect(screen.getByTestId('tabs-index').children[0]).not.toHaveStyle({
      transform: [{ translateY: appMetrics.tabSelected.lift }, { scale: appMetrics.tabSelected.scale }],
    });
  });

  it('zemin KREM CAM: %96 krem katmanı çubuğun içinde durur (opak `sand-50` yaması kalktı)', async () => {
    await render(<BottomTabBar items={items} testID="tabs" />);

    expect(screen.getByTestId('tabs-glass')).toHaveStyle({
      backgroundColor: customerAppColors['cream-glass'],
    });
  });
});
