import { formatPrice } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import type { HomePackage, HomeRecipe } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { LoadingState } from '@/components/ui/loading-state';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ProductPhotoCard } from '@/components/ui/product-photo-card';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { deviceLocale } from '@/lib/i18n/locale';
import messages from './messages.json';
import { useIdeas } from './use-ideas.hook';

/*
  FİKİRLER — tarifler + hazır paketlerin liste sayfası (kullanıcı kararı 09.08: üçüncü sekme
  "Siparişler" değil "Fikirler").

  ── BU EKRAN BUGÜN BİR İSKELETTİR ───────────────────────────────────────────
  Görsel yerleşimi (bölüm düzeni, kart biçimi, şerit/ızgara kararı) TASARIMDAN gelecek; burada
  tasarım YAPILMADI (CLAUDE §3 — "implement ederken improvise etme"). Ekran bugün üç şeyi yapıyor:
  iki ucu çağırıyor, sonucu MEVCUT kit komponentleriyle listeliyor, yükleme/hata/boş dallarını
  çiziyor. Yeni bir kart tipi, yeni bir görsel desen ÜRETİLMEDİ:
    · bölüm başlığı → `SectionHeader` (kitin kendi üç kademesi),
    · kart          → `ProductPhotoCard` (kitin kare kartı),
    · ızgara ölçüsü → KATALOG ızgarasının kendi ölçüleri (iki sütun · 20 satır · 14 sütun arası),
      birebir; kart zaten o ızgara için çizilmiş (komponent künyesi) ve buraya ikinci bir ölçü
      sözlüğü yazmak, tasarım gelince çöpe gidecek bir karar olurdu.
  Tasarım geldiğinde değişecek olan bu dosyanın GÖVDESİDİR; uç, sözleşme ve hook yerinde kalır.

  ── KARTIN İKİ EKSİĞİ BİLİNÇLİ BOŞ ──────────────────────────────────────────
  Tarif kartında FİYAT YOK: tarif bir içerik kartıdır, fiyat/stok taşımaz (sözleşme künyesi) —
  `priceLabel` verilmeyince çip hiç çizilmez, uydurma bir "0,00 €" yazılmaz. Paket kartında ise
  fiyat VAR ve tek fiyattır. `soldOut` iki kartta da yok: o karar henüz hiçbir yüzeyde bu kümeler
  için okunmuyor (paket sözleşmesinin BEKLEYEN(21.14) notu) ve `false` basmak "tükenmiş yok" ile
  "tükenme bilinmiyor"u aynı şeye indirirdi.
*/

type Messages = LocalizedCopy<typeof messages>;

/** İskelet kart sayısı — katalog iskeletinin kendi kurgusu (2×2). */
const SKELETON_CARDS = [0, 1, 2, 3];

interface IdeasScreenProps {
  /** Testlerin ve demo hâllerinin kapısı; verilmezse cihazın dili. */
  locale?: ReturnType<typeof deviceLocale>;
}

