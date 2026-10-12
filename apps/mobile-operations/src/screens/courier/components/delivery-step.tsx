import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import type { useDelivery } from '../use-delivery.hook';

/** Teslim ekranının parçalarına giden durum; hook'un kendi dönüşünden türer ki iki tanım ayrışmasın. */
export type DeliveryState = ReturnType<typeof useDelivery>;

interface StepHeadingProps {
  n: number;
  label: string;
  /** Başlığın sağ yuvası, bölümün tamamına ait eylem için; eylem gövdede tam genişlikte durursa istisnayı varsayılan gibi gösterir. */
  action?: ReactNode;
  /** Para adımı terracotta dairede durur ki kartın çerçevesiyle aynı aileden okunsun. */
  tone?: 'ink' | 'money';
  testID?: string;
}

/** Adım başlığı: daire adımı sayılabilir kılar; `testID` satıra verilir, çünkü adımın kaçıncı olduğu numara ve adla birlikte okunur. */
export function StepHeading({ n, label, action, tone = 'ink', testID }: StepHeadingProps) {
  return (
    <View style={styles.stepHead} testID={testID}>
      <View style={[styles.stepBadge, tone === 'money' ? styles.stepBadgeMoney : null]}>
        <Text style={styles.stepBadgeText}>{String(n)}</Text>
      </View>
      <Text style={tone === 'money' ? styles.moneyHeading : styles.sectionHeading}>{label}</Text>
      {action === undefined ? null : <View style={styles.stepAction}>{action}</View>}
    </View>
  );
}

interface StepCardProps {
  /** Kutu adımı ekrana bakar bakmaz okunan tonu taşır: eksikte uyarı, tamamda zeytin. */
  tone?: 'plain' | 'pending' | 'done' | 'money';
  /** Kutular verilmeden sonraki adımlar soluk ve dokunulmazdır; gizlenmez ki kurye sırayı görsün. */
  locked?: boolean;
  children: ReactNode;
  testID?: string;
}

export function StepCard({ tone = 'plain', locked = false, children, testID }: StepCardProps) {
  return (
    <View
      style={[
        tone === 'money' ? styles.moneyCard : styles.card,
        tone === 'pending' ? styles.pending : tone === 'done' ? styles.done : null,
        locked ? styles.locked : null,
      ]}
      pointerEvents={locked ? 'none' : 'auto'}
      testID={testID}
    >
      {children}
    </View>
  );
}

interface StepNoteProps {
  tone: 'hint' | 'warn' | 'error';
  children: ReactNode;
  testID?: string;
}

/** Adımın altındaki tek satır; hata ekran okuyucuya uyarı olarak gider ki kurye bakmadan da duysun. */
export function StepNote({ tone, children, testID }: StepNoteProps) {
  return (
    <Text
      style={tone === 'hint' ? styles.hint : tone === 'warn' ? styles.warn : styles.error}
      accessibilityRole={tone === 'error' ? 'alert' : undefined} testID={testID}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: operationsTheme.space.lg,
    padding: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    backgroundColor: operationsTheme.colors.panel,
  },
  moneyCard: {
    gap: operationsTheme.space.md,
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.terracotta,
    borderRadius: operationsTheme.radius.card,
    backgroundColor: operationsTheme.colors.panel,
  },
  pending: {
    backgroundColor: operationsTheme.colors['warning-bg'],
    borderColor: operationsTheme.colors['warning-line'],
  },
  done: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    borderColor: operationsTheme.colors['olive-line'],
  },
  locked: { opacity: 0.4 },
  stepHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
  },
  /** Eylem sağa yaslanır: ad ile arasındaki boşluk bölümün genişliği kadar esner. */
  stepAction: { marginLeft: 'auto' },
  stepBadge: {
    width: operationsTheme.size.stepBadge,
    height: operationsTheme.size.stepBadge,
    borderRadius: operationsTheme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: operationsTheme.colors.ink,
  },
  stepBadgeMoney: { backgroundColor: operationsTheme.colors.terracotta },
  stepBadgeText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['on-image'],
  },
  sectionHeading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  moneyHeading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.terracotta,
  },
  hint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  warn: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.terracotta,
  },
  error: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.error,
  },
});
