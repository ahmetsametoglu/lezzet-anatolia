import { fireEvent, render, screen } from '@testing-library/react-native';

import { OperationsStepperGroup } from './stepper-group';

/*
  Ölçülen dört şey: iki yönün de çağırana doğru sayıyı vermesi, TABANIN ALTINA inilememesi,
  ortadaki sayının DOKUNULABİLİR OLMAMASI (eldivenli parmak için tek yol ± düğmeleridir) ve
  ekran okuyucunun her iki düğmeyi de adıyla bulması.
*/

describe('OperationsStepperGroup', () => {
  it('artırma ve azaltma çağırana KOMŞU sayıyı verir', async () => {
    const onChange = jest.fn();
    await render(<OperationsStepperGroup value={3} onChange={onChange} label="Koli — 12 paket" />);

    await fireEvent.press(screen.getByRole('button', { name: 'Koli — 12 paket — artır' }));
    expect(onChange).toHaveBeenLastCalledWith(4);

    await fireEvent.press(screen.getByRole('button', { name: 'Koli — 12 paket — azalt' }));
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  /* Tabanda azaltma ENGELLİ, sessizce yutulmuş değil: engelli düğme kendi rengiyle "burası son"
     der; dokunulup hiçbir şey olmaması "bozuk" gibi okunurdu. */
  it('tabanda azaltma çağırana ULAŞMAZ', async () => {
    const onChange = jest.fn();
    await render(<OperationsStepperGroup value={0} onChange={onChange} label="Tek paket" />);

    await fireEvent.press(screen.getByRole('button', { name: 'Tek paket — azalt' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  /* Ortadaki sayı bir DÜĞME DEĞİL: dokunulabilir olsaydı cihaz klavyesi açılır ve sayacın var
     olma sebebi (klavyesiz sayım) ortadan kalkardı. */
  it('ortadaki sayı dokunulabilir değildir', async () => {
    await render(<OperationsStepperGroup value={7} onChange={jest.fn()} label="Tek paket" testID="sayac" />);

    expect(screen.getByTestId('sayac-value')).toHaveTextContent('7');
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
