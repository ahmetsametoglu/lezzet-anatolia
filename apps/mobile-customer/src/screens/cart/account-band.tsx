import { signedInText } from '@lezzet/helper';
import messages from '@lezzet/i18n/customer/cart';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { signOut } from '@lezzet/mobile-kit/src/lib/auth/sign-out';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';

interface AccountBandProps {
  email: string | null;
}

/**
 * Sepette misafirin giriş kartının yeri: girişli müşteri siparişin kimin adına verileceğini ödemeden önce burada görür (web ile aynı
 * bant). "Siz değil misiniz?" gerçekten çıkış yapar ama onayla, çünkü yanlışlıkla basan müşteri oturumunu kaybetmemeli.
 */
export function AccountBand({ email }: AccountBandProps) {
  const { theme } = useUnistyles();
  const locale = useAppLocale();
  const copy = messages[locale].account;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Çıkışla kimlik misafire döner ve sepet giriş kartını kendisi çizer; burada gezinme yok.
  const leave = async () => {
    setBusy(true);
    await signOut();
  };

  return (
    <View style={styles.band} testID="cart-account">
      <View style={styles.row}>
        <Icon name="check" size={14} color={theme.colors.ink} />
        <Text style={styles.label}>{signedInText(email, locale)}</Text>
        {confirming ? null : <TextAction label={copy.notYou} onPress={() => setConfirming(true)} testID="cart-not-you" />}
      </View>
      {confirming ? (
        <View style={styles.row}>
          <Text style={styles.confirm}>{copy.confirm}</Text>
          <TextAction label={copy.yes} tone="terracotta" disabled={busy} onPress={() => void leave()} testID="cart-sign-out" />
          <TextAction label={copy.cancel} disabled={busy} onPress={() => setConfirming(false)} testID="cart-sign-out-cancel" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  band: {
    gap: theme.space.sm,
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.control,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['2xl'],
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: theme.space.lg,
    rowGap: theme.space.xs,
  },
  label: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  confirm: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    color: theme.colors['olive-dark'],
  },
}));
