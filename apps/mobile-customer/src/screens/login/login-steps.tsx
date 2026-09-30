import type { LocalizedCopy } from '@lezzet/i18n';
import { useRouter, type Href } from 'expo-router';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';
import { GoogleMark } from '@lezzet/mobile-kit/src/components/ui/google-mark';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { LoadingState } from '@lezzet/mobile-kit/src/components/ui/loading-state';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { TextField } from '@lezzet/mobile-kit/src/components/ui/text-field';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { CodeField } from './code-field';
import type { LoginFlow } from './use-login-flow.hook';
import messages from '@lezzet/i18n/customer/login';

/* Giriş ekranı ile sepetin giriş çekmecesi aynı adımları ve aynı gizlilik cümlesini çizer. */

type Messages = LocalizedCopy<typeof messages>;

/** Tasarımın yol düğmesi 54; kitin `controlLg`si 52 olduğu için ayrı sabit. */
const PROVIDER_HEIGHT = 54;

export function LoginSteps({ flow }: { flow: LoginFlow }) {
  const t: Messages = messages[useAppLocale()];
  const { theme } = useUnistyles();

  return (
    <View style={styles.stepArea}>
      {flow.stage === 'choose' ? (
        <View style={styles.providers}>
          {/* Google'ın kuralı: düğme resmî renkli "G"yi taşır, yerine harf çizilmez. */}
          <PressableSurface
            onPress={flow.startGoogle}
            feedback="scale"
            style={[styles.providerButton, styles.cardButton]}
            accessibilityLabel={t.google}
            testID="login-google"
          >
            <GoogleMark />
            <Text style={[styles.providerLabel, styles.cardLabel]}>{t.google}</Text>
          </PressableSurface>
          <PressableSurface
            onPress={flow.chooseEmail}
            feedback="scale"
            style={[styles.providerButton, styles.oliveButton]}
            accessibilityLabel={t.email}
            testID="login-email"
          >
            <Icon name="mail" size={theme.size.inlineIcon} color={theme.colors.card} />
            <Text style={[styles.providerLabel, styles.oliveLabel]}>{t.email}</Text>
          </PressableSurface>
          {flow.notice === null ? null : (
            <Text style={styles.notice} testID="login-notice">
              {flow.notice}
            </Text>
          )}
        </View>
      ) : null}

      {flow.stage === 'email' ? (
        <View style={styles.form}>
          <TextField
            value={flow.email}
            onChangeText={flow.setEmail}
            accessibilityLabel={t.emailField}
            placeholder={t.emailField}
            shape="pill"
            content="email"
            errorText={flow.emailError ?? undefined}
            testID="login-email-input"
          />
          <PrimaryButton
            label={flow.cooldownSec > 0 ? t.sendWait.replace('{s}', String(flow.cooldownSec)) : flow.sending ? t.sending : t.send}
            onPress={flow.sendCode}
            disabled={flow.sending || flow.cooldownSec > 0}
            testID="login-send"
          />
        </View>
      ) : null}

      {flow.stage === 'code' ? (
        <View style={styles.form}>
          <Text style={styles.sentLine}>{t.sent.replace('{email}', flow.email.trim())}</Text>
          <CodeField
            value={flow.code}
            onChangeText={flow.onCodeChange}
            accessibilityLabel={t.codeField}
            placeholder={t.codePlaceholder}
            testID="login-code-input"
          />
          {flow.codeError === null ? null : (
            <Text style={styles.codeError} testID="login-code-error">
              {flow.codeError}
            </Text>
          )}
          <View style={styles.resendRow}>
            {/* Sayaç yalnız burada; bekleme süresince eylem kilitli. */}
            <TextAction
              label={flow.cooldownSec > 0 ? t.resendWait.replace('{s}', String(flow.cooldownSec)) : t.resend}
              onPress={flow.resend}
              disabled={flow.sending || flow.cooldownSec > 0}
              testID="login-resend"
            />
          </View>
        </View>
      ) : null}

      {flow.stage === 'verifying' || flow.stage === 'done' ? (
        <View style={styles.busy}>
          <LoadingState
            size="md"
            label={flow.stage === 'done' ? t.done : t.verifying}
            accessibilityLabel={flow.stage === 'done' ? t.done : t.verifying}
            testID="login-busy"
          />
        </View>
      ) : null}
    </View>
  );
}

/** Girişin gizlilik cümlesi; adres verilmezse bağlantısız çizilir. */
export function LoginLegal({ privacyHref }: { privacyHref?: Href }) {
  const t: Messages = messages[useAppLocale()];
  const router = useRouter();
  return (
    <Text style={styles.legal}>
      {t.legalPrefix}
      {privacyHref === undefined ? (
        t.privacyInline
      ) : (
        <Text style={styles.legalLink} onPress={() => router.push(privacyHref)} accessibilityRole="link" testID="login-privacy">
          {t.privacyInline}
        </Text>
      )}
      {t.legalSuffix}
    </Text>
  );
}

const styles = StyleSheet.create((theme) => ({
  /* Seçimin iki yolu ve bilgi satırı kadar sabit yer: kısa adımlarda ortalanmış blok oynamasın. */
  stepArea: {
    minHeight: theme.space.sm + 2 * PROVIDER_HEIGHT + theme.space.lg + theme.space.sm + theme.text.note * theme.text['lead--line-height'],
  },
  providers: { gap: theme.space.lg, marginTop: theme.space.sm },
  providerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
    height: PROVIDER_HEIGHT,
    paddingHorizontal: theme.space['5xl'],
    borderRadius: theme.radius.pill,
  },
  cardButton: {
    backgroundColor: theme.colors.card,
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-400'],
  },
  oliveButton: { backgroundColor: theme.colors.olive },
  providerLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
  },
  cardLabel: { color: theme.colors.ink },
  oliveLabel: { color: theme.colors.card },
  /** Satır yüksekliği açık: `stepArea` bu satırın boyuyla hesaplanıyor. */
  notice: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors['olive-dark'],
    textAlign: 'center',
    marginTop: theme.space.sm,
  },
  form: { gap: theme.space.lg },
  sentLine: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.control,
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
    paddingVertical: theme.space['7xl'],
    minHeight: customerMetrics.codeFieldHeight,
  },
  legal: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    lineHeight: theme.text.micro * theme.text['lead--line-height'],
    color: theme.colors.muted,
    marginTop: theme.space.lg,
  },
  legalLink: {
    color: theme.colors.olive,
    textDecorationLine: 'underline',
  },
}));
