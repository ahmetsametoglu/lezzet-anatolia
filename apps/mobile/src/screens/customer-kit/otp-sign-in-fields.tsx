import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { LoadingState } from '@/components/ui/loading-state';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextAction } from '@/components/ui/text-action';
import { TextField } from '@/components/ui/text-field';
import { CodeField } from '@/screens/login/code-field';
import type { useOtpSignIn } from './use-otp-sign-in.hook';

/*
  AKIŞ İÇİ KİMLİK ADIMININ ALANLARI — e-posta kutusu · kod kutusu · bekleme.

  Mekaniği `use-otp-sign-in.hook`ta, ÇİZİMİ burada: iki tüketen de (bölge talebi çekmecesi ve B2B
  başvurusu) aynı üç kutuyu aynı sırayla ve aynı kilit kurallarıyla basıyordu — bekleme sayacı
  yalnız düğme etiketinde, kod alanı altı hanede kendi kendine doğruluyor, doğrulama sırasında
  ikisi de kilitli. Elli satırlık bu yerleşimi ikinci kez yazmak, bir gün ayrışacak bir kopyaydı.

  ── METİN PROP, SÖZLÜK DEĞİL ────────────────────────────────────────────────
  Cümleler çağıranın kendi `messages.json`ından gelir (CLAUDE §2: global sözlük yok) ve zaten
  farklı olmaları GEREKİR — bölge talebinde "haberi nereye gönderelim", başvuruda "başvuruyu kimin
  adına yazalım". Ortak olan yerleşim; ortak olmayan şey söylenen söz.
*/

/**
 * Bu bileşenin istediği cümleler — çağıranın sözlüğü bu şekli taşımak zorunda (yapısal sözleşme).
 * İhraç EDİLMİYOR: çağıranlar kendi `messages.json`larını geçiyor, adı dışarıda kimse yazmıyor.
 */
interface OtpSignInCopy {
  emailPrompt: string;
  emailLabel: string;
  emailPlaceholder: string;
  send: string;
  sending: string;
  /** `{s}` yerine kalan saniye yazılır. */
  sendWait: string;
  /** `{email}` yerine kodun gittiği adres yazılır. */
  sent: string;
  codeField: string;
  codePlaceholder: string;
  resend: string;
  /** `{s}` yerine kalan saniye yazılır. */
  resendWait: string;
  verifying: string;
}

interface OtpSignInFieldsProps {
  signIn: ReturnType<typeof useOtpSignIn>;
  copy: OtpSignInCopy;
  /** `undefined` ise alt öğelere de kimlik verilmez (çağıranın `idOf` kalıbı). */
  testID?: string;
}

export function OtpSignInFields({ signIn, copy, testID }: OtpSignInFieldsProps) {
  const idOf = (part: string) => (testID === undefined ? undefined : `${testID}-${part}`);

  if (signIn.phase === 'verifying') {
    return (
      <View style={styles.busy}>
        <LoadingState label={copy.verifying} accessibilityLabel={copy.verifying} testID={idOf('busy')} />
      </View>
    );
  }

  if (signIn.phase === 'code') {
    return (
      <View style={styles.block}>
        <Text style={styles.prompt}>{copy.sent.replace('{email}', signIn.email.trim())}</Text>
        <CodeField
          value={signIn.code}
          onChangeText={signIn.onCodeChange}
          accessibilityLabel={copy.codeField}
          placeholder={copy.codePlaceholder}
          testID={idOf('code')}
        />
        {signIn.codeError === null ? null : (
          <Text style={styles.codeError} testID={idOf('code-error')}>
            {signIn.codeError}
          </Text>
        )}
        <View style={styles.resendRow}>
          {/* Bekleme süresince GERÇEKTEN kilitli (soluk + basılamaz) — sayaç yalnız burada. */}
          <TextAction
            label={signIn.cooldownSec > 0 ? copy.resendWait.replace('{s}', String(signIn.cooldownSec)) : copy.resend}
            onPress={signIn.resend}
            disabled={signIn.sending || signIn.cooldownSec > 0}
            testID={idOf('resend')}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <Text style={styles.prompt}>{copy.emailPrompt}</Text>
      <TextField
        value={signIn.email}
        onChangeText={signIn.setEmail}
        accessibilityLabel={copy.emailLabel}
        placeholder={copy.emailPlaceholder}
        content="email"
        errorText={signIn.emailError ?? undefined}
        testID={idOf('email')}
      />
      <PrimaryButton
        label={
          signIn.cooldownSec > 0
            ? copy.sendWait.replace('{s}', String(signIn.cooldownSec))
            : signIn.sending
              ? copy.sending
              : copy.send
        }
        onPress={signIn.sendCode}
        disabled={signIn.sending || signIn.cooldownSec > 0}
        testID={idOf('send')}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  block: {
    gap: theme.space.lg,
  },
  prompt: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.helper,
    color: theme.colors.ink,
  },
  codeError: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
    color: theme.colors['terracotta-bright'],
    textAlign: 'center',
  },
  resendRow: { alignItems: 'center' },
  busy: {
    alignItems: 'center',
    paddingVertical: theme.space['5xl'],
  },
}));
