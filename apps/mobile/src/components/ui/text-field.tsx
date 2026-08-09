import type { ReactNode } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
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

/*
  ALANIN İÇERİK TÜRÜ — işletim sistemine "burada ne yazılacak" demenin TEK yeri.

  Bunu söylemeyen alan, cihazın KAYITLI BİLGİLERİNİ (adres, ad, telefon) hiç önermez: Android
  Autofill ve iOS AutoFill yalnız beyan edilmiş alanları tanır (kullanıcı bulgusu 09.08 — adres
  çekmecesinde hiçbir öneri çıkmıyordu; alanlar türsüzdü). Kavram TEK, üç RN prop'una açılır
  (`autoComplete` + iOS `textContentType` + klavye/büyük harf/düzeltme) — çağıran üçünü ayrı ayrı
  bilmek zorunda kalmasın ve biri bir gün ötekinden ayrılmasın.

  Not: bu OS-içi otomatik doldurmadır (cihazda kayıtlı adresi tek dokunuşla basar). Yazarken
  arama sonucu öneren ADRES SERVİSİ ayrı bir konudur (dış API kararı — açık madde).
*/
type FieldTraits = {
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: boolean;
};

const CONTENT_TRAITS = {
  none: {},
  email: {
    autoComplete: 'email',
    textContentType: 'emailAddress',
    keyboardType: 'email-address',
    autoCapitalize: 'none',
    autoCorrect: false,
  },
  oneTimeCode: { autoComplete: 'one-time-code', textContentType: 'oneTimeCode' },
  name: { autoComplete: 'name', textContentType: 'name', autoCapitalize: 'words' },
  tel: { autoComplete: 'tel', textContentType: 'telephoneNumber', keyboardType: 'phone-pad' },
  /** Sokak + kapı numarası — cihazın kayıtlı adresini tek dokunuşla basan alan budur. */
  streetAddress: {
    autoComplete: 'street-address',
    textContentType: 'fullStreetAddress',
    autoCapitalize: 'words',
    autoCorrect: false,
  },
  addressLine2: { autoComplete: 'address-line2', textContentType: 'streetAddressLine2', autoCapitalize: 'words' },
  postalCode: {
    autoComplete: 'postal-code',
    textContentType: 'postalCode',
    keyboardType: 'number-pad',
    autoCorrect: false,
  },
  city: { autoComplete: 'postal-address-locality', textContentType: 'addressCity', autoCapitalize: 'words' },
} as const satisfies Record<string, FieldTraits>;

type FieldContent = Exclude<keyof typeof CONTENT_TRAITS, 'none'>;

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
  content?: FieldContent;
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
  // Tip GENİŞLETİLEREK okunur: sabit tablo `as const` olduğu için üyeler dar birleşim; ortak
  // arayüze bağlamak, "hangi anahtar hangi prop'u taşıyor" sorusunu tek yerde tutar.
  const traits: FieldTraits = CONTENT_TRAITS[content ?? 'none'];

  return (
    <View style={styles.stack}>
      {label === undefined ? null : <Text style={styles.label}>{label}</Text>}
      <View style={styles.row}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.muted}
          keyboardType={traits.keyboardType ?? (numeric ? 'number-pad' : 'default')}
          autoComplete={traits.autoComplete}
          textContentType={traits.textContentType}
          autoCapitalize={traits.autoCapitalize}
          autoCorrect={traits.autoCorrect}
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
