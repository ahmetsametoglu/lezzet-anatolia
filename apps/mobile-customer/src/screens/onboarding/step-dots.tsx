import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/*
  ADIM NOKTALARI — onboarding'in ilerleme göstergesi (v3 `ob.dots`, 00-ortak:333-335): etkin nokta
  24 dp genişler ve terracotta'ya döner, kalanlar 8 dp kum çizgisi.

  ŞABLONUN `transition:all .25s`İ ÇİZİLMEDİ (bilinçli): genişlik ve zemin rengi yerel sürücüye
  (useNativeDriver) taşınamaz; JS-sürücülü animasyon her karede state güncelleyip test hattını
  act uyarısına boğuyor (ölçüldü — 8 uyarı; iskelet nabzı bu yüzden yalnız yerel-sürücülü opaklık
  oynatıyor). Kitin kendi emsali de aynı yönde: basılı geri bildirim şablonun `.12s` geçişini
  değil anlık durum takasını çizer (`PressableSurface`). Durum takası burada da anlıktır.

  ÖLÇÜLER YEREL SABİT: nokta geometrisi (5 yükseklik · 3 yarıçap · 8/24 genişlik) yapısal ölçüdür,
  yuvarlanmaz; ölçü katmanları bu etapta yazıya kapalı olduğundan durak açılamadı — terfi ihtiyacı
  raporlandı (customer-metrics'in kendi kuruluş gerekçesiyle aynı durum).

  ERİŞİLEBİLİRLİK: noktalar tek tek sessizdir; sıra "Adım 2 / 4" cümlesini tek öğe olarak taşır —
  dört ayrı renk yuvarlağı ekran okuyucuya hiçbir şey söylemezdi.
*/

/** v3 birebir: etkin 24 · sönük 8 · yükseklik 5 · yarıçap 3. */
const DOT_WIDTH_ACTIVE = 24;
const DOT_WIDTH_IDLE = 8;
const DOT_HEIGHT = 5;
const DOT_RADIUS = 3;

interface StepDotsProps {
  count: number;
  /** Etkin adımın sıfır tabanlı sırası. */
  active: number;
  /** Sıranın ekran okuyucu cümlesi ("Adım 2 / 4") — i18n üstte çözülür. */
  accessibilityLabel: string;
  testID?: string;
}

export function StepDots({ count, active, accessibilityLabel, testID }: StepDotsProps) {
  return (
    <View style={styles.row} accessibilityLabel={accessibilityLabel} testID={testID}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={[styles.dot, index === active ? styles.dotActive : styles.dotIdle]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.space.sm,
  },
  dot: {
    height: DOT_HEIGHT,
    borderRadius: DOT_RADIUS,
  },
  dotActive: {
    width: DOT_WIDTH_ACTIVE,
    backgroundColor: theme.colors.terracotta,
  },
  dotIdle: {
    width: DOT_WIDTH_IDLE,
    backgroundColor: theme.colors['sand-400'],
  },
}));
