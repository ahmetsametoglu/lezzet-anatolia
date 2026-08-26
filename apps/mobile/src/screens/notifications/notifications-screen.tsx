import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import type { NotificationRow } from '@/lib/api/notifications';
import { BackButton } from '@/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { pullRefreshColors } from '@/components/ui/pull-refresh';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { upperIn } from '@/lib/i18n/locale';
import { useMe } from '@/screens/customer-kit/use-me.hook';
import { formatOrderDate } from '@/screens/orders/order-format';
import messages from './messages.json';
import { notificationHref, notificationSentence } from './notification-copy';
import { useNotifications } from './use-notifications.hook';

/*
  BİLDİRİMLER (14.13'ün ekranı — vitrin zilinin açtığı yer; yer tutucuydu, uca bağlandı).
  Desen puan geçmişinin BİREBİR aynısı: keyset akış, beş hâl (yükleniyor · misafir · hata · boş ·
  liste), kuyruk hataları listeyi düşürmez.

  ── SATIR CÜMLESİ EKRANDA KURULUR ───────────────────────────────────────────
  Uç `kind` + dil-bağımsız `payload` gönderir (metin taşımaz — 14.12); cümle `notification-copy`de,
  üç dil. BİLİNMEYEN tür genel cümleye düşer: `kind` kümesi sunucuda büyür ve eski uygulama
  sürümü yeni türü boş satırla değil, "bir gelişme var" ile karşılar.

  ── DOKUNUŞ = OKU + GİT; ✕ = GİZLE ─────────────────────────────────────────
  Satıra dokunmak okundu işaretler ve hedefi açar (sipariş → referansla, talep → kimlikle — rota
  sözleşmeleri `notification-copy` künyesinde). Gidecek yeri olmayan satırda dokunuş yalnız okur.
  Gizleme ayrı ve KÜÇÜK bir hedef: listeden ve rozetten düşürür ama satır sunucuda durur
  ("akış ≠ gelen kutusu" — okunan satır listede kalır, gizlenen kalkar).

  ── OKUNMAMIŞLIK YALNIZ NOKTADAN OKUNMAZ ────────────────────────────────────
  Nokta + kalın metin birlikte: renk körlüğünde okunmuşu ayıran tek şey renk olamaz (puan
  ekranının +/− kararının aynısı).
*/

type Messages = LocalizedCopy<typeof messages>;

interface NotificationsScreenProps {
  /** Testlerin ve demo hâllerinin kapısı; verilmezse uygulamanın dili (sipariş ekranının deseni). */
  locale?: Locale;
}

