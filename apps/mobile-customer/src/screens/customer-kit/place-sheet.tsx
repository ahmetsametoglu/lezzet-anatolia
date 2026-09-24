import { useState } from 'react';

import { useMe } from '@lezzet/mobile-kit/src/lib/me/use-me.hook';
import { addressDefaultsOf } from './address-form';
import { AddressPickerSheet } from './address-picker-sheet';
import { AddressSheet, type AddressSheetTarget } from './address-sheet';
import { selectDeliveryAddress, selectPickupWarehouse, useSelectedPickupWarehouse } from './delivery-address-store';
import { PostalCodeSheet } from './postal-code-sheet';
import { usePurchasePlace } from './purchase-place';
import { useAddresses } from './use-addresses.hook';
import { usePickupPoints } from './use-pickup-points.hook';

interface PlaceSheetProps {
  visible: boolean;
  onClose: () => void;
  /** "Nerelere gidiyorsunuz?" bağlantısı posta kodu çekmecesinde çizilsin mi. */
  showZonesLink?: boolean;
  /** Posta kodu çekmecesi bu kimliği taşır; adres seçici ve adres formu ondan türer. */
  testID?: string;
}

/**
 * Yerin tek değiştirme kapısı: adresi olan müşteride adres seçici (yeni adres ve gel-al dahil), adresi olmayanda posta kodu çekmecesi,
 * çünkü girişli müşterinin yeri adresidir ve serbest bir posta kodu onu ikinci bir yere bölerdi.
 */
export function PlaceSheet({ visible, onClose, showZonesLink = false, testID }: PlaceSheetProps) {
  const { status, me } = useMe();
  const { addresses, publish } = useAddresses(false);
  const { address, postalCode } = usePurchasePlace();
  const pickupPoints = usePickupPoints(status === 'ready' && address !== null);
  const selectedPickupId = useSelectedPickupWarehouse();
  const [addressSheet, setAddressSheet] = useState<AddressSheetTarget | null>(null);
  const idOf = (part: string) => (testID === undefined ? undefined : `${testID}-${part}`);

  if (address === null) {
    return <PostalCodeSheet visible={visible} code={postalCode} onClose={onClose} showZonesLink={showZonesLink} testID={testID} />;
  }

  return (
    <>
      <AddressPickerSheet
        visible={visible}
        addresses={addresses}
        selectedId={address.id}
        onSelect={selectDeliveryAddress}
        pickupPoints={pickupPoints}
        selectedPickupId={selectedPickupId}
        onSelectPickup={selectPickupWarehouse}
        onAddNew={() => {
          onClose();
          setAddressSheet({ editing: null });
        }}
        onClose={onClose}
        testID={idOf('picker')}
      />
      {/* Yazılan adres hem listeye girer hem seçili olur: müşteri onu az önce yeri için yazdı. */}
      <AddressSheet
        target={addressSheet}
        addresses={addresses}
        onClose={() => setAddressSheet(null)}
        onSaved={(next, savedId) => {
          publish(next);
          selectDeliveryAddress(savedId);
          setAddressSheet(null);
        }}
        defaults={addressDefaultsOf(me)}
        testID={idOf('address')}
      />
    </>
  );
}
