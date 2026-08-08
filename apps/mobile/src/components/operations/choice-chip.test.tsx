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

  it('`fill` segmenti satırı eşit paylaştırır; varsayılan içerik genişliğidir', async () => {
    await render(
      <>
        <OperationsChoiceChip label="a" selected={false} onPress={jest.fn()} fill testID="fill" />
        <OperationsChoiceChip label="b" selected={false} onPress={jest.fn()} testID="hug" />
      </>,
    );

    expect(screen.getByTestId('fill')).toHaveStyle({ flex: 1 });
    expect(screen.getByTestId('hug')).not.toHaveStyle({ flex: 1 });
  });
});