export function NotificationsScreen({ locale: forcedLocale }: NotificationsScreenProps) {
  const appLocale = useAppLocale();
  const locale = forcedLocale ?? appLocale;
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  /* Kanal aboneliği profil kimliği ister (doğal sır); `useMe` zaten kabuğun her yerinde okunuyor —
     ikinci bir kimlik çağrısı değil, aynı paylaşılan durumun bir okuması daha. */
  const meState = useMe();
  const feed = useNotifications(meState.status === 'ready' && meState.me !== null ? meState.me.id : null);

  /* HEADER: "sayfa başlığı" durağı (üç header kuralı — puan geçmişinin aynısı). "Tümünü okundu
     say" başlığın altında ve YALNIZ okunmamış varken: işi kalmamış bir eylem çizilmez. */
  const header = (
    <View style={styles.header}>
      <View style={styles.backRow}>
        <BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="notifications-back" />
      </View>
      <Text style={styles.eyebrow}>{upperIn(t.eyebrow, locale)}</Text>
      <Text style={styles.title} accessibilityRole="header">
        {t.title}
      </Text>
      {feed.status === 'ready' && feed.unread > 0 ? (
        <PressableSurface onPress={feed.markAllRead} feedback="opacity" style={styles.markAll} testID="notifications-mark-all">
          <Text style={styles.markAllLabel}>{t.markAll}</Text>
        </PressableSurface>
      ) : null}
    </View>
  );

  if (feed.status === 'loading') {
    return (
      <View style={styles.screen}>
        <View style={styles.headerPad}>{header}</View>
        <View style={styles.skeletonBody} testID="notifications-loading">
          {[0, 1, 2, 3, 4].map((row) => (
            <View key={row} style={styles.skeletonRow}>
              <Skeleton width="75%" height={theme.text.note} radius="badge" />
              <Skeleton width="30%" height={theme.text.micro} radius="badge" tone="soft" />
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
          icon={<Icon name="account" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
          title={t.guest.title}
          description={t.guest.body}
          action={<PrimaryButton label={t.guest.cta} shape="pill" onPress={() => router.push('/login')} testID="notifications-login" />}
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
          title={t.empty.title}
          description={t.empty.body}
          testID="notifications-empty"
        />
      </View>
    );
  }

  const listFooter = () => {
    if (feed.loadingMore) {
      return (
        <View style={styles.tail}>
          <LoadingState size="sm" accessibilityLabel={t.tailRetry} testID="notifications-tail-loading" />
        </View>
      );
    }
    if (feed.tailFailed) {
      return (
        <View style={styles.tail}>
          <PrimaryButton label={t.tailRetry} shape="pill" onPress={feed.loadMore} testID="notifications-tail-retry" />
        </View>
      );
    }
    return null;
  };

  const renderRow = (row: NotificationRow) => {
    const unread = row.readAt === null;
    const href = notificationHref(row);
    return (
      <View style={styles.row} testID={`notification-row-${row.id}`}>
        <PressableSurface
          feedback="opacity"
          style={styles.rowBody}
          onPress={() => {
            feed.markRead(row.id);
            if (href !== null) router.push(href as never);
          }}
          testID={`notification-open-${row.id}`}
        >
          <View style={styles.rowLine}>
            {unread ? <View style={styles.unreadDot} /> : null}
            <Text style={unread ? styles.sentenceUnread : styles.sentence}>{notificationSentence(row, locale)}</Text>
          </View>
          <Text style={styles.date}>{formatOrderDate(row.createdAt, locale)}</Text>
        </PressableSurface>
        <PressableSurface
          feedback="opacity"
          style={styles.dismiss}
          onPress={() => feed.dismiss(row.id)}
          accessibilityLabel={t.dismiss}
          testID={`notification-dismiss-${row.id}`}
        >
          <Icon name="close" size={theme.text.micro} color={theme.colors['sand-600']} />
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
        ListHeaderComponent={header}
        ListFooterComponent={listFooter()}
        contentContainerStyle={styles.content}
        onEndReached={feed.loadMore}
        // `FlatList` eşiği cömertçe tetikler; ikinci kapı hook'ta (imleç yoksa istek atılmaz).
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={feed.refresh} {...pullRefreshColors(theme.colors.olive)} />}
        testID="notifications-list"
      />
    </View>
  );
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
    gap: theme.space['2xl'],
    paddingTop: theme.space.lg,
  },
  skeletonRow: {
    gap: theme.space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.md,
    paddingVertical: theme.space.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors['sand-200'],
  },
  rowBody: {
    flex: 1,
    gap: theme.space['2xs'],
  },
  rowLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  unreadDot: {
    width: theme.space.sm,
    height: theme.space.sm,
    borderRadius: theme.space.sm / 2,
    backgroundColor: theme.colors.terracotta,
  },
  sentence: {
    flex: 1,
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    color: theme.colors['sand-600'],
  },
  sentenceUnread: {
    flex: 1,
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  date: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors['sand-600'],
  },
  /** Gizleme küçük ama DOKUNULUR hedef: satır dokunuşuyla karışmasın diye kendi yüzeyi var. */
  dismiss: {
    padding: theme.space.sm,
    marginTop: theme.space['2xs'],
  },
  tail: {
    paddingVertical: theme.space['2xl'],
    alignItems: 'center',
  },
}))
