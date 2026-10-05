import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import { notificationSentence, notificationTime, notificationTitle, notificationVisual, type NotificationVisualTone } from '@lezzet/i18n';
import notificationsMessages from '@lezzet/i18n/customer/notifications';
import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import type { NotificationRow } from '@lezzet/mobile-kit/src/lib/api/notifications';
import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { LoadingState } from '@lezzet/mobile-kit/src/components/ui/loading-state';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { pullRefreshColors } from '@lezzet/mobile-kit/src/components/ui/pull-refresh';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import { useMe } from '@lezzet/mobile-kit/src/lib/me/use-me.hook';
import messages from './messages.json';
import { notificationHref } from './notification-copy';
import { useNotifications } from './use-notifications.hook';

/*
  Satır metin taşımaz: başlık, cümle, zaman ve görsel kimlik web'in telefon görünümüyle ortak sözlükten (`@lezzet/i18n`) kurulur.
  Dokunuş okundu işaretler ve hedefi açar; gizleme ayrı ve küçük bir hedeftir, satırı listeden ve rozetten düşürür.
*/

type Messages = LocalizedCopy<typeof messages>;
type SharedMessages = LocalizedCopy<typeof notificationsMessages>;

interface NotificationsScreenProps {
  /** Testlerin ve demo hâllerinin kapısı; verilmezse uygulamanın dili. */
  locale?: Locale;
}

