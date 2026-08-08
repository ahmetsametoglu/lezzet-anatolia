import {
  customerAppColors,
  customerAppText,
  customerColors,
  customerText,
  operationsAppColors,
  operationsAppText,
} from '@lezzet/design-tokens';
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

/*
  OPERASYON TONU (21.9) — aynı iskelet, başka yüzey. Beklenen değerler `operationsApp*`
  token'larından TÜRETİLİR (ham hex teste de yazılmaz): tasarım seti değişirse test tanım gereği
  ayak uydurur.
*/
describe('BottomTabBar · operasyon tonu', () => {
  const operationsItems: BottomTabItem[] = [
    { key: 'courier', label: 'Kurye', icon: 'courier', selected: true, onPress: jest.fn() },
    { key: 'warehouse', label: 'Depo', icon: 'warehouse', selected: false, onPress: jest.fn() },
  ];

  it('seçili sekme MÜREKKEP, seçilmeyen `tab-inactive` — terracotta/muted çifti değil', async () => {
    await render(<BottomTabBar items={operationsItems} tone="operations" />);

    expect(screen.getByText('Kurye')).toHaveStyle({ color: customerColors.ink });
    expect(screen.getByText('Depo')).toHaveStyle({ color: operationsAppColors['tab-inactive'] });
    expect(screen.getByText('Kurye')).not.toHaveStyle({ color: customerColors.terracotta });
  });

  it('etiket kademesi `meta` (10,5) — müşterinin `micro` yuvarlaması burada gerekmiyor', async () => {
    await render(<BottomTabBar items={operationsItems} tone="operations" />);

    expect(screen.getByText('Kurye')).toHaveStyle({ fontSize: Number.parseFloat(operationsAppText.meta) });
  });

  it('üst çizgi kum ayracıdır, mürekkep değil', async () => {
    await render(<BottomTabBar items={operationsItems} tone="operations" testID="ops-tabs" />);

    expect(screen.getByTestId('ops-tabs')).toHaveStyle({ borderTopColor: customerAppColors['sand-300'] });
  });

  it('seçili ikon YÜKSELMEZ: operasyon tasarımı durumu yalnız RENKLE söylüyor', async () => {
    await render(<BottomTabBar items={operationsItems} tone="operations" testID="ops-tabs" />);

    expect(screen.getByTestId('ops-tabs-courier').children[0]).not.toHaveStyle({
      transform: [{ translateY: appMetrics.tabSelected.lift }, { scale: appMetrics.tabSelected.scale }],
    });
  });

  it('a11y sözleşmesi tondan bağımsızdır — rol ve seçililik aynı', async () => {
    await render(<BottomTabBar items={operationsItems} tone="operations" />);

    expect(screen.getByRole('tab', { name: 'Kurye', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Depo', selected: false })).toBeOnTheScreen();
  });
});
