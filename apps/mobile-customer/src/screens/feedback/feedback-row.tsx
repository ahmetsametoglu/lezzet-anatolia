import type { LocalizedCopy } from '@lezzet/i18n';
import { meetsReviewMinimum } from '@lezzet/domain-core';
import type { FeedbackCard, FeedbackVote } from '@lezzet/types';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Tag } from '@/components/ui/tag';
import { FrameImage } from '@lezzet/mobile-kit/src/components/ui/frame-image';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { TextField } from '@lezzet/mobile-kit/src/components/ui/text-field';
import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';
import type messages from '@lezzet/i18n/customer/feedback';
import { ThumbIcon } from './feedback-icons';

type Messages = LocalizedCopy<typeof messages>;

interface FeedbackRowProps {
  card: FeedbackCard;
  vote: FeedbackVote | undefined;
  onVote: (value: FeedbackVote) => void;
  comment: string;
  commentOpen: boolean;
  onOpenComment: () => void;
  onChangeComment: (text: string) => void;
  /** "Tamamla"dan sonra yorum alt sınırın altında kaldıysa uyarı çizilir. */
  short: boolean;
  reviewPoints: number;
  minWords: number;
  t: Messages;
  testID: string;
}

/** Değerlendirme listesinin bir ürünü: oy daireleri satırda, yorum alanı altında; rozet yorumun puanını söyler. */
export function FeedbackRow({
  card,
  vote,
  onVote,
  comment,
  commentOpen,
  onOpenComment,
  onChangeComment,
  short,
  reviewPoints,
  minWords,
  t,
  testID,
}: FeedbackRowProps) {
  const points = t.list.points.replace('{points}', String(reviewPoints));
  // Yeterli yorum rozeti zeytine çevirir; ödülün hak edildiğini yazı eklemeden söyler.
  const earned = meetsReviewMinimum(comment, minWords);

  return (
    <View style={styles.item} testID={testID}>
      <View style={styles.row}>
        <View style={styles.photo}>
          {card.image.url === null ? (
            <Text style={styles.initial}>{card.name.slice(0, 1)}</Text>
          ) : (
            <FrameImage image={card.image} style={styles.photoImage} />
          )}
        </View>
        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={2}>
            {card.name}
          </Text>
          {card.detail.length > 0 ? <Text style={styles.detail}>{card.detail}</Text> : null}
        </View>
        <VoteDot kind="dislike" selected={vote === 'dislike'} label={t.vote.dislike} onPress={() => onVote('dislike')} testID={`${testID}-dislike`} />
        <VoteDot kind="like" selected={vote === 'like'} label={t.vote.like} onPress={() => onVote('like')} testID={`${testID}-like`} />
      </View>

      {commentOpen ? (
        <TextField
          value={comment}
          onChangeText={onChangeComment}
          accessibilityLabel={t.list.commentLabel.replace('{product}', card.name)}
          placeholder={t.list.commentPlaceholder.replace('{product}', card.name)}
          multiline
          errorText={short ? t.list.minWords.replace('{count}', String(minWords)) : undefined}
          footerAside={<Tag label={earned ? `✓ ${points}` : points} tone={earned ? 'olive' : 'terracotta'} rotate={-2} testID={`${testID}-badge`} />}
          testID={`${testID}-comment`}
        />
      ) : (
        <PressableSurface
          onPress={onOpenComment}
          feedback="opacity"
          style={styles.add}
          accessibilityLabel={t.list.addComment}
          testID={`${testID}-add-comment`}
        >
          <Text style={styles.addLabel}>＋ {t.list.addComment}</Text>
          <Tag label={points} tone="soft" />
        </PressableSurface>
      )}
    </View>
  );
}

interface VoteDotProps {
  kind: FeedbackVote;
  selected: boolean;
  label: string;
  onPress: () => void;
  testID: string;
}

/** Oy dairesi: seçiliyken kendi rengiyle dolar, seçili değilken çerçeveli kalır. */
function VoteDot({ kind, selected, label, onPress, testID }: VoteDotProps) {
  const { theme } = useUnistyles();
  const filled = kind === 'like' ? styles.likeOn : styles.dislikeOn;
  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      style={[styles.dot, selected ? filled : undefined]}
      accessibilityLabel={label}
      selected={selected}
      testID={testID}
    >
      <ThumbIcon direction={kind === 'like' ? 'up' : 'down'} size={theme.size.inlineIcon} color={selected ? theme.colors.card : theme.colors.muted} />
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  item: {
    paddingVertical: theme.space.xl,
    gap: theme.space.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
  },
  photo: {
    width: customerMetrics.feedbackRowPhoto,
    height: customerMetrics.feedbackRowPhoto,
    borderRadius: customerMetrics.feedbackRowPhoto / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['sand-300'],
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  initial: {
    fontFamily: theme.font.display[theme.text['card-title--font-weight']],
    fontSize: theme.text['card-title'],
    color: theme.colors.muted,
  },
  text: {
    flex: 1,
    gap: theme.space['2xs'],
  },
  name: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
    color: theme.colors.ink,
  },
  detail: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.body,
  },
  dot: {
    width: customerMetrics.feedbackVoteDot,
    height: customerMetrics.feedbackVoteDot,
    borderRadius: customerMetrics.feedbackVoteDot / 2,
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-400'],
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  likeOn: {
    backgroundColor: theme.colors.olive,
    borderColor: theme.colors.olive,
  },
  dislikeOn: {
    backgroundColor: theme.colors.terracotta,
    borderColor: theme.colors.terracotta,
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    marginLeft: customerMetrics.feedbackRowPhoto + theme.space.xl,
  },
  addLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.olive,
  },
}));
