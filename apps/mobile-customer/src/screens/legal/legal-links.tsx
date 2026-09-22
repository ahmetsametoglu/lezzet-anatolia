import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { NavRow } from '@/screens/customer-kit/nav-row';
import { LEGAL_MESSAGES, type Messages } from './legal-types';

/*
  Beş belgenin tek listesi; tüketici mevzuatı bu bilgilerin satın almadan önce erişilebilir olmasını ister, her ekranda görünmesini
  değil. Sıra web'in sırası ve kodda durur, çünkü sözlüğe gömülen liste bir dilde eksik kalabilirdi.
*/

const LEGAL_PAGES: readonly (keyof Messages['pages'])[] = ['terms', 'sales', 'privacy', 'delivery', 'faq'];

interface LegalLinksProps {
  testID?: string;
}

export function LegalLinks({ testID }: LegalLinksProps) {
  const locale = useAppLocale();
  const t: Messages = LEGAL_MESSAGES[locale];
  const router = useRouter();

  return (
    <View style={styles.block} testID={testID}>
      <Text style={styles.title}>{t.directoryTitle}</Text>
      <View style={styles.card}>
        {LEGAL_PAGES.map((page, index) => (
          <NavRow
            key={page}
            label={t.pages[page].title}
            divider={index > 0}
            onPress={() => router.push({ pathname: '/legal/[page]', params: { page } })}
            testID={`legal-link-${page}`}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  block: { gap: theme.space.md },
  title: {
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text['card-title-sm'],
    color: theme.colors.ink,
  },
  /* Hesap menüsüyle AYNI kap (`menuCard`): bu da bir gezinme listesi, ayrı bir görsel dil icat
     etmesi için sebep yok. */
  card: {
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
    overflow: 'hidden',
  },
}));
