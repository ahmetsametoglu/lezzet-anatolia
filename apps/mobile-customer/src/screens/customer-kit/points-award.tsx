import type { LocalizedCopy } from '@lezzet/i18n';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { StyleSheet } from 'react-native-unistyles';
import { POINTS_SPARK_PATH } from '@lezzet/design-tokens/icons';

import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import messages from '@lezzet/i18n/customer/points-award';

/*
  Puan kazanımının sonucu, her kazanma anının ortak bloğu: kazanılanı ve toplamı tek biçimde söyler, çünkü ayrı yazılan iki biçim bir
  gün ayrışır. Kazanımı gösteren sayfa içeriği dikeyde ortalar; bunu blok değil her yüzeyin kaydırma kabı yapar, çünkü ortalanan şey
  sayfanın tamamıdır.
*/

type Messages = LocalizedCopy<typeof messages>;

interface PointsSparkProps {
  /** Kenar uzunluğu (dp) — kahraman ölçeği çağıranın kararı. */
  size: number;
  /** Dolgunun rengi — tema token'ı; ham hex YASAK (CLAUDE §3). */
  color: string;
}

/**
 * Puan yıldızı (✦), puanın görsel imzası: hesap kartı ve kazanım satırı puanı `✦` ile yazar. Dört uçlu ve kenarları içbükey, çünkü
 * düz eşkenar dörtgen büyük ölçekte leke gibi okunur; sözlükteki `star` beş uçlu ve başka bir işin ikonu.
 */
export function PointsSpark({ size, color }: PointsSparkProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d={POINTS_SPARK_PATH} fill={color} />
    </Svg>
  );
}

interface PointsAwardProps {
  /**
   * Bu anda gerçekten yazılan puan, motorun defterinden. `null` ödülün sahibi yok (girişsiz tur), `0` motor yazmadı (günlük tavan,
   * B2B, aynı kayda ikinci ödül); ikisinde de blok çizilmez, çünkü kazanılmayan ödülün sonucu gösterilmez.
   */
  points: number | null;
  /**
   * Yazımdan SONRAKİ bakiye — *"şu ana kadar ne oldu"* sorusunun cevabı.
   *
   * `null` iken toplam satırı düşer, blok yine çizilir: kazanılan puan bilindiği hâlde bakiyenin
   * okunamadığı hâlde "Toplam ✦ 0" yazmak, bozuk ölçümü sağlıklı gibi okutmak olurdu (CLAUDE §1).
   */
  balance: number | null;
  /**
   * Toplam henüz oturmadı mı, yani yolda cevabı gelmemiş bir yazım var mı: `true` iken sayı yazılmaz, bekleme söylenir, çünkü
   * tamamlanmamış bir sayı tam gibi gösterilirdi.
   */
  settling?: boolean;
  /** Tasarımın eğik kum kartı (değerlendirmenin sonu); varsayılan kutusuz küme (keşif turunun bitişi). */
  framed?: boolean;
  testID?: string;
}

/**
 * Kazanımın üç satırı: varsayılanda kendi aralığı olan kutusuz bir küme, hiyerarşi ölçek ve boşlukla kurulur. Değerlendirmenin sonu
 * tasarımın eğik kum kartını ister (`framed`).
 */
export function PointsAward({ points, balance, settling = false, framed = false, testID }: PointsAwardProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];

  if (settling) {
    return (
      <Text style={styles.settling} testID={testID === undefined ? undefined : `${testID}-settling`}>
        {t.settling}
      </Text>
    );
  }

  if (points === null || points <= 0) return null;

  return (
    <View style={[styles.block, framed ? styles.framed : undefined]} testID={testID}>
      <Text style={styles.value}>{t.points.replace('{points}', String(points))}</Text>
      <Text style={styles.note}>{t.note}</Text>
      {balance === null ? null : (
        <View style={styles.total}>
          <Text style={styles.totalLabel}>{t.total.replace('{points}', String(balance))}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  block: {
    alignItems: 'center',
    gap: theme.space.xs,
    marginTop: theme.space.lg,
  },
  /** Tasarımın puan kartı: kum zemin, sert gölge ve ters yöne eğik, ki içindeki eğik toplam rozetiyle birlikte elle konmuş gibi dursun. */
  framed: {
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.card,
    paddingVertical: theme.space['4xl'],
    paddingHorizontal: theme.space['8xl'],
    marginTop: theme.space.sm,
    marginBottom: theme.space.sm,
    transform: [{ rotate: '-2deg' }],
    boxShadow: theme.shadow.hard,
  },
  value: {
    fontFamily: theme.font.display[theme.text['h1-sm--font-weight']],
    fontSize: theme.text['h1-sm'],
    color: theme.colors.terracotta,
  },
  note: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['field-label'],
    color: theme.colors.body,
  },
  /** Toplam bir ROZET: kazanılan sayıdan bir kademe küçük, ama zeminiyle ondan ayrı bir gerçek. */
  total: {
    backgroundColor: theme.colors.olive,
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space['2xl'],
    marginTop: theme.space['2xs'],
    transform: [{ rotate: '2deg' }],
  },
  totalLabel: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text.badge,
    color: theme.colors.card,
  },
  /** Bekleme cümlesi — sayının yerini tutar, o yüzden aynı dikey boşlukta ve aynı tonda. */
  settling: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['field-label'],
    color: theme.colors.body,
    textAlign: 'center',
    marginTop: theme.space.lg,
  },
}));
