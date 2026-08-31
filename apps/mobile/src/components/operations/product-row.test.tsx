import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { OperationsProductRow } from './product-row';

/*
  Satırın ölçülebilir sözleri — hepsi DAVRANIŞ, biçim değil (Jest stil işlemez):

  · ad ve boy AYNI başlıkta okunur (iki `Text` olsa da ekran okuyucu tek cümle duyar),
  · boy yoksa hiç yazılmaz,
  · `onPress` yoksa satır DÜĞME DEĞİLDİR — kapanan kutunun kaydı dokunulamaz olmalı,
  · `meta` ve `right` çağıranın verdiği şeyi aynen taşır (kabuk çağıranın işi kuralının kanıtı).
*/

describe('OperationsProductRow', () => {
  it('adı ve boyu tek başlıkta yazar', async () => {
    await render(<OperationsProductRow name="Fıstıklı Baklava" variantLabel="1250 g" />);

    expect(screen.getByText(/Fıstıklı Baklava/)).toBeTruthy();
    expect(screen.getByText('1250 g')).toBeTruthy();
  });

  it('boy yoksa boş bir yarım çizmez', async () => {
    await render(<OperationsProductRow name="Şöbiyet" testID="satir" />);

    expect(screen.getByText('Şöbiyet')).toBeTruthy();
    // Tek çocuk: başlık. Boy için ikinci bir `Text` doğmamalı.
    expect(screen.queryByText(' ')).toBeNull();
  });

  it('meta ve sağ blok çağırandan geldiği gibi durur', async () => {
    await render(
      <OperationsProductRow
        name="Su Böreği"
        variantLabel="tepsi"
        meta={<Text>KURU DEPO A1</Text>}
        right={<Text>2/6</Text>}
      />,
    );

    expect(screen.getByText('KURU DEPO A1')).toBeTruthy();
    expect(screen.getByText('2/6')).toBeTruthy();
  });

  it('dokunuşsuz satır DÜĞME DEĞİLDİR — kapanan kutunun kaydı basılamaz', async () => {
    await render(<OperationsProductRow name="Acılı Ezme" variantLabel="250 g" testID="kayit" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('dokunuşlu satır adıyla bulunur ve çağırana ulaşır', async () => {
    const onPress = jest.fn();
    await render(
      <OperationsProductRow
        name="Acılı Ezme"
        variantLabel="250 g"
        onPress={onPress}
        accessibilityLabel="Acılı Ezme · elle düzelt"
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Acılı Ezme · elle düzelt' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
