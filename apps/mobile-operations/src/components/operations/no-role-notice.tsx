import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { CustomerIcon } from '@lezzet/mobile-kit/src/components/customer/customer-icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';

/*
  "Bu hesap operasyona tanımlı değil" bloğu, girişte (rolü olmayan hesap) ve kabuğun kapısında (bölümü olmayan oturum) aynı:
  kişiye neden içeri alınmadığını ve yetkiyi kimin açtığını söyler, tek eylemi başka hesapla girmek. "Yetki talebi gönder"
  çizilmez, çünkü talep akışı yok, hesabı yönetici açar.
*/

const t = operationsCopy.gate.forbidden;
const c = operationsTheme.colors;

interface NoRoleNoticeProps {
  /** Cümlenin öznesi; e-postası olmayan hesapta cümle öznesiz kurulur. */
  email: string | null;
  onSwitchAccount: () => void;
  testID?: string;
}

export function NoRoleNotice({ email, onSwitchAccount, testID }: NoRoleNoticeProps) {
  return (
    <View style={styles.stack} testID={testID}>
      <View style={styles.tile}>
        <CustomerIcon name="lock" size={operationsTheme.size.headerIcon} color={c.error} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.title} accessibilityRole="header">
          {t.title}
        </Text>
        <Text style={styles.body}>{email === null ? t.bodyNoEmail : fillCopy(t.body, { email })}</Text>
      </View>
      <PressableSurface
        onPress={onSwitchAccount}
        feedback="opacity"
        style={styles.switch}
        accessibilityRole="button"
        accessibilityLabel={t.switch}
        testID={testID === undefined ? undefined : `${testID}-switch`}
      >
        <Text style={styles.switchLabel}>{t.switch}</Text>
      </PressableSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: operationsTheme.space['2xl'],
  },
  tile: {
    width: operationsTheme.size.iconButton,
    height: operationsTheme.size.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.soft,
    backgroundColor: c['error-mark-bg'],
  },
  texts: {
    gap: operationsTheme.space.sm,
  },
  title: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['card-title--font-weight']],
    fontSize: operationsTheme.text['card-title'],
    lineHeight: operationsTheme.text['card-title'] * operationsTheme.text['h1-sm--line-height'],
    color: c.ink,
  },
  body: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['field-label'],
    lineHeight: operationsTheme.text['field-label'] * operationsTheme.text['lead--line-height'],
    color: c.body,
  },
  switch: { alignSelf: 'center' },
  switchLabel: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['field-label'],
    color: c.olive,
  },
});
