import { customerColors } from '@lezzet/design-tokens';
import { render, screen } from '@testing-library/react-native';

import { Icon } from './icon';
import { ICON_PATHS } from './icon-paths';
import { appMetrics } from '../../theme/metrics';

/*
  Testin işi üç şey: (1) geometri TASARIMDAN geliyor mu (sözlük ile çizim ayrışmasın),
  (2) renk ve kalınlık TEMADAN geliyor mu (ham değer yasak), (3) ikon ekran okuyucuda
  görünmüyor mu — kitteki her kullanımda ikonun yanında zaten bir metin var.

  `includeHiddenElements` HER SORGUDA açık: ikon kendini a11y ağacından çıkarıyor ve RNTL'in
  varsayılan sorguları gizli öğeleri atlıyor. Bayrağı açmak testin ikonu bulmasını sağlar,
  gizliliğin KENDİSİ ise son testte ayrıca doğrulanıyor.
*/

const hidden = { includeHiddenElements: true } as const;

/** Bir düğümün öğe (metin olmayan) çocukları — `ReactTestInstance` adı RNTL'den ihraç edilmiyor. */
type ElementChild = Exclude<ReturnType<typeof screen.getByTestId>['children'][number], string>;

/** `react-native-svg` çizim öğelerini yerel (`RNSVG*`) düğümlere indirger; test o düğümleri okur. */
const shapesOf = (testID: string): ElementChild[] =>
  screen
    .getByTestId(testID, hidden)
    .children.flatMap((group) =>
      typeof group === 'string' ? [] : group.children.filter((child): child is ElementChild => typeof child !== 'string'),
    );

describe('Icon', () => {
  it('sözlükteki yolları çizer — geometri komponentte değil, `icon-paths.ts`te durur', async () => {
    await render(<Icon name="home" size={appMetrics.size.tabIcon} testID="ic" />);

    expect(shapesOf('ic').map((shape) => shape.props.d)).toEqual(ICON_PATHS.home.paths);
  });

  it('daireli ikonda hem yol hem daire çizilir (şablonun kendi ayrımı korunur)', async () => {
    // Büyüteç şablonda `<circle>` + `<path>`; daireyi bir `d` yayına çevirmek geometriyi
    // YENİDEN YAZMAK olurdu — ölçü aynı kalsa bile artık tasarımın söylediği şey olmazdı.
    await render(<Icon name="search" size={appMetrics.size.inlineIcon} testID="ic" />);

    expect(shapesOf('ic').map((shape) => shape.type)).toEqual(['RNSVGPath', 'RNSVGCircle']);
    expect(shapesOf('ic')[1]?.props).toMatchObject({ cx: 11, cy: 11, r: 7 });
  });

  it('renk ÇAĞIRANDAN gelir; verilmezse paletin mürekkebine düşer', async () => {
    await render(<Icon name="filter" size={appMetrics.size.inlineIcon} testID="ic" />);

    expect(screen.getByTestId('ic', hidden).props.stroke).toBe(customerColors.ink);
  });

  it('renk verilince onu kullanır — ham hex komponente girmez', async () => {
    await render(<Icon name="catalog" size={appMetrics.size.tabIcon} color={customerColors.terracotta} testID="ic" />);

    expect(screen.getByTestId('ic', hidden).props.stroke).toBe(customerColors.terracotta);
  });

  it('çizgi kalınlığı BOYA göre kademelenir: küçük ikon kalın, büyük ikon ince', async () => {
    await render(<Icon name="catalog" size={appMetrics.size.tabIcon} testID="small" />);

    expect(screen.getByTestId('small', hidden).props.strokeWidth).toBe(appMetrics.border.iconStroke);
  });

  it('boş/hata bloğunun büyük ikonu ince çizgiyi alır', async () => {
    await render(<Icon name="connection-off" size={appMetrics.size.errorIcon} testID="big" />);

    expect(screen.getByTestId('big', hidden).props.strokeWidth).toBe(appMetrics.border.iconStrokeLarge);
  });

  it('kare OLMAYAN kutuda genişlik `viewBox` oranından türer (süzgeç 19×17)', async () => {
    // Kareye genişletmek çizgileri kutunun içinde kaydırırdı — yani ikonu yeniden çizmek.
    await render(<Icon name="filter" size={17} testID="ic" />);

    // `react-native-svg` `viewBox`u yerel düğümde `vbWidth`/`vbHeight`e ayırır.
    expect(screen.getByTestId('ic', hidden).props).toMatchObject({ width: 19, height: 17, vbWidth: 19, vbHeight: 17 });
  });

  it('kare kutuda genişlik = yükseklik (24×24 sözlüğün varsayılanı)', async () => {
    await render(<Icon name="home" size={appMetrics.size.tabIcon} testID="ic" />);

    const icon = screen.getByTestId('ic', hidden);
    expect(icon.props.width).toBe(appMetrics.size.tabIcon);
    expect(icon.props.height).toBe(appMetrics.size.tabIcon);
  });

  it('ekran okuyucudan GİZLİDİR — yanındaki metin zaten aynı şeyi söylüyor', async () => {
    await render(<Icon name="orders" size={appMetrics.size.tabIcon} testID="ic" />);

    const icon = screen.getByTestId('ic', hidden);
    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(icon.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
