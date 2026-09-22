import { fireEvent, render, screen } from '@testing-library/react-native';

import type { MeAddress } from '@/lib/api/addresses';
import { AddressCard } from './address-card';
import messages from '@lezzet/i18n/customer/account';

/*
  Satır artık bir kapı: eylemler çekmeceye taşındı, çünkü üç eylem satıra sığmıyordu ve adres kelime ortasından bölünüyordu
  ("12 Quai des Ba / teliers"). Satır dokunuşu çekmeceyi açmazsa müşterinin adrese ulaşacağı hiçbir yol kalmaz.
*/

const copy = messages.tr.addresses;

const ADRES: MeAddress = {
  id: 'addr-1',
  label: 'Ev',
  recipient: 'Ayşe Demir',
  phone: '+33624510988',
  country: 'FR',
  line1: '12 Quai des Bateliers',
  line2: null,
  postalCode: '67000',
  city: 'Strasbourg',
  isDefault: false,
  isBilling: false,
};

describe('AddressCard', () => {
  it('satırın kendisi çekmeceyi açar ve rol eylemi satırda çizilmez', async () => {
    const onOpen = jest.fn();
    await render(<AddressCard address={ADRES} copy={copy} onOpen={onOpen} showBilling={false} testID="kart" />);

    await fireEvent.press(screen.getByTestId('kart'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(copy.makeDefault)).toBeNull();
    expect(screen.queryByText(copy.edit)).toBeNull();
  });

  it('rolleri rozet söyler; fatura rozeti yalnız şirket hesabında çizilir', async () => {
    const dolu = { ...ADRES, isDefault: true, isBilling: true };
    const { rerender } = await render(<AddressCard address={dolu} copy={copy} onOpen={jest.fn()} showBilling={false} testID="kart" />);

    expect(screen.getByText(copy.default)).toBeOnTheScreen();
    expect(screen.queryByText(copy.billing)).toBeNull();

    await rerender(<AddressCard address={dolu} copy={copy} onOpen={jest.fn()} showBilling testID="kart" />);
    expect(screen.getByText(copy.billing)).toBeOnTheScreen();
  });
});
