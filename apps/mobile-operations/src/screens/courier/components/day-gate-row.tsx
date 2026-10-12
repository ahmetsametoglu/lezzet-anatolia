import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { IconName } from '@lezzet/design-tokens/icons';

import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';

interface GateRowProps {
  icon: IconName;
  title: string;
  meta: string;
  /** Krem zemin günün akışının bir adımıdır, zeytin zemin bir davet. */
  tone: 'plain' | 'invite';
  onPress: () => void;
  testID: string;
}

/** Kapı satırı: kare ikon, başlık, alt metin ve yön oku; sefer kapısı, yükleme ve yerinde satış aynı anatomiyi paylaşır ki biri ötekinden ayrılmasın. */
export function GateRow({ icon, title, meta, tone, onPress, testID }: GateRowProps) {
  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      style={[styles.gateRow, tone === 'invite' ? styles.gateRow_invite : styles.gateRow_plain]}
      accessibilityLabel={title}
      testID={testID}
    >
      <View style={[styles.gateIcon, tone === 'invite' ? styles.gateIcon_invite : styles.gateIcon_plain]}>
        <Icon
          name={icon}
          size={operationsTheme.size.stripIcon}
          color={tone === 'invite' ? operationsTheme.colors.olive : operationsTheme.colors.ink}
        />
      </View>
      <View style={styles.gateBody}>
        <Text style={[styles.gateTitle, tone === 'invite' ? styles.gateTitle_invite : null]}>{title}</Text>
        <Text style={styles.gateMeta}>{meta}</Text>
      </View>
      <Chevron />
    </PressableSurface>
  );
}

/** Yön oku bir davettir: kapı satırı ve açık durak kartı aynı işareti taşır. */
export function Chevron() {
  return <Text style={styles.chevron}>›</Text>;
}

const styles = StyleSheet.create({
  gateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.lg,
  },
  gateRow_plain: {
    backgroundColor: operationsTheme.colors.panel,
    borderColor: operationsTheme.colors['sand-300'],
  },
  gateRow_invite: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    borderColor: operationsTheme.colors['olive-line'],
  },
  /** Kare ikon kutusu — ikon serbest durmaz, kendi zeminine oturur. */
  gateIcon: {
    width: operationsTheme.size.controlSm,
    height: operationsTheme.size.controlSm,
    borderRadius: operationsTheme.radius.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateIcon_plain: { backgroundColor: operationsTheme.colors['neutral-bg'] },
  gateIcon_invite: { backgroundColor: operationsTheme.colors.cream },
  gateBody: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  gateTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  gateTitle_invite: { color: operationsTheme.colors['olive-dark'] },
  gateMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  chevron: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors['sand-600'],
  },
});
