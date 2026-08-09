import { formatPrice } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { HomePackage } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';
import { PhotoSurface } from '@/screens/customer-kit/photo-surface';
import messages from './messages.json';
import { usePackagesList } from './use-packages-list.hook';

/*
  PAKETLER (v3 `vPkgs`) — üçüncü sekmenin ekranı: hazır paketlerin tam listesi. Vitrindeki
  şeritten farkı SÜZGEÇ: orada yalnız işaretli paketler var, burada yayındakilerin tamamı
  (karar uçta — `PackageListSchema` künyesi).

  ── TASARIMIN KARTINDAN BUGÜN ÇİZİLEBİLEN ───────────────────────────────────
  v3'ün kartı fotoğraf bölgesinin ALTINDA beyaz bir gövde taşıyor: kısa açıklama · içerik çipleri
  (paketin kalem adları) · soğuk zincir notu · "Paketi incele ›". Bunlardan yalnız SONUNCUSU
  verisizdir; ötekilerin üçü de sözleşmede YOK — `HomePackageSchema` beş alan taşır (slug · ad ·
  fiyat · kalem SAYISI · görsel). Çizilmediler çünkü uydurulacak bir açıklama ya da hayalî bir
  çip listesi, boş bırakmaktan kötüdür (CLAUDE §0 — kanıtsız bilgi basma). Aynı gerekçeyle
  "Tükendi — yakında yeniden" rozeti de yok: paket sözleşmesi stok TAŞIMIYOR ve `false` basmak
  "tükenmiş yok" ile "tükenme bilinmiyor"u aynı şeye indirirdi. Eksik alanlar terfi ihtiyacı
  olarak raporlandı; geldikleri gün gövde tasarımdaki hâline tamamlanır.

  FOTOĞRAF BÖLGESİ KİTİN YÜZEYİNDEN (`PhotoSurface`): "foto varsa foto, yoksa baş harf" + skrim
  tek kopya durur. `PhotoTile` kullanılMADI çünkü o BASILABİLİR bir karttır ve burada basılabilir
  olan kartın TAMAMIDIR (fotoğraf + beyaz gövde) — iç içe iki basılabilir yüzey doğardı.

  YÜKLEME: iskelet gelecek yerleşimin AYNISI (fotoğraf bloğu + gövde satırı) ve "yükleniyor"
  halkasıyla AYNI ANDA çizilmez (kullanıcı bulgusu 09.08). Aşağı çekerek yenileme ise ekranı
  iskelete DÜŞÜRMEZ: satırlar yerinde kalır, hareketin kendi göstergesi yeter.
*/

type Messages = LocalizedCopy<typeof messages>;

/** İskelet kart sayısı — tasarımın kendi yer tutucu sayısı (v3:873 `hint-placeholder-count="3"`). */
const SKELETON_CARDS = [0, 1, 2];

interface PackagesListScreenProps {
  /** Testlerin ve demo hâllerinin kapısı; verilmezse uygulamanın dili (`useAppLocale`). */
  locale?: Locale;
}

