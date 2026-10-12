import { Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';

/*
  Seçicinin arama kutusu ve liste başlığı. Kutu ekranın üstünde sabittir; arama sürerken durum başlıkta yazar ("aranıyor…"), liste
  sökülmez ki her tuşta ekran zıplamasın.
*/

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  clearLabel: string;
  autoFocus?: boolean;
  testID?: string;
}

export function SearchBox({ value, onChange, placeholder, clearLabel, autoFocus = false, testID }: SearchBoxProps) {
  return (
    <View style={styles.box}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={operationsTheme.colors['tab-inactive']}
        accessibilityLabel={placeholder}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={styles.input}
        testID={testID}
      />
      {/* Temizleme düğmesinin yeri metin boşken de ayrılmıştır; yazınca metin kaymaz. */}
      <View style={styles.clearSlot}>
        {value.length > 0 ? (
          <PressableSurface
            onPress={() => onChange('')}
            feedback="scale"
            style={styles.clear}
            accessibilityLabel={clearLabel}
            testID={testID === undefined ? undefined : `${testID}-clear`}
          >
            <Icon name="close" size={operationsTheme.size.badgeIcon} color={operationsTheme.colors.muted} />
          </PressableSurface>
        ) : null}
      </View>
    </View>
  );
}

interface ListStatusProps {
  text: string;
  busy?: boolean;
  testID?: string;
}

export function ListStatus({ text, busy = false, testID }: ListStatusProps) {
  return (
    <Text style={[styles.status, busy ? styles.statusBusy : null]} numberOfLines={1} testID={testID}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  box: {
    height: operationsTheme.size.controlMd,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.olive,
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
    paddingLeft: operationsTheme.space['2xl'],
  },
  input: {
    flex: 1,
    height: '100%',
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  clearSlot: {
    width: operationsTheme.size.touchTarget,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clear: {
    width: operationsTheme.space['6xl'],
    height: operationsTheme.space['6xl'],
    borderRadius: operationsTheme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  status: {
    height: operationsTheme.space['2xl'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  statusBusy: { color: operationsTheme.colors.olive },
});