export function NotificationsScreen({ locale: forcedLocale }: NotificationsScreenProps) {
  const appLocale = useAppLocale();
  const locale = forcedLocale ?? appLocale;
  const t: Messages = messages[locale];
  const shared: SharedMessages = notificationsMessages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  // Kanal aboneliği profil kimliği ister; kimlik kabuğun her yerinde okunan paylaşılan durumdan gelir.
  const meState = useMe();
  const feed = useNotifications(meState.status === 'ready' && meState.me !== null ? meState.me.id : null);

  // "Tümünü okundu say" yalnız okunmamış varken: işi kalmamış bir eylem çizilmez.
  const header = (
    <View style={styles.header}>
      <View style={styles.backRow}>
        <BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="notifications-back" />
      </View>
      <Text style={styles.eyebrow}>{upperIn(t.eyebrow, locale)}</Text>
      <Text style={styles.title} accessibilityRole="header">
        {shared.title}
      </Text>
      {feed.status === 'ready' && feed.unread > 0 ? (
        <PressableSurface onPress={feed.markAllRead} feedback="opacity" style={styles.markAll} testID="notifications-mark-all">
          <Text style={styles.markAllLabel}>{shared.markAll}</Text>
        </PressableSurface>
      ) : null}
    </View>
  );

  if (feed.status === 'loading') {
    return (
      <View style={styles.screen}>
        <View style={styles.headerPad}>{header}</View>
        <View style={styles.skeletonBody} testID="notifications-loading">
          {/* İskelet gelen kartın yerini tutar: ikon dairesi, başlık ve cümle. */}
          {[0, 1, 2, 3, 4].map((row) => (
            <View key={row} style={[styles.card, styles.cardBody]}>
              <Skeleton width={theme.size.iconButton} height={theme.size.iconButton} radius="full" tone="deep" />
              <View style={styles.texts}>
                <Skeleton width="40%" height={theme.text.note} radius="badge" tone="deep" />
                <Skeleton width={row % 2 === 0 ? '80%' : '60%'} height={theme.text.helper} radius="badge" tone="deep" />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (feed.status === 'guest') {
    return (
      <View style={styles.screen}>
        <View style={styles.headerPad}>{header}</View>
        <EmptyState
          fill
          icon={<Icon name="bell" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
          title={shared.guest.title}
          description={shared.guest.body}
          action={<PrimaryButton label={shared.guest.cta} shape="pill" onPress={() => router.push('/login')} testID="notifications-login" />}
          testID="notifications-guest"
        />
      </View>
    );
  }

  if (feed.status === 'error') {
    return (
      <View style={styles.screen}>
        <View style={styles.headerPad}>{header}</View>
        <EmptyState
          fill
          icon={<Icon name="connection-off" size={theme.size.errorIcon} color={theme.colors['sand-600']} />}
          title={t.error.title}
          description={t.error.body}
          action={<PrimaryButton label={t.error.retry} shape="pill" onPress={feed.retry} testID="notifications-retry" />}
          testID="notifications-error"
        />
      </View>
    );
  }

  if (feed.rows.length === 0) {
    return (
      <View style={styles.screen}>
        <View style={styles.headerPad}>{header}</View>
        <EmptyState
          fill
          icon={<Icon name="bell" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
          title={shared.empty.title}
          description={shared.empty.body}
          testID="notifications-empty"
        />
      </View>
    );
  }

  const listFooter = (
    <View style={styles.footer}>
      {feed.loadingMore ? <LoadingState size="sm" accessibilityLabel={shared.loadMore} testID="notifications-tail-loading" /> : null}
      {!feed.loadingMore && feed.tailFailed ? (
        <PrimaryButton label={shared.loadMore} shape="pill" onPress={feed.loadMore} testID="notifications-tail-retry" />
      ) : null}
      <Text style={styles.prefsNote}>{shared.prefsNote}</Text>
    </View>
  );

  // Ton anlamdır, renk burada temaya çevrilir; web'in telefon görünümüyle aynı aileler.
  const toneBg: Record<NotificationVisualTone, string> = {
    positive: theme.colors['olive-bg'],
    attention: theme.colors['honey-bg'],
    issue: theme.colors['terracotta-bg'],
    neutral: theme.colors['sand-100'],
  };
  const toneText: Record<NotificationVisualTone, string> = {
    positive: theme.colors['olive-dark'],
    attention: theme.colors.honey,
    issue: theme.colors['terracotta-bright'],
    neutral: theme.colors.muted,
  };
  const now = Date.now();

  const renderRow = (row: NotificationRow) => {
    const href = notificationHref(row);
    const visual = notificationVisual(row);
    return (
      <View style={styles.card} testID={`notification-row-${row.id}`}>
        <PressableSurface
          feedback="scale"
          grow
          style={styles.cardBody}
          onPress={() => {
            feed.markRead(row.id);
            if (href !== null) router.push(href as never);
          }}
          testID={`notification-open-${row.id}`}
        >
          <View style={[styles.iconCircle, { backgroundColor: toneBg[visual.tone] }]}>
            <Icon name={visual.symbol} size={theme.size.headerIcon} color={toneText[visual.tone]} />
          </View>
          <View style={styles.texts}>
            <Text style={styles.cardTitle}>{notificationTitle(row, locale)}</Text>
            <Text style={styles.cardSentence}>{notificationSentence(row, locale)}</Text>
            <Text style={styles.cardTime}>{notificationTime(row.createdAt, locale, now)}</Text>
          </View>
          {row.readAt === null ? <View style={styles.unreadDot} testID={`notification-unread-${row.id}`} /> : null}
        </PressableSurface>
        <PressableSurface
          feedback="opacity"
          compact
          style={styles.dismiss}
          onPress={() => feed.dismiss(row.id)}
          accessibilityLabel={shared.dismiss}
          testID={`notification-dismiss-${row.id}`}
        >
          <Icon name="close" size={theme.text['body-sm']} color={theme.colors['sand-600']} />
        </PressableSurface>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={feed.rows}
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => renderRow(item)}
        ItemSeparatorComponent={RowGap}
        ListHeaderComponent={header}
        ListFooterComponent={listFooter}
        contentContainerStyle={styles.content}
        onEndReached={feed.loadMore}
        // Liste eşiği cömertçe tetikler; ikinci kapı kancada (imleç yoksa istek atılmaz).
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={feed.refresh} {...pullRefreshColors(theme.colors.olive)} />}
        testID="notifications-list"
      />
    </View>
  );
}

function RowGap() {
  return <View style={styles.rowGap} />;
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    paddingTop: rt.insets.top,
  },
  content: {
    paddingHorizontal: theme.space['4xl'],
    paddingBottom: theme.space['5xl'],
  },
  headerPad: {
    paddingHorizontal: theme.space['4xl'],
  },
  header: {
    gap: theme.space.xs,
    paddingTop: theme.space['3xl'],
    paddingBottom: theme.space['2xl'],
  },
  backRow: {
    flexDirection: 'row',
    marginLeft: -theme.space['3xl'],
  },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors.terracotta,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    fontSize: theme.text['page-title-sm'],
    color: theme.colors.ink,
  },
  markAll: {
    alignSelf: 'flex-start',
    paddingVertical: theme.space.xs,
  },
  markAllLabel: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
    color: theme.colors.olive,
  },
  skeletonBody: {
    paddingHorizontal: theme.space['4xl'],
    gap: theme.space.lg,
  },
  rowGap: {
    height: theme.space.lg,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.xs,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors['sand-250'],
    paddingVertical: theme.space.xl,
    paddingLeft: theme.space['2xl'],
    paddingRight: theme.space.sm,
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
  },
  iconCircle: {
    width: theme.size.iconButton,
    height: theme.size.iconButton,
    borderRadius: theme.size.iconButton / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: theme.space['2xs'],
  },
  cardTitle: {
    fontFamily: theme.font.body[700],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  cardSentence: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * 1.4,
    color: theme.colors.muted,
  },
  cardTime: {
    marginTop: theme.space['2xs'],
    fontFamily: theme.font.body[600],
    fontSize: theme.text['badge-sm'],
    color: theme.colors['sand-600'],
  },
  unreadDot: {
    width: theme.space.lg,
    height: theme.space.lg,
    borderRadius: theme.space.lg / 2,
    backgroundColor: theme.colors.terracotta,
  },
  dismiss: {
    paddingHorizontal: theme.space.sm,
  },
  footer: {
    alignItems: 'center',
    gap: theme.space['2xl'],
    paddingTop: theme.space['2xl'],
  },
  prefsNote: {
    paddingHorizontal: theme.space.xl,
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    lineHeight: theme.text.micro * 1.5,
    color: theme.colors.muted,
    textAlign: 'center',
  },
}));
