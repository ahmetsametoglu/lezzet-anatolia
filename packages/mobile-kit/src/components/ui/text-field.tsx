import type { IconName } from '@lezzet/design-tokens/icons';
import type { ReactNode } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from './icon';

/*
  Tasarım mobilde yalnız yer tutucu çiziyor, ama yer tutucu ekran okuyucu için ad değildir ve yazmaya başlayınca kaybolur; bu yüzden
  `accessibilityLabel` zorunlu. Hata mesajı `accessibilityHint`e de geçer ki alanla birlikte okunsun.
*/

/*
  İşletim sistemi kayıtlı adres, ad ve telefonu yalnız türü beyan edilmiş alana önerir. Tür tek kavramdır ve üç RN prop'una açılır, ki
  çağıran üçünü ayrı bilmek zorunda kalmasın ve biri ötekinden ayrılmasın.
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
   * `compact` operasyonun kart içindeki alanıdır: punto küçülür ve çerçeve kartınki kadar sessizleşir, ki alan kartın önüne geçmesin.
   * Tek prop, çünkü punto ve çerçeve hep birlikte değişir; iki prop olmayan bir birleşimi mümkün gösterirdi.
   */
  density?: 'comfortable' | 'compact';
  /** Otomatik doldurma ve klavye önerisi için alanın türü (`CONTENT_TRAITS`). */
  content?: FieldContent;
  numeric?: boolean;
  /** `'grow'`: yazışma kutusu — tek satır yüksekliğinden başlar, metinle `controlGrowMax`a kadar uzar; Enter satır atlar. */
  multiline?: boolean | 'grow';
  /** Alanın sonundaki yuva — genellikle bir düğme. */
  trailing?: ReactNode;
  /** Alanın başındaki ikon; dokunmayı almaz ve metin ikonun sağından başlar. */
  icon?: IconName;
  /** Tasarımın "şimdi burayı doldur" alanı: zeytin, kalın çerçeve. Hata çerçevesi bunu ezer. */
  accent?: boolean;
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
  density = 'comfortable',
  content,
  numeric = false,
  multiline = false,
  trailing,
  icon,
  accent = false,
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
        {icon === undefined ? null : (
          <View style={styles.iconSlot} pointerEvents="none">
            <Icon name={icon} size={theme.size.inlineIcon} color={theme.colors.muted} />
          </View>
        )}
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
          multiline={multiline !== false}
          editable={editable}
          testID={testID}
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={errorText ?? helperText}
          accessibilityState={{ disabled: !editable }}
          style={[
            styles.input,
            density === 'compact' ? styles.compact : styles.comfortable,
            shape === 'pill' ? styles.pill : styles.soft,
            multiline === 'grow' ? styles.grow : multiline ? styles.multiline : styles.singleLine,
            icon === undefined ? undefined : styles.withIcon,
            accent ? styles.accent : undefined,
            /* Hata çerçevesi yoğunluğun ve vurgunun çerçevesini EZER ve sırası bu yüzden sonda: sessiz
               alan hata verdiğinde sessiz kalmamalı. */
            hasError ? styles.errorBorder : undefined,
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
    color: theme.colors.ink,
  },
  comfortable: {
    fontSize: theme.text['body-sm'],
    borderColor: theme.colors['sand-400'],
  },
  compact: {
    fontSize: theme.text.note,
    borderColor: theme.colors['sand-300'],
  },
  singleLine: {
    height: theme.size.controlMd,
  },
  multiline: {
    minHeight: theme.size.controlMultiline,
    paddingVertical: theme.space['2xl'],
    textAlignVertical: 'top',
  },
  grow: {
    minHeight: theme.size.controlMd,
    maxHeight: theme.size.controlGrowMax,
    paddingVertical: theme.space['2xl'],
    textAlignVertical: 'center',
  },
  pill: { borderRadius: theme.radius.pill },
  soft: { borderRadius: theme.radius.control },
  /* Baştaki ikon — alanın İÇİNDE, sol dolgunun üstünde (satırın ilk öğesi girdi olduğu için sol kenar
     girdinin kenarıdır). Mutlak konum: ikon satırda yer tutmaz, girdi tam genişlikte kalır. */
  iconSlot: { position: 'absolute', left: theme.space['3xl'], zIndex: 1 },
  /** İkonlu alanda metin ikonun sağından başlar: dolgu + ikon + aralık. */
  withIcon: { paddingLeft: theme.space['3xl'] + theme.size.inlineIcon + theme.space.md },
  accent: { borderColor: theme.colors.olive, borderWidth: theme.border.accent },
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
