import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { ConversationSourceEnum, type ConversationSource } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PressableSurface } from '@/components/ui/pressable-surface';
import type { SocialRow } from '@/lib/api/social';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { managementCopy } from './copy';
import { socialInitials, socialPreview, socialStamp, socialTitle } from './social-format';
import { useSocialInbox, type ChannelFilter } from './use-social-inbox.hook';

/*
  SOSYAL GELEN KUTUSU (Operasyon Mobil v3:2179-2227) — üç Meta kanalı tek listede, son harekete
  göre sıralı, keyset sayfalı; web `/operations/social` kuyruğunun mobil aynası (15.15).

  ── v3 SATIRI KART YAPTI (30.08) ────────────────────────────────────────────
  v2 satırları alt çizgiyle ayrılmış düz bir listeydi; v3 her sohbeti kendi çerçevesine aldı ve
  ayrımı ÇİZGİDEN değil BOŞLUKTAN kurdu. Kazanç görsel değil işlevsel: çerçeve artık bir durum
  taşıyabiliyor — cevap bekleyen sohbetin çerçevesi ZEYTİN, ötekilerinki kum. Kuyrukta gözün
  aradığı şey tam olarak budur ("kim cevap bekliyor").

  ── BAŞ HARF KARESİ GELDİ, RENGİ KANALIN ───────────────────────────────────
  v3 satırın soluna 34'lük bir baş harf karesi koyuyor ve onu duruma göre boyuyor. Bizde karenin
  rengi KANALIN markasıdır (v2'nin sol kenar çubuğundan devralındı): v3'ün satırında kanal hiçbir
  yerde görünmüyor ve üç kanalın birleştiği bir kuyrukta "nereden yazdı" sorusu kaybolurdu. Durum
  ise zaten çerçevede. Böylece iki bilgi iki ayrı yerde durur, ikisi de kaybolmaz.

  ── "TASLAK ONAY BEKLİYOR" ROZETİ ──────────────────────────────────────────
  v3:2205'in rozeti sözleşmede KARŞILIĞI OLAN bir şeydir: kuyruk satırı hibrit modun bekleyen
  taslağını taşıyor (`aiDraftReply`). Rozet o alan doluyken çizilir — operatör hangi sohbette
  onayının beklendiğini listeyi açmadan görür.

  ── İKİ SÜZGEÇ EKSENİ KALDI (tasarımdan bilinçli sapma) ────────────────────
  v3 yalnız KANAL çiplerini çiziyor (v3:2189). "Cevap bekleyen" ekseni silinmedi: uç onu destekliyor
  (`filter=awaiting`), ekranın sayacı onu sayıyor ve "cevap bekleyen Messenger sohbetleri" meşru bir
  sorudur (bu ekranın kendi test künyesi). Çizilmeseydi çalışan bir kapı ve onu besleyen uç
  parametresi ölü kod olarak kalırdı.

  Kuyruğun üç kuyruk hâli (yükleniyor · düştü · bitti) footer'da — `nextCursor` üretilip
  TÜKETİLİYOR (CLAUDE §1: sayfalayan okumanın tüketeni olmalı).
*/

const t = managementCopy.social;

/** Kanal → baş harf karesinin zemini. Token'dan (CLAUDE §3) — `operationsTheme` markaları yayar. */
const CHANNEL_TINT = {
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
      style={[styles.row, item.awaitingReply ? styles.rowAwaiting : styles.rowIdle]}
      /* Çerçevenin rengi ekran okuyucuya ulaşmaz — "top bizde" o yüzden ada EKLENİR. Görünür
         rozeti kaldırmak, sesli okumadan da kaldırmak anlamına gelmemeli. */
      accessibilityLabel={
        item.awaitingReply ? `${socialTitle(item)} — ${managementCopy.common.ourTurn}` : socialTitle(item)
      }
      testID={`management-social-row-${item.id}`}
    >
      <View style={[styles.avatar, { backgroundColor: CHANNEL_TINT[item.source] }]}>
        <Text style={styles.avatarText}>{socialInitials(item)}</Text>
      </View>
      <View style={styles.rowText}>
        <View style={styles.rowHead}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {socialTitle(item)}
          </Text>
          <Text style={styles.rowStamp}>{socialStamp(item.lastMessageAt)}</Text>
        </View>
        <Text style={styles.rowPreview} numberOfLines={1}>
          {socialPreview(item, t.kind)}
        </Text>
        {item.aiDraftReply === null ? null : (
          <Text style={styles.draftBadge} testID={`management-social-draft-${item.id}`}>
            {t.draftBadge}
          </Text>
        )}
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
  /* v3:2189 — çip 38 dp yüksekliğinde bir KONTROL, satır içi bir etiket değil: dolgusu o yüzden
     büyüdü. Dokunma hedefi `compact` payıyla zaten 44'e tamamlanıyordu; değişen görsel ağırlık. */
  chip: {
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['2xl'],
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
    /* Satırları AYIRAN şey artık çizgi değil boşluk (v3): her sohbet kendi kartında duruyor. */
    gap: operationsTheme.space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['2xl'],
    backgroundColor: operationsTheme.colors.panel,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
  },
  /** Cevap bekleyen sohbetin çerçevesi ZEYTİN — kuyrukta gözün aradığı tek şey (v3:2192). */
  rowAwaiting: {
    borderColor: operationsTheme.colors.olive,
  },
  rowIdle: {
    borderColor: operationsTheme.colors['sand-300'],
  },
  /** Baş harf karesi — zemini KANALIN markası, harfleri krem (`social-format` künyesi). */
  avatar: {
    width: operationsTheme.size.listAvatar,
    height: operationsTheme.size.listAvatar,
    borderRadius: operationsTheme.radius.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors['on-image'],
  },
  rowText: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
  },
  rowTitle: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  rowPreview: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.body,
  },
  rowStamp: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  /** "TASLAK ONAY BEKLİYOR" — yalnız bekleyen YZ taslağı olan satırda (v3:2205). */
  draftBadge: {
    alignSelf: 'flex-start',
    marginTop: operationsTheme.space['2xs'],
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.md,
    borderRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
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
