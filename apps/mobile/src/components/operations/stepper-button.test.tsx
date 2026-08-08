import { fireEvent, render, screen } from '@testing-library/react-native';

import { OperationsStepperButton } from './stepper-button';

/*
  Ölçülen üç şey: doğru işaret karakteri (eksi U+2212, tire DEĞİL — hizayı o belirliyor), engelli
  düğmenin çağırana ulaşmaması ve ekran okuyucu adının işaretin yerine geçmesi.
*/

describe('OperationsStepperButton', () => {
  it('azaltma işareti matematiksel EKSİDİR, tire değil', async () => {
    await render(
      <OperationsStepperButton direction="decrease" onPress={jest.fn()} accessibilityLabel="Tutarı azalt" />,
    );

    expect(screen.getByText('−')).toBeOnTheScreen();
    expect(screen.queryByText('-')).toBeNull();
  });

  it('dokunuşu iletir ve ekran okuyucuya ADIYLA görünür', async () => {
    const onPress = jest.fn();
    await render(
      <OperationsStepperButton direction="increase" onPress={onPress} accessibilityLabel="Tutarı artır" />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Tutarı artır' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('engelliyken çağırana ulaşmaz', async () => {
    const onPress = jest.fn();
    await render(
      <OperationsStepperButton
        direction="increase"
        onPress={onPress}
        accessibilityLabel="Tutarı artır"
        disabled
        testID="stepper"
      />,
    );

    await fireEvent.press(screen.getByTestId('stepper'));

    expect(onPress).not.toHaveBeenCalled();
  });
});
