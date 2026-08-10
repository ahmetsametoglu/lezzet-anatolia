import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { pullRefreshColors } from '@/components/ui/pull-refresh';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextAction } from '@/components/ui/text-action';
import type { TicketSummary } from '@/lib/api/tickets';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { publishToast } from '@/lib/toast/toast-store';
import { NewTicketSheet } from './new-ticket-sheet';
import { ticketMeta, ticketScope, ticketTitle } from './ticket-format';
import { TicketStatusTag } from './ticket-status-tag';
import { TicketsSkeleton } from './tickets-skeleton';
import messages from './messages.json';
import { useTickets } from './use-tickets.hook';

/*
  TALEPLERİM (v3 `vTalepler`) — GERÇEK UÇTAN okur (`GET /api/v1/me/tickets`): misafir kapısı,
  iskelet, ağ hatası, boş durum ve talep kartları.

  ── SONSUZ KAYDIRMA ─────────────────────────────────────────────────────────
  Talep sayısı veriyle SINIRSIZ büyür → keyset + sonsuz kaydırma; imleç hiçbir yere yazılmaz
  (CLAUDE §1). Kuyruk hatası listeyi DÜŞÜRMEZ: satırlar yerinde kalır, sona tekrar-dene çıkar
  (siparişler listesinin aynı ayrımı — "hiç veri yok" ≠ "devamı gelmedi").

  ── YENİ TALEP BURADA AÇILIR (kullanıcı kararı 09.08) ───────────────────────
  "Bize yazın" ayrı bir sayfa DEĞİL, bu ekranın ÇEKMECESİDİR (`NewTicketSheet`): hem başlıktaki
  "＋ Yeni" hem boş durumun birincil düğmesi aynı çekmeceyi açar. Gönderim başarılıysa çekmece
  kapanır, liste tazelenir (uç yalnız kimlik döndürüyor — yeni talep ancak tazelemeyle görünür) ve
  onay toast'la söylenir. Sipariş detayından gelen `?order=` da buraya düşer ve çekmeceyi doğrudan
  o siparişle açar (rota kabuğu `app/support/new.tsx` yönlendiriyor).

  ── ŞABLONDAN SAPMALAR (hepsi bilinçli) ─────────────────────────────────────
  1. **Kart adı "tür · konu"** (v3 yalnız türü yazıyor): `subject` personelin elle açtığı talepte
     dolu gelir ve o zaman üç satırın üçü de "Eksik ürün" derdi. Kural tek yerde (`ticket-format`).
  2. **Alt satırda "son mesaj"** — gerekçe `ticketMeta` künyesinde (liste son mesaja göre sıralı).
  3. **İskelet ve ağ hatası ÇİZİLDİ** (şablonda yok/kutulu): önceki etapta bu ekranda ağ yoktu,
     bugün var. Hata bloğu katalog/sipariş ekranlarının `EmptyState` + `connection-off` kalıbı —
     aynı arıza üç ekranda üç ayrı görünüme sahip olmasın.
  4. **Kart bütünüyle basılabilir** (şablon üç ayrı bloğu tek tek bağlıyor): ekran okuyucuya tek
     satır olarak gider.
*/

type Messages = LocalizedCopy<typeof messages>;

/* Skeleton kart sayısı artık `tickets-skeleton`ın kendi sabiti; yükseklik ise hiç yazılmıyor —
   kartın yapısı kurulunca kendiliğinden çıkıyor (o dosyanın künyesi). */

interface TicketsScreenProps {
  /**
   * Sipariş detayından gelindiyse siparişin numarası — çekmece doğrudan o siparişle açılır.
   * Verildiği anda çekmece de AÇIK başlar: müşteri "bize yazın" dedi, listeyi görmek istemedi.
   */
  orderReference?: string;
  /** Çekmece açık başlasın mı (rota kabuğunun `?new=1` işareti). */
  openNew?: boolean;
  /** Testlerin ve demo hâllerinin kapısı; verilmezse uygulamanın dili (`useAppLocale`). */
  locale?: Locale;
}

