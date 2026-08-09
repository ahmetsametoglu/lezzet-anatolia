import type { ReactNode } from 'react';
import { Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

/*
  METİN ALANI — v3'te ~18 kullanım. İki köşe kademesi (hap ⟷ yumuşak), sayısal ve çok satırlı
  türler, alanın SONUNDA düğme yuvası (SIRET "Bul", mesaj "gönder", kupon "Uygula").

  ETİKET: tasarım mobilde görünür etiket kullanmıyor, yalnız yer tutucu (placeholder) var —
  ama yer tutucu ekran okuyucu için ad DEĞİLDİR ve yazmaya başlayınca kaybolur. O yüzden
  `accessibilityLabel` ZORUNLU; görünür etiket isteyen ekran ayrıca `label` verir.

  HATA: kenarlık `terracotta-line`e döner ve mesaj hata renginde yazılır; `accessibilityRole`
  değişmez, mesaj alanla birlikte okunsun diye `accessibilityHint`e de geçer.
*/

interface TextFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  /** Ekran okuyucu adı — ZORUNLU; yer tutucu bunun yerine geçmez. */
  accessibilityLabel: string;
  /** Görünür etiket (isteğe bağlı). */
  label?: string;
  placeholder?: string;
  /** Köşe kademesi: hap (22) ⟷ yumuşak/kontrol (16). */
  shape?: 'pill' | 'soft';
  /**
   * Alanın İÇERİK TÜRÜ — işletim sistemine otomatik doldurma/öneri için söylenir (kullanıcı
   * bulgusu 08.08: e-posta alanı klavye önerisi vermiyordu). Tek kavram, üç RN prop'una açılır
   * (`autoComplete` + iOS `textContentType` + uygun klavye/büyük harf) — çağıran üçünü ayrı
   * ayrı bilmek zorunda kalmasın.
   */
  content?: 'email' | 'oneTimeCode';
  numeric?: boolean;
  multiline?: boolean;
  /** Alanın sonundaki yuva — genellikle bir düğme. */
  trailing?: ReactNode;
  helperText?: string;
  errorText?: string;
  editable?: boolean;
  testID?: string;
}

export function TextField({
  value,
  onChangeText,
  accessibilityLabel,
  label,
  placeholder,
  shape = 'soft',
  content,
  numeric = false,
  multiline = false,
  trailing,
  helperText,
  errorText,
  editable = true,
  testID,
}: TextFieldProps) {
  const { theme } = useUnistyles();
  const hasError = errorText !== undefined;

  return (
    <View style={styles.stack}>
      {label === undefined ? null : <Text style={styles.label}>{label}</Text>}
      <View style={styles.row}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.muted}
          keyboardType={content === 'email' ? 'email-address' : numeric ? 'number-pad' : 'default'}
          autoComplete={content === 'email' ? 'email' : content === 'oneTimeCode' ? 'one-time-code' : undefined}
          textContentType={content === 'email' ? 'emailAddress' : content === 'oneTimeCode' ? 'oneTimeCode' : undefined}
          autoCapitalize={content === 'email' ? 'none' : undefined}
          autoCorrect={content === 'email' ? false : undefined}
          multiline={multiline}
          editable={editable}
          testID={testID}
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={errorText ?? helperText}
          accessibilityState={{ disabled: !editable }}
          style={[
            styles.input,
            shape === 'pill' ? styles.pill : styles.soft,
            multiline ? styles.multiline : styles.singleLine,
            hasError ? styles.errorBorder : styles.idleBorder,
            editable ? undefined : styles.readOnly,
          ]}
        />
        {trailing}
      </View>
      {errorText === undefined ? null : <Text style={[styles.helper, styles.errorText]}>{errorText}</Text>}
      {errorText === undefined && helperText !== undefined ? (
        <Text style={styles.helper}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  stack: {
    gap: theme.space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  input: {
    flex: 1,
    paddingHorizontal: theme.space['3xl'],
    backgroundColor: theme.colors.card,
    borderWidth: theme.border.base,
    // Girdinin YAZDIĞI metin ağırlıksızdır (RN varsayılanı 400) — aile o ağırlıkla indekslenir.
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    color: theme.colors.ink,
  },
  singleLine: {
    height: theme.size.controlMd,
  },
  multiline: {
    minHeight: theme.size.controlMultiline,
    paddingVertical: theme.space['2xl'],
    textAlignVertical: 'top',
  },
  pill: { borderRadius: theme.radius.pill },
  soft: { borderRadius: theme.radius.control },
  idleBorder: { borderColor: theme.colors['sand-400'] },
  errorBorder: { borderColor: theme.colors['terracotta-line'] },
  readOnly: {
    backgroundColor: theme.colors['sand-50'],
    borderColor: theme.colors['disabled-line'],
    color: theme.colors['disabled-text'],
  },
  label: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['field-label'],
    fontWeight: theme.text['field-label--font-weight'],
    color: theme.colors.ink,
  },
  helper: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
  errorText: {
    color: theme.colors.error,
  },
}));
