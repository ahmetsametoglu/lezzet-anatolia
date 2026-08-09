import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Skeleton } from '@/components/ui/skeleton';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';

/*
  VİTRİN İSKELETİ — ilk yükte sayfanın YERİNİ TUTAR (kullanıcı isteği 09.08: "vitrin sayfasını
  bire bir kopyalasın").

  NEDEN BİREBİR: iskeletin tek işi gelecek yerleşimin ölçüsünü tutmaktır. Ölçüsü sayfadan
  farklıysa veri gelince ekran ZIPLAR ve kullanıcı bunu bir arıza gibi okur. Bu yüzden buradaki
  hiçbir yükseklik tahmin DEĞİLDİR: her biri `home-screen`in kendi stillerinden türetildi
  (dolgu + satır yüksekliği) ya da sabit kart ölçüsünden alındı (`customerMetrics`).

  BÖLÜM SIRASI SAYFAYLA AYNI: başlık → süren sipariş → günün fırsatı → fırsat rayı → koleksiyon
  bantları → vitrin rayı → tarif rayı → hazır paketler → davet blokları. Kimlikli/fixture
  bölümler (süren sipariş · günün fırsatı) de yerini tutar: sayfada varsa iskelette de var.

  İKİ ÇİZİM DİLİ, TEK KURAL (v3'ün kendi iskelet dili — katalog `catSkel`, siparişler `ov.skel`):
  · sayfada TEK PARÇA renkli YÜZEY olan öğe (sipariş bandı, günün fırsatı, koleksiyon bandı,
    tarif/paket kartı, davet kutusu) tek gri BLOK olur — v3 de metin dolu sipariş kartını tek
    110'luk blokla temsil ediyor;
  · yüzeyi olmayan öğe (selamlama satırları, bölüm başlıkları, ürün dairesi + adı, fırsat kartı)
    satır satır ÇUBUKLA taklit edilir.

  METİN YOK — İKİ GÖSTERGE AYNI ANDA ÇİZİLMEZ (kullanıcı bulgusu 09.08, katalogda ölçüldü):
  iskeletin yanına bir de "Yükleniyor…" yazmak aynı şeyi iki kez söylemektir. Nabız zaten
  "bekleniyor" diyor. Ekran okuyucuya da tek ses gider: kök `progressbar` + `busy`; blokların
  kendisi a11y'de görünmez (`Skeleton` künyesi).

  YENİLEMEDE (aşağı çekme) BU EKRAN HİÇ ÇİZİLMEZ: hook yenilemede `loading`e düşmez (künyesi),
  bölümler yerinde kalır — iskelete düşmek ekranı bir an boşaltırdı.
*/

/*
  TEKRAR SAYILARI UÇ SÖZLEŞMESİNDEN (`/api/v1/home` tavanları): bant 6 (4 kategori + 2 koleksiyon)
  · fırsat 2 · seçki 4 · tarif 3 · paket 2. Uydurma bir sayı, iskeletin toplam yüksekliğini
  sayfadan ayırırdı. Yatay rayların sayısı yalnız ekrana sığan kadarını etkiler; dikey bölümlerde
  (bantlar, paketler) sayfanın kendi yüksekliğini verir.
*/
const BAND_SLOTS = [0, 1, 2, 3, 4, 5];
const OFFER_SLOTS = [0, 1];
const FEATURED_SLOTS = [0, 1, 2, 3];
const RECIPE_SLOTS = [0, 1, 2];
const PACKAGE_SLOTS = [0, 1];

interface HomeSkeletonProps {
  testID?: string;
}

