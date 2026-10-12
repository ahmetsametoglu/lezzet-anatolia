import { HEART_PATH } from '@lezzet/design-tokens/icons';
import type { PublishedReview } from '@lezzet/types';
import { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import type { Messages } from './product-copy';

interface ReviewCardProps {
  review: PublishedReview;
  t: Messages;
  testID: string;
}

/** Yorum kartı (tasarım 17a, 18a): kum zemin, ad ve puan bir satırda, altında metin; tarih yazılmaz. */
export function ReviewCard({ review, t, testID }: ReviewCardProps) {
  const { theme } = useUnistyles();
  // Varsayılan çeviridir, çünkü okunabilirlik asıl amaç; makine çevirisi yorumu yumuşatabileceği için orijinal bir dokunuş uzakta.
  const [showingOriginal, setShowingOriginal] = useState(false);
  const translated = review.commentTranslated && review.originalComment !== null;
  const shown = translated && showingOriginal ? review.originalComment : review.comment;

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.head}>
        <Text style={styles.author} numberOfLines={1}>
          {review.authorName}
        </Text>
        {review.rating !== null ? (
          <ReviewStars value={review.rating} size={customerMetrics.reviewStar} />
        ) : review.vote === 'like' ? (
          // Yıldızsız yorum değerlendirme akışından gelir; beğeni yıldız gibi çizilseydi uydurma bir puan okunurdu.
          <View style={styles.liked} testID={`${testID}-liked`}>
            <Svg
              width={customerMetrics.reviewHeart}
              height={customerMetrics.reviewHeart}
              viewBox="0 0 24 24"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Path d={HEART_PATH} fill={theme.colors.olive} />
            </Svg>
            <Text style={styles.likedText}>{t.reviews.liked}</Text>
          </View>
        ) : null}
      </View>
      {shown === null ? null : <Text style={styles.comment}>{shown}</Text>}
      {translated ? (
        <PressableSurface
          onPress={() => setShowingOriginal((current) => !current)}
          feedback="opacity"
          haptic={false}
          style={styles.translation}
          accessibilityLabel={showingOriginal ? t.reviews.translation.showTranslation : t.reviews.translation.showOriginal}
          testID={`${testID}-translation`}
        >
          <Text style={styles.translationText}>
            {showingOriginal ? t.reviews.translation.showTranslation : t.reviews.translation.showOriginal}
          </Text>
        </PressableSurface>
      ) : null}
    </View>
  );
}

interface ReviewStarsProps {
  /** 1–5; tam yıldıza yuvarlanır, çünkü kart yarım yıldız çizmez. */
  value: number;
  size: number;
}

export function ReviewStars({ value, size }: ReviewStarsProps) {
  const { theme } = useUnistyles();
  const full = Math.round(value);
  return (
    <View style={styles.stars} accessible accessibilityLabel={`${value} / 5`}>
      {[0, 1, 2, 3, 4].map((index) => (
        <Icon key={index} name="star" size={size} color={index < full ? theme.colors.star : theme.colors['sand-400']} filled />
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.space.md,
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space['2xl'],
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors['sand-250'],
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
  },
  author: {
    flex: 1,
    fontFamily: theme.font.body[700],
    fontSize: theme.text['body-sm'],
    color: theme.colors.ink,
  },
  stars: {
    flexDirection: 'row',
    gap: theme.space['2xs'],
  },
  liked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  likedText: {
    fontFamily: theme.font.body[700],
    fontSize: theme.text.note,
    color: theme.colors.olive,
  },
  comment: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  translation: {
    alignSelf: 'flex-start',
  },
  translationText: {
    fontFamily: theme.font.body[700],
    fontSize: theme.text.helper,
    color: theme.colors.olive,
  },
}));