export function IdeasScreen({ locale = deviceLocale() }: IdeasScreenProps) {
  const t: Messages = messages[locale];
  const { theme, rt } = useUnistyles();
  const router = useRouter();
  const ideas = useIdeas(locale);

  /* Kare kartın kenarı SÜTUNDAN gelir (katalog iskeletinin aynı hesabı): ekran genişliği eksi iki
     yan boşluk, eksi sütun arası, bölü iki. `aspectRatio` tek başına güvenilmez — genişlik
     hesaplanır (cihazda kanıtlandı). */
  const cardSize = (rt.screen.width - theme.space['6xl'] * 2 - theme.space['2xl']) / 2;

  /* Sayfa başlığı HER DALDA durur (siparişler ekranının kuralı): yüklenirken, hata anında ve boş
     listede de kullanıcı hangi sayfada olduğunu görür. Yatay dolgu SARMALAYICIDAN gelir — başlığın
     kendisine konsaydı kaydırma kabında çift dolgu olurdu. */
  const header = (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{t.eyebrow.toLocaleUpperCase('tr-TR')}</Text>
      <Text style={styles.title} accessibilityRole="header">
        {t.title}
      </Text>
    </View>
  );

  if (ideas.status === 'loading') {
    return (
      <View style={styles.screen} testID="ideas-loading">
        <View style={styles.pad}>{header}</View>
        <View style={styles.skeletonBody}>
          <View style={styles.row}>
            {SKELETON_CARDS.slice(0, 2).map((index) => (
              <Skeleton key={index} width={cardSize} height={cardSize} radius="card" />
            ))}
          </View>
          <View style={styles.row}>
            {SKELETON_CARDS.slice(2).map((index) => (
              <Skeleton key={index} width={cardSize} height={cardSize} radius="card" />
            ))}
          </View>
          <LoadingState size="sm" label={t.loading} accessibilityLabel={t.loading} />
        </View>
      </View>
    );
  }

  if (ideas.status === 'error') {
    return (
      <View style={styles.screen}>
        <View style={styles.pad}>{header}</View>
        <EmptyState
          icon={<Icon name="connection-off" size={theme.size.errorIcon} color={theme.colors['sand-600']} />}
          title={t.error.title}
          description={t.error.body}
          action={<PrimaryButton label={t.error.retry} shape="pill" onPress={ideas.retry} testID="ideas-retry" />}
          testID="ideas-error"
        />
      </View>
    );
  }

  if (ideas.recipes.length === 0 && ideas.packages.length === 0) {
    return (
      <View style={styles.screen}>
        <View style={styles.pad}>{header}</View>
        <EmptyState
          icon={<Icon name="search-empty" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
          title={t.empty.title}
          description={t.empty.body}
          action={<PrimaryButton label={t.empty.cta} onPress={() => router.push('/catalog')} testID="ideas-browse" />}
          testID="ideas-empty"
        />
      </View>
    );
  }

  /** Boş bölüm HİÇ çizilmez (vitrinin aynı kuralı): başlığı olup içi olmayan bir bölüm, boş bir söz. */
  const recipeSection =
    ideas.recipes.length === 0 ? null : (
      <View style={styles.section}>
        <SectionHeader eyebrow={t.recipes.eyebrow} title={t.recipes.title} testID="ideas-recipes-header" />
        <View style={styles.grid}>
          {ideas.recipes.map((recipe: HomeRecipe) => (
            <View key={recipe.slug} style={{ width: cardSize }}>
              <ProductPhotoCard
                name={recipe.name}
                photoUri={recipe.image.url}
                /* "N malzeme" = BİZİM ürün satırları + evden malzemeler (sözleşme ikisini ayrı
                   taşır, cümleyi ekran kurar). */
                optionsLabel={t.recipes.meta.replace('{n}', String(recipe.itemCount + recipe.pantryCount))}
                accessibilityLabel={t.recipes.open.replace('{name}', recipe.name)}
                onPress={() => router.push({ pathname: '/recipe/[slug]', params: { slug: recipe.slug } })}
                testID={`ideas-recipe-${recipe.slug}`}
              />
            </View>
          ))}
        </View>
      </View>
    );

  const packageSection =
    ideas.packages.length === 0 ? null : (
      <View style={styles.section}>
        <SectionHeader eyebrow={t.packages.eyebrow} testID="ideas-packages-header" />
        <View style={styles.grid}>
          {ideas.packages.map((pack: HomePackage) => (
            <View key={pack.slug} style={{ width: cardSize }}>
              <ProductPhotoCard
                name={pack.name}
                priceLabel={formatPrice(pack.priceCents, locale)}
                photoUri={pack.image.url}
                optionsLabel={t.packages.meta.replace('{n}', String(pack.itemCount))}
                accessibilityLabel={t.packages.open.replace('{name}', pack.name)}
                onPress={() => router.push({ pathname: '/package/[slug]', params: { slug: pack.slug } })}
                testID={`ideas-package-${pack.slug}`}
              />
            </View>
          ))}
        </View>
      </View>
    );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="ideas-scroll">
        {header}
        {recipeSection}
        {packageSection}
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
    paddingHorizontal: theme.space['6xl'],
    paddingBottom: theme.space['5xl'],
    gap: theme.space['5xl'],
  },
  /* Yatay dolgu listede kaydırma kabından gelir; kapsız dallarda (yükleme/hata/boş) sarmalayıcıdan
     (siparişler ekranının 09.08 bulgusu: başlık o dallarda sola yapışıyordu). */
  pad: { paddingHorizontal: theme.space['6xl'] },
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
    color: theme.colors.ink,
  },
  section: { gap: theme.space.xl },
  /* KATALOG IZGARASININ ölçüleri, birebir: satır arası 20, sütun arası 14. Kart genişliği sayıyla
     verildiği için tek kalan kart da sütun genişliğinde kalır (esneyip satırı doldurmaz). */
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: theme.space['5xl'],
    columnGap: theme.space['2xl'],
  },
  skeletonBody: {
    paddingHorizontal: theme.space['6xl'],
    paddingTop: theme.space['5xl'],
    gap: theme.space['5xl'],
  },
  row: {
    flexDirection: 'row',
    gap: theme.space['2xl'],
  },
}));
