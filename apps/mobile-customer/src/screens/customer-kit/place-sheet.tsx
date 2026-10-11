import { useState } from 'react';

import type { MeAddress } from '@/lib/api/addresses';
import { useMe } from '@lezzet/mobile-kit/src/lib/me/use-me.hook';
import { addressDefaultsOf } from './address-form';
import { AddressPickerSheet } from './address-picker-sheet';
import { AddressSheet } from './address-sheet';
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
  const { status } = useMe();
  const { addresses } = useAddresses(false);
  const { address, postalCode, country } = usePurchasePlace();
  const pickupPoints = usePickupPoints(status === 'ready' && address !== null);
  const selectedPickupId = useSelectedPickupWarehouse();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MeAddress | null>(null);
  const idOf = (part: string) => (testID === undefined ? undefined : `${testID}-${part}`);

  if (address === null) {
    return (
      <PostalCodeSheet visible={visible} code={postalCode} country={country} onClose={onClose} showZonesLink={showZonesLink} testID={testID} />
    );
  }

  return (
    <>
      {/* Düzenleme formu seçicinin yerine açılır ve kapanınca seçici geri gelir: düzeltme sepetten çıkmadan biter. */}
      <AddressPickerSheet
        visible={visible && editing === null}
        addresses={addresses}
        selectedId={address.id}
        onSelect={selectDeliveryAddress}
        pickupPoints={pickupPoints}
        selectedPickupId={selectedPickupId}
        onSelectPickup={selectPickupWarehouse}
        onAddNew={() => {
          onClose();
          setAdding(true);
        }}
        onEdit={setEditing}
        onClose={onClose}
        testID={idOf('picker')}
      />
      <NewAddressSheet visible={adding} onClose={() => setAdding(false)} testID={idOf('address')} />
      <EditAddressSheet address={editing} onClose={() => setEditing(null)} testID={idOf('edit')} />
    </>
  );
}

interface NewAddressSheetProps {
  visible: boolean;
  onClose: () => void;
  testID?: string;
}

/** Yeni adres çekmecesi: yazılan adres hem listeye girer hem seçili olur, çünkü müşteri onu az önce yeri için yazdı. */
export function NewAddressSheet({ visible, onClose, testID }: NewAddressSheetProps) {
  const { me } = useMe();
  const { addresses, publish } = useAddresses(false);
  return (
    <AddressSheet
      target={visible ? { editing: null } : null}
      addresses={addresses}
      onClose={onClose}
      onSaved={(next, savedId) => {
        publish(next);
        selectDeliveryAddress(savedId);
        onClose();
      }}
      defaults={addressDefaultsOf(me)}
      testID={testID}
    />
  );
}

interface EditAddressSheetProps {
  /** Düzenlenen adres; `null` = kapalı. */
  address: MeAddress | null;
  onClose: () => void;
  testID?: string;
}

/** Düzenleme çekmecesi: kayıt ya da silme listeyi tazeler; silinen adres seçiliyse yer varsayılan adrese düşer. */
function EditAddressSheet({ address, onClose, testID }: EditAddressSheetProps) {
  const { addresses, publish } = useAddresses(false);
  return (
    <AddressSheet
      target={address === null ? null : { editing: address }}
      addresses={addresses}
      onClose={onClose}
      onSaved={(next) => {
        publish(next);
        onClose();
      }}
      testID={testID}
    />
  );
}
