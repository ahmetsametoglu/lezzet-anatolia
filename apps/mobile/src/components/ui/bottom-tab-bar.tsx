import { BlurView } from 'expo-blur';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from './icon';
import type { IconName } from './icon-paths';
import { PressableSurface } from './pressable-surface';

/*
  ALT SEKME ÇUBUĞU — uygulamanın kabuğu (v3 `tabs`, dört sekme: Vitrin · Katalog · Siparişler ·
  Hesap). Sepet sekme DEĞİLDİR (envanter §4): sepete FAB ve yapışkan barlardan gidilir.

  YÖNLENDİRMEYİ BİLMEZ: girdisi `items` dizisidir (etiket + ikon + seçili mi + basılınca ne
  olacak), yani navigasyon kütüphanesinin şeklinden bağımsızdır. Router'ın kendi tab bar prop'unu
  bu komponente doğrudan geçirmek, kiti expo-router sürümüne bağlardı; çeviri kabuk katmanının
  (`app/(tabs)/_layout.tsx`) işi.

  İKON ARTIK VAR (21.7): tasarımın 23 px'lik çizgi ikonları `react-native-svg` ile, yolları
  şablondan birebir alınarak çiziliyor (`icon-paths.ts` — v3:1745 `IC` sözlüğü). İkon ADI çağırandan
  gelir, çünkü hangi rotanın hangi ikonu taşıdığı navigasyonun bilgisidir, çubuğun değil.

  ROZET YOK: tasarımın `t.badge` yuvası ölü (envanter §8.6 — sayaç sepet sekmesi içindi, o sekme
  de yok). Ölü bir alanı port etmemek envanter §8.13'ün kararı.

  ZEMİN KREM CAM (Token Kararlari #17): %96 krem + `blur(8px)`. Gerekçe ve Android'in
  `BlurTargetView` açığı `AppBar` künyesinde, tek yerde yazılı — aynı yüzey, aynı karar.
*/

/** Tek sekme — kabuk hangi rotanın seçili olduğunu bilir, çubuk yalnız çizer. */
export interface BottomTabItem {
  /** Rota adı; liste anahtarı ve test kimliği olarak da kullanılır. */
  key: string;
  /** Görünen etiket — i18n üstte çözülür. */
  label: string;
  /** Sekmenin ikonu (`icon-paths.ts` sözlüğünden) — hangi rotanın hangi ikonu, kabuğun bilgisi. */
  icon: IconName;
  selected: boolean;
  onPress: () => void;
}

interface BottomTabBarProps {
  items: BottomTabItem[];
  testID?: string;
}

export function BottomTabBar({ items, testID }: BottomTabBarProps) {
  const { theme } = useUnistyles();

  return (
    <BlurView intensity={theme.glassBlurIntensity} tint="light" style={styles.bar} testID={testID} accessibilityRole="tablist">
      <View style={styles.glass} pointerEvents="none" testID={testID === undefined ? undefined : `${testID}-glass`} />
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
            {/* İkonun rengi etiketle AYNI kaynaktan: şablon ikonu `currentColor` ile boyuyor,
                yani ikon ile etiket tek bir durum rengini paylaşıyor. RN renk mirası vermediği
                için değer açıkça geçiliyor — ama seçim yine tek koşuldan okunuyor.

                DÖNÜŞÜM SARMALAYICIDA, ikonun kendisinde değil: `Icon` bir SVG çizer ve stil
                prop'u YOKTUR (renk/boy dışında bir görünüm kararı ikona ait değildir). Şablon da
                dönüşümü ikonun kutusuna uyguluyor. */}
            <View style={item.selected ? styles.selectedIcon : undefined}>
              <Icon
                name={item.icon}
                size={theme.size.tabIcon}
                color={item.selected ? theme.colors.terracotta : theme.colors.muted}
              />
            </View>
            <Text style={[styles.label, item.selected ? styles.selectedLabel : styles.idleLabel]}>{item.label}</Text>
          </PressableSurface>
        </View>
      ))}
    </BlurView>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  bar: {
    flexDirection: 'row',
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors.ink,
    paddingTop: theme.space.md,
    paddingHorizontal: theme.space.md,
    /* Alt güvenli alan çubuğun İÇİNDE: ana ekran çubuğu (home indicator) etiketin üstüne binmesin.
       Tasarımın 6 px'lik alt dolgusu onun üstüne eklenir. */
    paddingBottom: rt.insets.bottom + theme.space.sm,
  },
  /** Bulanıklığın üstündeki krem katman — gerekçesi `AppBar`da, aynı yüzeyin ikizi. */
  glass: {
    position: 'absolute',
    inset: 0,
    backgroundColor: theme.colors['cream-glass'],
  },
  slot: {
    flex: 1,
  },
  item: {
    alignItems: 'center',
    gap: theme.space['2xs'],
    paddingVertical: theme.space.sm,
  },
  /** Seçili sekmenin ikonu bir tık yukarı kalkar ve büyür — tasarımın durum vurgusu. */
  selectedIcon: {
    transform: [{ translateY: theme.tabSelected.lift }, { scale: theme.tabSelected.scale }],
  },
  label: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    /* Tasarım 10,5/700; ölçekte o durak yok (envanter §3b'nin bilinen açığı). Boy `micro` (11,5),
       ağırlık üstbaşlık kademesinden (700) — `eyebrow` (10) sayıca daha yakın ama harf aralığı
       .18em'dir ve büyük harf içindir; sekme etiketi cümle biçimlidir. */
    fontSize: theme.text.micro,
    fontWeight: theme.text['eyebrow--font-weight'],
  },
  selectedLabel: { color: theme.colors.terracotta },
  idleLabel: { color: theme.colors.muted },
}));
