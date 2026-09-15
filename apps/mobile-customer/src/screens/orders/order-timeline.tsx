import type { OrderMilestone, OrderTimelineStep } from '@lezzet/types';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';

/*
  Sipariş zaman çizgisi, dört durak (alındı → hazırlandı → yolda → teslim edildi): adımları motor verir (`orderTimeline`), çünkü
  geçilmiş durağı ve atlanan geçişleri anlık durum değil geçmiş söyler. İptal ve iade çizgide yer tutmaz; saat yalnız kaydı olan
  adımda yazılır, çünkü damgasız adıma tarih uydurmak kaydı olmayan olaya saat yazmak olurdu.
*/

/** Durağın ikonu — sıra tasarımın sırası; küme motorun `OrderMilestone`u (kapalı, derlemede zorlar). */
const STEP_ICONS = {
  received: 'check-wide',
  prepared: 'box',
  on_the_way: 'truck',
  delivered: 'home',
} as const satisfies Record<OrderMilestone, string>;

interface OrderTimelineProps {
  /** Motorun ürettiği dört adım — sıra anlamlıdır, ekran yeniden sıralamaz. */
  steps: readonly OrderTimelineStep[];
  /** Durak adları — sayfanın `messages.json`'undan. */
  labels: Record<OrderMilestone, string>;
  /** "Şu an" durağının notu; `delivered` hiç `current` olmadığı için kümede yok. */
  notes: Record<Exclude<OrderMilestone, 'delivered'>, string>;
  /** Damgayı okunur metne çeviren biçimlendirici — dil kararı çağıranın. */
  formatAt: (iso: string) => string;
  testID?: string;
}

export function OrderTimeline({ steps, labels, notes, formatAt, testID }: OrderTimelineProps) {
  const { theme } = useUnistyles();

  return (
    <View style={styles.panel} testID={testID}>
      {steps.map((step, index) => {
        const reached = step.state !== 'pending';
        const isCurrent = step.state === 'current';
        const note = isCurrent && step.milestone !== 'delivered' ? notes[step.milestone] : undefined;
        const markStyle = isCurrent ? styles.markCurrent : reached ? styles.markDone : styles.markIdle;
        const markColor = reached ? theme.colors.card : theme.colors.muted;
        const icon = STEP_ICONS[step.milestone];

        return (
          <View key={step.milestone} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.mark, markStyle]}>
                <Icon name={icon} size={theme.size.inlineIcon} color={markColor} />
              </View>
              {/* Son durağın altında çizgi yok: çizgi İKİ durağı bağlar, tek başına bir şey demez.
                  Rengi SONRAKİ adım belirler (web'in aynı kararı): "Yolda" geçilmiş olsa da ondan
                  sonrası henüz yaşanmadıysa çizgi kum rengidir — kendi hâline bakmak, geleceğe
                  giden yolu yaşanmış gibi boyardı. */}
              {index < steps.length - 1 ? (
                <View
                  style={[
                    styles.line,
                    steps[index + 1]?.state === 'pending' ? styles.lineIdle : styles.lineDone,
                  ]}
                />
              ) : null}
            </View>
            <View style={styles.text}>
              <Text style={[styles.label, reached ? styles.labelReached : styles.labelIdle]}>
                {labels[step.milestone]}
              </Text>
              {reached && step.at !== null ? <Text style={styles.time}>{formatAt(step.at)}</Text> : null}
              {note === undefined ? null : <Text style={styles.note}>{note}</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  panel: {
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
    padding: theme.space['3xl'],
    paddingBottom: theme.space.xs,
  },
  row: {
    flexDirection: 'row',
    gap: theme.space.xl,
  },
  rail: { alignItems: 'center' },
  mark: {
    width: theme.size.stepButton,
    height: theme.size.stepButton,
    borderRadius: theme.size.stepButton / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markDone: { backgroundColor: theme.colors.olive },
  markCurrent: { backgroundColor: theme.colors.terracotta },
  markIdle: { backgroundColor: theme.colors['sand-300'] },
  line: {
    flex: 1,
    // Şablon 2,5 px çiziyor — ölçekte tam karşılığı `border.ring`.
    width: theme.border.ring,
    minHeight: theme.space['3xl'],
    marginVertical: theme.space['2xs'],
    borderRadius: theme.border.ring / 2,
  },
  lineDone: { backgroundColor: theme.colors.olive },
  lineIdle: { backgroundColor: theme.colors['sand-400'] },
  text: {
    flex: 1,
    gap: theme.space['2xs'],
    paddingBottom: theme.space['2xl'],
  },
  label: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
  },
  labelReached: { color: theme.colors.ink },
  labelIdle: { color: theme.colors['sand-600'] },
  time: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
  },
  note: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.terracotta,
  },
}));
