import type { LocalizedCopy } from '@lezzet/i18n';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import type { MeAddress } from '@/lib/api/addresses';
import { addressLine, addressTitle } from '@lezzet/address';
// Yalnız metin bloğunun tipi için: komponent sözlüğü okumaz, çağıran geçirir.
import type accountMessages from '@lezzet/i18n/customer/account';

/*
  Rolün adı "teslimat adresi", "varsayılan" değil: varsayılan bir mekanizmanın adıdır, müşterinin gördüğü şey roldür. Satırda eylem
  yok — rol ve düzenleme çekmecede sorulur, çünkü eylemler kısalmıyor ve üçü birden adres satırını kelime ortasından bölüyordu.
*/

type AddressCopy = LocalizedCopy<typeof accountMessages>['addresses'];

interface AddressCardProps {
  address: MeAddress;
  copy: AddressCopy;
  /** Satırın tamamı çekmeceyi açar. */
  onOpen: () => void;
  /** `false` ise fatura rozeti hiç çizilmez: bireysel hesapta bu rolün karşılığı yok. */
  showBilling: boolean;
  testID?: string;
}

export function AddressCard({ address, copy, onOpen, showBilling, testID }: AddressCardProps) {
  const { theme } = useUnistyles();

  return (
    <PressableSurface
      onPress={onOpen}
      feedback="opacity"
      haptic={false}
      style={styles.card}
      accessibilityLabel={addressTitle(address)}
      accessibilityHint={copy.editLabel.replace('{label}', addressTitle(address))}
      testID={testID}
    >
      <View style={styles.text}>
        {/* İki rol ayrı rozet: bir adres ikisi birden olabilir ve müşteri hangi rolü kaldırdığını görmeli. */}
        <View style={styles.labelRow}>
          <Text style={styles.label}>{addressTitle(address)}</Text>
          {address.isDefault ? <Text style={styles.defaultBadge}>{copy.default}</Text> : null}
          {showBilling && address.isBilling ? <Text style={styles.billingBadge}>{copy.billing}</Text> : null}
        </View>
        <Text style={styles.line}>{addressLine(address)}</Text>
      </View>
      {/* Ok, satırın bir kapı olduğunu söyler; eylem adı yazılsaydı kalkan eylemler geri gelirdi. */}
      <Icon name="arrow-right" size={16} color={theme.colors.muted} />
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  /* Kartın kendi zemini yok: panel zaten aynı tonda ve üst üste iki aynı ton sınırı okutmaz; ayrım panelin satır ayracında. */
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
  },
  text: { flex: 1, gap: theme.space['2xs'] },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  label: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  defaultBadge: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.eyebrow,
    color: theme.colors['olive-dark'],
    backgroundColor: theme.colors['olive-bg'],
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space['2xs'],
    paddingHorizontal: theme.space.md,
    overflow: 'hidden',
  },
  /* Fatura rozeti ayrı tonda, yoksa yan yana iki rozet tek şey gibi okunurdu; etiket de yazılı, çünkü renk tek başına anlam taşımaz. */
  billingBadge: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.eyebrow,
    color: theme.colors.ink,
    backgroundColor: theme.colors['sand-300'],
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space['2xs'],
    paddingHorizontal: theme.space.md,
    overflow: 'hidden',
  },
  line: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    color: theme.colors.muted,
  },
}));
