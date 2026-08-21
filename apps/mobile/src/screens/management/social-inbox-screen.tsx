import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { ConversationSourceEnum, type ConversationSource } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PressableSurface } from '@/components/ui/pressable-surface';
import type { SocialRow } from '@/lib/api/social';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { managementCopy } from './copy';
import { socialPreview, socialStamp, socialTitle } from './social-format';
import { useSocialInbox, type ChannelFilter } from './use-social-inbox.hook';

/*
  SOSYAL GELEN KUTUSU — web `/operations/social` kuyruğunun mobil aynası (15.15): üç Meta kanalı
  tek listede, son harekete göre sıralı, keyset sayfalı.

  Liste kalıbı talep listesinden (`tickets-screen`), görünüm dili yönetim bölümünden
  (`complaint-screen`): OperationsStackHeader + `operationsTheme` sabiti + OperationsNoticeBlock.
  Kuyruğun üç kuyruk hâli (yükleniyor · düştü · bitti) footer'da — `nextCursor` üretilip
  TÜKETİLİYOR (CLAUDE §1: sayfalayan okumanın tüketeni olmalı).

  ── KANAL SATIRIN SOL KENARINDAN OKUNUR (web `SOURCE_EDGE` kararı) ──────────
  Renk marka token'ından (`brand-whatsapp/messenger/instagram` — design-tokens, ham hex yok):
  kuyruk artık üç kanalın kuyruğu ve satırın nereden geldiği ilk bakışta görünmeli. Rozet metni
  çevrilmez — marka adları sözlükte de aynen durur.
*/

const t = managementCopy.social;

/** Kanal → sol kenar rengi. Token'dan (CLAUDE §3) — `operationsTheme` marka anahtarlarını yayar. */
const CHANNEL_EDGE = {
  whatsapp: operationsTheme.colors['brand-whatsapp'],
  messenger: operationsTheme.colors['brand-messenger'],
  instagram: operationsTheme.colors['brand-instagram'],
} as const satisfies Record<ConversationSource, string>;

interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}

/** Süzgeç çipi — iki şeridin (durum · kanal) ortak görünümü. */
function FilterChip({ label, active, onPress, testID }: FilterChipProps) {
  return (
    <PressableSurface
      onPress={onPress}
      feedback="opacity"
      compact
      style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}
      accessibilityLabel={label}
      testID={testID}
    >
      <Text style={active ? styles.chipActiveLabel : styles.chipIdleLabel}>{label}</Text>
    </PressableSurface>
  );
}

