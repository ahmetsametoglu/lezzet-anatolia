import { fireEvent, render, screen } from '@testing-library/react-native';

import { OperationsQtyStepperField } from './qty-stepper-field';

/*
  Alanın sözleri, hepsi davranış:
  · sayı OKUNUR ama dokunulamaz (klavyesiz sayımın kendisi),
  · taban ve tavan gerçekten DUVAR — düğme sönmekle kalmaz, çağırana da ulaşmaz,
  · tavan verilmezse üst sınır YOKTUR (yumuşak sınırı çağıran uyarır, alan engellemez).
*/

const props = { caption: 'bu kutuya konuyor', label: 'Fıstıklı Baklava için adet' };

describe('OperationsQtyStepperField', () => {
  it('değeri ve açıklamasını yazar', async () => {
    await render(<OperationsQtyStepperField value={3} onChange={jest.fn()} {...props} testID="adet" />);

    expect(screen.getByTestId('adet-value')).toHaveTextContent('3');
    expect(screen.getByText('bu kutuya konuyor')).toBeTruthy();
  });

  it('sayının kendisi DOKUNULAMAZ — değişmenin tek yolu ±', async () => {
    await render(<OperationsQtyStepperField value={3} onChange={jest.fn()} {...props} testID="adet" />);

    // İki düğme var (azalt/artır); sayı üçüncü bir düğme değil.
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('artırır ve azaltır', async () => {
    const onChange = jest.fn();
    await render(<OperationsQtyStepperField value={3} onChange={onChange} {...props} testID="adet" />);

    await fireEvent.press(screen.getByTestId('adet-increase'));
    expect(onChange).toHaveBeenLastCalledWith(4);

    await fireEvent.press(screen.getByTestId('adet-decrease'));
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it('tabanda azaltma çağırana ULAŞMAZ', async () => {
    const onChange = jest.fn();
    await render(<OperationsQtyStepperField value={0} onChange={onChange} {...props} testID="adet" />);

    await fireEvent.press(screen.getByTestId('adet-decrease'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('tavanda artırma çağırana ULAŞMAZ — fiziksel duvar', async () => {
    const onChange = jest.fn();
    await render(<OperationsQtyStepperField value={5} max={5} onChange={onChange} {...props} testID="adet" />);

    await fireEvent.press(screen.getByTestId('adet-increase'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('tavan verilmezse üst sınır YOKTUR — yumuşak sınırı çağıran uyarır', async () => {
    const onChange = jest.fn();
    await render(<OperationsQtyStepperField value={999} onChange={onChange} {...props} testID="adet" />);

    await fireEvent.press(screen.getByTestId('adet-increase'));

    expect(onChange).toHaveBeenLastCalledWith(1000);
  });
});
