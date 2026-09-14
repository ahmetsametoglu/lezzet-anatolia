import { OTP_CODE_LENGTH } from '@lezzet/types';
import { Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';

/*
  ALTI HANELİ KOD (tasarım: altı kutu) — kutular YALNIZ gösterir, rakamları tek ve görünmez bir alan alır. Altı
  ayrı alan yazılsaydı odak kutudan kutuya elle taşınır, yapıştırma ve cihazın kod önerisi (`oneTimeCode`)
  altıya bölünürdü; tek alan bunları bedavaya verir. Alan kutuların üstünde, YAZISI saydam: dokunuş onu odaklar.
  Kutunun kenarı sırayı söyler: sıradaki zeytin, dolu kum, boş nötr.
*/

/** Tasarımın 2 px kenarı — kod kutusunu 1,5 px'lik e-posta alanından ayırır (ops emsali: tarama çekmecesi). */
const BOX_BORDER = 2;

interface CodeBoxesProps {
  value: string;
  onChange: (value: string) => void;
  /** Panel açılınca odak kendiliğinden gelir; bekleyen (gizli) katmanda gelmez. */
  autoFocus: boolean;
  /** Ekran okuyucu adı — ZORUNLU. */
  accessibilityLabel: string;
  testID?: string;
}

export function CodeBoxes({ value, onChange, autoFocus, accessibilityLabel, testID }: CodeBoxesProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: OTP_CODE_LENGTH }, (_, index) => {
        const digit = value[index] ?? '';
        const state = index === value.length ? 'next' : digit === '' ? 'empty' : 'filled';
        return (
          <View key={index} style={[styles.box, styles[state]]}>
            <Text style={styles.digit}>{digit}</Text>
          </View>
        );
      })}
      <TextInput
        value={value}
        autoFocus={autoFocus}
        onChangeText={onChange}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={OTP_CODE_LENGTH}
        caretHidden
        selectionColor="transparent"
        accessibilityLabel={accessibilityLabel}
        style={styles.input}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: operationsTheme.space.sm,
  },
  box: {
    flex: 1,
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BOX_BORDER,
    borderRadius: operationsTheme.radius.soft,
    backgroundColor: operationsTheme.colors.card,
  },
  next: { borderColor: operationsTheme.colors.olive },
  filled: { borderColor: operationsTheme.colors['sand-300'] },
  empty: { borderColor: operationsTheme.colors['neutral-bg'] },
  digit: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['h2-sm--font-weight']],
    fontSize: operationsTheme.text['h2-sm'],
    color: operationsTheme.colors.ink,
  },
  /**
   * Kutuların tamamını kaplar ve yalnız YAZISI saydamdır — alanın kendisi görünür kalır. Saydamlığı 0 olan görünümü
   * Android erişilebilirlik ağacından düşürüyor: ekran okuyucu da cihaz sürücüsü de alanı bulamadı (ölçüldü 14.09).
   */
  input: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    color: 'transparent',
    backgroundColor: 'transparent',
  },
});