export function SocialInboxScreen() {
  const router = useRouter();
  const inbox = useSocialInbox();

  const channels: { value: ChannelFilter; label: string; key: string }[] = [
    { value: undefined, label: t.channelAll, key: 'all' },
    ...ConversationSourceEnum.options.map((source) => ({ value: source as ChannelFilter, label: t.channel[source], key: source })),
  ];

  const renderRow = ({ item }: { item: SocialRow }) => (
    <PressableSurface
      onPress={() => router.navigate(`/social/${item.id}`)}
      feedback="opacity"
      style={[styles.row, { borderLeftColor: CHANNEL_EDGE[item.source] }]}
      accessibilityLabel={socialTitle(item)}
      testID={`management-social-row-${item.id}`}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {socialTitle(item)}
        </Text>
        <Text style={styles.rowPreview} numberOfLines={1}>
          {socialPreview(item, t.kind)}
        </Text>
      </View>
      <View style={styles.rowSide}>
        <Text style={styles.rowStamp}>{socialStamp(item.lastMessageAt)}</Text>
        {item.awaitingReply ? <Text style={styles.ourTurn}>{managementCopy.common.ourTurn}</Text> : null}
      </View>
    </PressableSurface>
  );

  return (
    <View style={styles.screen} testID="management-social">
      <OperationsStackHeader
        title={t.title}
        subtitle={fillCopy(t.caption, {
          awaiting: String(inbox.counts.awaitingReply),
          ai: String(inbox.counts.handledByAi),
        })}
        onBack={() => router.back()}
        backLabel={managementCopy.common.back}
        testID="management-social-header"
      />

      <View style={styles.chips}>
        <FilterChip
          label={t.filter.all}
          active={!inbox.awaitingOnly}
          onPress={() => inbox.setAwaitingOnly(false)}
          testID="management-social-filter-all"
        />
        <FilterChip
          label={t.filter.awaiting}
          active={inbox.awaitingOnly}
          onPress={() => inbox.setAwaitingOnly(true)}
          testID="management-social-filter-awaiting"
        />
      </View>
      <View style={styles.chips}>
        {channels.map((channel) => (
          <FilterChip
            key={channel.key}
            label={channel.label}
            active={inbox.channel === channel.value}
            onPress={() => inbox.setChannel(channel.value)}
            testID={`management-social-channel-${channel.key}`}
          />
        ))}
      </View>

      {inbox.status === 'loading' ? (
        <View style={styles.pending} testID="management-social-loading">
          <ActivityIndicator color={operationsTheme.colors.olive} />
        </View>
      ) : inbox.status === 'error' ? (
        <View style={styles.noticeWrap}>
          <OperationsNoticeBlock
            variant="error"
            title={t.error.title}
            description={t.error.body}
            retry={{ label: t.error.retry, onPress: inbox.retry }}
            testID="management-social-error"
          />
        </View>
      ) : inbox.rows.length === 0 ? (
        <View style={styles.noticeWrap}>
          <OperationsNoticeBlock variant="empty" title={t.empty.title} description={t.empty.body} testID="management-social-empty" />
        </View>
      ) : (
        <FlatList
          data={inbox.rows}
          keyExtractor={(row) => row.id}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          onEndReached={inbox.loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={inbox.refreshing}
              onRefresh={inbox.refresh}
              tintColor={operationsTheme.colors.olive}
            />
          }
          ListFooterComponent={
            inbox.loadingMore ? (
              <Text style={styles.footerNote}>{t.tail.loading}</Text>
            ) : inbox.tailFailed ? (
              <PressableSurface
                onPress={inbox.loadMore}
                feedback="opacity"
                compact
                accessibilityLabel={t.tail.failed}
                testID="management-social-tail-retry"
              >
                <Text style={[styles.footerNote, styles.footerRetry]}>{t.tail.failed}</Text>
              </PressableSurface>
            ) : inbox.hasMore ? null : (
              <Text style={styles.footerNote}>{t.tail.end}</Text>
            )
          }
          testID="management-social-list"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: operationsTheme.space.sm,
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space.md,
  },
  chip: {
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    borderWidth: operationsTheme.border.base,
  },
  chipActive: {
    backgroundColor: operationsTheme.colors.olive,
    borderColor: operationsTheme.colors.olive,
  },
  chipIdle: {
    borderColor: operationsTheme.colors['sand-500'],
  },
  chipActiveLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.card,
  },
  chipIdleLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.ink,
  },
  pending: {
    paddingTop: operationsTheme.space['7xl'],
  },
  noticeWrap: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space['2xl'],
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space['8xl'],
  },
  /** Sol kenar KANALIN markası — kalınlık sabit, renk satırda (`CHANNEL_EDGE`). */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space['2xl'],
    paddingLeft: operationsTheme.space.lg,
    borderLeftWidth: operationsTheme.space['2xs'],
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'solid',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  rowText: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  rowTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  rowPreview: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  rowSide: {
    alignItems: 'flex-end',
    gap: operationsTheme.space['2xs'],
  },
  rowStamp: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  /** "top bizde" — yönetim hub'ının aynı rozeti (tek desen, iki ekran). */
  ourTurn: {
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.md,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.terracotta,
    borderRadius: operationsTheme.radius.badge,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.terracotta,
  },
  footerNote: {
    paddingVertical: operationsTheme.space['2xl'],
    textAlign: 'center',
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  footerRetry: {
    color: operationsTheme.colors.olive,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
  },
});
