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
import { upperIn } from '@/lib/i18n/locale';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import messages from './messages.json';
import { groupPointsHistory, type PointsHistoryGroup } from './points-history-group';
import { usePoints } from '@/screens/account/use-points.hook';
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
  /* Kart ile defter AYRI uçlar ve ayrı kalmaları bilinçli (sözleşme künyesi: kartın tavanı sabit,
     defter sınırsız büyüyor). Bu ekran ikisini de okur çünkü müşterinin buraya getiren sorusu tek
     değil: *"hangi puan nereden geldi"* defterin işi, *"kaç puanım var"* kartın. Bakiyeyi görmek
     için hesap ekranına dönmek zorunda kalmak MB-67'nin ta kendisiydi. */
  const points = usePoints(true);
  const card = points.view?.points ?? null;
  const pending = card?.pendingNeighborAwards ?? [];
  const neighborPoints = card?.earnWays.find((way) => way.key === 'neighbor')?.points ?? null;

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
      <Text style={styles.eyebrow}>{upperIn(t.eyebrow, locale)}</Text>
      <Text style={styles.title} accessibilityRole="header">
        {t.title}
      </Text>

      {/* BAKİYE BAŞLIKTA (MB-67): ekran müşterinin *"puanlarım nerede"* diye geldiği yer ve tek
          satırlık bir defterin altında koca bir boşluk bırakıyordu. Kart okunmadan çizilmez —
          "0 puan" gösterip sonra gerçek sayıya atlamak, olmayan bir bakiyeyi bir an doğru gibi
          okuturdu (CLAUDE §1: ölçülemeyen değer sıfır değildir). */}
      {card === null ? null : (
        <View style={styles.balanceRow} testID="points-history-balance">
          <Text style={styles.balanceLabel}>{t.pending.balance}</Text>
          <Text style={styles.balanceValue}>{card.balance}</Text>
        </View>
      )}

      {/* YOLDA (★ karar 3): defterde KARŞILIĞI YOK ve olmamalı — bekleyen ödül henüz yazılmadı.
          O yüzden listeye satır olarak karışmıyor, listenin ÜSTÜNDE ayrı bir blok olarak duruyor:
          sanal bir satır hem tarih sırasını hem bakiyenin toplamını yalan söyletirdi. */}
      {pending.length === 0 || neighborPoints === null ? null : (
        <View style={styles.pendingCard} testID="points-history-pending">
          <Text style={styles.pendingTitle}>{t.pending.title}</Text>
          {pending.map((award, index) => (
            <Text key={`${award.neighborName}-${award.deliveryDate}-${index}`} style={styles.pendingLine}>
              {t.pending.one.replace('{name}', award.neighborName).replace('{points}', String(neighborPoints))}
            </Text>
          ))}
        </View>
      )}
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
          <Text style={styles.reason}>{reasonLabel(t, group.reason, group.points)}</Text>
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
/**
 * Satırın adı — **işarete duyarlı** (★ karar 7 · 17.08).
 *
 * Geri alma aynı sebeple ve ters işaretle yazılıyor, yani ham etiket kullanılsaydı müşteri aynı adı
 * biri artı biri eksi olmak üzere iki kez görür ve ne olduğunu anlamazdı: *"Komşu daveti +100"*
 * altında *"Komşu daveti −100"*. Ayrım VERİDE değil SUNUMDA yapılıyor — sebep enum'u bilerek
 * büyütülmedi (★ karar 7d).
 *
 * Sözlük yalnız geri ALINABİLEN sebepleri taşıyor; ötekiler kendi adında kalır. `redemption` zaten
 * doğası gereği eksidir ("Kupona çevrildi") ve `manual` eksi de artı da olabilir — ikisine de ters
 * etiket uydurmak, olmayan bir olayı adlandırmak olurdu.
 */
function reasonLabel(t: Messages, reason: PointsReason, points: number): string {
  const labels: Record<PointsReason, string> = t.reason;
  if (points >= 0) return labels[reason];

  const reverted: Partial<Record<PointsReason, string>> = t.reasonReverted;
  return reverted[reason] ?? labels[reason];
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
  /* BAKİYE SATIRI, KART DEĞİL: sayfanın kendi başlığının altında bir künye satırı gibi durur.
     Kutu yapmak, altındaki "yolda" bloğuyla iki kart üst üste gelmesi demekti. */
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: theme.space.sm,
  },
  balanceLabel: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    color: theme.colors.muted,
  },
  balanceValue: {
    fontFamily: theme.font.display[theme.text['card-title--font-weight']],
    fontSize: theme.text['card-title'],
    color: theme.colors.olive,
  },
  /* "Yolda" bir VAAT, bir kayıt değil — o yüzden defterin satırlarından görsel olarak da ayrı:
     yumuşak zemin, kendi başlığı. Zeytin değil kum tonunda çünkü henüz kazanılmış bir şey yok. */
  pendingCard: {
    marginTop: theme.space.lg,
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors['sand-100'],
    gap: theme.space.xs,
  },
  pendingTitle: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  pendingLine: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
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
