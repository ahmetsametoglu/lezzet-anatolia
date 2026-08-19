import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { useAppLocale } from '@/lib/i18n/app-locale';
import { NavRow } from '@/screens/customer-kit/nav-row';
import type { Messages } from './legal-types';
import messages from './messages.json';

/*
  BİLGİ SAYFALARININ KAPISI — beş belgenin tek listesi.

  Neden ayrı bir blok: ölçüldü (19.08, MB-76) — beş sayfadan yalnız ikisine (`delivery`, `privacy`)
  gidilebiliyordu ve o iki kapı da GİRİŞLİ hesabın içindeydi. `sales` (satış koşulları) ile `terms`
  (yasal bilgiler) uygulamanın HİÇBİR yerinden açılmıyordu — yalnız deep-link ile. Yani satın alma
  kararını verecek kişi teslimat kurallarını, kargo ücretini, iade koşullarını ve satış koşullarını
  göremiyordu; Fransız tüketici mevzuatında bu bilgiler satın almadan ÖNCE erişilebilir olmak zorunda.

  Web'de aynı işi altbilgi yapıyor (`components/customer/ui/site-frame.tsx`, `LEGAL_LINKS`) ve her
  sayfada duruyor. **Native'de o kadarı YAPILMADI ve bu bilinçli (kullanıcı kararı 19.08):** kanunun
  istediği şey belgelerin ERİŞİLEBİLİR olması, her ekranda gösterilmesi değil. Blok bir kez vitrinin
  dibine de konmuş, sonra geri alınmıştı — vitrin alışverişin kendisi, orada beş satırlık hukuk
  listesi müşteriyi gereksiz yorar. Belgelerin kalıcı evi HESAP ekranı (sekme çubuğunun bilgiye
  ayrılmış durağı), İKİ HÂLDE de: girişli gövde ve misafir duvarı.

  Sözleşme öncesi bilgi ayrı bir sorudur ve ayrı yerde karşılanıyor — checkout'un satış koşulları
  satırı. Kanunun "satın almadan ÖNCE" dediği an odur; misafir zaten hesapsız sipariş veremiyor.

  SIRA WEB'İN SIRASI (künye → satış koşulları → gizlilik → teslimat → SSS): genelden özele iner ve
  sonuncusu en çok tıklanandır. Dizi burada duruyor, sözlükte değil — hangi sayfaların olduğu ve
  hangi sırayla durdukları DİLE GÖRE DEĞİŞMEZ; sözlüğe gömülseydi bir dilde bir satır eksik kalır ve
  o dilin müşterisi sayfayı hiç göremezdi (web künyesinin aynı gerekçesi).

  Sayfa ADLARI burada yeniden yazılmadı: `messages.json`'daki `pages.<anahtar>.title` okunuyor. İki
  liste tutulsaydı bir gün ayrışırdı — kapıda bir ad, sayfanın başlığında başka bir ad.
*/

const LEGAL_PAGES: readonly (keyof Messages['pages'])[] = ['terms', 'sales', 'privacy', 'delivery', 'faq'];

interface LegalLinksProps {
  testID?: string;
}

export function LegalLinks({ testID }: LegalLinksProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
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