export function PackagesListScreen({ locale: forcedLocale }: PackagesListScreenProps) {
  const appLocale = useAppLocale();
  const locale = forcedLocale ?? appLocale;
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const list = usePackagesList(locale);

  /* Sayfa başlığı HER DALDA durur (siparişler ekranının kuralı): yüklenirken, hata anında ve boş
     listede de kullanıcı hangi sayfada olduğunu görür. */
  const header = (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{t.eyebrow.toLocaleUpperCase('tr-TR')}</Text>
      <Text style={styles.title} accessibilityRole="header">
        {t.title}
      </Text>
      <Text style={styles.body}>{t.body}</Text>
    </View>
  );

  const card = (pack: HomePackage) => (
    <PressableSurface
      key={pack.slug}
      onPress={() => router.push({ pathname: '/package/[slug]', params: { slug: pack.slug } })}
      feedback="scale"
      style={styles.card}
      accessibilityLabel={t.open.replace('{name}', pack.name)}
      testID={`packages-card-${pack.slug}`}
    >
      <PhotoSurface photoUri={pack.image.url} initial={pack.name.slice(0, 1)} scrim style={styles.photo}>
        {/* Fiyat rozeti SAĞ ÜSTTE (v3:878) — vitrin şeridinde sol altta; ikisi ayrı kart. */}
        <View style={styles.priceBadge}>
          <Tag label={formatPrice(pack.priceCents, locale)} rotate={3} shadow />
        </View>
        <View style={styles.caption}>
          <Text style={styles.name}>{pack.name}</Text>
          <Text style={styles.meta}>{t.meta.replace('{n}', String(pack.itemCount))}</Text>
        </View>
      </PhotoSurface>
      {/* Gövde bugün YALNIZ eylemi taşıyor; tasarımın kesikli ayracı da onunla birlikte gelecek —
          ayıracak bir şey yokken çizilen bir ayraç, olmayan bir içeriğin sözünü verirdi. */}
      <View style={styles.cardBody}>
        <Text style={styles.cta}>{t.cta}</Text>
      </View>
    </PressableSurface>
  );

  if (list.status === 'loading') {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          {header}
          {SKELETON_CARDS.map((index) => (
            <View key={index} style={styles.card}>
              <Skeleton width="100%" height={customerMetrics.packageListPhotoHeight} radius="card" />
              <View style={styles.cardBody}>
                <Skeleton width={theme.size.circleSm} height={theme.text.note} radius="badge" />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (list.status === 'error') {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>{header}</View>
        <EmptyState
          icon={<Icon name="connection-off" size={theme.size.errorIcon} color={theme.colors['sand-600']} />}
          title={t.error.title}
          description={t.error.body}
          action={<PrimaryButton label={t.error.retry} shape="pill" onPress={list.retry} testID="packages-retry" />}
          testID="packages-error"
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={theme.colors.olive} />
        }
        testID="packages-scroll"
      >
        {header}
        {/* Boş hâl KESİKLİ ÇERÇEVELİ kutu (v3:866) — kitin boş durumu o kutunun içinde durur. */}
        {list.packages.length === 0 ? (
          <View style={styles.emptyBox}>
            <EmptyState
              title={t.empty.title}
              description={t.empty.body}
              action={
                <PrimaryButton
                  label={t.empty.cta}
                  shape="pill"
                  onPress={() => router.push('/catalog')}
                  testID="packages-browse"
                />
              }
              testID="packages-empty"
            />
          </View>
        ) : (
          list.packages.map(card)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    paddingTop: rt.insets.top,
  },
  content: {
    paddingHorizontal: theme.space['4xl'],
    paddingBottom: theme.space['5xl'],
    // v3:872 kartlar arası 16; başlıkla ilk kart arasındaki 12 farkı ölçekte ayrı bir durak
    // gerektirmiyor — başlığın kendi alt nefesi zaten var.
    gap: theme.space['3xl'],
  },
  header: {
    gap: theme.space.xs,
    // Güvenli alanın hemen altına yapışmasın diye üst nefes (siparişler ekranının aynı ölçüsü).
    paddingTop: theme.space['3xl'],
    paddingBottom: theme.space.xs,
  },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors.terracotta,
  },
  title: {
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    fontSize: theme.text['page-title-sm'],
    // v3:862 satır aralığı 1.15 — oran da token (`h1--line-height`), ham çarpan yazılmadı.
    lineHeight: theme.text['page-title-sm'] * theme.text['h1--line-height'],
    color: theme.colors.ink,
  },
  body: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },

  /* ── Kart ───────────────────────────────────────────────────────────────── */
  card: {
    backgroundColor: theme.colors.card,
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-200'],
    // v3 köşeyi 24 çiziyor; resmî yarıçap seti (Token Kararlari #7) kartı `card` (20) kademesine
    // bağlıyor — beşinci bir durak açmak seti bozardı (`BottomSheet`in aynı hükmü).
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    // v3 gölgesi `0 4px 18px rgba(58,65,71,.07)`; token seti bu rolde tek durak taşıyor (`soft`).
    boxShadow: theme.shadow.soft,
  },
  photo: { height: customerMetrics.packageListPhotoHeight },
  priceBadge: {
    position: 'absolute',
    top: theme.space.xl,
    right: theme.space.xl,
  },
  caption: {
    position: 'absolute',
    left: theme.space['3xl'],
    right: theme.space['3xl'],
    bottom: theme.space['2xl'],
    gap: theme.space['2xs'],
  },
  name: {
    fontFamily: theme.font.display[theme.text['card-title--font-weight']],
    fontSize: theme.text['card-title'],
    lineHeight: theme.text['card-title'] * theme.text['h1--line-height'],
    color: theme.colors['on-image'],
  },
  meta: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    // v3:882 .16em; kitin üstbaşlık aralığı .18em — fark ekranda ölçülemez, token kazanır.
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors['olive-light'],
  },
  cardBody: {
    paddingVertical: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
    alignItems: 'flex-end',
  },
  cta: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.olive,
  },

  /** v3:866 — kesikli çerçeveli boş kutu; içindeki blok kitin `EmptyState`i. */
  emptyBox: {
    borderWidth: theme.border.base,
    borderStyle: 'dashed',
    borderColor: theme.colors['sand-400'],
    borderRadius: theme.radius.card,
  },
}));
