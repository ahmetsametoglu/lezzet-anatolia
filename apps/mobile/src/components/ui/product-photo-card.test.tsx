import {
  customerAppColors,
  customerAppGradient,
  customerAppRadius,
  customerAppText,
  customerColors,
  customerText,
} from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { processColor } from 'react-native';

import { ProductPhotoCard } from './product-photo-card';
import { appMetrics } from '../../theme/metrics';
import { parseLinearGradient } from '../../theme/gradient';
import { emToDp, mapTokens } from '../../theme/parse';

/*
  Testin işi iki şey: (1) kartın davranışı — durum rozetinin tek yuvası, tükendinin önceliği,
  erişilebilir adın kuruluşu; (2) DEĞERİN TEMADAN geldiğinin kanıtı. İkincisi olmadan bir gün
  birinin ham `#faf6ec` yazması hiçbir yerde patlamazdı (CLAUDE §3 — ham hex yasak).
*/

const appText = mapTokens({ ...customerText, ...customerAppText });
const appRadius = mapTokens(customerAppRadius);

describe('ProductPhotoCard', () => {
  it('ad ve fiyatı gösterir, a11y adı ikisinden kurulur, basılınca çağırır', async () => {
    const onPress = jest.fn();
    await render(<ProductPhotoCard name="Antep fıstığı" priceLabel="12,90 €" onPress={onPress} />);

    expect(screen.getByText('Antep fıstığı')).toBeOnTheScreen();
    expect(screen.getByText('12,90 €')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Antep fıstığı · 12,90 €' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('KARE: oran 1 ve fotoğraf katmanı kart yarıçapını (20) temadan alır', async () => {
    await render(<ProductPhotoCard name="Zeytin" priceLabel="8 €" onPress={jest.fn()} testID="card" />);

    const card = screen.getByTestId('card');
    expect(card).toHaveStyle({ aspectRatio: 1 });
    expect(card.children[0]).toHaveStyle({ borderRadius: appRadius.card });
  });

  it('fotoğrafın altında gradyan var ve durakları `photo-bottom` token’ından geliyor', async () => {
    await render(<ProductPhotoCard name="Pekmez" priceLabel="9 €" onPress={jest.fn()} testID="card" />);

    const expected = parseLinearGradient(customerAppGradient['photo-bottom']);
    const scrim = screen.getByTestId('card-scrim');
    // expo-linear-gradient renkleri motora vermeden önce `processColor`dan geçirir; karşılaştırma
    // aynı dönüşümden sonra yapılır, yoksa dizge ile sayı karşılaştırılmış olurdu.
    expect(scrim.props['colors']).toEqual(expected.colors.map((color) => processColor(color as string)));
    expect(scrim.props['locations']).toEqual(expected.locations);
  });

  it('tükendi: rozet çıkar, fotoğraf katmanı solar, durum a11y adına eklenir', async () => {
    await render(
      <ProductPhotoCard
        name="Nar ekşisi"
        priceLabel="6 €"
        onPress={jest.fn()}
        soldOut
        soldOutLabel="Tükendi"
        testID="card"
      />,
    );

    expect(screen.getByText('Tükendi')).toHaveStyle({ color: customerColors['sand-50'] });
    expect(screen.getByTestId('card').children[0]).toHaveStyle({ opacity: appMetrics.soldOutOpacity });
    expect(screen.getByRole('button', { name: 'Nar ekşisi · 6 € · Tükendi' })).toBeOnTheScreen();
  });

  it('tükendi rozeti indirim rozetinin ÖNÜNE geçer (ikisi aynı köşede)', async () => {
    await render(
      <ProductPhotoCard
        name="Kekik"
        priceLabel="4 €"
        onPress={jest.fn()}
        soldOut
        soldOutLabel="Tükendi"
        discountLabel="İndirim"
      />,
    );

    expect(screen.getByText('Tükendi')).toBeOnTheScreen();
    expect(screen.queryByText('İndirim')).toBeNull();
  });

  it('indirim rozeti terracotta metin taşır ve üstbaşlık kademesinde büyük harfe döner', async () => {
    await render(<ProductPhotoCard name="Bal" priceLabel="14 €" onPress={jest.fn()} discountLabel="İndirim" />);

    expect(screen.getByText('İndirim')).toHaveStyle({
      color: customerColors.terracotta,
      fontSize: appText.eyebrow,
      fontWeight: appText['eyebrow--font-weight'],
      letterSpacing: emToDp(appText['eyebrow-sm--letter-spacing'], appText.eyebrow),
      textTransform: 'uppercase',
    });
  });

  it('ad fotoğrafın ÜSTÜNDE krem renkte ve sıkı satır aralığıyla durur', async () => {
    await render(<ProductPhotoCard name="Bulgur" priceLabel="3 €" onPress={jest.fn()} />);

    expect(screen.getByText('Bulgur')).toHaveStyle({
      color: customerColors.cream,
      fontSize: appText.body,
      lineHeight: appText.body * appText['h1--line-height'],
    });
  });

  it('çeşit satırı verilince fotoğraf-üstü yumuşak tonda çıkar', async () => {
    await render(<ProductPhotoCard name="Salça" priceLabel="7 €" onPress={jest.fn()} optionsLabel="3 seçenek" />);

    expect(screen.getByText('3 seçenek')).toHaveStyle({
      color: customerColors['on-image-soft'],
      fontSize: appText.micro,
    });
  });

  it('fotoğraf yoksa baş harfe DÜŞMEZ — kum zemin kalır, ad zaten kartın üstünde', async () => {
    await render(<ProductPhotoCard name="Bulgur" priceLabel="3 €" onPress={jest.fn()} testID="card" />);

    expect(screen.queryByText('B', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId('card').children[0]).toHaveStyle({
      backgroundColor: customerAppColors['sand-300'],
    });
  });
});
