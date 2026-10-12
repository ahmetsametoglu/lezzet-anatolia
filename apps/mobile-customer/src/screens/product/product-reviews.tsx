import type { ReviewPreview } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { fill, type Messages } from './product-copy';
import { ReviewCard } from './review-card';

interface ProductReviewsProps {
  slug: string;
  preview: ReviewPreview;
  t: Messages;
}

/**
 * Ürün sayfasının yorum seçkisi (tasarım 17a): en yeni yorumlar ve tümünün bağlantısı; puan özeti başlığın üst satırındadır. Yorum
 * sayfadan yazılmaz, alım sonrası değerlendirme akışından gelir.
 */
export function ProductReviews({ slug, preview, t }: ProductReviewsProps) {
  const router = useRouter();
  const { summary, items } = preview;

  if (items.length === 0) {
    return (
      <Text style={styles.empty} testID="product-reviews-empty">
        {t.reviews.empty}
      </Text>
    );
  }

  const allLabel = fill(t.reviews.all, 'count', String(summary.commentCount));
  return (
    <>
      {items.map((review, index) => (
        <ReviewCard key={review.id} review={review} t={t} testID={`product-review-${index}`} />
      ))}
      {/* Bağlantı yalnız gösterilenden fazla yorum varken: aynı listeyi açan bağlantı olmayan bir kapı gösterirdi. */}
      {summary.commentCount > items.length ? (
        <PressableSurface
          onPress={() => router.push({ pathname: '/reviews/[slug]', params: { slug } })}
          feedback="opacity"
          haptic={false}
          style={styles.all}
          accessibilityRole="link"
          accessibilityLabel={allLabel}
          testID="product-reviews-all"
        >
          <Text style={styles.allText}>{allLabel}</Text>
        </PressableSurface>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  empty: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.muted,
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.card,
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space.xl,
  },
  all: {
    alignSelf: 'flex-start',
  },
  allText: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.olive,
  },
}));
