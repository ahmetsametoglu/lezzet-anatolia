import addressCopy from '@lezzet/i18n/customer/address';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BottomSheet } from '@lezzet/mobile-kit/src/components/ui/bottom-sheet';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import type { MeAddress } from '@/lib/api/addresses';
import type { PickupPoint } from '@/lib/api/pickup-points';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { addressContact, addressLine, addressTitle } from '@lezzet/address';
import { OptionRow } from './option-row';

/*
  Teslimat adresi ekran terk edilmeden seçilir; seçim ortak depoya yazılır (`delivery-address-store`), ki sepette seçilen adres ödemede de
  geçerli olsun. Kartın gövdesi seçer, yanındaki "Düzenle" formu çağıranın yuvasından (`onEdit`) açar, çünkü düzeltme sepetten çıkmadan yapılmalı.
*/

interface AddressPickerSheetProps {
  visible: boolean;
  addresses: readonly MeAddress[];
  /** Şu an geçerli olan adres — seçili çizilir. `null` iken hiçbir satır seçili değildir. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddNew: () => void;
  /** Kayıtlı adresi düzenleme formunda açar; seçimi değiştirmez. */
  onEdit: (address: MeAddress) => void;
  onClose: () => void;
  /** Gel-al noktaları (izinli müşteride): depo bir adres gibi seçilir; boş listede kart çizilmez. */
  pickupPoints?: readonly PickupPoint[];
  selectedPickupId?: string | null;
  onSelectPickup?: (warehouseId: string) => void;
  testID?: string;
}

export function AddressPickerSheet({
  visible,
  addresses,
  selectedId,
  onSelect,
  onAddNew,
  onEdit,
  onClose,
  pickupPoints = [],
  selectedPickupId = null,
  onSelectPickup,
  testID,
}: AddressPickerSheetProps) {
  const copy = addressCopy[useAppLocale()];

  return (
    <BottomSheet visible={visible} onClose={onClose} title={copy.pickerTitle} testID={testID}>
      <View style={styles.list}>
        <Text style={styles.hint}>{copy.pickerHint}</Text>
        {addresses.map((address) => {
          // Depo seçiliyken varsayılan adres fatura adresidir, seçili çizilmez — tek seçim, tek çerçeve.
          const selected = address.id === selectedId && selectedPickupId === null;
          return (
            <OptionRow
              key={address.id}
              label={addressTitle(address)}
              badge={selected ? copy.selectedBadge : undefined}
              description={addressLine(address)}
              detail={addressContact(address) ?? undefined}
              selected={selected}
              onPress={() => {
                onSelect(address.id);
                // Seçim ANINDA kapanır: liste tek soruluk, "tamam" düğmesi ikinci bir dokunuş isterdi.
                onClose();
              }}
              action={<TextAction label={copy.edit} onPress={() => onEdit(address)} testID={`address-edit-${address.id}`} />}
              testID={`address-pick-${address.id}`}
            />
          );
        })}
        {/* Gel-al: depo satırı adreslerin altında, aynı seçim dili; depo müşterinin adresi olmadığı için düzenlenmez. */}
        {pickupPoints.map((point) => {
          const selected = point.id === selectedPickupId;
          return (
            <OptionRow
              key={point.id}
              label={copy.pickupOption}
              badge={selected ? copy.selectedBadge : undefined}
              description={`${point.name} · ${point.addressLine}`}
              selected={selected}
              onPress={() => {
                onSelectPickup?.(point.id);
                onClose();
              }}
              testID={`address-pick-warehouse-${point.id}`}
            />
          );
        })}
        <TextAction label={copy.addNew} onPress={onAddNew} testID="address-pick-new" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: {
    gap: theme.space.md,
  },
  hint: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
}));
