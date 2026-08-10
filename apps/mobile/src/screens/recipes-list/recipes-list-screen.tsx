import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { pullRefreshColors } from '@/components/ui/pull-refresh';

import { BackButton } from '@/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Tag } from '@/components/ui/tag';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';
import { PhotoTile } from '@/screens/customer-kit/photo-tile';
import messages from './messages.json';
import { RecipesListSkeleton } from './recipes-list-skeleton';
import { useRecipesList } from './use-recipes-list.hook';

/*
  TARİFLER (v3 `vRecipes`) — "Sofradan Fikirler" şeridinin tamamı. Vitrinden açılır (`/recipes`),
  yani YIĞIN ekranıdır: sekme çubuğu olmadan, geri okuyla — tasarımın kendi başlık satırı da
  (v3:905) geri düğmesiyle başlıyor.

  KART KİTİN FOTOĞRAF KARTI (`PhotoTile`), tam genişlik ve 168 yüksek (v3:912): vitrindeki tarif
  kartıyla AYNI öğe, farkı yalnız ölçü. Süre rozeti sol üstte; `duration` girilmemişse (`null`)
  rozet HİÇ çizilmez — olmayan bir süreye "0 dk" uydurulmaz (sözleşme künyesi).

  "N malzeme" = BİZİM ürün satırlarımız + evden malzemeler (sözleşme ikisini ayrı taşır, cümleyi
  ekran kurar).

  YÜKLEME: iskelet gelecek yerleşimin AYNISI (tam genişlik 168'lik kartlar) ve "yükleniyor"
  halkasıyla AYNI ANDA çizilmez (kullanıcı bulgusu 09.08).

  BOŞ HÂL TASARIMDA YOK ve uydurulmadı: kitin boş durumu, katalog/paket ekranlarıyla aynı
  kalıpta kullanıldı — başlığı olup içi olmayan bir liste, boş bir sözdür. Tasarımdan bu ekrana
  bir boş hâl geldiği gün yalnız metinler değişir.
*/

type Messages = LocalizedCopy<typeof messages>;

interface RecipesListScreenProps {
  /** Testlerin ve demo hâllerinin kapısı; verilmezse uygulamanın dili (`useAppLocale`). */
  locale?: Locale;
}

export function RecipesListScreen({ locale: forcedLocale }: RecipesListScreenProps) {
  // Hook KOŞULSUZ çağrılır, seçim sonra yapılır: `??` ile kısa devre yapılsaydı prop verilen
  // kullanımda hook hiç çağrılmaz ve çağrı sırası bozulurdu (React kuralı).
  const appLocale = useAppLocale();
  const locale = forcedLocale ?? appLocale;
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const list = useRecipesList(locale);

  /* Başlık satırı HER DALDA durur: yüklenirken de, hata anında da geri yolu açık kalmalı —
     geri düğmesi olmayan bir yığın ekranı, kullanıcıyı cihazın kendi hareketine mahkûm eder. */
  const header = (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="recipes-back" />
        <Text style={styles.title} accessibilityRole="header">
          {t.title}
        </Text>
      </View>
      <Text style={styles.body}>{t.body}</Text>
    </View>
  );

  /* İLK YÜK: başlık GERÇEK kalır (yukarıdaki kural — içindeki geri düğmesi çalışır), kartların
     yerini skeleton tutar (`recipes-list-skeleton`). */
  if (list.status === 'loading') {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          {header}
          <RecipesListSkeleton testID="recipes-loading" />
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
          action={<PrimaryButton label={t.error.retry} shape="pill" onPress={list.retry} testID="recipes-retry" />}
          testID="recipes-error"
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} {...pullRefreshColors(theme.colors.olive)} />
        }
        testID="recipes-scroll"
      >
        {header}
        {list.recipes.length === 0 ? (
          <EmptyState
            icon={<Icon name="search-empty" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
            title={t.empty.title}
            description={t.empty.body}
            action={
              <PrimaryButton
                label={t.empty.cta}
                shape="pill"
                onPress={() => router.push('/catalog')}
                testID="recipes-browse"
              />
            }
            testID="recipes-empty"
          />
        ) : (
          list.recipes.map((recipe) => (
            <PhotoTile
              key={recipe.slug}
              height={customerMetrics.recipeListCardHeight}
              photoUri={recipe.image.url}
              initial={recipe.name.slice(0, 1)}
              /* `duration` hazır metindir ("35 dk" — 05.16, cümleyi cihaz kurmaz); `null` →
                 rozet çizilmez (girilmemiş süreye rozet uydurulmaz). */
              topBadge={recipe.duration === null ? undefined : <Tag label={recipe.duration} tone="cream" rotate={-3} />}
              onPress={() => router.push({ pathname: '/recipe/[slug]', params: { slug: recipe.slug } })}
              accessibilityLabel={t.open.replace('{name}', recipe.name)}
              testID={`recipes-card-${recipe.slug}`}
            >
              <Text style={styles.cardTitle}>{recipe.name}</Text>
              <Text style={styles.cardMeta}>
                {t.meta.replace('{n}', String(recipe.itemCount + recipe.pantryCount))}
              </Text>
            </PhotoTile>
          ))
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
    gap: theme.space.xl,
  },
  header: {
    gap: theme.space.md,
    paddingTop: theme.space.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    // Geri düğmesinin dairesi sayfanın sol dolgusuna taşar (v3:905 `margin-left:-8px`) —
    // ikonun optik hizası metin sütunuyla tutsun diye.
    marginLeft: -theme.space.md,
  },
  title: {
    flex: 1,
    fontFamily: theme.font.display[theme.text['screen-title--font-weight']],
    fontSize: theme.text['screen-title'],
    color: theme.colors.ink,
  },
  body: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  cardTitle: {
    fontFamily: theme.font.display[theme.text['h2-sm--font-weight']],
    // v3:917 — 21; ölçekte o durak yok, en yakını `h2-sm` (20).
    fontSize: theme.text['h2-sm'],
    lineHeight: theme.text['h2-sm'] * theme.text['h1--line-height'],
    color: theme.colors['on-image'],
  },
  cardMeta: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.helper,
    color: theme.colors['olive-light'],
  },
}));
