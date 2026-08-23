import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from './pressable-surface';
import { emToDp } from '../../theme/parse';

/*
  EĞİK ROZET — v3'ün en çok yinelenen öğesi (~18 kullanım): fiyat çipi · "Tükendi" · "İNDİRİM" ·
  "TOPTAN" · geri sayım · takip çipi hep budur. İmzası hafif dönüştür (tasarımda −7°…+6°);
  açı içeriğe göre değişir, o yüzden PROP — sabit bir açı rozetleri birbirinin kopyası yapardı.

  Dört ton, hepsi token: terracotta (fiyat/fırsat) · ink (koyu vurgu) · cream (fotoğraf ve koyu
  blok üstünde) · sand (puan, yumuşak vurgu).

  YAZI VE GÖLGE ARTIK KENDİ KADEMESİNDE (Token Kararlari #16): daha önce ölçü `field-label`den,
  ağırlık `button`dan devşiriliyor ve gölge `shadow.soft`la kuruluyordu — üç ayrı kademeden
  toplanan bir dördüncü kademe, üçünden biri kendi gerekçesiyle değiştiği gün rozeti sessizce
  bozardı. Bugün üçü de `badge` adını taşıyor ve tek karardan değişiyor.

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
  /**
   * Köşe kademesi (kullanıcı isteği 23.08 — *"biraz daha yuvarlak, dikkat çekici"*).
   *
   * Varsayılan `badge` (12px) bugünkü ~18 kullanımın hepsinin hâli; `pill` (22px) resmî setin
   * "hap düğme, çip, sayaç" kademesidir (`customerAppRadius` künyesi). Prop, çünkü kademeyi
   * komponentin tamamına dayatmak tasarımın dört kademeli kararını üçe indirirdi — burada
   * daha yuvarlak istenen TEK bir rozet var, hepsi değil.
   */
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
    // Rozetin KENDİ gölgesi (#16): `soft`un 1 px yüksekliği fotoğraf üstünde yetmiyordu.
    boxShadow: theme.shadow.badge,
  },
  label: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text.badge,
    letterSpacing: emToDp(theme.text['badge--letter-spacing'], theme.text.badge),
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
