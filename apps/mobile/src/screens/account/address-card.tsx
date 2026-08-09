import type { LocalizedCopy } from '@lezzet/i18n';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { TextAction } from '@/components/ui/text-action';
import type { MeAddress } from '@/lib/api/addresses';
// Yalnız METİN BLOĞUNUN TİPİ için: komponent sözlüğü okumaz, çağıran geçirir.
import type accountMessages from './messages.json';

/*
  ADRES KARTI — "etiket · varsayılan rozeti · adres satırı · varsayılan yap · Düzenle" (v3:859-866).
  Veri artık SÖZLEŞMEDEN (`MeAddress`, 21.15) — fixture tipi kalktı; kart, uçların döndürdüğünü çizer.

  METİNLER TEK BLOK HÂLİNDE GEÇER (`copy`): çağıran sözlüğün (`account/messages.json`) `addresses`
  bölümünü okuyor; beş ayrı metin prop'u yerine bloğun kendisi geçince yeni bir metin eklendiğinde
  imza değişmez. Tip de o bloktan TÜRER, elle yazılmaz.

  "VARSAYILAN YAP" yalnız varsayılan OLMAYAN kartta çıkar (şablonun kendi kuralı) — varsayılan bir
  adresi varsayılan yapan bir düğme, basılınca hiçbir şey yapmayan bir düğmedir.
*/

type AddressCopy = LocalizedCopy<typeof accountMessages>['addresses'];

/** Etiketsiz adreste başlık ŞEHİRDİR — uydurma etiket yazılmaz (entity künyesindeki kural). */
function addressTitle(address: MeAddress): string {
  return address.label ?? address.city;
}

/**
 * Kartta okunan tek satır — şablonun birleşimi (`l + ', ' + zip + ' ' + city`, v3:2023) veriye
 * uyarlandı: `line2` (kat/daire) varsa sokağın peşine girer, yutulursa teslimat adresi eksik
 * görünür. SAKLANMAZ, TÜRETİLİR: iki yerde tutulan aynı gerçek bir gün ayrışır.
 */
function addressLine(address: MeAddress): string {
  const street = address.line2 === null ? address.line1 : `${address.line1}, ${address.line2}`;
  return `${street}, ${address.postalCode} ${address.city}`;
}

interface AddressCardProps {
  address: MeAddress;
  copy: AddressCopy;
  onMakeDefault: () => void;
  /** Düzenleme kapısı — v3 kartının "Düzenle" ucu; çekmeceyi dolu açar. */
  onEdit: () => void;
  testID?: string;
}

export function AddressCard({ address, copy, onMakeDefault, onEdit, testID }: AddressCardProps) {
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.text}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>{addressTitle(address)}</Text>
          {address.isDefault ? <Text style={styles.defaultBadge}>{copy.default}</Text> : null}
        </View>
        <Text style={styles.line}>{addressLine(address)}</Text>
      </View>
      {address.isDefault ? null : (
        <TextAction
          label={copy.makeDefault}
          onPress={onMakeDefault}
          accessibilityHint={copy.makeDefaultLabel.replace('{label}', addressTitle(address))}
          testID={testID === undefined ? undefined : `${testID}-default`}
        />
      )}
      <TextAction
        label={copy.edit}
        onPress={onEdit}
        accessibilityHint={copy.editLabel.replace('{label}', addressTitle(address))}
        testID={testID === undefined ? undefined : `${testID}-edit`}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  /* Kartın KENDİ zemini yok (kullanıcı kararı 09.08): satırlar hesap ekranının adres PANELİNİN
     içinde yaşıyor ve panel zaten `sand-250` — iki aynı ton üst üste gelince sınır okunmuyordu.
     Ayrım artık panelin kesikli satır ayracında; kart yalnız satırın kendi düzenini kurar. */
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
  line: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
}));
