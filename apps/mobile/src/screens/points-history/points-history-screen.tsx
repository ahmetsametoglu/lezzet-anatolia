import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { PointsReason } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BackButton } from '@/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { LoadingState } from '@/components/ui/loading-state';
import { PrimaryButton } from '@/components/ui/primary-button';
import { pullRefreshColors } from '@/components/ui/pull-refresh';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import messages from './messages.json';
import { groupPointsHistory, type PointsHistoryGroup } from './points-history-group';
import { usePointsHistory } from './use-points-history.hook';

/*
  PUAN GEÇMİŞİ (MB-59 · kullanıcı isteği 15.08) — *"hangi puan nereden geldi konusunu da
  gösterebileceğimiz bir bölümümüz olmalı."*

  ── NEDEN AYRI EKRAN, HESAP KARTININ İÇİNDE BİR LİSTE DEĞİL ─────────────────
  Defter veriyle SINIRSIZ büyüyor (CLAUDE §1) ve sonsuz kaydırma istiyor; hesap kartının içine
  konsaydı ya ilk birkaç satırla kesilir (kullanıcının istediği "nereden geldi" sorusunu tam
  yanıtlamaz) ya da hesap ekranını her açılışta defter okumaya mecbur ederdi. Kart bir ÖZETTİR,
  geçmiş bir ARŞİV.

  ── EN BÜYÜK İKİ ÖDÜLÜN GÖRÜNDÜĞÜ TEK YER BURASI ────────────────────────────
  `referral` (500) ve `neighbor` (100) başkasının eylemiyle doğuyor — davet edilen kişi parasını
  ödediğinde — ve müşteri o an uygulamada değil, yani gösterilebilecek bir "sonuç sayfası" yok.
  Günlük ziyaret puanı da bilinçli sessiz yazılıyor (karar 11.08). Üçünün de müşteriye görünür
  olduğu ilk yer bu ekran.

  ── SEBEP CÜMLESİ EKRANDA KURULUR ───────────────────────────────────────────
  Sunucu ANAHTAR gönderiyor (`PointsReason`), cümle burada — i18n istemcide, üç dil
  (`points-earn-list`in aynı kararı). Küme TAM: `redemption` ve `manual` da var, çünkü geçmiş
  "program neyle ödüllendirir" sorusunu değil "defterde ne var" sorusunu yanıtlıyor.
  `Record` derlemede tam kapsam ister — defter yeni bir sebep öğrenirse burası DERLENMEZ, eksik
  çizmez.

  ── TARİH BİÇİMİ ORTAK ──────────────────────────────────────────────────────
  `formatOrderDate` altı ekranın zaten paylaştığı kapı; ikinci bir `Intl` tablosu açmak duplikasyon
  olurdu (CLAUDE §1). O dosyanın `@lezzet/helper`a terfi borcu kendi künyesinde kayıtlı.
*/

type Messages = LocalizedCopy<typeof messages>;

interface PointsHistoryScreenProps {
  /** Testlerin ve demo hâllerinin kapısı; verilmezse uygulamanın dili (sipariş ekranının deseni). */
  locale?: Locale;
}

