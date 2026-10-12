import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';

/*
  Seçim satırı: iki satır künye ve sağda eylem ("ara ›", "değiştir"); dokununca tam ekran seçici açılır. Boyu sabittir, boş, dolu ve
  kapalı hâl aynı yeri kaplar ki seçimden sonra altındaki bölümler kaymasın.
*/

export type PickRowTone = 'muted' | 'faint' | 'credit' | 'warn';

interface PickRowProps {
  title: string;
  sub: string;
  subTone?: PickRowTone;
  /** Başlığın yanındaki rozet (onay bekleyen kayıt). */
  badge?: ReactNode;
  action?: string;
  /** `empty` henüz seçilmedi, `off` önceki adımı bekliyor ve dokunulmaz. */
  state?: 'filled' | 'empty' | 'off';
  onPress?: () => void;
  accessibilityLabel: string;
  testID?: string;
}

export function PickRow({
  title,
  sub,
  subTone = 'muted',
  badge,
  action,
  state = 'filled',
  onPress,
  accessibilityLabel,
  testID,
}: PickRowProps) {
  const content = (
    <>
      <View style={styles.texts}>
        <View style={styles.titleLine}>
          <Text style={[styles.title, state !== 'filled' ? styles.titleMuted : null]} numberOfLines={1}>
            {title}
          </Text>
          {badge}
        </View>
        <Text style={[styles.sub, styles[subTone]]} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      {action ? <Text style={styles.action}>{action}</Text> : null}
    </>
  );
  /* Önceki adımı bekleyen satır dokunulmaz; aynı kutu düz çizilir ki boyu ve yeri değişmesin. */
  if (state === 'off' || onPress === undefined) {
    return (
      <View style={[styles.row, state === 'off' ? styles.rowOff : null]} accessibilityLabel={accessibilityLabel} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <PressableSurface onPress={onPress} feedback="scale" style={styles.row} accessibilityLabel={accessibilityLabel} testID={testID}>
      {content}
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  row: {
    height: operationsTheme.size.controlAmount,
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  rowOff: {
    borderStyle: 'dashed',
    backgroundColor: operationsTheme.colors.cream,
  },
  texts: { flex: 1, minWidth: 0, gap: operationsTheme.space['2xs'] },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.sm, minWidth: 0 },
  title: {
    flexShrink: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  titleMuted: { color: operationsTheme.colors['tab-inactive'] },
  sub: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
  },
  muted: { color: operationsTheme.colors.muted },
  faint: { color: operationsTheme.colors['tab-inactive'] },
  credit: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    color: operationsTheme.colors['olive-dark'],
  },
  warn: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    color: operationsTheme.colors.terracotta,
  },
  action: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.olive,
  },
});
