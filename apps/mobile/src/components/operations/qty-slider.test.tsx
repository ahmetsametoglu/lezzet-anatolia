import { fireEvent, render, screen } from '@testing-library/react-native';

import { axisWindow, growthFactor, OperationsQtySlider, snapToStep } from './qty-slider';

/*
  Sürükleme jesti jest'te sahte (RNGH jestSetup) — jest burada matematiği ve dokunulabilir
  yüzeyleri ölçer; sürükleme + kenarda büyüme cihaz turunun işidir (23.08 deseni: vizör gibi,
  sonuç cümlesiyle doğrulanır).
*/

const FINE = { increase: 'Adedi artır', decrease: 'Adedi azalt' };

describe('axisWindow', () => {
  it('beklenen adet eksenin açılış tavanıdır', () => {
    expect(axisWindow(12, 12, 120)).toBe(120);
  });

  it('beklenen yoksa 10 kaba adımlık pencere açar (tekilde en az 10)', () => {
    expect(axisWindow(0, 12, null)).toBe(120);
    expect(axisWindow(1, 1, null)).toBe(10);
  });

  it('taşan değerde pencere değerin %25 üstüne, adımın katına oturur', () => {
    // 200 * 1.25 = 250 → 12'nin katına yukarı: 252. Topuz uçtan içeri döner, oynayacak yer kalır.
    expect(axisWindow(200, 12, 120)).toBe(252);
  });
});

describe('snapToStep · growthFactor', () => {
  it('ham değer kaba adımın katına yuvarlanır', () => {
    expect(snapToStep(29, 12)).toBe(24);
    expect(snapToStep(31, 12)).toBe(36);
  });

  it('kenarda tutma ivmesi kademeli hızlanır', () => {
    expect(growthFactor(1)).toBe(1);
    expect(growthFactor(5)).toBe(2);
    expect(growthFactor(9)).toBe(4);
    expect(growthFactor(20)).toBe(8);
  });
});

describe('OperationsQtySlider', () => {
  it('± ince ayar 1er oynatır; sıfırda azaltma kapalıdır', async () => {
    const onChange = jest.fn();
    await render(
      <OperationsQtySlider
        value={12}
        onChange={onChange}
        step={12}
        expected={120}
        accessibilityLabel="Gelen adet"
        fineLabels={FINE}
        testID="qty"
      />,
    );

    await fireEvent.press(screen.getByTestId('qty-increase'));
    expect(onChange).toHaveBeenLastCalledWith(13);

    await fireEvent.press(screen.getByTestId('qty-decrease'));
    expect(onChange).toHaveBeenLastCalledWith(11);
  });

  it('sıfırdayken azaltma düğmesi devre dışıdır ve değer eksiye inmez', async () => {
    const onChange = jest.fn();
    await render(
      <OperationsQtySlider
        value={0}
        onChange={onChange}
        step={1}
        accessibilityLabel="Gelen adet"
        fineLabels={FINE}
        testID="qty"
      />,
    );

    await fireEvent.press(screen.getByTestId('qty-decrease'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ekran okuyucu kaba adımla gezer (increment = çarpan), sıfırın altına inmez', async () => {
    const onChange = jest.fn();
    await render(
      <OperationsQtySlider
        value={12}
        onChange={onChange}
        step={12}
        expected={120}
        accessibilityLabel="Gelen adet"
        fineLabels={FINE}
        testID="qty"
      />,
    );

    const track = screen.getByTestId('qty-track');
    await fireEvent(track, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(24);

    await fireEvent(track, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('değer büyük puntoyla yazar, açıklama satırı ekrandan gelir', async () => {
    await render(
      <OperationsQtySlider
        value={40}
        onChange={jest.fn()}
        step={4}
        accessibilityLabel="Gelen adet"
        fineLabels={FINE}
        caption="10 koli"
        testID="qty"
      />,
    );

    expect(screen.getByTestId('qty-value')).toHaveTextContent('40');
    expect(screen.getByText('10 koli')).toBeOnTheScreen();
  });
});
