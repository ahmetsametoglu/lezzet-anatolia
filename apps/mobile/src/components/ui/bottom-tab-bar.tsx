import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from './pressable-surface';

/*
  ALT SEKME ÇUBUĞU — uygulamanın kabuğu (v3 `tabs`, dört sekme: Vitrin · Katalog · Siparişler ·
  Hesap). Sepet sekme DEĞİLDİR (envanter §4): sepete FAB ve yapışkan barlardan gidilir.

  YÖNLENDİRMEYİ BİLMEZ: girdisi `items` dizisidir (etiket + seçili mi + basılınca ne olacak),
  yani navigasyon kütüphanesinin şeklinden bağımsızdır. Router'ın kendi tab bar prop'unu bu
  komponente doğrudan geçirmek, kiti expo-router sürümüne bağlardı; çeviri kabuk katmanının
  (`app/(tabs)/_layout.tsx`) işi.

  İKON YOK — BEKLEYEN(21.7). Tasarım her sekmeye 23 px'lik bir çizgi ikonu koyuyor (`IC` sözlüğü,
  v3 satır 1745) ama uygulamada İKON SİSTEMİ HENÜZ YOK: kit (21.5) ikonsuz kuruldu, `EmptyState`
  bile ikonu yuva olarak dışarıdan bekliyor. Tasarımın yolları SVG'dir ve çizilmeleri
  `react-native-svg` (yeni bir yerel modül + dev-client yeniden derlemesi) ister; hazır bir ikon
  setine geçmek ise "improvise etme" kuralının ihlali olurdu (yollar tasarımda YAZILI). Karar
  yöneticinin: ikon sistemi tek seferde kurulur, sonra bu çubuk da öteki ekranlar da onu kullanır.
  Bugünkü çubuk etiketle çalışır — eksik olan görsel, işlev değil.

  ROZET DE YOK: tasarımın `t.badge` yuvası ölü (envanter §8.6 — sayaç sepet sekmesi içindi, o
  sekme de yok). Ölü bir alanı port etmemek envanter §8.13'ün kararı.
*/

/** Tek sekme — kabuk hangi rotanın seçili olduğunu bilir, çubuk yalnız çizer. */
interface BottomTabItem {
  /** Rota adı; liste anahtarı ve test kimliği olarak da kullanılır. */
  key: string;
  /** Görünen etiket — i18n üstte çözülür. */
  label: string;
  selected: boolean;
  onPress: () => void;
}

interface BottomTabBarProps {
  items: BottomTabItem[];
  testID?: string;
}

export function BottomTabBar({ items, testID }: BottomTabBarProps) {
  return (
    <View style={styles.bar} testID={testID} accessibilityRole="tablist">
      {items.map((item) => (
        // Genişliği YUVA dağıtır: `PressableSurface`in stili iç yüzeydedir, dış `Pressable`a
        // `flex: 1` geçirilemez — dördü eşit paylaşsın diye sarmalayıcı burada.
        <View key={item.key} style={styles.slot}>
          <PressableSurface
            onPress={item.onPress}
            feedback="opacity"
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            selected={item.selected}
            /* Görsel yüksekliği (etiket + dolgu) 44 dp'nin altında: dokunma payı ekleniyor. */
            compact
            style={styles.item}
            testID={testID === undefined ? undefined : `${testID}-${item.key}`}
          >
            <Text style={[styles.label, item.selected ? styles.selectedLabel : styles.idleLabel]}>{item.label}</Text>
          </PressableSurface>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  bar: {
    flexDirection: 'row',
    /* Tasarım %96 opak krem + `blur(8px)` çiziyor; alfalı krem token'ı YOK ve gerçek bulanıklık
       ayrı bir yerel modül ister (expo-blur). Opak kum kademesiyle kuruldu — `AppBar`ın aynı
       kararı, aynı gerekçe; ikisi de envantere raporlandı. */
    backgroundColor: theme.colors['sand-50'],
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors.ink,
    paddingTop: theme.space.md,
    paddingHorizontal: theme.space.md,
    /* Alt güvenli alan çubuğun İÇİNDE: ana ekran çubuğu (home indicator) etiketin üstüne binmesin.
       Tasarımın 6 px'lik alt dolgusu onun üstüne eklenir. */
    paddingBottom: rt.insets.bottom + theme.space.sm,
  },
  slot: {
    flex: 1,
  },
  item: {
    alignItems: 'center',
    gap: theme.space['2xs'],
    paddingVertical: theme.space.sm,
  },
  label: {
    fontFamily: theme.font.body,
    /* Tasarım 10,5/700; ölçekte o durak yok (envanter §3b'nin bilinen açığı). Boy `micro` (11,5),
       ağırlık üstbaşlık kademesinden (700) — `eyebrow` (10) sayıca daha yakın ama harf aralığı
       .18em'dir ve büyük harf içindir; sekme etiketi cümle biçimlidir. */
    fontSize: theme.text.micro,
    fontWeight: theme.text['eyebrow--font-weight'],
  },
  selectedLabel: { color: theme.colors.terracotta },
  idleLabel: { color: theme.colors.muted },
}));
