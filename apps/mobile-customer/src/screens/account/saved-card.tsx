import { formatPrice } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { MeCartViewLine, MeSavedView } from '@lezzet/types';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
// Yalnız metin bloğunun tipi için: komponent sözlüğü okumaz, çağıran geçirir.
import type accountMessages from '@lezzet/i18n/customer/account';

type SavedCopy = LocalizedCopy<typeof accountMessages>['saved'];

interface SavedCardProps {
  copy: SavedCopy;
  locale: Locale;
  view: MeSavedView;
  /** İstek uçuşta: çift dokunuş aynı kalemi iki kez taşımasın. */
  busy: boolean;
  onRestore: (lines: readonly MeCartViewLine[]) => void;
  onCancelNotice: (postalCode: string) => void;
}

/**
 * Sonraya kaydedilenler ve bekleyen bölge haberleri, web kartının ikizi; yalnız içerik varken çizilir, çünkü boş kart olmayan bir
 * özelliği varmış gibi gösterir. Satışa kapanmış kalem toplu taşımaya girmez, basılınca hiçbir şey yapmayan eylem bozuk eylemdir.
 */
export function SavedCard({ copy, locale, view, busy, onRestore, onCancelNotice }: SavedCardProps) {
  if (view.saved.length === 0 && view.zoneNotices.length === 0) return null;
  const addable = view.saved.filter((line) => !line.blocked);

  return (
    <View style={styles.card} testID="account-saved">
      <View style={styles.head}>
        <Text style={styles.title}>{copy.title}</Text>
        {addable.length > 0 ? (
          <TextAction label={copy.addAll} onPress={() => onRestore(addable)} disabled={busy} testID="account-saved-all" />
        ) : null}
      </View>
      {view.saved.length === 0 ? <Text style={styles.muted}>{copy.empty}</Text> : null}
      {view.saved.map((line) => (
        <View key={line.kind === 'bundle' ? line.bundleId : `${line.variantId}:${line.stockId ?? ''}`} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.name} numberOfLines={1}>
              {line.unitLabel ? `${line.name} · ${line.unitLabel}` : line.name}
            </Text>
            <Text style={styles.meta}>
              {line.group === 'undeliverable' ? `${copy.routeOnly} · ` : ''}
              {line.unitPriceCents === null ? '—' : formatPrice(line.unitPriceCents, locale)}
            </Text>
          </View>
          <TextAction label={copy.add} onPress={() => onRestore([line])} disabled={busy || line.blocked} />
        </View>
      ))}
      {view.zoneNotices.length > 0 ? (
        <View style={styles.notices}>
          <Text style={styles.noticeTitle}>{copy.zoneTitle}</Text>
          {view.zoneNotices.map((notice) => (
            <View key={notice.postalCode} style={styles.noticeRow}>
              <Text style={styles.noticeText}>{copy.zoneWaiting.replace('{code}', notice.postalCode)}</Text>
              {/* Vazgeçmek sakin tonda: onay istemeyen, geri dönülebilir bir eylem (web kartıyla aynı). */}
              <PressableSurface
                onPress={() => onCancelNotice(notice.postalCode)}
                disabled={busy}
                feedback="opacity"
                accessibilityRole="button"
                testID={`account-zone-notice-${notice.postalCode}`}
              >
                <Text style={styles.cancel}>{copy.zoneCancel}</Text>
              </PressableSurface>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.card,
    padding: theme.space['3xl'],
    gap: theme.space.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.md,
  },
  title: {
    flexShrink: 1,
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text['card-title-sm'],
    color: theme.colors.ink,
  },
  muted: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    color: theme.colors.muted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.lg,
    backgroundColor: theme.colors.cream,
    borderColor: theme.colors['sand-200'],
    borderWidth: 1,
    borderRadius: theme.radius.soft,
    paddingHorizontal: theme.space['2xl'],
    paddingVertical: theme.space.lg,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: theme.font.body[700],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  meta: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
  },
  notices: {
    gap: theme.space.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors['sand-100'],
    paddingTop: theme.space.lg,
  },
  noticeTitle: {
    fontFamily: theme.font.body[700],
    fontSize: theme.text['body-sm'],
    color: theme.colors.ink,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.lg,
  },
  cancel: {
    fontFamily: theme.font.body[700],
    fontSize: theme.text.note,
    color: theme.colors.muted,
  },
  noticeText: {
    flex: 1,
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    color: theme.colors.body,
  },
}));
