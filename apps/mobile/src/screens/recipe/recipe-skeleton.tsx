import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Skeleton } from '@/components/ui/skeleton';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';

/*
  TARİF DETAY SKELETON'I — ilk yükte sayfanın YERİNİ TUTAR. Ürün detay skeleton'ının
  (`product-skeleton`) aynı iki kuralı: ölçüler TAHMİN DEĞİL, sayfanın kendi stillerinden türer;
  metin yazılmaz, tek ses ekran okuyucuya kökten gider.

  ÖNCEKİ HÂLİ ekranın içine gömülü dört çubuktu ve ölçüleri ham sayıydı (`120` `12` `26` `46`) —
  hiçbiri sayfadan alınmamıştı, yani skeleton'ın yüksekliği sayfanın yüksekliği değildi.

  NEYİ ÇİZERİZ — ölçüt "bu bölüm olmadan sayfa VAR OLABİLİR Mİ" (ürün detayının aynı ölçütü,
  kullanıcı kararı 10.08):
  · ÇİZİLİR — kahraman + yüzen geri düğmesi · künye (üstbaşlık + ad) · "Bizden" bölümü ve malzeme
    satırları · "Hazırlanış" bölümü ve adımlar · yapışkan bar. Malzemesi ve adımı olmayan bir
    tarif tarif değildir; koddaki `length === 0` koruması bozuk veriye karşıdır, gerçek bir hâl
    değil.
  · ÇİZİLMEZ — süre·porsiyon rozeti, açıklama, "Evinizden" listesi (üçü de gerçekten opsiyonel:
    süresi girilmemiş tarif, açıklamasız tarif, evden malzeme istemeyen tarif olağan hâllerdir).

  SAYISI BİLİNMEYEN LİSTEDE EN AZ MAKUL SAYI ÇİZİLİR: kaç malzeme ve kaç adım geleceğini
  bilmiyoruz. Fazla çizmek veri gelince blokları KAYBETTİRİR (kullanıcının arıza diye okuduğu
  hareket), az çizmek yalnız aşağı doğru EKLER. İkisi eşit değil, o yüzden alt sınır seçildi.
*/

const ROW_SLOTS = [0, 1, 2];
const STEP_SLOTS = [0, 1, 2];

interface RecipeSkeletonProps {
  testID?: string;
}

export function RecipeSkeleton({ testID }: RecipeSkeletonProps) {
  const { theme } = useUnistyles();

  const line = (fontSize: number, ratio: number = theme.text['h1--line-height']): number => fontSize * ratio;

  /* Adım satırı (`styles.stepRow`): yüksekliğin tabanı numara dairesi (28) — tek satırlık adım
     ondan kısa kalıyor. Adımlar çoğu zaman daha uzundur ama kaç satır olacağını bilmiyoruz ve
     uydurma bir satır sayısı, ölçülmemiş bir değeri ölçülmüş gibi gösterirdi. */
  const stepHeight = customerMetrics.recipeStepBadge;

  return (
    <View
      style={styles.screen}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      {/* ── Kahraman: tam genişlik foto + üstünde yüzen geri düğmesi ────────── */}
      <View style={styles.hero}>
        <Skeleton width="100%" height={customerMetrics.recipeHero} radius="none" />
        <View style={styles.heroButtons}>
          <Skeleton width={theme.size.iconButtonOnPhoto} height={theme.size.iconButtonOnPhoto} />
        </View>
      </View>

      <View style={styles.head}>
        {/* Künye: üstbaşlık ("SOFRADAN FİKİRLER") + tarif adı. */}
        <Skeleton width="38%" height={line(theme.text.eyebrow)} />
        <Skeleton width="76%" height={line(theme.text['h1-sm'], theme.text['h1-sm--line-height'])} />

        {/* ── "Bizden": bölüm üstbaşlığı + malzeme satırları ────────────────── */}
        <View style={styles.oursEyebrow}>
          <Skeleton width="30%" height={line(theme.text.eyebrow)} />
        </View>
        <View>
          {ROW_SLOTS.map((slot) => (
            <View key={slot} style={styles.row}>
              <Skeleton width={customerMetrics.recipeRowPhoto} height={customerMetrics.recipeRowPhoto} />
              <View style={styles.rowText}>
                <Skeleton width="64%" height={line(theme.text.control)} />
                <Skeleton width="38%" height={line(theme.text.micro)} />
              </View>
              {/* Sepete + kutusu — satırın sağ ucunda, kare. */}
              <Skeleton width={customerMetrics.recipeAddBox} height={customerMetrics.recipeAddBox} radius="badge" />
            </View>
          ))}
        </View>

        {/* ── "Hazırlanış": bölüm üstbaşlığı + numaralı adımlar ─────────────── */}
        <View style={styles.stepsEyebrow}>
          <Skeleton width="30%" height={line(theme.text.eyebrow)} />
        </View>
        <View style={styles.stepList}>
          {STEP_SLOTS.map((slot) => (
            <View key={slot} style={styles.stepRow}>
              <Skeleton width={customerMetrics.recipeStepBadge} height={customerMetrics.recipeStepBadge} />
              <View style={styles.stepText}>
                <Skeleton width="100%" height={stepHeight} radius="badge" />
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Yapışkan barın kaydırma payı (sayfada da bar varken var). */}
      <View style={styles.barSpace} />

      {/* ── Yapışkan bar: tek blok "hepsini ekle" düğmesi ───────────────────── */}
      <View style={styles.bar}>
        <Skeleton width="100%" height={theme.size.controlLg} radius="control" />
      </View>
    </View>
  );
}

/*
  STİLLER — sayfanın kendi kap stillerinin AYNISI (dolgu · ara · kenar boşluğu · çerçeve): yalnız
  blok yüksekliklerini eşitlemek yetmezdi, bölümler arası boşluk da yerleşimin parçası.
*/
const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.cream,
  },

  hero: { height: customerMetrics.recipeHero },
  heroButtons: {
    position: 'absolute',
    top: rt.insets.top + theme.space.md,
    left: theme.space['3xl'],
    right: theme.space['3xl'],
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  head: {
    paddingTop: theme.space['5xl'],
    paddingHorizontal: theme.space['6xl'],
    paddingBottom: theme.space.md,
    gap: theme.space.lg,
  },
  oursEyebrow: { marginTop: theme.space.md },
  stepsEyebrow: { marginTop: theme.space.md },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
    paddingVertical: theme.space.lg,
    borderBottomWidth: theme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: theme.colors['sand-400'],
  },
  rowText: { flex: 1, minWidth: 0, gap: theme.space['2xs'] },

  stepList: { gap: theme.space.xl },
  stepRow: { flexDirection: 'row', gap: theme.space.xl },
  stepText: { flex: 1 },

  barSpace: { height: customerMetrics.recipeBarSpace },

  /* Bar sayfadaki gibi mutlak konumlu. Cam (`BlurView`) kullanılmadı: altında kaydırılacak içerik
     yokken bulanıklık bir şey göstermez — zemin barın kendi yüzey rengi. */
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors.ink,
    backgroundColor: theme.colors['cream-glass'],
    paddingTop: theme.space.xl,
    paddingHorizontal: theme.space['4xl'],
    paddingBottom: Math.max(rt.insets.bottom, theme.space['7xl']),
  },
}));