export function TicketsScreen({ orderReference, openNew = false, locale: forcedLocale }: TicketsScreenProps) {
  const appLocale = useAppLocale();
  const locale = forcedLocale ?? appLocale;
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const tickets = useTickets();
  const [sheetOpen, setSheetOpen] = useState(openNew || orderReference !== undefined);

  const bar = (
    <AppBar
      title={t.list.title}
      left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="tickets-back" />}
      right={
        <TextAction
          label={t.list.new}
          onPress={() => setSheetOpen(true)}
          accessibilityHint={t.list.newLabel}
          testID="tickets-new"
        />
      }
      testID="tickets-appbar"
    />
  );

  /* Çekmece KAPALIYKEN ÇİZİLMEZ (komponentin kendi künyesi): her açılış temiz taslakla başlar ve
     kapalı çekmece sipariş listesi için ağa çıkmaz. Ekranın hangi hâlde olduğundan bağımsız —
     boş listeden de, dolu listeden de aynı çekmece açılır. */
  const sheet = sheetOpen ? (
    <NewTicketSheet
      locale={locale}
      orderReference={orderReference}
      onClose={() => setSheetOpen(false)}
      onCreated={() => {
        setSheetOpen(false);
        tickets.refresh();
        publishToast(t.new.sentToast);
      }}
    />
  ) : null;

  /* Misafir · iskelet · hata · boş — dördü de listenin YERİNE geçer: hiçbirinde kaydırılacak bir
     satır yok ve `FlatList` kabuğu boşuna kurulmaz. */
  if (tickets.status === 'guest') {
    /* Çekmece MİSAFİRE açılmaz, işaretle gelinmiş olsa bile: talep açmak oturum ister ve form
       gönderim anında 401 alırdı. Doğru cevap kapının kendisi. */
    return (
      <View style={styles.screen}>
        {bar}
        <EmptyState
          icon={<Icon name="whatsapp" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
          title={t.guest.title}
          description={t.guest.body}
          action={
            <PrimaryButton label={t.guest.cta} shape="pill" onPress={() => router.push('/login')} testID="tickets-login" />
          }
          testID="tickets-guest"
        />
      </View>
    );
  }

  /* İLK YÜK: başlık GERÇEK kalır (geri düğmesi ve "Yeni talep" bağlantısı çalışır), kartların
     yerini skeleton tutar. Blok ekrandan `tickets-skeleton`a taşındı: kartın içi tanınmıyordu ve
     yüksekliği tek ham sayıydı. Çekmece yine çizilir — açık gelmiş olabilir (`openNew`). */
  if (tickets.status === 'loading') {
    return (
      <View style={styles.screen}>
        {bar}
        <View style={styles.skeletonBody}>
          <TicketsSkeleton testID="tickets-loading" />
        </View>
        {sheet}
      </View>
    );
  }

  if (tickets.status === 'error') {
    return (
      <View style={styles.screen}>
        {bar}
        <EmptyState
          icon={<Icon name="connection-off" size={theme.size.errorIcon} color={theme.colors['sand-600']} />}
          title={t.error.title}
          description={t.error.body}
          action={<PrimaryButton label={t.error.retry} shape="pill" onPress={tickets.retry} testID="tickets-retry" />}
          testID="tickets-error"
        />
        {sheet}
      </View>
    );
  }

  if (tickets.tickets.length === 0) {
    return (
      <View style={styles.screen}>
        {bar}
        <EmptyState
          icon={<Icon name="whatsapp" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
          title={t.list.empty.title}
          description={t.list.empty.body}
          action={
            <PrimaryButton
              label={t.list.empty.cta}
              shape="pill"
              onPress={() => setSheetOpen(true)}
              testID="tickets-empty-cta"
            />
          }
          testID="tickets-empty"
        />
        {sheet}
      </View>
    );
  }

  /** Listenin kuyruğu: yükleniyor · düştü · bitti — üçü ayrı şey, üçü ayrı gösterilir. */
  const listFooter = () => {
    if (tickets.loadingMore) {
      return (
        <View style={styles.tail}>
          <LoadingState size="sm" label={t.list.loading} accessibilityLabel={t.list.loading} testID="tickets-tail-loading" />
        </View>
      );
    }
    if (tickets.tailFailed) {
      return (
        <View style={styles.tail}>
          <PrimaryButton label={t.list.tailRetry} shape="pill" onPress={tickets.loadMore} testID="tickets-tail-retry" />
        </View>
      );
    }
    if (!tickets.hasMore) return <Text style={styles.tailNote}>{t.list.end}</Text>;
    return null;
  };

  const renderTicket = (ticket: TicketSummary) => {
    const title = ticketTitle(t.type[ticket.type], ticket.subject, t.list.withSubject);
    const scope = ticketScope(ticket.orderReference, t.list.orderScope, t.list.generalScope);

    return (
      <PressableSurface
        onPress={() => router.push({ pathname: '/support/[ticket]', params: { ticket: ticket.id } })}
        feedback="opacity"
        style={styles.card}
        accessibilityLabel={t.list.open.replace('{type}', title)}
        testID={`ticket-${ticket.id}`}
      >
        <View style={styles.cardText}>
          <Text style={styles.type} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.meta}>{ticketMeta(ticket, scope, t.list.lastMessage, locale)}</Text>
        </View>
        <TicketStatusTag status={ticket.status} label={t.status[ticket.status]} testID={`ticket-${ticket.id}-status`} />
        {/* İşaret METİNDİR (kitteki `NavRow` ile aynı): satırın kendisi zaten düğme. */}
        <View style={styles.chevronBox}>
          <Text style={styles.chevron}>›</Text>
        </View>
      </PressableSurface>
    );
  };

  return (
    <View style={styles.screen}>
      {bar}
      <FlatList
        data={tickets.tickets}
        keyExtractor={(ticket) => ticket.id}
        renderItem={({ item }) => renderTicket(item)}
        ListFooterComponent={listFooter()}
        contentContainerStyle={styles.content}
        onEndReached={tickets.loadMore}
        // `FlatList` eşiği cömertçe tetikler; ikinci kapı hook'ta (imleç yoksa istek atılmaz).
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={tickets.refreshing} onRefresh={tickets.refresh} {...pullRefreshColors(theme.colors.olive)} />
        }
        testID="tickets-list"
      />
      {sheet}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
  },
  content: {
    padding: theme.space['4xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
    gap: theme.space.lg,
  },
  skeletonBody: {
    padding: theme.space['4xl'],
    gap: theme.space.lg,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
    paddingVertical: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
  },
  cardText: { flex: 1, gap: theme.space['2xs'] },
  type: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  meta: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
  chevronBox: { justifyContent: 'center' },
  chevron: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['icon-sm'],
    lineHeight: theme.text['icon-sm'],
    color: theme.colors['sand-600'],
  },
  tail: {
    alignItems: 'center',
    paddingTop: theme.space.lg,
  },
  tailNote: {
    paddingTop: theme.space.lg,
    textAlign: 'center',
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
}));
