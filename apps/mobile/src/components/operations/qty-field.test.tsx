import { fireEvent, render, screen } from '@testing-library/react-native';

import { OperationsQtyField } from './qty-field';

/*
  ADET KUTUSU TESTİ — komponentin sözleşmesi: metni AYNEN taşır (ayrıştırmaz), ekran okuyucuya adını
  verir ve işaretli alanda eksi yazılabilen klavyeyi açar.

  "Boş ile sıfır ayrımı" burada SINANMAZ ve sınanmamalı: o kural çağıranın (`parseQty`) ve onun
  kendi testinin işi — komponent metni yorumlarsa ayrım iki yerde yaşamaya başlar.
*/

describe('operasyon adet kutusu', () => {
  it('metni aynen taşır ve değişikliği HAM dize olarak bildirir', async () => {
    const onChangeText = jest.fn();
    await render(
      <OperationsQtyField value="4" onChangeText={onChangeText} accessibilityLabel="Gelen adet" testID="qty" />,
    );

    expect(screen.getByTestId('qty').props.value).toBe('4');

    await fireEvent.changeText(screen.getByTestId('qty'), '12');
    expect(onChangeText).toHaveBeenCalledWith('12');
  });

  it('varsayılan klavye eksi TAŞIMAZ; `signed` alanda taşır', async () => {
    await render(<OperationsQtyField value="" onChangeText={jest.fn()} accessibilityLabel="Adet" testID="plain" />);
    expect(screen.getByTestId('plain').props.keyboardType).toBe('number-pad');

    await render(
      <OperationsQtyField value="" onChangeText={jest.fn()} accessibilityLabel="Adet" signed testID="signed" />,
    );
    expect(screen.getByTestId('signed').props.keyboardType).toBe('numbers-and-punctuation');
  });

  it('ekran okuyucu adı ZORUNLUDUR — yer tutucu onun yerine geçmez', async () => {
    await render(
      <OperationsQtyField
        value=""
        onChangeText={jest.fn()}
        accessibilityLabel="Mantı · 500 g için gelen adet"
        placeholder="—"
        testID="labelled"
      />,
    );

    expect(screen.getByLabelText('Mantı · 500 g için gelen adet')).toBeOnTheScreen();
    expect(screen.getByTestId('labelled').props.placeholder).toBe('—');
  });
});
