import { customerColors } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { appMetrics } from '@lezzet/mobile-kit/src/theme/metrics';
import { ProductCircleCard } from './product-circle-card';

describe('ProductCircleCard', () => {
  it('ad ve fiyatı gösterir, a11y adı ikisinden kurulur, basılınca çağırır', async () => {
    const onPress = jest.fn();
    await render(<ProductCircleCard name="Antep fıstığı" priceLabel="12,90 €" onPress={onPress} />);

    expect(screen.getByText('Antep fıstığı')).toBeOnTheScreen();
    expect(screen.getByText('12,90 €')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Antep fıstığı · 12,90 €' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // İki boyut kademesi de ölçü katmanından okunur; varsayılan vitrin çapıdır.
  it('iki boyut kademesi ölçü katmanından gelir, varsayılan vitrin çapıdır', async () => {
    await render(
      <>
        <ProductCircleCard name="Zeytin" priceLabel="8 €" onPress={jest.fn()} size="sm" testID="small" />
        <ProductCircleCard name="Zeytin" priceLabel="8 €" onPress={jest.fn()} testID="default" />
      </>,
    );

    expect(screen.getByTestId('small').children[0]).toHaveStyle({
      width: appMetrics.size.circleSm,
      height: appMetrics.size.circleSm,
    });
    expect(screen.getByTestId('default').children[0]).toHaveStyle({
      width: appMetrics.size.circleLg,
      height: appMetrics.size.circleLg,
    });
  });

  it('tükendi: daire solar ve rozet çıkar', async () => {
    await render(
      <ProductCircleCard name="Nar ekşisi" priceLabel="6 €" onPress={jest.fn()} soldOut soldOutLabel="TÜKENDİ" />,
    );

    expect(screen.getByText('TÜKENDİ')).toBeOnTheScreen();
  });

  it('tükendi rozeti indirim rozetinin ÖNÜNE geçer (ikisi aynı köşede)', async () => {
    await render(
      <ProductCircleCard
        name="Kekik"
        priceLabel="4 €"
        onPress={jest.fn()}
        soldOut
        soldOutLabel="TÜKENDİ"
        discountLabel="İNDİRİM"
      />,
    );

    expect(screen.getByText('TÜKENDİ')).toBeOnTheScreen();
    expect(screen.queryByText('İNDİRİM')).toBeNull();
  });

  it('miktar satırı verilince yardımcı kademede çıkar ve ekran okuyucu fiyatı miktarla duyar', async () => {
    await render(<ProductCircleCard name="Simit" priceLabel="3,50 €" onPress={jest.fn()} quantityLabel="4 adet" />);

    expect(screen.getByText('4 adet')).toHaveStyle({ color: customerColors.muted });
    expect(screen.getByRole('button', { name: 'Simit · 4 adet · 3,50 €' })).toBeOnTheScreen();
  });

  it('fotoğraf yoksa adın baş harfine düşer — ve daire a11y ağacında GÖRÜNMEZ (kartın adı yeter)', async () => {
    await render(<ProductCircleCard name="Bulgur" priceLabel="3 €" onPress={jest.fn()} />);

    expect(screen.queryByText('B')).toBeNull();
    expect(screen.getByText('B', { includeHiddenElements: true })).toBeOnTheScreen();
  });
});
