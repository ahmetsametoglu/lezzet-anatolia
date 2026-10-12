import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';

/*
  Sipariş sayfasının bölüm kabuğu: numara (biten bölümde onay işareti), başlık, sağda tek eylem. Bölüm kapanıp açılmaz; boş ve dolu hâl
  aynı boydadır, bu yüzden içerik satırları da sabit boylu bileşenlerden kurulur.
*/

interface OrderSectionProps {
  n: number;
  /** `ok` bölüm tamam, `wait` önceki adımı bekliyor. */
  state: 'active' | 'ok' | 'wait';
  title: string;
  /** Bekleyen bölümün neyi beklediği ("müşteriden sonra"). */
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  testID?: string;
}

export function OrderSection({ n, state, title, hint, action, children, testID }: OrderSectionProps) {
  return (
    <View style={styles.section} testID={testID}>
      <View style={styles.head}>
        <View style={[styles.mark, state === 'ok' ? styles.markOk : null, state === 'wait' ? styles.markWait : null]}>
          {state === 'ok' ? (
            <Icon name="check" size={operationsTheme.size.badgeIcon} color={operationsTheme.colors.card} />
          ) : (
            <Text style={[styles.markText, state === 'wait' ? styles.markTextWait : null]}>{n}</Text>
          )}
        </View>
        <Text style={[styles.title, state === 'wait' ? styles.titleWait : null]} numberOfLines={1}>
          {title}
        </Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        {action}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.card,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    gap: operationsTheme.space.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    minHeight: operationsTheme.size.stepBadge,
  },
  mark: {
    width: operationsTheme.size.stepBadge,
    height: operationsTheme.size.stepBadge,
    borderRadius: operationsTheme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: operationsTheme.colors.ink,
  },
  markOk: { backgroundColor: operationsTheme.colors.olive },
  markWait: { backgroundColor: operationsTheme.colors['neutral-bg'] },
  markText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.card,
  },
  markTextWait: { color: operationsTheme.colors['tab-inactive'] },
  title: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  titleWait: { color: operationsTheme.colors['tab-inactive'] },
  hint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors['tab-inactive'],
  },
});
