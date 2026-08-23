import { fireEvent, render, screen } from '@testing-library/react-native';

import { OperationsChoiceChip } from './choice-chip';

/*
  Kitin sözleşmesi üç maddedir ve üçü de ölçülüyor: dokunuş çağırana gider, SEÇİLİLİK ekran
  okuyucuya bildirilir (renk farkı ona ulaşmaz) ve segment biçimi satırı EŞİT paylaşır.
*/

describe('OperationsChoiceChip', () => {
  it('dokunuşu çağırana iletir', async () => {
    const onPress = jest.fn();
    await render(<OperationsChoiceChip label="nakit" selected={false} onPress={onPress} testID="chip" />);

    await fireEvent.press(screen.getByTestId('chip'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('seçililiği ERİŞİLEBİLİRLİĞE de bildirir', async () => {
    await render(<OperationsChoiceChip label="kart" selected onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'kart', selected: true })).toBeOnTheScreen();
  });

  it('`fill` esnemeyi DIŞ Pressable`a taşır — iç yüzeyde `flex` OLMAZ (23.08 arızası)', async () => {
    await render(
      <>
        <OperationsChoiceChip label="a" selected={false} onPress={jest.fn()} fill testID="fill" />
        <OperationsChoiceChip label="b" selected={false} onPress={jest.fn()} testID="hug" />
      </>,
    );

    // İç yüzeye `flex: 1` yazmak cihazda düğmeyi daraltıp metni eziyordu (ölçüldü 23.08 —
    // `PressableSurface.grow` künyesi). Esneme dış Pressable'da (grow prop'u); iç yüzey temiz.
    expect(screen.getByTestId('fill')).not.toHaveStyle({ flex: 1 });
    expect(screen.getByTestId('fill').parent?.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ flex: 1 })]),
    );
    expect(screen.getByTestId('hug')).not.toHaveStyle({ flex: 1 });
  });
});
