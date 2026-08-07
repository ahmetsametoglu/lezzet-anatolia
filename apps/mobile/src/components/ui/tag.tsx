import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from './pressable-surface';

/*
  EĞİK ROZET — v3'ün en çok yinelenen öğesi (~18 kullanım): fiyat çipi · "Tükendi" · "İNDİRİM" ·
  "TOPTAN" · geri sayım · takip çipi hep budur. İmzası hafif dönüştür (tasarımda −7°…+6°);
  açı içeriğe göre değişir, o yüzden PROP — sabit bir açı rozetleri birbirinin kopyası yapardı.

  Dört ton, hepsi token: terracotta (fiyat/fırsat) · ink (koyu vurgu) · cream (fotoğraf ve koyu
  blok üstünde) · sand (puan, yumuşak vurgu).

  DÖNÜŞ NEDEN DIŞ SARMALAYICIDA: basılı durum `scale` uyguluyor ve RN'de `transform` dizisi
  BÜTÜN olarak değişir — dönüş iç yüzeyde olsaydı basıldığı an kaybolurdu. Dışta durunca ikisi
  üst üste biner (tasarımdaki `transform:scale(.9) rotate(-2deg)` ile aynı sonuç).
*/

type TagTone = 'terracotta' | 'ink' | 'cream' | 'sand';

interface TagProps {
  /** Rozet metni — i18n üstte çözülür, komponent metin gömmez. */
  label: string;
  tone?: TagTone;
  /** Derece cinsinden dönüş (tasarım aralığı −7…+6). Varsayılan düz. */
  rotate?: number;
  /** Sert değil YUMUŞAK gölge — fotoğraf üstünde duran rozetler bunu taşır. */
  shadow?: boolean;
  /** Verilirse rozet dokunulabilir olur (fiyat çipi "sepete ekle" gibi). */
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

export function Tag({ label, tone = 'terracotta', rotate = 0, shadow = false, onPress, accessibilityLabel, testID }: TagProps) {
  const badgeStyle = [styles.badge, styles[tone], shadow ? styles.shadow : undefined];
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
  shadow: {
    boxShadow: theme.shadow.soft,
  },
  label: {
    fontFamily: theme.font.body,
    // Rozetin kendi yazı kademesi YOK: ölçü tasarımdaki değerin aynısı olan `field-label`
    // (12,5), ağırlık düğme kademesinden (700). Ayrı bir rozet kademesi envantere önerildi.
    fontSize: theme.text['field-label'],
    fontWeight: theme.text['button--font-weight'],
  },
  terracotta: { backgroundColor: theme.colors.terracotta },
  terracottaLabel: { color: theme.colors.card },
  ink: { backgroundColor: theme.colors.ink },
  inkLabel: { color: theme.colors['sand-50'] },
  cream: { backgroundColor: theme.colors['sand-50'] },
  creamLabel: { color: theme.colors.ink },
  sand: { backgroundColor: theme.colors['sand-150'] },
  sandLabel: { color: theme.colors['olive-dark'] },
}));
