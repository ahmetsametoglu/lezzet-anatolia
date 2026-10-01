import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Skeleton } from '@/components/ui/skeleton';
import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';

/*
  Ürün detayının ilk yükte yer tutucusu: ölçüler sayfanın kendi stillerinden türer ki veri gelince ekran zıplamasın, metin yazılmaz.
  Yalnız her zaman görünen bölümler çizilir; koşullu bölümler çizilmez ki kayma yalnız "gelen eklendi" yönünde olsun.
*/

/** Üç akordeon başlığı — sayfanın kendi sırası (İçindekiler · Besin değerleri · Saklama). */
const ACCORDION_SLOTS = [0, 1, 2];

type Theme = ReturnType<typeof useUnistyles>['theme'];

/* Satır yüksekliği sayfanın KENDİ hesabıdır. Sayfada `lineHeight` verilmiş metinlerde o oran
   kullanılır (başlık `h1-sm--line-height`, boş-yorum kutusu `lead--line-height`); verilmemiş
   olanlarda vitrin skeleton'ının çarpanı (`h1--line-height`) — ikisi de token, uydurma yok. */
function lineOf(theme: Theme, fontSize: number, ratio: number = theme.text['h1--line-height']): number {
  return fontSize * ratio;
}

interface ProductSkeletonProps {
  testID?: string;
}

export function ProductSkeleton({ testID }: ProductSkeletonProps) {
  const { theme } = useUnistyles();

  return (
    <View
      style={styles.screen}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      {/* ── Kahraman: tam genişlik foto + üstünde yüzen geri/paylaş daireleri ── */}
      <View style={styles.hero}>
        {/* Köşesiz: sayfada da kenardan kenara (kart değil). */}
        <Skeleton width="100%" height={customerMetrics.productHero} radius="none" />
        <View style={styles.heroButtons}>
          <Skeleton width={theme.size.iconButtonOnPhoto} height={theme.size.iconButtonOnPhoto} />
          <Skeleton width={theme.size.iconButtonOnPhoto} height={theme.size.iconButtonOnPhoto} />
        </View>
      </View>

      {/* ── Künye: ürün adı + birim/KDV satırı ─────────────────────────────── */}
      <View style={styles.head}>
        <Skeleton width="72%" height={lineOf(theme, theme.text['h1-sm'], theme.text['h1-sm--line-height'])} />
        <Skeleton width="48%" height={lineOf(theme, theme.text.micro)} />
      </View>

      <BodySlots />
      <ProductBarSkeleton />
    </View>
  );
}

/** Künyenin altındaki gövde; kart bilgisiyle çizilen üst bölümün altında yüklemenin sürdüğünü ekran okuyucuya da söyler. */
export function ProductBodySkeleton({ testID }: ProductSkeletonProps) {
  return (
    <View testID={testID} accessible accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
      <BodySlots />
    </View>
  );
}

function BodySlots() {
  const { theme } = useUnistyles();

  /* Boş-yorum kutusu (`styles.reviewsEmpty`) tek parça YÜZEY: dikey dolgu + tek satır metin. */
  const reviewsEmptyHeight = theme.space.lg * 2 + lineOf(theme, theme.text.note, theme.text['lead--line-height']);

  return (
    <>
      {/* ── Akordeonlar: çerçeve gerçek, başlıklar gri ─────────────────────── */}
      <View style={styles.accordion}>
        {ACCORDION_SLOTS.map((slot) => (
          <View key={slot} style={[styles.accordionHead, slot === 0 ? null : styles.accordionDivided]}>
            <Skeleton width="46%" height={lineOf(theme, theme.text.note)} />
          </View>
        ))}
      </View>

      {/* ── Değerlendirmeler: bölüm başlığı + "yorum yok" kutusu ───────────── */}
      <View style={styles.reviews}>
        <Skeleton width="52%" height={lineOf(theme, theme.text['card-title-sm'])} />
        <Skeleton width="100%" height={reviewsEmptyHeight} radius="card" />
      </View>
    </>
  );
}

/** Yapışkan bar: adet kutusu + sepete ekle düğmesi. */
export function ProductBarSkeleton() {
  const { theme } = useUnistyles();

  /* Sepet adedi kutusu (`styles.stepper`): iki düğme + ortadaki sayı alanı; yüksekliği düğmeden. */
  const stepperWidth = customerMetrics.productStepButtonWidth * 2 + customerMetrics.productStepValueWidth;

  return (
    <View style={styles.bar}>
      <View style={styles.barRow}>
        <Skeleton width={stepperWidth} height={customerMetrics.productStepButtonHeight} radius="control" />
        <View style={styles.ctaSlot}>
          <Skeleton width="100%" height={theme.size.controlLg} radius="control" />
        </View>
      </View>
    </View>
  );
}

/*
  STİLLER — sayfanın kendi kap stillerinin AYNISI (dolgu · ara · kenar boşluğu · çerçeve). Yalnız
  blok yüksekliklerini eşitlemek yetmezdi: bölümler arası boşluk da yerleşimin parçası ve veri
  gelince oradan zıplardı.
*/
const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.cream,
  },

  hero: { height: customerMetrics.productHero },
  /** Sayfanın kendi hesabı: şablonun 8px'i ÜST GÜVENLİ ALANIN üstüne eklenir. */
  heroButtons: {
    position: 'absolute',
    top: rt.insets.top + theme.space.md,
    left: theme.space['3xl'],
    right: theme.space['3xl'],
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  head: {
    paddingTop: theme.space['2xl'],
    paddingHorizontal: theme.space['2xl'],
    paddingBottom: theme.space.sm,
    gap: theme.space.md,
  },

  accordion: {
    marginVertical: theme.space.xs,
    marginHorizontal: theme.space.xl,
    borderTopWidth: theme.border.base,
    borderBottomWidth: theme.border.base,
    borderColor: theme.colors.ink,
  },
  accordionHead: {
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space.lg,
  },
  accordionDivided: {
    borderTopWidth: theme.border.base,
    borderStyle: 'dashed',
    borderColor: theme.colors['sand-400'],
  },

  reviews: {
    paddingTop: theme.space.lg,
    paddingHorizontal: theme.space.xl,
    gap: theme.space.md,
  },

  /* Bar sayfadaki gibi mutlak konumlu ve ekranın altına yapışık. Cam (`BlurView`) kullanılmadı:
     altında kaydırılacak içerik yokken bulanıklık bir şey göstermez, bedelini boşuna öderdi —
     zemin barın kendi yüzey rengi. */
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors.ink,
    backgroundColor: theme.colors['cream-glass'],
    paddingTop: theme.space.lg,
    paddingHorizontal: theme.space.xl,
    /* Alt güvenli alan barın İÇİNDE; dolguyla TOPLANMAZ (sayfanın aynı kararı). */
    paddingBottom: Math.max(rt.insets.bottom, theme.space['2xl']),
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
  },
  ctaSlot: { flex: 1 },
}));
