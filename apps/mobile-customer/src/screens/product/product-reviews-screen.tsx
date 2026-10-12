import { reviewFilterCount } from '@lezzet/domain-core';
import { formatDecimal, ratingCountLabel } from '@lezzet/helper';
import messages from '@lezzet/i18n/customer/product';
import { ReviewRatingFilterEnum, type ReviewRatingFilter, type ReviewSummary } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { EmptyState } from '@/components/ui/empty-state';
import { PageHeaderBar, PageHeaderHero, usePageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';
import { Chip } from '@lezzet/mobile-kit/src/components/ui/chip';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { LoadingState } from '@lezzet/mobile-kit/src/components/ui/loading-state';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import { fill, type Messages } from './product-copy';
import { ReviewCard, ReviewStars } from './review-card';
import { useProductReviews } from './use-product-reviews.hook';

/*
  Tüm yorumlar ekranı (tasarım 17t): puan özeti, yıldız dağılımı, süzgeç çipleri ve aşağı kaydırdıkça yüklenen liste. Sayılar ürünün
  tamamının dağılımından okunur, yüklenmiş sayfadan değil.
*/

interface ProductReviewsScreenProps {
  slug: string;
}

export function ProductReviewsScreen({ slug }: ProductReviewsScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const page = usePageHeader();
  const reviews = useProductReviews(slug, locale);

  const bar = (
    <PageHeaderBar title={t.reviews.title} collapsed={page.collapsed} backLabel={t.back} onBack={() => router.back()} testID="reviews-back" />
  );

  if (reviews.status === 'loading') {
    return (
      <View style={styles.screen}>
        {bar}
        <View style={styles.skeleton} testID="reviews-loading">
          <Skeleton width="40%" height={theme.text.eyebrow} radius="badge" />
          <Skeleton width="70%" height={theme.text['page-title-sm']} radius="badge" />
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} width="100%" height={customerMetrics.reviewSkeletonCard} radius="card" tone="soft" />
          ))}
        </View>
      </View>
    );
  }

  if (reviews.status === 'missing' || reviews.status === 'error' || reviews.summary === null) {
    const missing = reviews.status === 'missing';
    return (
      <View style={styles.screen}>
        {bar}
        <EmptyState
          fill
          icon={missing ? undefined : <Icon name="connection-off" size={theme.size.errorIcon} color={theme.colors['sand-600']} />}
          title={missing ? t.notFound.title : t.error.title}
          description={missing ? t.notFound.body : t.error.body}
          action={
            <PrimaryButton
              label={missing ? t.notFound.back : t.error.retry}
              shape="pill"
              onPress={missing ? () => router.back() : reviews.retry}
              testID="reviews-error-action"
            />
          }
          testID={missing ? 'reviews-missing' : 'reviews-error'}
        />
      </View>
    );
  }

  const summary = reviews.summary;
  const countOf = (key: ReviewRatingFilter | null) => (key === null ? summary.commentCount : reviewFilterCount(summary.ratingBreakdown, key));
  // Sayısı sıfır olan çip çizilmez: basılınca boş liste gösteren çip müşteriye kendi dokunuşunu sorgulatır.
  const chips: (ReviewRatingFilter | null)[] = [null, ...ReviewRatingFilterEnum.options.filter((key) => countOf(key) > 0)];

  const header = (
    <PageHeaderHero eyebrow={upperIn(reviews.productName, locale)} title={t.reviews.title} onTitleLayout={page.onTitleLayout} style={styles.header}>
      <ReviewOverview summary={summary} t={t} />
      <View style={styles.chips}>
        {chips.map((key) => (
          <Chip
            key={key ?? 'all'}
            // Sözlük yıldızı yer tutucuyla taşır; çip yalnız metin çizdiği için karakter konur, tasarım karesi de karakteri çiziyor.
            label={fill(t.reviews.filters[key ?? 'all'], 'count', String(countOf(key))).replace('{star}', '★')}
            selected={reviews.filter === key}
            onPress={() => reviews.setFilter(key)}
            testID={`reviews-filter-${key ?? 'all'}`}
          />
        ))}
      </View>
    </PageHeaderHero>
  );

  const footer = reviews.loadingMore ? (
    <View style={styles.tail}>
      <LoadingState size="sm" accessibilityLabel={t.reviews.loading} testID="reviews-tail-loading" />
    </View>
  ) : reviews.tailFailed ? (
    <View style={styles.tail}>
      <PrimaryButton label={t.reviews.retry} shape="pill" onPress={reviews.retry} testID="reviews-tail-retry" />
    </View>
  ) : null;

  return (
    <View style={styles.screen}>
      {bar}
      <FlatList
        data={reviews.reviews}
        keyExtractor={(review) => review.id}
        renderItem={({ item, index }) => <ReviewCard review={item} t={t} testID={`reviews-row-${index}`} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={header}
        // Boş durum yalnız istek sürmüyorken: yükleme sırasında "yorum yok" demek bir saniye sonra kendini yalanlardı.
        ListEmptyComponent={
          reviews.loadingMore || reviews.tailFailed ? null : (
            <Text style={styles.empty} testID="reviews-empty">
              {t.reviews.panelEmpty}
            </Text>
          )
        }
        ListFooterComponent={footer}
        onScroll={page.onScroll}
        scrollEventThrottle={16}
        onEndReached={reviews.loadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={styles.content}
        testID="reviews-list"
      />
    </View>
  );
}

interface ReviewOverviewProps {
  summary: ReviewSummary;
  t: Messages;
}

/** Ortalama, yıldızlar ve dağılım çubukları; ortalama yoksa yalnız çubuklar durur, çünkü "0,0" kötü ürün demektir. */
function ReviewOverview({ summary, t }: ReviewOverviewProps) {
  const locale = useAppLocale();
  // Çubuk oranı en çok oylanana göre: tasarımda en yüksek çubuk tam dolar; hiç oy yoksa bölme yapılmaz.
  const max = Math.max(...summary.ratingBreakdown, 0);
  return (
    <View style={styles.overview}>
      {summary.average === null ? null : (
        <View style={styles.average} testID="reviews-summary">
          <Text style={styles.averageValue}>{formatDecimal(summary.average, locale, 1)}</Text>
          <View style={styles.averageText}>
            <ReviewStars value={summary.average} size={customerMetrics.reviewSummaryStar} />
            <Text style={styles.averageCount}>{ratingCountLabel(summary.totalCount, t.reviews)}</Text>
          </View>
        </View>
      )}
      <View style={styles.bars}>
        {[5, 4, 3, 2, 1].map((star) => {
          const count = summary.ratingBreakdown[star - 1] ?? 0;
          return (
            <View key={star} style={styles.barRow} testID={`reviews-bar-${star}`}>
              <Text style={styles.barLabel}>{star}★</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: max > 0 ? `${(count / max) * 100}%` : '0%' }]} />
              </View>
              <Text style={styles.barCount}>{count}</Text>
            </View>
          );
        })}
      </View>
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
    paddingBottom: rt.insets.bottom + theme.space['5xl'],
  },
  header: { paddingBottom: theme.space.xl },
  skeleton: {
    paddingHorizontal: theme.space['4xl'],
    paddingTop: theme.space.lg,
    gap: theme.space.xl,
  },
  overview: {
    gap: theme.space.xl,
    paddingTop: theme.space.md,
  },
  average: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space['2xl'],
  },
  averageValue: {
    fontFamily: theme.font.display[theme.text['h1-sm--font-weight']],
    fontSize: theme.text['h1-md'],
    color: theme.colors.ink,
  },
  averageText: {
    gap: theme.space.xs,
  },
  averageCount: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    color: theme.colors.muted,
  },
  bars: {
    gap: theme.space.sm,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
  },
  barLabel: {
    width: customerMetrics.reviewBarLabel,
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.body,
  },
  barTrack: {
    flex: 1,
    height: customerMetrics.reviewBarHeight,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors['sand-200'],
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.star,
  },
  barCount: {
    width: customerMetrics.reviewBarLabel,
    textAlign: 'right',
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.md,
    paddingTop: theme.space.xl,
  },
  separator: { height: theme.space.lg },
  empty: {
    paddingVertical: theme.space['4xl'],
    textAlign: 'center',
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    color: theme.colors.muted,
  },
  tail: {
    paddingVertical: theme.space['3xl'],
    alignItems: 'center',
  },
}));
