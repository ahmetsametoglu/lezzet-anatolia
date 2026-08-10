import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Skeleton } from '@/components/ui/skeleton';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';

/*
  ÜRÜN DETAY SKELETON'I — ilk yükte sayfanın YERİNİ TUTAR. Vitrin skeleton'ının (`home-skeleton`)
  aynı iki kuralı geçerli: ölçüler TAHMİN DEĞİL, sayfanın kendi stillerinden türer (dolgu + satır
  yüksekliği + kit ölçüsü); metin yazılmaz, tek ses ekran okuyucuya kökten gider.

  ÖNCEKİ HÂLİNİN İKİ KUSURU (ölçüldü 10.08 — ekranın içine gömülü dört çubuktu):
  · ÖLÇÜLER HAM SAYIYDI (`120`, `12`, `26`, `14`, `90`) — hiçbiri sayfadan alınmamıştı, yani
    skeleton'ın yüksekliği sayfanın yüksekliği değildi ve veri gelince ekran zıplıyordu;
  · SAYFANIN YARISI YOKTU — akordeonlar, değerlendirmeler ve en görünürü YAPIŞKAN BAR. Bar her
    hâlde ekranın altında duran sabit yükseklikli tek öğe; skeleton'da olmayınca veri gelince
    aşağıdan aniden beliriyordu.

  YALNIZ HER ZAMAN GÖRÜNENLER ÇİZİLİR (kullanıcı kararı 10.08): kahraman · künye (ad + birim
  satırı) · üç akordeon başlığı · değerlendirmeler · yapışkan bar. Koşullu olanlar — kategori
  üstbaşlığı, limit/kargo çipleri, aile rayı, boy çipleri, açıklama, benzerler rayı, rozetler,
  yer filigranı — ÇİZİLMEZ. Vitrindeki "son açılışın izi" çözümü burada işlemez: iz ürüne özel
  olurdu (bu üründe aile rayı var, ötekinde yok) ve slug başına kayıt tutmak depoyu şişirirdi.
  Sonuç: kayma yalnız "gelen eklendi" yönünde olur, gözden kaybolan blok kalmaz.

  SABİT YAPI GERÇEK ÇİZİLİR, VERİ GRİ OLUR: akordeonun çerçeveleri (üst/alt düz mürekkep, aralar
  kesik kum) ve barın zemini veriye bağlı değil — onları da griye çevirmek, sayfanın değişmeyen
  iskeletini bilinmiyormuş gibi göstermek olurdu. Gri kalan yalnız uçtan gelecek olandır.
*/

/** Üç akordeon başlığı — sayfanın kendi sırası (İçindekiler · Besin değerleri · Saklama). */
const ACCORDION_SLOTS = [0, 1, 2];

interface ProductSkeletonProps {
  testID?: string;
}

export function ProductSkeleton({ testID }: ProductSkeletonProps) {
  const { theme } = useUnistyles();

  /* Satır yüksekliği sayfanın KENDİ hesabıdır. Sayfada `lineHeight` verilmiş metinlerde o oran
     kullanılır (başlık `h1-sm--line-height`, boş-yorum kutusu `lead--line-height`); verilmemiş
     olanlarda vitrin skeleton'ının çarpanı (`h1--line-height`) — ikisi de token, uydurma yok. */
  const line = (fontSize: number, ratio: number = theme.text['h1--line-height']): number => fontSize * ratio;

  /* Boş-yorum kutusu (`styles.reviewsEmpty`) tek parça YÜZEY: dikey dolgu + tek satır metin. */
  const reviewsEmptyHeight = theme.space.lg * 2 + line(theme.text.note, theme.text['lead--line-height']);

  /* Sepet adedi kutusu (`styles.stepper`): iki düğme + ortadaki sayı alanı; yüksekliği düğmeden. */
  const stepperWidth = customerMetrics.productStepButtonWidth * 2 + customerMetrics.productStepValueWidth;

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
        <Skeleton width="72%" height={line(theme.text['h1-sm'], theme.text['h1-sm--line-height'])} />
        <Skeleton width="48%" height={line(theme.text.micro)} />
      </View>

      {/* ── Akordeonlar: çerçeve gerçek, başlıklar gri ─────────────────────── */}
      <View style={styles.accordion}>
        {ACCORDION_SLOTS.map((slot) => (
          <View key={slot} style={[styles.accordionHead, slot === 0 ? null : styles.accordionDivided]}>
            <Skeleton width="46%" height={line(theme.text.note)} />
          </View>
        ))}
      </View>

      {/* ── Değerlendirmeler: bölüm başlığı + "yorum yok" kutusu ───────────── */}
      <View style={styles.reviews}>
        <Skeleton width="52%" height={line(theme.text['card-title-sm'])} />
        <Skeleton width="100%" height={reviewsEmptyHeight} radius="card" />
      </View>

      {/* ── Yapışkan bar: adet kutusu + sepete ekle düğmesi ─────────────────── */}
      <View style={styles.bar}>
        <View style={styles.barRow}>
          <Skeleton width={stepperWidth} height={customerMetrics.productStepButtonHeight} radius="control" />
          <View style={styles.ctaSlot}>
            <Skeleton width="100%" height={theme.size.controlLg} radius="control" />
          </View>
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