export function PointsHistoryScreen({ locale: forcedLocale }: PointsHistoryScreenProps) {
  const appLocale = useAppLocale();
  const locale = forcedLocale ?? appLocale;
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const history = usePointsHistory();

  /* HEADER: "sayfa başlığı" durağı — `‹` kendi satırında → eyebrow → 26px başlık
     (`design/KARARLAR.md` 16.08, "üç header" kuralı). Ölçüt: kaydırırken erişilebilir kalması
     gereken bir eylem YOK, yani bu bir bölüm girişi — siparişlerle aynı aile.

     BU EKRAN KURALIN NEDEN YAZILDIĞININ KANITI: ilk hâlinde başlık + ALT BAŞLIK vardı ve bu
     dördüncü bir varyanttı — kural yazılı olmadığı için uydurulmuştu. Alt başlık ("Hangi puan
     nereden geldi") kaldırıldı; sözü listenin kendisi zaten veriyor. */
  const header = (
    <View style={styles.header}>
      <View style={styles.backRow}>
        <BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="points-history-back" />
      </View>
      <Text style={styles.eyebrow}>{t.eyebrow.toLocaleUpperCase('tr-TR')}</Text>
      <Text style={styles.title} accessibilityRole="header">
        {t.title}
      </Text>
    </View>
  );

  /* Beş hâl de listenin YERİNE geçer, içine değil: hiçbirinde kaydırılacak satır yok ve `FlatList`
     kabuğu boşuna kurulmaz (sipariş ekranının kararı). Boş hâller `fill` ile ORTALANIR — kullanıcı
     kararı 15.08, tam-ekran boş hâlin yerleşimi. */
  if (history.status === 'loading') {
    return (
      <View style={styles.screen}>
        <View style={styles.headerPad}>{header}</View>
        <View style={styles.skeletonBody} testID="points-history-loading">
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <View key={row} style={styles.skeletonRow}>
              <View style={styles.skeletonText}>
                <Skeleton width="60%" height={theme.text.note} radius="badge" />
                <Skeleton width="35%" height={theme.text.micro} radius="badge" tone="soft" />
              </View>
              <Skeleton width={56} height={theme.text.note} radius="badge" />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (history.status === 'guest') {
    return (
      <View style={styles.screen}>
        <View style={styles.headerPad}>{header}</View>
        <EmptyState
          fill
          icon={<Icon name="account" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
          title={t.guest.title}
          description={t.guest.body}
          action={<PrimaryButton label={t.guest.cta} shape="pill" onPress={() => router.push('/login')} testID="points-history-login" />}
          testID="points-history-guest"
        />
      </View>
    );
  }

  /* PROGRAM DIŞI (B2B) — "hiç hareketiniz yok" DEĞİL, "bu program size açık değil". Eylem yok:
     müşterinin yapabileceği bir şey yok ve bir düğme koymak onu boşa gezdirirdi. */
  if (history.status === 'denied') {
    return (
      <View style={styles.screen}>
        <View style={styles.headerPad}>{header}</View>
        <EmptyState
          fill
          icon={<CustomerIcon name="lock" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
          title={t.denied.title}
          description={t.denied.body}
          testID="points-history-denied"
        />
      </View>
    );
  }

  if (history.status === 'error') {
    return (
      <View style={styles.screen}>
        <View style={styles.headerPad}>{header}</View>
        <EmptyState
          fill
          icon={<Icon name="connection-off" size={theme.size.errorIcon} color={theme.colors['sand-600']} />}
          title={t.error.title}
          description={t.error.body}
          action={<PrimaryButton label={t.error.retry} shape="pill" onPress={history.retry} testID="points-history-retry" />}
          testID="points-history-error"
        />
      </View>
    );
  }

  if (history.entries.length === 0) {
    return (
      <View style={styles.screen}>
        <View style={styles.headerPad}>{header}</View>
        <EmptyState
          fill
          icon={<CustomerIcon name="star" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
          title={t.empty.title}
          description={t.empty.body}
          action={<PrimaryButton label={t.empty.cta} shape="pill" onPress={() => router.push('/account')} testID="points-history-earn" />}
          testID="points-history-empty"
        />
      </View>
    );
  }

  /* Birleştirme ÇİZİM anında, veri katmanında değil (dosyanın künyesi): hook defterin ham
     satırlarını taşır, ekran onları okunur hâle getirir. Kuyruk geldikçe TÜM birikmiş liste
     yeniden gruplanır — sayfa sınırına düşen bir grup böylece kendiliğinden tamamlanır. */
  const groups = groupPointsHistory(history.entries, locale);

  /** Kuyruk: yükleniyor · düştü · bitti — üçü ayrı şey (sipariş listesinin kararı). */
  const listFooter = () => {
    if (history.loadingMore) {
      return (
        <View style={styles.tail}>
          <LoadingState size="sm" accessibilityLabel={t.tailRetry} testID="points-history-tail-loading" />
        </View>
      );
    }
    if (history.tailFailed) {
      return (
        <View style={styles.tail}>
          <PrimaryButton label={t.tailRetry} shape="pill" onPress={history.loadMore} testID="points-history-tail-retry" />
        </View>
      );
    }
    return null;
  };

  const renderGroup = (group: PointsHistoryGroup) => {
    const earned = group.points >= 0;
    return (
      <View style={styles.row} testID={`points-history-row-${group.id}`}>
        <View style={styles.rowText}>
          <Text style={styles.reason}>{reasonLabel(t, group.reason)}</Text>
          {/* Sayı YALNIZ birden çoksa yazılır: "1 hareket" demek, hiçbir şey söylemeden satırı
              kalabalıklaştırmaktır. */}
          <Text style={styles.date}>
            {group.count === 1 ? group.date : `${group.date} · ${t.count.replace('{n}', String(group.count))}`}
          </Text>
        </View>
        {/* İŞARET RENKTEN DE OKUNUR ama YALNIZ renkten değil: rakamın önünde `+`/`−` duruyor.
            Renk körlüğünde kazanım ile harcamayı ayıran tek şey renk olamaz (web kartının aynı
            kararı, orada da işaret yazılıyor). Eksi işareti `−` (U+2212), tire değil: rakamla aynı
            yükseklikte durur. */}
        <Text style={earned ? styles.plus : styles.minus}>
          {earned ? '+' : '−'}
          {Math.abs(group.points)}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={groups}
        keyExtractor={(group) => group.id}
        renderItem={({ item }) => renderGroup(item)}
        ListHeaderComponent={header}
        ListFooterComponent={listFooter()}
        contentContainerStyle={styles.content}
        onEndReached={history.loadMore}
        // `FlatList` eşiği cömertçe tetikler; ikinci kapı hook'ta (imleç yoksa istek atılmaz).
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={history.refreshing}
            onRefresh={history.refresh}
            {...pullRefreshColors(theme.colors.olive)}
          />
        }
        testID="points-history-list"
      />
    </View>
  );
}

/**
 * Sebebin müşteri cümlesi — küme TAM (`Record`), yani defter yeni bir sebep öğrenirse burası
 * derlemede kırılır ve eksik çizmez.
 */
function reasonLabel(t: Messages, reason: PointsReason): string {
  const labels: Record<PointsReason, string> = t.reason;
  return labels[reason];
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
  /** Boş/hata dallarında listenin kaydırma dolgusu yok; başlık onu sarmalayıcıdan alır. */
  headerPad: {
    paddingHorizontal: theme.space['4xl'],
  },
  header: {
    gap: theme.space.xs,
    paddingTop: theme.space['3xl'],
    paddingBottom: theme.space['2xl'],
  },
  /** Geri düğmesi: glif başlıkla hizalanır — künyesi sipariş ekranında (16.08 hizalama kararı). */
  backRow: {
    flexDirection: 'row',
    marginLeft: -theme.space['3xl'],
  },
  /** Eyebrow — siparişler ekranının ölçüleriyle BİREBİR (aynı header durağı, tek görünüm). */
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors.terracotta,
  },
  title: {
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    fontSize: theme.text['page-title-sm'],
    color: theme.colors.ink,
  },
  /* SATIR KUTU DEĞİL: hareketler bir liste, kart yığını değil — her satıra zemin ve çerçeve
     vermek 200 satırlık bir arşivi okunamaz kılardı. Ayrım ince bir çizgiyle. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.xl,
    paddingVertical: theme.space.xl,
    borderBottomWidth: theme.border.hairline,
    borderBottomColor: theme.colors['sand-300'],
  },
  rowText: {
    flex: 1,
    gap: theme.space['2xs'],
  },
  reason: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  date: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
  },
  /** Kazanım zeytin, harcama terracotta — tutarın YANINDA işaret de var (renk tek ayırt edici değil). */
  plus: {
    fontFamily: theme.font.body[700],
    fontSize: theme.text.note,
    color: theme.colors['olive-dark'],
  },
  minus: {
    fontFamily: theme.font.body[700],
    fontSize: theme.text.note,
    color: theme.colors.terracotta,
  },
  tail: {
    paddingVertical: theme.space['3xl'],
    alignItems: 'center',
  },
  skeletonBody: {
    paddingHorizontal: theme.space['4xl'],
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.xl,
    paddingVertical: theme.space.xl,
    borderBottomWidth: theme.border.hairline,
    borderBottomColor: theme.colors['sand-300'],
  },
  skeletonText: {
    flex: 1,
    gap: theme.space['2xs'],
  },
}));
