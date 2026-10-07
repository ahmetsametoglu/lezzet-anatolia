import addressCopy from '@lezzet/i18n/customer/address';
import placeCopy from '@lezzet/i18n/customer/place';
import { CountryEnum, type Country } from '@lezzet/types';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Chip } from '@lezzet/mobile-kit/src/components/ui/chip';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';

interface CountryChipsProps {
  value: Country;
  onChange: (country: Country) => void;
  /** Çiplerin kimlikleri bundan türer (`<önek>-FR`, `<önek>-DE`). */
  testIDPrefix: string;
}

/** Ülke önce seçilir, çünkü aynı posta kodu iki ülkede de bulunabilir; öneri ve yer çözümü seçilen ülkede yapılır. */
export function CountryChips({ value, onChange, testIDPrefix }: CountryChipsProps) {
  const locale = useAppLocale();
  const place = placeCopy[locale];
  return (
    <View style={styles.group}>
      {/* Büyük harf dilin kuralıyla, çünkü stilin `textTransform`u Android'de cihazın dilini kullanır. */}
      <Text style={styles.eyebrow}>{upperIn(addressCopy[locale].form.countryLabel, locale)}</Text>
      <View style={styles.row}>
        {CountryEnum.options.map((code) => (
          <Chip
            key={code}
            grow
            label={code === 'DE' ? place.countryDE : place.countryFR}
            selected={value === code}
            onPress={() => onChange(code)}
            testID={`${testIDPrefix}-${code}`}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  group: {
    gap: theme.space.md,
  },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow-xs--font-weight']],
    fontSize: theme.text['eyebrow-xs'],
    letterSpacing: emToDp(theme.text['eyebrow-xs--letter-spacing'], theme.text['eyebrow-xs']),
    color: theme.colors.terracotta,
  },
  row: {
    flexDirection: 'row',
    gap: theme.space.md,
  },
}));