export function HomeSkeleton({ testID }: HomeSkeletonProps) {
  const { theme, rt } = useUnistyles();

  /* Bir metin satırının kapladığı yer. Oran sayfanın kendi hesabıdır: `home-screen` başlıklarını
     `fontSize * h1--line-height` ile çiziyor; iskeletteki çubuk da aynı yerden ölçülür. */
  const line = (fontSize: number): number => fontSize * theme.text['h1--line-height'];

  /* Süren sipariş bandı (`styles.liveBand`): dikey dolgu + iki satırlık metin bloğu. Satır sayısı
     bandın yüksekliğini belirleyen taraftır — ikon (17) ve takip çipi ondan kısa. */
  const liveBandHeight =
    theme.space.xl * 2 + line(theme.text.control) + theme.space['2xs'] + line(theme.text.helper);

  /* Günün fırsatı (`styles.flashBand`): yüksekliği METİN değil FOTOĞRAF verir — daire 132 ve
     bandın dışına 4'er px taşıyor (`marginVertical: -xs`), yani düzen kutusu 124. Metin bloğu
     bundan kısa kalıyor, o yüzden band bu ölçüde duruyor. */
  const flashBandHeight = customerMetrics.flashPhoto - theme.space.xs * 2;

  /* Fırsat kartı (`styles.offerCard`): dikey dolgu + çerçeve + 48'lik daire.

     TEK ÖLÇÜLEBİLİR SAPMA BURADA (cihazda ölçüldü 09.08, CPH1907): gerçek kart ~75 dp çiziliyor,
     bu hesap 71 diyor. Fark daireden değil METİN sütunundan geliyor — RN'in varsayılan satır
     kutusu yazı boyundan büyüktür (yazı tipinin kendi ascent/descent'i) ve üç satırlık sütun
     daireyi 4 dp aşıyor. O oranın TOKEN'I YOK; uydurma bir çarpan yazmak ölçülmemiş bir değeri
     ölçülmüş gibi göstermek olurdu (CLAUDE §0). Sonuç: fırsat rayının ALTINDAKİ bölümler tek
     seferlik ~5 dp yukarıda duruyor, üstündeki her şey (başlık · süren sipariş · günün fırsatı)
     cihazda 1 px'e kadar birebir. Kalıcı çözüm sayfanın kendi kartına açık `lineHeight` vermek
     (o dosya ana şeridin alanında) — terfi ihtiyacı raporlandı. */
  const offerCardHeight = theme.space.lg * 2 + theme.border.base * 2 + customerMetrics.offerPhoto;
  /* Kartın genişliği ekrandan türer — rayda İKİ kart yan yana görünür (uç de iki fırsat veriyor);
     hesap katalog iskeletinin ızgara hesabıyla aynı dilde: ekran eksi yan boşluklar, eksi ara. */
  const offerCardWidth = (rt.screen.width - theme.space['6xl'] * 2 - theme.space.xl) / 2;

  /* Davet kutusu (`DashedInvite`, `row` yerleşimi): dolgu + çerçeve + başlık satırı + açıklama
     satırı. Açıklamanın satır aralığı kendi token'ından (`lead--line-height`). */
  const inviteHeight =
    theme.space['2xl'] * 2 +
    theme.border.base * 2 +
    line(theme.text.control) +
    theme.space['2xs'] +
    theme.text.helper * theme.text['lead--line-height'];

  return (
    <View
      style={styles.screen}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      {/* ── Başlık: selamlama + konum hapı · sağda zil düğmesi ─────────────── */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Skeleton width="66%" height={line(theme.text['page-title-sm'])} />
          <Skeleton width="44%" height={line(theme.text.micro)} />
        </View>
        <View style={styles.headerActions}>
          <Skeleton width={theme.size.controlSm} height={theme.size.controlSm} />
        </View>
      </View>

      {/* ── Süren sipariş bandı ─────────────────────────────────────────────── */}
      <View style={styles.bandSlot}>
        <Skeleton width="100%" height={liveBandHeight} radius="card" />
      </View>

      {/* ── Günün fırsatı: kenardan kenara, köşesiz ─────────────────────────── */}
      <Skeleton width="100%" height={flashBandHeight} radius="none" />

      {/* ── Fırsat rayı ─────────────────────────────────────────────────────── */}
      <View style={styles.rail}>
        {OFFER_SLOTS.map((slot) => (
          <Skeleton key={slot} width={offerCardWidth} height={offerCardHeight} radius="control" />
        ))}
      </View>

      {/* ── Koleksiyon bantları: üstbaşlık + BİTİŞİK bant yığını (sayfada da gap yok) ── */}
      <View>
        <View style={styles.collectionsEyebrow}>
          <Skeleton width="34%" height={line(theme.text.eyebrow)} />
        </View>
        {BAND_SLOTS.map((slot) => (
          <Skeleton key={slot} width="100%" height={customerMetrics.collectionBand} radius="none" />
        ))}
      </View>

      {/* ── Vitrin rayı: bölüm başlığı + ürün daireleri ─────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionPad}>
          <View style={styles.sectionHeader}>
            <Skeleton width="34%" height={line(theme.text.eyebrow)} />
            <Skeleton width="62%" height={line(theme.text['h2-sm'])} />
          </View>
        </View>
        <View style={styles.circleRail}>
          {FEATURED_SLOTS.map((slot) => (
            <View key={slot} style={styles.circleCard}>
              <Skeleton width={theme.size.circleLg} height={theme.size.circleLg} />
              <Skeleton width={theme.size.circleLg} height={line(theme.text['body-sm'])} />
            </View>
          ))}
        </View>
      </View>

      {/* ── Tarif rayı ──────────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionPad}>
          <View style={styles.sectionHeader}>
            <Skeleton width="34%" height={line(theme.text.eyebrow)} />
            <Skeleton width="62%" height={line(theme.text['h2-sm'])} />
          </View>
        </View>
        <View style={styles.rail}>
          {RECIPE_SLOTS.map((slot) => (
            <Skeleton
              key={slot}
              width={customerMetrics.recipeCardWidth}
              height={customerMetrics.recipeCardHeight}
              radius="card"
            />
          ))}
        </View>
      </View>

      {/* ── Hazır paketler: üstbaşlık ve kartlar sayfada da AYRI iki kardeş ─── */}
      <View style={styles.sectionPad}>
        <Skeleton width="34%" height={line(theme.text.eyebrow)} />
      </View>
      <View style={styles.packages}>
        {PACKAGE_SLOTS.map((slot) => (
          <Skeleton key={slot} width="100%" height={customerMetrics.packageCardHeight} radius="card" />
        ))}
      </View>

      {/* ── Davet blokları (Keşif · profesyonel hesap) ──────────────────────── */}
      <View style={styles.invites}>
        <Skeleton width="100%" height={inviteHeight} radius="card" />
        <Skeleton width="100%" height={inviteHeight} radius="card" />
      </View>
    </View>
  );
}

/*
  STİLLER — sayfanın kendi kap stillerinin AYNISI (dolgu · ara · kenar boşluğu). Kaplar taklit
  edilmeden yalnız blok yüksekliklerini eşitlemek yetmezdi: bölümler arası boşluk da yerleşimin
  parçası ve veri gelince oradan zıplardı.
*/
const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    paddingTop: rt.insets.top,
    paddingBottom: theme.space['6xl'],
    gap: theme.space['4xl'],
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space['6xl'],
    paddingTop: theme.space['7xl'],
    gap: theme.space.xl,
  },
  headerText: { flex: 1, gap: theme.space['2xs'] },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingTop: theme.space.sm,
  },

  /** Süren sipariş bandının kenar boşluğu (sayfada `marginHorizontal`, burada kabın dolgusu). */
  bandSlot: { paddingHorizontal: theme.space['6xl'] },

  /** Yatay rayların kap ölçüleri (sayfadaki `rail`). */
  rail: {
    flexDirection: 'row',
    gap: theme.space.xl,
    paddingHorizontal: theme.space['6xl'],
    paddingTop: theme.space.lg,
    overflow: 'hidden',
  },
  circleRail: {
    flexDirection: 'row',
    gap: theme.space['4xl'],
    paddingHorizontal: theme.space['6xl'],
    paddingTop: theme.space.lg,
    overflow: 'hidden',
  },
  circleCard: { alignItems: 'center', gap: theme.space.sm },

  collectionsEyebrow: {
    paddingHorizontal: theme.space['6xl'],
    paddingBottom: theme.space.md,
  },

  section: { gap: theme.space.md },
  sectionPad: { paddingHorizontal: theme.space['6xl'] },
  sectionHeader: { gap: theme.space['2xs'] },

  packages: {
    gap: theme.space.xl,
    paddingHorizontal: theme.space['6xl'],
  },
  invites: {
    gap: theme.space.xl,
    paddingHorizontal: theme.space['6xl'],
    paddingTop: theme.space.xl,
  },
}));
