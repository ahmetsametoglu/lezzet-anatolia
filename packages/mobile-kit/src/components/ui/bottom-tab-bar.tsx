import { BlurView } from 'expo-blur';
import { Platform, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { operationsTheme } from '../../theme/unistyles';
import { Icon } from './icon';
import { customerTabBarHomeIndicatorTrimPx } from '@lezzet/design-tokens/customer';
import type { IconName } from '@lezzet/design-tokens/icons';
import { PressableSurface } from './pressable-surface';

/*
  Alt sekme çubuğu, uygulamanın kabuğu: yönlendirmeyi bilmez, `items` dizisini çizer; sepet sekme değil, rozet yok. Operasyon ve
  müşteri aynı iskeleti paylaşır, ayrım yalnız `tone`dadır ve operasyon değerleri `operationsTheme` sabitinden okunur.
*/

/** Çubuğun hangi yüzeyde durduğu — renk/kademe kararı bu addan türer, çağırandan değil. */
type BottomTabTone = 'customer' | 'operations';

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
  /** Varsayılan müşteri vitrini; operasyon kabuğu kendi tonunu ister. */
  tone?: BottomTabTone;
  testID?: string;
}

export function BottomTabBar({ items, tone = 'customer', testID }: BottomTabBarProps) {
  const { theme } = useUnistyles();

  /* İkon ve etiket TEK kaynaktan boyanır (şablon ikonu `currentColor` ile boyuyor). Renk STİL
     DEĞİL PROP olarak da gerektiği için (`Icon`ın `color`u) stil sayfasında değil burada durur —
     iki yerde yazılsaydı ikon ile etiketin rengi bir gün ayrışırdı. */
  const stateColors =
    tone === 'operations'
      ? { selected: operationsTheme.colors.olive, idle: operationsTheme.colors['tab-inactive'] }
      : { selected: theme.colors.terracotta, idle: theme.colors.muted };

  /* İkon ölçüsü de tondan: iki yüzeyin durağı v3'te ayrıldı (künye üstte, ölçüm `metrics.ts`te). */
  const iconSize = tone === 'operations' ? operationsTheme.size.tabIconOperations : theme.size.tabIcon;

  return (
    <BlurView
      intensity={theme.glassBlurIntensity}
      tint="light"
      style={[styles.bar, styles[`${tone}Bar`]]}
      testID={testID}
      accessibilityRole="tablist"
    >
      <View style={styles.glass} pointerEvents="none" testID={testID === undefined ? undefined : `${testID}-glass`} />
      {items.map((item) => (
        // Genişliği YUVA dağıtır: `PressableSurface`in stili iç yüzeydedir, dış `Pressable`a
        // `flex: 1` geçirilemez — dördü eşit paylaşsın diye sarmalayıcı burada.
        <View key={item.key} style={styles.slot}>
          <PressableSurface
      /* Sekme çubuğu saf gezinmedir; her geçişte titremek titreşimin anlamını sıfırlar. */
      haptic={false}
            onPress={item.onPress}
            /* Müşteri şablonu sekmede opaklık kullanıyor, operasyon v2 küçültme (`scale(.94)` —
               kitin `scale` durağına, .97'ye çekildi; .9'a olan uzaklık daha büyük). */
            feedback={tone === 'operations' ? 'scale' : 'opacity'}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            selected={item.selected}
            /* Görsel yüksekliği (etiket + dolgu) 44 dp'nin altında: dokunma payı ekleniyor. */
            compact
            style={styles.item}
            testID={testID === undefined ? undefined : `${testID}-${item.key}`}
          >
            {/* İkonun rengi etiketle aynı koşuldan okunur; dönüşüm sarmalayıcıda, çünkü `Icon`un stil prop'u yok. */}
            <View style={item.selected && tone === 'customer' ? styles.selectedIcon : undefined}>
              <Icon
                name={item.icon}
                size={iconSize}
                color={item.selected ? stateColors.selected : stateColors.idle}
              />
            </View>
            <Text
              style={[
                styles.label,
                styles[`${tone}Label`],
                { color: item.selected ? stateColors.selected : stateColors.idle },
              ]}
            >
              {item.label}
            </Text>
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
    paddingTop: theme.space.md,
    paddingHorizontal: theme.space.md,
  },
  /** Müşteri: mürekkep üst çizgi + tasarımın 6 px alt dolgusu (v3). */
  customerBar: {
    borderTopColor: theme.colors.ink,
    /* Alt güvenli alan tasarım dolgusuyla toplanmaz, büyüğü alınır; iPhone'un ev çubuğu payı ayrıca kırpılır, çünkü tamamı etiketlerin
       altında belirgin bir boşluk bırakır. Android'in sistem çubuğu kırpılmaz, etiket altında kalırdı. */
    paddingBottom: Math.max(rt.insets.bottom - (Platform.OS === 'ios' ? customerTabBarHomeIndicatorTrimPx : 0), theme.space.sm),
  },
  /** Operasyon: kum ayracı (`#ddd6c4` → `sand-300`) + 10 px alt, 6 px yan dolgu (v3). */
  operationsBar: {
    borderTopColor: operationsTheme.colors['sand-300'],
    // Aynı kural: inset ile dolgunun büyüğü (gerekçe üstte).
    paddingBottom: Math.max(rt.insets.bottom, theme.space.lg),
    // v3 `padding:8px 6px 10px` — yatay nefes müşterininkinden 2 dp dar (dört yuva daha geniş).
    paddingHorizontal: theme.space.sm,
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
  /** Seçili sekmenin ikonu bir tık yukarı kalkar ve büyür; müşteri tasarımının vurgusu, operasyonda seçim yalnız renkle söylenir. */
  selectedIcon: {
    transform: [{ translateY: theme.tabSelected.lift }, { scale: theme.tabSelected.scale }],
  },
  label: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
  },
  /* Müşteri tasarımı 10,5/700; ölçekte o durak yok (envanter §3b'nin bilinen açığı). Boy `micro`
     (11,5), ağırlık üstbaşlık kademesinden (700) — `eyebrow` (10) sayıca daha yakın ama harf
     aralığı .18em'dir ve büyük harf içindir; sekme etiketi cümle biçimlidir. */
  customerLabel: { fontSize: theme.text.micro },
  /* Operasyon etiketi tam 10 px; `badge-sm` o ölçünün kendisi. */
  operationsLabel: { fontSize: operationsTheme.text['badge-sm'] },
}));
