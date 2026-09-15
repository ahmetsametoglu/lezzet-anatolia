import { useState, type ReactNode } from 'react';
import { Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { DEV_ACCOUNTS } from '@lezzet/mobile-kit/src/lib/auth/dev-login';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { fillCopy } from '@/screens/operations/copy';

import { loginCopy } from '../copy';
import { TALL_BUTTON_HEIGHT } from '../login-metrics';
import type { OperationsLogin } from '../use-operations-login.hook';
import { CodeBoxes } from './code-boxes';

/*
  Giriş hâli: başlık, adres ya da kod adımı, "YA DA" ve Google (tek renk "G", çünkü çok renkli logo ham hex isterdi); tasarımın
  demo satırı, hâl seçicisi ve "Yardım · Erişimim yok" satırı çizilmez. Kod adımı adresin yerine açılır ve iki adım, boyu en
  büyüğüne göre sabit tek yuvada durur; bekleyen adım saydam ve dokunulmaz kalır, böylece Google düğmesi yerinden oynamaz.
*/

const t = loginCopy;
const c = operationsTheme.colors;

/** Geliştirme düğmeleri yalnız operasyon hesapları — müşteri hesabı bu uygulamanın kapısından geçemez. */
const OPERATIONS_DEV_ACCOUNTS = DEV_ACCOUNTS.filter((account) => account.operations);

/** Sayaç dakika:saniye — tasarım "0:24"; oran sınırının cezası bir saate varabilir ("59:12"). */
function countdownText(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

interface EntryFormProps {
  login: OperationsLogin;
}

export function EntryForm({ login }: EntryFormProps) {
  /* Yuva KÜÇÜLMEZ: adres adımında ipucu satırı yazarken kalkıyor — yuva onunla küçülseydi Google yine oynardı. */
  const [slotHeight, setSlotHeight] = useState(0);
  const measure = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setSlotHeight((current) => Math.max(current, height));
  };

  return (
    <>
      <Text style={styles.title} accessibilityRole="header">
        {t.title}
      </Text>
      <View style={{ minHeight: slotHeight }}>
        <StepLayer active={!login.codeOpen} onLayout={measure}>
          <AddressStep login={login} active={!login.codeOpen} />
        </StepLayer>
        <StepLayer active={login.codeOpen} onLayout={measure}>
          <CodeStep login={login} active={login.codeOpen} />
        </StepLayer>
      </View>
      <View style={styles.divider}>
        <View style={styles.rule} />
        <Text style={styles.or}>{t.or}</Text>
        <View style={styles.rule} />
      </View>
      <PressableSurface
        onPress={login.startGoogle}
        feedback="scale"
        style={styles.google}
        accessibilityRole="button"
        accessibilityLabel={t.google}
        testID="login-google"
      >
        <Text style={styles.googleMark}>G</Text>
        <Text style={styles.googleLabel}>{t.google}</Text>
      </PressableSurface>
      {__DEV__ ? (
        <View style={styles.devRow}>
          {OPERATIONS_DEV_ACCOUNTS.map((account) => (
            <TextAction
              key={account.email}
              label={account.label}
              onPress={() => login.startDevSignIn(account.email)}
              testID={`login-dev-${account.label.toLocaleLowerCase('tr')}`}
            />
          ))}
        </View>
      ) : null}
    </>
  );
}

interface StepLayerProps {
  active: boolean;
  onLayout: (event: LayoutChangeEvent) => void;
  children: ReactNode;
}

/** Etkin adım akışta durur; bekleyen adım aynı yerde saydam, dokunulmaz ve ekran okuyucudan gizli. */
function StepLayer({ active, onLayout, children }: StepLayerProps) {
  return (
    <View
      style={active ? undefined : styles.idleLayer}
      onLayout={onLayout}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
    >
      {children}
    </View>
  );
}

interface StepProps {
  login: OperationsLogin;
  /** Etkin adım mı — kimlikler (testID) ve odak yalnız etkin adımda. */
  active: boolean;
}

/** Adres adımı — e-posta alanı, ipucu, "Kod gönder", uyarı kutusu. Kenar alanın durumunu söyler. */
function AddressStep({ login, active }: StepProps) {
  const filled = login.email.trim() !== '';
  const fieldTone = login.warning !== null ? styles.fieldWarning : filled ? styles.fieldFilled : undefined;
  return (
    <View style={styles.stack}>
      <View style={[styles.field, fieldTone]}>
        <Icon name="mail" size={operationsTheme.size.inlineIcon} color={c.muted} />
        <TextInput
          // Koddan dönüşte alan yeniden kurulur ve odağı alır; ilk açılışta klavye açılmaz.
          key={`address-${login.addressRound}`}
          autoFocus={login.addressRound > 0}
          value={login.email}
          onChangeText={login.changeEmail}
          placeholder={t.email.placeholder}
          placeholderTextColor={c.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={login.requestCode}
          accessibilityLabel={t.email.label}
          style={styles.input}
          testID={active ? 'login-email-input' : undefined}
        />
      </View>
      {filled ? null : <Text style={styles.hint}>{t.email.hint}</Text>}
      <PressableSurface
        onPress={login.requestCode}
        feedback="scale"
        disabled={!filled}
        style={[styles.send, filled ? styles.sendReady : styles.sendIdle]}
        accessibilityRole="button"
        accessibilityLabel={t.send}
        testID={active ? 'login-send' : undefined}
      >
        <Text style={styles.sendLabel}>{t.send}</Text>
      </PressableSurface>
      {login.warning === null ? null : (
        <View style={styles.warning} accessibilityRole="alert">
          <Text style={styles.warningText} testID={active ? 'login-notice' : undefined}>
            {login.warning}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Kod adımı — gönderildiği adres, altı kutu, ret cümlesi; yeniden gönderme ve adrese dönüş aynı satırda. */
function CodeStep({ login, active }: StepProps) {
  const counting = login.cooldownSec > 0;
  const resendLabel = counting ? fillCopy(t.code.resendIn, { time: countdownText(login.cooldownSec) }) : t.code.resend;
  return (
    <View style={styles.codePanel}>
      <View style={styles.codeHead}>
        <Text style={styles.codeSent}>{t.code.sent}</Text>
        {/* Tek satır, ortadan kısaltılır: uzun adres paneli uzatıp yuvayı (ve Google'ı) oynatmasın. */}
        <Text style={styles.codeAddress} numberOfLines={1} ellipsizeMode="middle">
          {login.email.trim()}
        </Text>
      </View>
      <CodeBoxes
        // Panel her açılışta yeniden kurulur ve odağı alır; bekleyen katmanda odak gelmez.
        key={active ? 'active' : 'idle'}
        autoFocus={active}
        value={login.code}
        onChange={login.changeCode}
        accessibilityLabel={t.code.label}
        testID={active ? 'login-code' : undefined}
      />
      {login.codeError === null ? null : (
        <Text style={styles.codeError} testID={active ? 'login-code-error' : undefined}>
          {login.codeError}
        </Text>
      )}
      <View style={styles.codeActions}>
        <PressableSurface
          onPress={login.requestCode}
          feedback="opacity"
          disabled={counting}
          accessibilityRole="button"
          accessibilityLabel={resendLabel}
          testID={active ? 'login-resend' : undefined}
        >
          <Text style={[styles.link, counting ? styles.linkCounting : undefined]}>{resendLabel}</Text>
        </PressableSurface>
        <PressableSurface
          onPress={login.changeAddress}
          feedback="opacity"
          accessibilityRole="button"
          accessibilityLabel={t.code.change}
          testID={active ? 'login-change-email' : undefined}
        >
          <Text style={styles.link}>{t.code.change}</Text>
        </PressableSurface>
      </View>
    </View>
  );
}

const helperText = {
  fontSize: operationsTheme.text.helper,
  lineHeight: operationsTheme.text.helper * operationsTheme.text['snug--line-height'],
};

const styles = StyleSheet.create({
  title: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['h1-sm--font-weight']],
    fontSize: operationsTheme.text['h1-sm'],
    lineHeight: operationsTheme.text['h1-sm'] * operationsTheme.text['h1--line-height'],
    color: c.ink,
  },
  /** Bekleyen adım: etkin adımın üstünde, aynı genişlikte; görünmez ve dokunuş almaz. */
  idleLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
  stack: {
    gap: operationsTheme.space.md,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    height: operationsTheme.size.controlLg,
    paddingHorizontal: operationsTheme.space['3xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: c['sand-300'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: c.card,
  },
  fieldFilled: { borderColor: c.olive },
  fieldWarning: { borderColor: c['warning-line'] },
  input: {
    flex: 1,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.body,
    color: c.ink,
  },
  hint: {
    paddingHorizontal: operationsTheme.space['2xs'],
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: c.muted,
  },
  send: {
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
  },
  sendReady: { backgroundColor: c.olive },
  /** Boş alanın düğmesi — kitin "kapalı CTA" durağı (tasarımın #c4bda9'u aynı rol). */
  sendIdle: { backgroundColor: c['disabled-fill'] },
  sendLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    color: c['on-image'],
  },
  /** Uyarı kutusu: uyarı zemini + sıcak ince kenar (tasarımın #e2c4b0'ı `terracotta-line`a Δ6/5/3). */
  warning: {
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.hairline,
    borderColor: c['terracotta-line'],
    borderRadius: operationsTheme.radius.soft,
    backgroundColor: c['warning-bg'],
  },
  warningText: {
    ...helperText,
    fontFamily: operationsTheme.font.body[600],
    color: c.error,
  },
  codePanel: {
    gap: operationsTheme.space.lg,
    padding: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: c['sand-300'],
    borderRadius: operationsTheme.radius.card,
    backgroundColor: c.panel,
  },
  codeHead: {
    gap: operationsTheme.space['2xs'],
  },
  codeSent: {
    ...helperText,
    fontFamily: operationsTheme.font.body[400],
    color: c.muted,
  },
  /** Boş adres de bir satır tutar: bekleyen katman ilk harfte uzayıp yuvayı büyütmesin. */
  codeAddress: {
    ...helperText,
    minHeight: helperText.lineHeight,
    fontFamily: operationsTheme.font.body[700],
    color: c.ink,
  },
  codeError: {
    ...helperText,
    fontFamily: operationsTheme.font.body[600],
    color: c.error,
  },
  codeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.md,
  },
  link: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.helper,
    color: c.olive,
  },
  linkCounting: { color: c['on-ink-muted'] },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    marginTop: operationsTheme.space.xs,
  },
  rule: {
    flex: 1,
    height: operationsTheme.border.hairline,
    backgroundColor: c['sand-300'],
  },
  or: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['eyebrow-xs'],
    letterSpacing: emToDp(operationsTheme.text['eyebrow-xs--letter-spacing'], operationsTheme.text['eyebrow-xs']),
    color: c['on-ink-muted'],
  },
  google: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: operationsTheme.space.lg,
    height: TALL_BUTTON_HEIGHT,
    borderWidth: operationsTheme.border.base,
    borderColor: c['sand-300'],
    borderRadius: operationsTheme.radius.card,
    backgroundColor: c.card,
  },
  googleMark: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.step,
    color: c['brand-google'],
  },
  googleLabel: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['body-sm'],
    color: c.ink,
  },
  devRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: operationsTheme.space.md,
  },
});
