import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';

/*
  KESİKLİ DAVET KUTUSU — v3'ün "bu bir liste öğesi değil, bir DAVET" kalıbı: vitrinin Keşif ve
  profesyonel hesap bantları (v3:162, 166), checkout'un misafir doğrulama bloğu (v3:501),
  siparişlerin bağlantı hatası kutusu (v3:644).

  Katalog ekranının künyesinde `DashedInvite` diye bir komponent ADAYI olarak anılıyordu
  (sapma 2) — burada kuruldu. Kite terfisi raporlandı; müşteri ekranlarında dördü de bu kutuyu
  kullanıyor, beşinci bir kopya doğmuyor.

  ÜÇ TON: `terracotta` çağırıdır (yeni bir şey teklif eder), `olive` de çağırıdır ama BAŞKA bir
  yüzeye (kullanıcı kararı 15.08 — vitrinde alt alta duran iki davetin aynı renkte olması
  istenmedi; ayrım "biri sönük" diye değil, "ikisi ayrı yere götürüyor" diye kuruldu),
  `sand` bilgidir (durum bildirir).
  Fark yalnız çerçeve ve başlık rengindedir; şablonun 2 px ⟷ 1,5 px kalınlık ayrımı ÇİZİLMEDİ —
  ölçü katmanında 2'lik bir durak yok ve vurgu farkını zaten RENK taşıyor.

  ÜÇ YERLEŞİM, hepsi tasarımdan: `row` (metin solda, işaret sağda — tüm kutu basılır),
  `stack` (başlık · açıklama · düğme alt alta), `center` (ikon · başlık · düğme ortalanmış).
*/

interface DashedInviteProps {
  title: string;
  description?: string;
  /** Çerçeve ve başlık ailesi. */
  tone?: 'terracotta' | 'olive' | 'sand';
  layout?: 'row' | 'stack' | 'center';
  /** `center` yerleşiminde başlığın üstündeki ikon. */
  icon?: ReactNode;
  /** `stack`/`center`te düğme; `row`da sağdaki işaret (›/→) — çağıran verir. */
  action?: ReactNode;
  /** Verilirse KUTUNUN TAMAMI basılabilir olur (`row` yerleşiminin tasarımdaki davranışı). */
  onPress?: () => void;
  /** Kutu basılabilirken ekran okuyucunun duyduğu ad; verilmezse başlık. */
  accessibilityLabel?: string;
  testID?: string;
}

export function DashedInvite({
  title,
  description,
  tone = 'terracotta',
  layout = 'row',
  icon,
  action,
  onPress,
  accessibilityLabel,
  testID,
}: DashedInviteProps) {
  const body = (
    <>
      {icon}
      <View style={styles[`${layout}Text`]}>
        <Text
          style={[
            styles.title,
            styles[`${tone}Title`],
            layout === 'center' ? styles.centeredText : undefined,
          ]}
        >
          {title}
        </Text>
        {description === undefined ? null : (
          <Text style={[styles.description, layout === 'center' ? styles.centeredText : undefined]}>{description}</Text>
        )}
      </View>
      {action}
    </>
  );

  const boxStyle = [styles.box, styles[`${tone}Border`], styles[`${layout}Layout`]];

  if (onPress === undefined) {
    return (
      <View style={boxStyle} testID={testID}>
        {body}
      </View>
    );
  }

  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      style={boxStyle}
      accessibilityLabel={accessibilityLabel ?? title}
      testID={testID}
    >
      {body}
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  box: {
    borderWidth: theme.border.base,
    borderStyle: 'dashed',
    borderRadius: theme.radius.card,
    padding: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
  },
  terracottaBorder: { borderColor: theme.colors.terracotta },
  oliveBorder: { borderColor: theme.colors['olive-line'] },
  sandBorder: { borderColor: theme.colors['sand-500'] },
  rowLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
  },
  stackLayout: {
    gap: theme.space.md,
  },
  centerLayout: {
    alignItems: 'center',
    gap: theme.space.lg,
    // Şablonun ortalanmış hâli daha geniş nefes alıyor (`padding:28px 20px`).
    paddingVertical: theme.space['7xl'],
  },
  rowText: {
    flex: 1,
    gap: theme.space['2xs'],
  },
  stackText: {
    gap: theme.space.xs,
  },
  centerText: {
    alignSelf: 'stretch',
    gap: theme.space.xs,
    alignItems: 'center',
  },
  centeredText: { textAlign: 'center' },
  title: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
  },
  terracottaTitle: { color: theme.colors.terracotta },
  oliveTitle: { color: theme.colors['olive-dark'] },
  /* Ad TONLA eşleşiyor (`sandTitle`, `${tone}Title`) — eskiden `inkTitle`di ve ton adıyla
     bağı yoktu; üçüncü ton eklenince eşleme elle yazılan bir `if` olmaktan çıktı. */
  sandTitle: { color: theme.colors.ink },
  description: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
}));
