import { initialsOf } from '@lezzet/helper';
import messages from '@lezzet/i18n/customer/cart';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { signOut } from '@lezzet/mobile-kit/src/lib/auth/sign-out';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';

/** Tasarımın mobil sepet kartındaki yuvarlak (px). */
const INITIALS_SIZE = 38;

interface AccountCardProps {
  name: string;
  email: string | null;
}

/**
 * Sepette girişli müşterinin hesap kartı (tasarımın mobil sepet kartı, web ile aynı). "Siz değil misiniz?" tasarıma eklendi ve
 * gerçekten çıkış yapar ama onayla, çünkü yanlışlıkla basan müşteri oturumunu kaybetmemeli.
 */
export function AccountCard({ name, email }: AccountCardProps) {
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
    <View style={styles.card} testID="cart-account">
      <View style={styles.initials}>
        <Text style={styles.initialsLabel}>{initialsOf(name, email, locale)}</Text>
      </View>
      <View style={styles.identity}>
        <Text style={styles.name} numberOfLines={1}>
          {name.trim() || email}
        </Text>
        {name.trim() && email ? (
          <Text style={styles.email} numberOfLines={1}>
            {email}
          </Text>
        ) : null}
        {confirming ? (
          <View style={styles.confirmRow}>
            <Text style={styles.confirm}>{copy.confirm}</Text>
            <TextAction label={copy.yes} tone="terracotta" disabled={busy} onPress={() => void leave()} testID="cart-sign-out" />
            <TextAction label={copy.cancel} disabled={busy} onPress={() => setConfirming(false)} testID="cart-sign-out-cancel" />
          </View>
        ) : (
          <TextAction label={copy.notYou} onPress={() => setConfirming(true)} testID="cart-not-you" />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    backgroundColor: theme.colors.card,
    borderWidth: 1.5,
    borderColor: theme.colors['sand-300'],
    borderRadius: theme.radius.control,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['2xl'],
  },
  initials: {
    width: INITIALS_SIZE,
    height: INITIALS_SIZE,
    borderRadius: INITIALS_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['sand-150'],
  },
  initialsLabel: {
    fontFamily: theme.font.body[700],
    fontSize: theme.text.note,
    color: theme.colors.honey,
  },
  identity: { flex: 1, minWidth: 0, gap: 1 },
  name: {
    fontFamily: theme.font.body[700],
    fontSize: theme.text['body-sm'],
    color: theme.colors.ink,
  },
  email: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
  },
  confirmRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: theme.space.lg,
    rowGap: theme.space.xs,
  },
  confirm: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors['olive-dark'],
  },
}));
