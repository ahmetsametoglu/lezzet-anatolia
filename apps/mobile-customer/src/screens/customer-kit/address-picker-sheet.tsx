import type { LocalizedCopy } from '@lezzet/i18n';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BottomSheet } from '@lezzet/mobile-kit/src/components/ui/bottom-sheet';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import type { MeAddress } from '@/lib/api/addresses';
import type { PickupPoint } from '@/lib/api/pickup-points';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { addressContact, addressLine } from '@lezzet/address';
import messages from './address-picker-messages.json';
import { OptionRow } from './option-row';

/*
  Teslimat adresi ekran terk edilmeden seçilir; seçim ortak depoya yazılır (`delivery-address-store`), ki sepette seçilen adres ödemede de
  geçerli olsun. Liste yalnız seçer: yazma ve düzenleme kitin formundadır, "yeni adres" onu çağıranın yuvasından (`onAddNew`) açar.
*/

type Messages = LocalizedCopy<typeof messages>;

interface AddressPickerSheetProps {
  visible: boolean;
  addresses: readonly MeAddress[];
  /** Şu an geçerli olan adres — seçili çizilir. `null` iken hiçbir satır seçili değildir. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddNew: () => void;
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
  onClose,
  pickupPoints = [],
  selectedPickupId = null,
  onSelectPickup,
  testID,
}: AddressPickerSheetProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t.title} testID={testID}>
      <View style={styles.list}>
        {addresses.map((address) => (
          <OptionRow
            key={address.id}
            label={address.label ?? t.untitled}
            description={addressLine(address)}
            detail={addressContact(address) ?? undefined}
            // Depo seçiliyken varsayılan adres fatura adresidir, seçili çizilmez — tek seçim, tek çerçeve.
            selected={address.id === selectedId && selectedPickupId === null}
            onPress={() => {
              onSelect(address.id);
              // Seçim ANINDA kapanır: liste tek soruluk, "tamam" düğmesi ikinci bir dokunuş isterdi.
              onClose();
            }}
            testID={`address-pick-${address.id}`}
          />
        ))}
        {/* Gel-al: depo satırı adreslerin altında, aynı seçim dili. Sepet ve ödeme o depoya göre kurulur; adres fatura adresi olarak kalır. */}
        {pickupPoints.map((point) => (
          <OptionRow
            key={point.id}
            label={t.pickupOption}
            description={`${point.name} · ${point.addressLine}`}
            selected={point.id === selectedPickupId}
            onPress={() => {
              onSelectPickup?.(point.id);
              onClose();
            }}
            testID={`address-pick-warehouse-${point.id}`}
          />
        ))}
        <TextAction label={t.addNew} onPress={onAddNew} testID="address-pick-new" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: {
    gap: theme.space.md,
  },
}));
