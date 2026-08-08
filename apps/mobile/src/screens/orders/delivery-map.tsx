import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { customerMetrics } from '@/screens/customer-kit/customer-metrics';

/*
  CANLI TAKİP HARİTASI (v3:702) — kurye yoldayken sipariş detayının başında duran şerit.

  HARİTA TEMSİLÎDİR, GERÇEK DEĞİL: şablonda da öyle — elle çizilmiş yollar, bir nehir, kesikli bir
  rota, kuryenin konumu ve teslim iğnesi. Gerçek harita (koordinat, döşeme sağlayıcısı, canlı
  konum) kendi görevidir; burada çizilen, o gelene kadar müşteriye "takip ediliyor" demenin
  tasarımdaki hâlidir. Geometri şablondan BİREBİR alındı, sadeleştirilmedi.

  ── SAPMA: NABIZ ANİMASYONU ÇİZİLMEDİ ───────────────────────────────────────
  Şablonda kurye noktasının etrafında SVG `<animate>` ile büyüyen bir halka var. RN'de karşılığı
  `Animated` + sürekli koşan bir döngüdür; ekranın geri kalanı hareketsizken tek bir süs için
  kalıcı bir animasyon döngüsü açmak (pil + testte sahte zamanlayıcı) bu etabın kazancından
  büyük bir bedel. Halka STATİK çizildi: konum aynı yerde ve aynı vurguyla duruyor.
*/

interface DeliveryMapProps {
  /** "Kurye yolda · tahmini 30–40 dk" — cümle çağırandan (i18n). */
  trackingLabel: string;
  /** Sağ alt köşedeki "Canlı takip" künyesi. */
  liveLabel: string;
  testID?: string;
}

export function DeliveryMap({ trackingLabel, liveLabel, testID }: DeliveryMapProps) {
  const { theme } = useUnistyles();

  return (
    <View style={styles.frame} testID={testID}>
      {/* Harita bir RESİMDİR: ekran okuyucuya çizim değil, üstündeki iki metin konuşur. */}
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 340 195"
        preserveAspectRatio="xMidYMid slice"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {/* Yollar — krem şeritler. */}
        <Path d="M-10 45 H350" stroke={theme.colors['sand-50']} strokeWidth={11} fill="none" />
        <Path d="M-10 110 H350" stroke={theme.colors['sand-50']} strokeWidth={8} fill="none" />
        <Path d="M70 -10 V205" stroke={theme.colors['sand-50']} strokeWidth={8} fill="none" />
        <Path d="M180 -10 V205" stroke={theme.colors['sand-50']} strokeWidth={11} fill="none" />
        <Path d="M255 -10 L340 90" stroke={theme.colors['sand-50']} strokeWidth={7} fill="none" />
        {/* Nehir — şablonun soğuk mavisi; palette karşılığı yok, en yakın nötr kullanıldı (raporlandı). */}
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
        {/* Kuryenin konumu: dolu nokta + etrafında sabit halka (bkz. sapma). */}
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
      <View style={styles.liveChip}>
        <Text style={styles.liveLabel}>{liveLabel}</Text>
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
    fontWeight: theme.text['button--font-weight'],
    color: theme.colors['sand-50'],
  },
  liveChip: {
    position: 'absolute',
    right: theme.space.xl,
    bottom: theme.space.xl,
    paddingVertical: theme.space.xs,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.badge,
    backgroundColor: theme.colors['cream-glass'],
  },
  liveLabel: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.eyebrow,
    fontWeight: theme.text['field-label--font-weight'],
    color: theme.colors.muted,
  },
}));
