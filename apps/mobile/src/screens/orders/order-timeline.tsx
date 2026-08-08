import type { CustomerOrderStatus } from '@lezzet/types';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/ui/icon';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';

/*
  SİPARİŞ ZAMAN ÇİZGİSİ (v3:719) — dört durak: alındı → hazırlanıyor → yolda → teslim edildi.

  DÖRT DURAK SABİT, durum ONLARDAN BİRİNE denk gelir. `cancelled` ve `returning` çizgide bir yer
  TUTMAZ (şablonun `si` haritası da onları içermiyor): iptal edilmiş bir sipariş çizginin
  ortasında donmuş gibi görünmemeli — o durumda hiçbir durak "şu an burası" diye işaretlenmez,
  ulaşılmış olanlar geçmiş kalır. Durumun kendisi başlıktaki rozetle söyleniyor.

  ÜÇ GÖRSEL DURUM: geçilmiş (zeytin) · şu an (terracotta) · henüz değil (kum). Şu an olan durak
  ayrıca bir NOT taşır ("Kurye bölgenizde…"); teslim edilmiş siparişte not yoktur, çünkü söylenecek
  bir "şu an" kalmamıştır.
*/

/** Çizginin durakları — sıra tasarımın sırası. */
const STEPS = ['received', 'preparing', 'on_the_way', 'delivered'] as const;
type TimelineStep = (typeof STEPS)[number];

/** Durum → çizgideki durak sırası. Kümede olmayan durum (iptal/iade) çizgide yer tutmaz. */
const STATUS_INDEX: Partial<Record<CustomerOrderStatus, number>> = {
  received: 0,
  preparing: 1,
  on_the_way: 2,
  delivered: 3,
};

interface OrderTimelineProps {
  status: CustomerOrderStatus;
  /** Dört durağın saati; ulaşılmamış durak `null`. */
  times: readonly [string | null, string | null, string | null, string | null];
  /** Durak adları — sayfanın `messages.json`'undan. */
  labels: Record<TimelineStep, string>;
  /** "Şu an" durağının notu; teslim edilmişte hiç okunmaz. */
  notes: Record<'received' | 'preparing' | 'on_the_way', string>;
  testID?: string;
}

export function OrderTimeline({ status, times, labels, notes, testID }: OrderTimelineProps) {
  const { theme } = useUnistyles();
  const currentIndex = STATUS_INDEX[status];
  const delivered = status === 'delivered';

  return (
    <View style={styles.panel} testID={testID}>
      {STEPS.map((step, index) => {
        const reached = currentIndex !== undefined && index <= currentIndex;
        const isCurrent = currentIndex === index && !delivered;
        const note = isCurrent && step !== 'delivered' ? notes[step] : undefined;
        const markStyle = isCurrent ? styles.markCurrent : reached ? styles.markDone : styles.markIdle;
        const markColor = reached || isCurrent ? theme.colors.card : theme.colors.muted;

        return (
          <View key={step} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.mark, markStyle]}>
                {step === 'received' ? (
                  <CustomerIcon name="check" size={theme.size.inlineIcon} color={markColor} />
                ) : step === 'preparing' ? (
                  <CustomerIcon name="box" size={theme.size.inlineIcon} color={markColor} />
                ) : step === 'on_the_way' ? (
                  <CustomerIcon name="truck" size={theme.size.inlineIcon} color={markColor} />
                ) : (
                  <Icon name="home" size={theme.size.inlineIcon} color={markColor} />
                )}
              </View>
              {/* Son durağın altında çizgi yok: çizgi İKİ durağı bağlar, tek başına bir şey demez. */}
              {index < STEPS.length - 1 ? (
                <View
                  style={[
                    styles.line,
                    currentIndex !== undefined && index < currentIndex ? styles.lineDone : styles.lineIdle,
                  ]}
                />
              ) : null}
            </View>
            <View style={styles.text}>
              <Text style={[styles.label, reached ? styles.labelReached : styles.labelIdle]}>{labels[step]}</Text>
              {reached && times[index] !== null ? <Text style={styles.time}>{times[index]}</Text> : null}
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
    fontWeight: theme.text['button--font-weight'],
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
    fontSize: theme.text.micro,
    fontWeight: theme.text['field-label--font-weight'],
    lineHeight: theme.text.micro * theme.text['lead--line-height'],
    color: theme.colors.terracotta,
  },
}));
