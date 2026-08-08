import { customerColors, operationsAppText } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { OperationsStackHeader } from './stack-header';

describe('OperationsStackHeader', () => {
  it('başlık BAŞLIK rolüyle, künye satırı `meta` kademesinde soluk yazılır', async () => {
    await render(
      <OperationsStackHeader
        title="Bildirimler"
        subtitle="yalnız Kurye — rol süzmesi"
        onBack={jest.fn()}
        backLabel="Geri"
      />,
    );

    expect(screen.getByRole('header', { name: 'Bildirimler' })).toBeOnTheScreen();
    expect(screen.getByText('yalnız Kurye — rol süzmesi')).toHaveStyle({
      fontSize: Number.parseFloat(operationsAppText.meta),
      color: customerColors.muted,
    });
  });

  it('künye satırı isteğe bağlıdır', async () => {
    await render(<OperationsStackHeader title="Gün Sonu Özeti" onBack={jest.fn()} backLabel="Geri" />);

    expect(screen.getByRole('header', { name: 'Gün Sonu Özeti' })).toBeOnTheScreen();
  });

  it('geri düğmesi adını prop’tan alır ve basılınca çağırır', async () => {
    const onBack = jest.fn();
    await render(<OperationsStackHeader title="Bildirimler" onBack={onBack} backLabel="Geri" />);

    await fireEvent.press(screen.getByRole('button', { name: 'Geri' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
