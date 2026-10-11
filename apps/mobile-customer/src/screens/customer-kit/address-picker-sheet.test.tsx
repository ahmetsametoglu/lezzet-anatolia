import { fireEvent, render, screen } from '@testing-library/react-native';

import addressCopy from '@lezzet/i18n/customer/address';
import { AddressPickerSheet } from './address-picker-sheet';

/*
  ADRES SEÇİCİDE DEPO KARTI (gel-al): depo bir adres gibi listelenir, dokununca seçim yazılır ve çekmece kapanır — adres
  satırıyla aynı dil. Bu test şu hatada kırmızıya döner: kart çizilmez, dokunuş seçimi yazmaz ya da çekmece açık kalır.
*/
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const address = {
  id: 'adr-1',
  label: 'Ev',
  recipient: 'Ayşe Demir',
  phone: '+33600000000',
  line1: '12 Rue des Orfèvres',
  line2: null,
  postalCode: '67000',
  city: 'Strasbourg',
  country: 'FR' as const,
  isDefault: true,
  isBilling: false,
};
const point = { id: 'wh-1', name: 'Strasbourg deposu', addressLine: '14 Rue de la Course, 67000 Strasbourg' };

it('depo kartı listelenir; dokununca seçim yazılır ve çekmece kapanır', async () => {
  const onSelectPickup = jest.fn();
  const onClose = jest.fn();
  await render(
    <AddressPickerSheet
      visible
      addresses={[address]}
      selectedId="adr-1"
      onSelect={jest.fn()}
      onAddNew={jest.fn()}
      onEdit={jest.fn()}
      onClose={onClose}
      pickupPoints={[point]}
      selectedPickupId={null}
      onSelectPickup={onSelectPickup}
    />,
  );
  expect(screen.getByText(addressCopy.tr.pickupOption)).toBeTruthy();
  await fireEvent.press(screen.getByTestId('address-pick-warehouse-wh-1'));
  expect(onSelectPickup).toHaveBeenCalledWith('wh-1');
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('teklif yoksa depo kartı hiç çizilmez', async () => {
  await render(
    <AddressPickerSheet visible addresses={[address]} selectedId="adr-1" onSelect={jest.fn()} onAddNew={jest.fn()} onEdit={jest.fn()} onClose={jest.fn()} />,
  );
  expect(screen.queryByText(addressCopy.tr.pickupOption)).toBeNull();
});

/* Düzenle seçimle karışırsa müşteri adresini düzeltmek isterken onu seçmiş ve çekmeceyi kapatmış olur; depo müşterinin adresi değildir. */
it('Düzenle adresi seçmeden formu ister; depo kartında Düzenle yoktur', async () => {
  const onSelect = jest.fn();
  const onEdit = jest.fn();
  const onClose = jest.fn();
  await render(
    <AddressPickerSheet
      visible
      addresses={[address]}
      selectedId="adr-1"
      onSelect={onSelect}
      onAddNew={jest.fn()}
      onEdit={onEdit}
      onClose={onClose}
      pickupPoints={[point]}
      selectedPickupId={null}
      onSelectPickup={jest.fn()}
    />,
  );

  await fireEvent.press(screen.getByTestId('address-edit-adr-1'));

  expect(onEdit).toHaveBeenCalledWith(address);
  expect(onSelect).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.queryByTestId('address-edit-wh-1')).toBeNull();
});
