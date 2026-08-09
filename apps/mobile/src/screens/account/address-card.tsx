import type { LocalizedCopy } from '@lezzet/i18n';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { TextAction } from '@/components/ui/text-action';
import { addressLine, type AccountAddressView } from './account-fixture';
// Yalnız METİN BLOĞUNUN TİPİ için: komponent sözlüğü okumaz, çağıran geçirir.
import type accountMessages from './messages.json';

/*
  ADRES KARTI — "etiket · varsayılan rozeti · adres satırı · varsayılan yap · Düzenle" (v3:859-866).
  İKİ ekran çiziyor: hesap sayfası (liste) ve profil düzenleme sayfası (formun girişi). Aynı satırı
  iki dosyada yazmak, birinin bir gün ötekinden ayrılması demekti (CLAUDE §1).

  METİNLER TEK BLOK HÂLİNDE GEÇER (`copy`): iki çağıran da aynı sözlüğün (`account/messages.json`)
  `addresses` bölümünü okuyor; beş ayrı metin prop'u yerine bloğun kendisi geçince yeni bir metin
  eklendiğinde imza değişmez. Tip de o bloktan TÜRER, elle yazılmaz.

  "VARSAYILAN YAP" yalnız varsayılan OLMAYAN kartta çıkar (şablonun kendi kuralı) — varsayılan bir
  adresi varsayılan yapan bir düğme, basılınca hiçbir şey yapmayan bir düğmedir.
*/

type AddressCopy = LocalizedCopy<typeof accountMessages>['addresses'];

interface AddressCardProps {
  address: AccountAddressView;
  copy: AddressCopy;
  onMakeDefault: () => void;
  /** Düzenleme kapısı; verilmezse ok çizilmez (adres çekmecesi uçlarıyla birlikte gelecek — 21.14c). */
  onEdit?: () => void;
  testID?: string;
}

export function AddressCard({ address, copy, onMakeDefault, onEdit, testID }: AddressCardProps) {
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.text}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>{address.label}</Text>
          {address.isDefault ? <Text style={styles.defaultBadge}>{copy.default}</Text> : null}
        </View>
        <Text style={styles.line}>{addressLine(address)}</Text>
      </View>
      {address.isDefault ? null : (
        <TextAction
          label={copy.makeDefault}
          onPress={onMakeDefault}
          accessibilityHint={copy.makeDefaultLabel.replace('{label}', address.label)}
          testID={testID === undefined ? undefined : `${testID}-default`}
        />
      )}
      {onEdit === undefined ? null : (
        <TextAction
          label={copy.edit}
          onPress={onEdit}
          accessibilityHint={copy.editLabel.replace('{label}', address.label)}
          testID={testID === undefined ? undefined : `${testID}-edit`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['3xl'],
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
    fontWeight: theme.text['button--font-weight'],
    color: theme.colors.ink,
  },
  defaultBadge: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.eyebrow,
    fontWeight: theme.text['field-label--font-weight'],
    color: theme.colors['olive-dark'],
    backgroundColor: theme.colors['olive-bg'],
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space['2xs'],
    paddingHorizontal: theme.space.md,
    overflow: 'hidden',
  },
  line: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
}));
