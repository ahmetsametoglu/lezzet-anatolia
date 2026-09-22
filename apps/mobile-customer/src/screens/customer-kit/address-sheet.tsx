import type { LocalizedCopy } from '@lezzet/i18n';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BottomSheet } from '@lezzet/mobile-kit/src/components/ui/bottom-sheet';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import type { MeAddress } from '@/lib/api/addresses';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { AddressForm } from './address-form';
import addressCopy from '@lezzet/i18n/customer/address';

/*
  Formun yüzen kabuğu (tasarım `shAddr`); içerik `AddressForm`, burada yalnız açılma ve kapanma kararı var. Form her açılışta `key`
  ile yeniden kurulur, yoksa ilk kare önceki adresi gösterirdi; kapanma animasyonu boyunca içerik `shown` ile yerinde kalır, yoksa
  çekmece boş bir formla aşağı kayardı.
*/

/** Başlık formun ortak sözlüğünden (web adres penceresiyle aynı metin — `@lezzet/i18n/customer/address`). */
type AddressCopy = LocalizedCopy<typeof addressCopy>;

/** Çekmecenin konusu: `editing: null` yeni adres, dolu ise düzenleme. `null` = kapalı. */
export interface AddressSheetTarget {
  editing: MeAddress | null;
}

interface AddressSheetProps {
  target: AddressSheetTarget | null;
  /** Yazımdan önceki liste — `AddressForm`un yeni adresi çözmesi için. */
  addresses: MeAddress[];
  onClose: () => void;
  /** Yazım başarılı; imza `AddressForm`unkiyle aynı (`savedId` silmede `null`). */
  onSaved: (addresses: MeAddress[], savedId: string | null) => void;
  /** Yeni adreste alıcı/telefon varsayılanı — hesabın künyesi; gerekçesi `AddressForm`da. */
  defaults?: { recipient: string; phone: string };
  /**
   * Rol eylemleri — yalnız hesap ekranı verir; "Siparişi tamamla"da adres zaten o an seçiliyor ve soru cevapsız kalırdı.
   * Adres rolü taşıyorsa eylemi çizilmez: çekmece ne kadar kısa olursa o kadar okunur.
   */
  roles?: {
    labels: { makeDefault: string; makeBilling: string };
    onMakeDefault: (address: MeAddress) => void;
    /** `null` ise fatura rolü hiç sorulmaz: bireysel hesapta karşılığı yok. */
    onMakeBilling: ((address: MeAddress) => void) | null;
  };
  testID?: string;
}

export function AddressSheet({ target, addresses, onClose, onSaved, defaults, roles, testID }: AddressSheetProps) {
  const locale = useAppLocale();
  const copy: AddressCopy = addressCopy[locale];

  const [session, setSession] = useState(0);
  const opened = useRef<AddressSheetTarget | null>(null);
  if (target !== null && target !== opened.current) {
    opened.current = target;
    setSession((count) => count + 1);
  }
  const shown = target ?? opened.current;
  /* Rol satırı listeden okunur, çekmeceyi açan kopyadan değil: rol verilince satır yenilenir ve eylem kendiliğinden düşer. */
  const editing = shown?.editing == null ? null : (addresses.find((address) => address.id === shown.editing?.id) ?? shown.editing);
  const roleActions =
    roles === undefined || editing === null
      ? []
      : [
          editing.isDefault ? null : (
            <TextAction
              key="default"
              label={roles.labels.makeDefault}
              onPress={() => roles.onMakeDefault(editing)}
              testID="address-make-default"
            />
          ),
          roles.onMakeBilling === null || editing.isBilling ? null : (
            <TextAction
              key="billing"
              label={roles.labels.makeBilling}
              onPress={() => roles.onMakeBilling?.(editing)}
              testID="address-make-billing"
            />
          ),
        ].filter((action) => action !== null);

  return (
    <BottomSheet
      visible={target !== null}
      title={shown?.editing == null ? copy.newTitle : copy.editTitle}
      onClose={onClose}
      testID={testID}
    >
      {roleActions.length === 0 ? null : <View style={styles.roles}>{roleActions}</View>}
      <AddressForm
        key={session}
        editing={shown?.editing ?? null}
        addresses={addresses}
        active={target !== null}
        defaults={defaults}
        onSaved={(next, savedId) => {
          onSaved(next, savedId);
          onClose();
        }}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  /* Tek şerit: rol eylemleri formun üstünde yan yana durur, kutu ya da başlık açmadan — çekmece yükselmemeli. */
  roles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space['2xl'],
  },
}));
