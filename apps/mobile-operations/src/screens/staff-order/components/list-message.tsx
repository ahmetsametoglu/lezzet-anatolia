import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { staffOrderCopy } from '../copy';

const t = staffOrderCopy.list;

/* Seçici listesinin ilk satırının yerine yazan mesaj (ipucu, sonuç yok, hata); satır boyundadır ki sonuç gelince liste kaymasın. */

interface ListMessageProps {
  title: string;
  body: string;
  height: number;
  /** Hata satırında dokunuş yeniden dener. */
  onPress?: () => void;
  testID?: string;
}

export function ListMessage({ title, body, height, onPress, testID }: ListMessageProps) {
  const texts = (
    <>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.body} numberOfLines={2}>
        {body}
      </Text>
    </>
  );
  if (onPress === undefined) {
    return (
      <View style={[styles.row, { height }]} testID={testID}>
        {texts}
      </View>
    );
  }
  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      style={[styles.row, { height }]}
      accessibilityLabel={`${title} ${body}`}
      testID={testID}
    >
      {texts}
    </PressableSurface>
  );
}

interface ListTailProps {
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  testID?: string;
}

/** Listenin dibi: devamı yüklenirken ve devamı okunamadığında tek satır; okunamayan devam dokununca yeniden istenir. */
export function ListTail({ loading, failed, onRetry, testID }: ListTailProps) {
  if (loading) return <Text style={styles.tail}>{t.loadingMore}</Text>;
  if (!failed) return null;
  return (
    <PressableSurface onPress={onRetry} feedback="opacity" style={styles.tailHit} accessibilityLabel={t.moreFailed} testID={testID}>
      <Text style={[styles.tail, styles.tailFailed]}>{t.moreFailed}</Text>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  row: {
    justifyContent: 'center',
    gap: operationsTheme.space['2xs'],
    borderBottomWidth: operationsTheme.border.base,
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  title: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.muted,
  },
  body: { fontFamily: operationsTheme.font.body[400], fontSize: operationsTheme.text.meta, color: operationsTheme.colors.muted },
  tailHit: { alignSelf: 'stretch' },
  tail: {
    paddingVertical: operationsTheme.space.xl,
    textAlign: 'center',
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  tailFailed: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    color: operationsTheme.colors.terracotta,
  },
});
