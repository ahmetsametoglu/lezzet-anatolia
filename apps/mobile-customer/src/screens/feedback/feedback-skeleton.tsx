import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Skeleton } from '@/components/ui/skeleton';
import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';

/*
  Değerlendirme listesi gelirken yerini tutar; ölçüler ekranın kendi stillerinden türer, metin yazılmaz. Davet en az bir ürünle
  gelir ve kaç ürün geleceği bilinmez, bu yüzden üç satır çizilir.
*/

const ROWS = 3;

interface FeedbackSkeletonProps {
  testID?: string;
}

export function FeedbackSkeleton({ testID }: FeedbackSkeletonProps) {
  const { theme } = useUnistyles();
  const line = (fontSize: number, ratio: number = theme.text['h1--line-height']): number => fontSize * ratio;

  return (
    <View style={styles.screen} testID={testID} accessible accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
      <Skeleton width="40%" height={line(theme.text.eyebrow)} />
      <Skeleton width="68%" height={line(theme.text['h2-sm'])} />
      <Skeleton width="72%" height={line(theme.text['body-sm']) + theme.space.md * 2} radius="badge" />

      <View style={styles.card}>
        {Array.from({ length: ROWS }, (_, index) => (
          <View key={index} style={[styles.row, index > 0 ? styles.divider : undefined]}>
            <Skeleton width={customerMetrics.feedbackRowPhoto} height={customerMetrics.feedbackRowPhoto} radius="full" tone="deep" />
            <View style={styles.text}>
              <Skeleton width="70%" height={line(theme.text.control)} tone="deep" />
              <Skeleton width="45%" height={line(theme.text.helper)} tone="deep" />
            </View>
            <Skeleton width={customerMetrics.feedbackVoteDot} height={customerMetrics.feedbackVoteDot} radius="full" tone="deep" />
            <Skeleton width={customerMetrics.feedbackVoteDot} height={customerMetrics.feedbackVoteDot} radius="full" tone="deep" />
          </View>
        ))}
      </View>

      <Skeleton width="100%" height={theme.size.controlLg} radius="control" />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    paddingTop: theme.space['4xl'],
    paddingHorizontal: theme.space['4xl'],
    gap: theme.space.lg,
  },
  card: {
    marginTop: theme.space.xs,
    paddingHorizontal: theme.space['3xl'],
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors['sand-250'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
    paddingVertical: theme.space.xl,
  },
  divider: {
    borderTopWidth: theme.border.base,
    borderColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
  },
  text: {
    flex: 1,
    gap: theme.space.xs,
  },
}));
