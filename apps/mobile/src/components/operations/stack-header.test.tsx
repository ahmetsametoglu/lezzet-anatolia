import { customerColors, customerText } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { OperationsStackHeader } from './stack-header';

describe('OperationsStackHeader', () => {
  it('başlık BAŞLIK rolüyle, künye satırı `micro` kademesinde soluk yazılır (v3)', async () => {
    await render(
      <OperationsStackHeader
        title="Bildirimler"
        subtitle="yalnız Kurye — rol süzmesi"
        onBack={jest.fn()}
        backLabel="Geri"
      />,
    );

    expect(screen.getByRole('header', { name: 'Bildirimler' })).toBeOnTheScreen();
    /* v3: başlık `h2-sm` (Lora 20) — v2'nin `screen-title`ı (17) değil. Kademe testte SABİT
       yazılmıyor, token'dan okunuyor: ölçek kayarsa test de onunla kayar. */
    expect(screen.getByRole('header', { name: 'Bildirimler' })).toHaveStyle({
      fontSize: Number.parseFloat(customerText['h2-sm']),
    });
    /* Künye v3'te İNCELDİ: 700/10,5 (`meta`) → 400/11,5 (`micro`). */
    expect(screen.getByText('yalnız Kurye — rol süzmesi')).toHaveStyle({
      fontSize: Number.parseFloat(customerText.micro),
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
