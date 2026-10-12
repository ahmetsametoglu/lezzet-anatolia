import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';

/*
  Eğik rozet: fiyat çipi, "Tükendi", "İNDİRİM", geri sayım ve puan rozeti hep budur. Açı içeriğe göre değiştiği için prop; dönüş dış
  sarmalayıcıda, çünkü basılı durumun `scale`ı iç yüzeyde ve RN `transform` dizisini bütün olarak değiştirir.
*/

type TagTone = 'terracotta' | 'soft' | 'ink' | 'cream' | 'sand' | 'olive' | 'blocked';

interface TagProps {
  /** Rozet metni — i18n üstte çözülür, komponent metin gömmez. */
  label: string;
  tone?: TagTone;
  /** Derece cinsinden dönüş (tasarım aralığı −7…+6). Varsayılan düz. */
  rotate?: number;
  /** Sert değil YUMUŞAK gölge — fotoğraf üstünde duran rozetler bunu taşır. */
  shadow?: boolean;
  /** Köşe kademesi; `pill` daha yuvarlak ve dikkat çekici, tek tek rozetler için. */
  shape?: 'badge' | 'pill';
  /** Verilirse rozet dokunulabilir olur (fiyat çipi "sepete ekle" gibi). */
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

export function Tag({
  label,
  tone = 'terracotta',
  rotate = 0,
  shadow = false,
  shape = 'badge',
  onPress,
  accessibilityLabel,
  testID,
}: TagProps) {
  const badgeStyle = [styles.badge, styles[tone], shape === 'pill' ? styles.pill : undefined, shadow ? styles.shadow : undefined];
  const content = <Text style={[styles.label, styles[`${tone}Label`]]}>{label}</Text>;
  const rotation = rotate === 0 ? undefined : { transform: [{ rotate: `${rotate}deg` }] };

  if (!onPress) {
    return (
      <View style={[badgeStyle, rotation]} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <View style={rotation}>
      <PressableSurface
        onPress={onPress}
        feedback="scale-small"
        compact
        style={badgeStyle}
        accessibilityLabel={accessibilityLabel ?? label}
        testID={testID}
      >
        {content}
      </PressableSurface>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.xl,
    borderRadius: theme.radius.badge,
  },
  pill: { borderRadius: theme.radius.pill },
  shadow: {
    // `soft` gölgenin 1 px yüksekliği fotoğraf üstünde yetmiyor.
    boxShadow: theme.shadow.badge,
  },
  label: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text.badge,
    letterSpacing: emToDp(theme.text['badge--letter-spacing'], theme.text.badge),
  },
  terracotta: { backgroundColor: theme.colors.terracotta },
  terracottaLabel: { color: theme.colors.card },
  soft: { backgroundColor: theme.colors['terracotta-bg'] },
  softLabel: { color: theme.colors.terracotta },
  ink: { backgroundColor: theme.colors.ink },
  inkLabel: { color: theme.colors['sand-50'] },
  cream: { backgroundColor: theme.colors['sand-50'] },
  creamLabel: { color: theme.colors.ink },
  sand: { backgroundColor: theme.colors['sand-150'] },
  sandLabel: { color: theme.colors['olive-dark'] },
  /* Tamamlanmış ödül: değerlendirmede yorum puanı hak edildiğinde rozet zeytine döner. */
  olive: { backgroundColor: theme.colors.olive },
  oliveLabel: { color: theme.colors.card },
  /* Fiyat çipi bu adrese gitmeyen üründe susar: aynı çip terracottayken "al" diyen bir vurgudur. */
  blocked: { backgroundColor: theme.colors['sand-650'] },
  blockedLabel: { color: theme.colors.card },
}));
