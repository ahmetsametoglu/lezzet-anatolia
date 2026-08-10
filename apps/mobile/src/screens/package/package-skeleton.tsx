import { useWindowDimensions, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Skeleton } from '@/components/ui/skeleton';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';

/*
  PAKET DETAY SKELETON'I — ilk yükte sayfanın YERİNİ TUTAR. Ürün ve tarif skeleton'larının aynı
  iki kuralı: ölçüler TAHMİN DEĞİL, sayfanın kendi stillerinden türer; metin yazılmaz.

  ÖNCEKİ HÂLİ ekranın içine gömülü dört çubuktu ve ölçüleri ham sayıydı (`26` `18` `66`); künye
  ile içerik listesi arasındaki bölüm başlığı, alt not ve YAPIŞKAN BAR hiç temsil edilmiyordu.

  BAŞLIK ÇUBUĞU BURADA DEĞİL, EKRANDA: sayfanın kendi başlığı yüklenirken de GERÇEK çiziliyor
  (geri düğmesi çalışır hâlde — ekranın kendi kararı, "geri yolu ekran boşken de açık"). Skeleton
  onun ALTINDAN başlar; başlığı burada gri çizmek çalışan bir düğmeyi ölü bir bloğa çevirirdi.

  NEYİ ÇİZERİZ — ölçüt "bu bölüm olmadan sayfa VAR OLABİLİR Mİ" (ürün detayının aynı ölçütü):
  · ÇİZİLİR — kahraman (16:10) · künye (ad + fiyat) · içerik bölümünün başlığı ve satırları ·
    alt not · yapışkan bar. Kalemleri olmayan paket paket değildir; not ve bar sayfada zaten
    koşulsuz çiziliyor.
  · ÇİZİLMEZ — tükendi rozeti, kargo kısıtı çipi, yer işareti, açıklama (dördü de opsiyonel).

  SAYISI BİLİNMEYEN LİSTEDE EN AZ MAKUL SAYI: kaç kalem geleceğini bilmiyoruz. Fazla çizmek veri
  gelince blokları KAYBETTİRİR, az çizmek yalnız aşağı doğru EKLER — alt sınır seçildi.
*/

const ITEM_SLOTS = [0, 1, 2];

interface PackageSkeletonProps {
  testID?: string;
}

export function PackageSkeleton({ testID }: PackageSkeletonProps) {
  const { theme } = useUnistyles();
  const { width } = useWindowDimensions();

  const line = (fontSize: number, ratio: number = theme.text['h1--line-height']): number => fontSize * ratio;

  /* Kahraman 16:10 (sayfada `aspectRatio`); skeleton yüksekliği sayı ister, oran ekranın GERÇEK
     genişliğinden çözülür — sabit bir yükseklik yazmak dar/geniş cihazda kayardı. */
  const heroHeight = Math.round((width * 10) / 16);

  /* İçerik satırı (`styles.itemRow`): dikey dolgu + küçük kare (46); metin ondan kısa. */
  const itemHeight = theme.space.lg * 2 + customerMetrics.packageItemPhoto;

  return (
    <View
      style={styles.screen}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      {/* ── Kahraman: 16:10 galeri kutusu, köşesiz ──────────────────────────── */}
      <Skeleton width="100%" height={heroHeight} radius="none" />

      {/* ── Gövde: ad · fiyat · içerik başlığı + satırlar · not ─────────────── */}
      <View style={styles.body}>
        <Skeleton width="74%" height={line(theme.text['h1-sm'], theme.text['h1-sm--line-height'])} />
        <Skeleton width="42%" height={line(theme.text['card-title'])} />

        <View style={styles.sectionTitle}>
          <Skeleton width="36%" height={line(theme.text['screen-title'])} />
        </View>
        <View style={styles.items}>
          {ITEM_SLOTS.map((slot) => (
            <Skeleton key={slot} width="100%" height={itemHeight} radius="card" />
          ))}
        </View>
        <Skeleton width="88%" height={line(theme.text.helper, 1.5)} />
      </View>

      {/* Yapışkan barın kaydırma payı. */}
      <View style={styles.barSpace} />

      {/* ── Yapışkan bar: adet kutusu + sepete ekle düğmesi (ürün barının ikizi) ── */}
      <View style={styles.bar}>
        <View style={styles.barRow}>
          <Skeleton
            width={customerMetrics.productStepButtonWidth * 2 + customerMetrics.productStepValueWidth}
            height={customerMetrics.productStepButtonHeight}
            radius="control"
          />
          <View style={styles.ctaSlot}>
            <Skeleton width="100%" height={theme.size.controlLg} radius="control" />
          </View>
        </View>
      </View>
    </View>
  );
}

/*
  STİLLER — sayfanın kendi kap stillerinin AYNISI (dolgu · ara · çerçeve). Kaplar taklit edilmeden
  yalnız blok yüksekliklerini eşitlemek yetmezdi: bölümler arası boşluk da yerleşimin parçası.
*/
const styles = StyleSheet.create((theme, rt) => ({
  /* Üst güvenli alan YOK: ekranın kendisi onu uyguluyor ve skeleton başlığın altına giriyor. */
  screen: { flex: 1 },

  body: {
    paddingVertical: theme.space['3xl'],
    paddingHorizontal: theme.space['4xl'],
    gap: theme.space.lg,
  },
  sectionTitle: { marginTop: theme.space.sm },
  items: { gap: theme.space.md },

  barSpace: { height: customerMetrics.productBarSpace },

  /* Bar sayfadaki gibi mutlak konumlu; cam (`BlurView`) kullanılmadı — altında kaydırılacak
     içerik yokken bulanıklık bir şey göstermez, zemin barın kendi yüzey rengi. */
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
    paddingBottom: Math.max(rt.insets.bottom, theme.space['2xl']),
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
  },
  ctaSlot: { flex: 1 },
}));
