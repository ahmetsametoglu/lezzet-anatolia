import { TextInput } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { customerMetrics } from '@/screens/customer-kit/customer-metrics';

/*
  TEK KULLANIMLIK KOD ALANI (v3:781) — kitin `TextField`inden BİLEREK ayrı: bu kontrol metin alanı
  değil, altı rakamlık bir sahnedir — 62 yükseklik, zeytin kenar, ortalanmış 26'lık rakamlar,
  geniş harf aralığı (şablon `.22em`). Bu görünümü `TextField`e varyant olarak eklemek, kitin tek
  alanına üç ayrık görsel kural sokardı; form kitine "kod alanı" durağı açılırsa buradaki taşınır
  (ihtiyaç raporlandı). Ham `TextInput` bu yüzden son çare değil, tek doğru araç.

  `oneTimeCode` içerik türü: iOS mesajlardan/klavyeden kod önerir; Android'de `sms-otp` muadili
  `one-time-code`a bağlanır. Kod MAİLDEN geldiği için öneri her cihazda dolmayabilir — tür yine
  de doğru beyan.
*/

interface CodeFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  /** Ekran okuyucu adı — ZORUNLU. */
  accessibilityLabel: string;
  placeholder: string;
  testID?: string;
}

export function CodeField({ value, onChangeText, accessibilityLabel, placeholder, testID }: CodeFieldProps) {
  const { theme } = useUnistyles();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.muted}
      keyboardType="number-pad"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      accessibilityLabel={accessibilityLabel}
      style={styles.field}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  field: {
    height: customerMetrics.codeFieldHeight,
    borderWidth: theme.border.base,
    borderColor: theme.colors.olive,
    borderRadius: theme.radius.card,
    paddingHorizontal: theme.space['6xl'],
    backgroundColor: theme.colors.card,
    textAlign: 'center',
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text['page-title-sm'],
    fontWeight: theme.text['chip--font-weight'],
    color: theme.colors.ink,
    /* Şablonun `.22em`i — rakamlar arası nefes; em→dp çevirisi boy üstünden. */
    letterSpacing: theme.text['page-title-sm'] * 0.22,
  },
}));
