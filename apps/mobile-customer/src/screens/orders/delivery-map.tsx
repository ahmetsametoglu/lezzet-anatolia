import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';

/*
  Kurye yoldayken sipariş detayının başındaki temsilî harita: kuryenin konumunu ve varış süresini ölçmediğimiz için çizim tasarımdan
  birebir alınır ve üstünde yalnız "yolda" yazar. Tasarımdaki nabız halkası statik çizildi, çünkü tek bir süs için sürekli koşan
  animasyon pil ve testte sahte zamanlayıcı bedeli getirir.
*/

interface DeliveryMapProps {
  trackingLabel: string;
  testID?: string;
}

export function DeliveryMap({ trackingLabel, testID }: DeliveryMapProps) {
  const { theme } = useUnistyles();

  return (
    <View style={styles.frame} testID={testID}>
      {/* Harita bir resimdir: ekran okuyucuya çizim değil, üstündeki metin konuşur. */}
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 340 195"
        preserveAspectRatio="xMidYMid slice"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {/* Yollar — krem çizgiler. */}
        <Path d="M-10 45 H350" stroke={theme.colors['sand-50']} strokeWidth={11} fill="none" />
        <Path d="M-10 110 H350" stroke={theme.colors['sand-50']} strokeWidth={8} fill="none" />
        <Path d="M70 -10 V205" stroke={theme.colors['sand-50']} strokeWidth={8} fill="none" />
        <Path d="M180 -10 V205" stroke={theme.colors['sand-50']} strokeWidth={11} fill="none" />
        <Path d="M255 -10 L340 90" stroke={theme.colors['sand-50']} strokeWidth={7} fill="none" />
        {/* Nehir: tasarımın mavisi palette yok, en yakın nötr kullanıldı. */}
        <Path d="M-10 170 C 90 140, 200 190, 350 145" stroke={theme.colors['neutral-400']} strokeWidth={16} fill="none" />
        {/* Kuryenin izlediği rota — kesikli zeytin. */}
        <Path
          d="M55 160 C 100 130, 140 135, 185 100 S 255 62, 288 58"
          stroke={theme.colors.olive}
          strokeWidth={3.5}
          strokeDasharray="7 6"
          strokeLinecap="round"
          fill="none"
        />
        {/* Kuryenin konumu: dolu nokta ve sabit halka. */}
        <Circle cx={150} cy={122} r={9} fill={theme.colors.terracotta} stroke={theme.colors['sand-50']} strokeWidth={3} />
        <Circle cx={150} cy={122} r={18} fill="none" stroke={theme.colors.terracotta} strokeWidth={2} opacity={0.5} />
        {/* Teslim iğnesi. */}
        <G translateX={288} translateY={58}>
          <Path d="M0 0C0 0 -9 -8 -9 -14a9 9 0 1 1 18 0C9 -8 0 0 0 0z" fill={theme.colors.ink} />
          <Circle cx={0} cy={-13.5} r={3.4} fill={theme.colors['sand-50']} />
        </G>
      </Svg>
      <View style={styles.trackingChip}>
        <Text style={styles.trackingLabel}>{trackingLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  frame: {
    height: customerMetrics.mapHeight,
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    // Şablonun soluk yeşil zemini; palette en yakın karşılık zeytin bandın zeminidir.
    backgroundColor: theme.colors['olive-bg'],
  },
  trackingChip: {
    position: 'absolute',
    top: theme.space.xl,
    left: theme.space.xl,
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.xl,
    borderRadius: theme.radius.badge,
    backgroundColor: theme.colors.ink,
  },
  trackingLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.micro,
    color: theme.colors['sand-50'],
  },
}));
