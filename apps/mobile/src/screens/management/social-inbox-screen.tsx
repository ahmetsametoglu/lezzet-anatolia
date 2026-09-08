import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { ConversationHandlerEnum, ConversationSourceEnum, type ConversationHandler } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsScreenChrome } from '@/components/operations/screen-scroll';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsSurface } from '@/components/operations/surface';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { pullRefreshColors } from '@/components/ui/pull-refresh';
import type { SocialRow } from '@/lib/api/social';
import { fillCopy, operationsCopy, operationsFailureText } from '@/screens/operations/copy';
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

  ── BAŞ HARF KARESİ TASARIMIN RENGİNDE ─────────────────────────────────────
  v3 satırın soluna 34'lük bir baş harf karesi koyuyor ve onu DURUMA göre boyuyor. Bir tur boyunca
  biz onu kanalın markasıyla boyadık ve kullanıcı bulgusuyla geri alındı — gerekçe ve ölçüm
  `AVATAR_TINT` künyesinde. Kanal artık damganın yanında sönük bir kelime.

  ── "TASLAK ONAY BEKLİYOR" ROZETİ ──────────────────────────────────────────
  v3:2205'in rozeti sözleşmede KARŞILIĞI OLAN bir şeydir: kuyruk satırı hibrit modun bekleyen
  taslağını taşıyor (`aiDraftReply`). Rozet o alan doluyken çizilir — operatör hangi sohbette
  onayının beklendiğini listeyi açmadan görür.

  ── İKİ SÜZGEÇ EKSENİ ÇEKMECEDE (kullanıcı kararı 07.09) ───────────────────
  v3 tek şerit çiziyor ve o şeritte yalnız KANAL var (v3:2189). "Cevap bekleyen" ekseni bizim
  eklememiz ve silinmedi — uç onu destekliyor (`filter=awaiting`), başlık sayacı onu sayıyor ve
  "cevap bekleyen Messenger sohbetleri" meşru bir sorudur.

  Ama iki eksen iki ŞERİT demekti ve cihazda ölçüldüğünde sekiz çip listenin üstündeki alanı
  yiyordu. Kullanıcı kararı: seçili süzgeçler yukarıda METİN, düzenleme ÇEKMECEDE. Böylece
  tasarımın "üstte tek satır" niyeti korunuyor, eksen sayısı arttıkça şerit büyümüyor ve okunan
  şey bir çip dizisi değil bir cümle oluyor ("Cevap bekleyen · WhatsApp").

  Kuyruğun üç kuyruk hâli (yükleniyor · düştü · bitti) footer'da — `nextCursor` üretilip
  TÜKETİLİYOR (CLAUDE §1: sayfalayan okumanın tüketeni olmalı).
*/

const t = managementCopy.social;

/** İskelet kutusu sohbet satırının KENDİ ölçüsünden: iki dolgu + ad satırı + ön izleme satırı. */
const SKELETON_ROW_HEIGHT =
  operationsTheme.space['2xl'] * 2 +
  operationsTheme.text['body-sm'] * operationsTheme.text['lead--line-height'] +
  operationsTheme.text.micro * operationsTheme.text['lead--line-height'];

/*
  ── BAŞ HARF KARESİNİN RENGİ MARKADAN DURUMA DÖNDÜ (kullanıcı bulgusu 07.09) ─
  Bir tur boyunca kare KANALIN markasıyla boyanıyordu (`brand-whatsapp` #128c4b vb.). Gerekçe
  savunulabilirdi — üç kanalın birleştiği kuyrukta "nereden yazdı" kaybolmasın — ama bedeli
  ölçüldü: kullanıcı *"renkler ile bizim ekranın renkleriyle hiç alakası yok"* dedi ve cihaz
  görüntüsü onu doğruladı. Doymuş marka yeşili krem/zeytin paletin içinde tek başına bağırıyor,
  üstelik kuyruk pratikte tek kanaldan doluyken DÖRT satır da aynı yeşili taşıyor — yani ayırt
  edici hiçbir bilgi vermeden paleti bozuyordu.

  Tasarım (v3:31) kareyi DURUMA göre boyuyor ve dört değerin dördü de token olarak zaten var:
  bekleyen `olive-bg`(#e3ecd2) + `olive-dark`(#4a6121) · bekleyensiz `neutral-bg`(#e7e2d2) +
  `body`(#6d7261). Tasarımın hexleri ile token değerleri birebir aynı — yeni renk kodlanmadı.

  KANAL BİLGİSİ KAYBOLMADI, sesi kısıldı: satırın künyesine damganın yanına sönük bir kelime
  olarak girdi ("WhatsApp · 21:10"). Tasarımın kartında kanal hiç yok; bir kelime eklemek, doymuş
  bir kareyi korumaktan ucuz bir sapma.
*/
const AVATAR_TINT = {
  awaiting: { bg: operationsTheme.colors['olive-bg'], fg: operationsTheme.colors['olive-dark'] },
  idle: { bg: operationsTheme.colors['neutral-bg'], fg: operationsTheme.colors.body },
} as const;

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
  const [filterOpen, setFilterOpen] = useState(false);

  const channels: { value: ChannelFilter; label: string; key: string }[] = [
    { value: undefined, label: t.channelAll, key: 'all' },
    ...ConversationSourceEnum.options.map((source) => ({ value: source as ChannelFilter, label: t.channel[source], key: source })),
  ];

  /* Özet satırı SEÇİMDEN türer, ayrı bir metin tutulmaz: iki gerçek olsaydı biri gün gelip
     ötekinden sapardı ve operatör listenin neye göre süzüldüğünü yanlış okurdu. */
  const statusLabel = inbox.awaitingOnly ? t.filter.awaiting : t.filter.all;
  const channelLabel = inbox.channel === undefined ? t.channelAll : t.channel[inbox.channel];
  const handlerLabel = inbox.handler === undefined ? t.handlerAll : t.handler[inbox.handler];
  const suzgecVar = inbox.awaitingOnly || inbox.channel !== undefined || inbox.handler !== undefined;

  /* Yürütücü çipleri de ENUM'dan doğar (sohbet ekranının aynı kararı): dördüncü bir mod eklenirse
     çip kendiliğinden gelir, bu dosya değişmez. */
  const handlers: { value: ConversationHandler | undefined; label: string; key: string }[] = [
    { value: undefined, label: t.handlerAll, key: 'all' },
    ...ConversationHandlerEnum.options.map((mode) => ({ value: mode, label: t.handler[mode], key: mode })),
  ];

  const renderRow = ({ item }: { item: SocialRow }) => (
    /* Kabuk kitten (`panel`); ekranın eklediği tek şey ÇERÇEVENİN RENGİ — cevap bekleyen sohbet
       zeytin kenarla ayrılıyor ve o kuyruğun kendi kuralı, kitin değil. */
    <OperationsSurface
      tone="panel"
      padding="md"
      onPress={() => router.navigate(`/social/${item.id}`)}
      style={[styles.row, item.awaitingReply ? styles.rowAwaiting : styles.rowIdle]}
      /* Çerçevenin rengi ekran okuyucuya ulaşmaz — "top bizde" o yüzden ada EKLENİR. Görünür
         rozeti kaldırmak, sesli okumadan da kaldırmak anlamına gelmemeli. */
      accessibilityLabel={
        item.awaitingReply ? `${socialTitle(item)} — ${managementCopy.common.ourTurn}` : socialTitle(item)
      }
      testID={`management-social-row-${item.id}`}
    >
      <View style={[styles.avatar, { backgroundColor: AVATAR_TINT[item.awaitingReply ? 'awaiting' : 'idle'].bg }]}>
        <Text style={[styles.avatarText, { color: AVATAR_TINT[item.awaitingReply ? 'awaiting' : 'idle'].fg }]}>
          {socialInitials(item)}
        </Text>
      </View>
      <View style={styles.rowText}>
        <View style={styles.rowHead}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {socialTitle(item)}
          </Text>
          {/* Kanal damganın YANINDA ve sönük — kareyi boyamak yerine (künye yukarıda). */}
          <Text style={styles.rowStamp}>{`${t.channel[item.source]} · ${socialStamp(item.lastMessageAt)}`}</Text>
        </View>
        <Text style={styles.rowPreview} numberOfLines={1}>
          {socialPreview(item, t.kind)}
        </Text>
        {/*
          ROZET ŞERİDİ — "kim yürütüyor" + "taslak bekliyor" (21.289 · kullanıcı isteği:
          *"Mesajlaşmaların kimin tarafından yönetildiğini rozetlerle gösterebiliriz"*).

          YÜRÜTÜCÜ ROZETİ YALNIZ `human` DIŞINDA çizilir. İnsan varsayılan hâldir ve her satıra bir
          "İnsan" rozeti koymak, hiçbir şey söylemeyen bir gürültü katmanı olurdu — rozet ancak
          BEKLENMEYENİ söylediğinde bilgi taşır. Ayrım tonda da var: hibrit bir ONAY bekliyor
          (terracotta ailesi, taslak rozetiyle akraba), yapay zekâ ise KENDİ yürütüyor (zeytin).
        */}
        {item.handledBy === 'human' && item.aiDraftReply === null ? null : (
          <View style={styles.badgeRow}>
            {item.handledBy === 'human' ? null : (
              <Text
                style={[styles.badge, item.handledBy === 'ai' ? styles.badgeAi : styles.badgeHybrid]}
                testID={`management-social-handler-badge-${item.id}`}
              >
                {t.handler[item.handledBy].toLocaleUpperCase('tr')}
              </Text>
            )}
            {item.aiDraftReply === null ? null : (
              <Text style={[styles.badge, styles.badgeDraft]} testID={`management-social-draft-${item.id}`}>
                {t.draftBadge}
              </Text>
            )}
          </View>
        )}
      </View>
    </OperationsSurface>
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

      {/*
        SÜZGEÇ ARTIK BİR SATIR + ÇEKMECE (kullanıcı kararı 07.09).

        Önceki hâlde iki çip ŞERİDİ vardı — sekiz çip, iki satır — ve cihazda ölçüldüğünde listenin
        üstündeki alanın neredeyse tamamını yiyordu. Tasarım (v3:31) tek şerit çiziyor ve o şeritte
        yalnız KANAL var; ikinci eksen ("cevap bekleyen") bizim eklememizdi ve şeridi ikiye katlayan
        şey oydu.

        Kullanıcının kararı ikisini de çözüyor: seçili süzgeçler yukarıda METİN olarak duruyor
        (bir satır, okunur bir cümle), düzenleme çekmecede. Eksen sayısı arttıkça şerit büyümüyor.
      */}
      <PressableSurface
        onPress={() => setFilterOpen(true)}
        feedback="opacity"
        compact
        style={styles.filterBar}
        accessibilityLabel={t.filterBar.label}
        testID="management-social-filter-open"
      >
        <Text style={styles.filterSummary} numberOfLines={1} testID="management-social-filter-summary">
          {fillCopy(t.filterBar.summary, { status: statusLabel, channel: channelLabel, handler: handlerLabel })}
        </Text>
        <Text style={styles.filterAction}>{t.filterBar.action}</Text>
      </PressableSurface>

      <BottomSheet
        visible={filterOpen}
        title={t.filterSheet.title}
        onClose={() => setFilterOpen(false)}
        titleAction={
          /* "Sıfırla" YALNIZ sıfırlanacak bir şey varken çizilir — hep duran bir eylem, basıldığında
             hiçbir şey olmayan bir düğme olurdu. */
          suzgecVar ? (
            <PressableSurface
              onPress={() => {
                inbox.setAwaitingOnly(false);
                inbox.setChannel(undefined);
                inbox.setHandler(undefined);
              }}
              feedback="opacity"
              compact
              accessibilityLabel={t.filterSheet.reset}
              testID="management-social-filter-reset"
            >
              <Text style={styles.filterAction}>{t.filterSheet.reset}</Text>
            </PressableSurface>
          ) : undefined
        }
        testID="management-social-filter-sheet"
      >
        {/* Seçim ANINDA uygulanır, çekmece açık kalır: iki eksen var ve "uygula" düğmesi operatörü
            iki kez dokunmaya zorlardı. Kapanış kararı operatörün — arkadaki liste zaten süzülmüş
            hâlde görünüyor. */}
        <Text style={styles.sheetLabel}>{t.filterSheet.status}</Text>
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

        <Text style={styles.sheetLabel}>{t.filterSheet.channel}</Text>
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

        {/* YÜRÜTÜCÜ EKSENİ (21.289 · kullanıcı isteği): *"kimin yönettiğine göre de
            filtreleyebilmeliyim"*. "Ajanın kendi başına yürüttükleri" ile "insan bekleyenler" ayrı
            sorulardır — biri denetim (ajan ne yapıyor), öteki iş (bana ne kaldı). */}
        <Text style={styles.sheetLabel}>{t.filterSheet.handler}</Text>
        <View style={styles.chips}>
          {handlers.map((mode) => (
            <FilterChip
              key={mode.key}
              label={mode.label}
              active={inbox.handler === mode.value}
              onPress={() => inbox.setHandler(mode.value)}
              testID={`management-social-handler-${mode.key}`}
            />
          ))}
        </View>
      </BottomSheet>

      {inbox.status === 'loading' ? (
        /* İLK YÜK İSKELETLE (v3 dili): üç kutu, sohbet satırının yüksekliğinde. */
        <View style={styles.skeleton}>
          <OperationsSkeletonList
            heights={[SKELETON_ROW_HEIGHT, SKELETON_ROW_HEIGHT, SKELETON_ROW_HEIGHT]}
            label={t.loading}
            testID="management-social-loading"
          />
        </View>
      ) : inbox.status === 'error' ? (
        <View style={styles.noticeWrap}>
          {/* BAŞLIK NE düştüğünü, ALT SATIR NİÇİN düştüğünü söyler (06.09'da ölçülen arıza):
              sebep dört sınıfa ayrılıyor ve cümle ortak sözlükten geliyor — oturumu ölmüş cihaza
              "bağlantını kontrol et" demek, operatörü çalışan bir wifi'nin peşine takıyordu. */}
          <OperationsNoticeBlock
            variant="error"
            title={t.error.title}
            description={operationsFailureText(inbox.failure)}
            retry={{ label: t.error.retry, onPress: inbox.retry }}
            testID="management-social-error"
          />
        </View>
      ) : inbox.rows.length === 0 ? (
        <View style={styles.noticeWrap}>
          <OperationsNoticeBlock variant="empty" title={t.empty.title} description={t.empty.body} testID="management-social-empty" />
        </View>
      ) : (
        /* KABUK DAVRANIŞLARI TEK KAPIDAN (21.178) — `FlatList` sarılamaz (iç içe kaydırıcı
           sanallaştırmayı öldürür), o yüzden KROM kapısı: şeridi kabuk çizer, bağlantıyı listeye
           verir. Bu ekran kapının ilk `FlatList` müşterisi.

           Başlık ve süzgeç şeridi listenin DIŞINDA kalıyor ve bu bilinçli: gelen kutusunda süzgeç
           bir gezinme aracı, aşağı kaydırırken elden çıkmamalı. Mikro şerit yine de doğru iş
           yapıyor — sayfanın ADINI taşıyor, süzgeçleri değil. */
        <OperationsScreenChrome title={t.title} caption={operationsCopy.sections.management.tab}>
          {(bind) => (
        <FlatList
          {...bind}
          data={inbox.rows}
          keyExtractor={(row) => row.id}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          onEndReached={inbox.loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            /* Halkanın rengi İKİ platformda iki ayrı prop ister (`pullRefreshColors` künyesi):
               yalnız `tintColor` verilirse Android sistemin SİYAHINI çiziyor ve bu sessiz. */
            <RefreshControl
              refreshing={inbox.refreshing}
              onRefresh={inbox.refresh}
              {...pullRefreshColors(operationsTheme.colors.olive)}
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
        </OperationsScreenChrome>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  /* Çip ızgarası artık ÇEKMECENİN içinde — kenar boşluğu çekmecenin kendi dolgusundan gelir. */
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: operationsTheme.space.sm,
    paddingBottom: operationsTheme.space['2xl'],
  },
  /** Çekmecenin eksen başlığı — "DURUM" · "KANAL". */
  sheetLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
    paddingBottom: operationsTheme.space.md,
  },
  /** Seçili süzgeçlerin OKUNUR hâli — bir cümle, bir şerit değil. */
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.md,
    marginHorizontal: operationsTheme.space['6xl'],
    marginBottom: operationsTheme.space['2xl'],
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.badge,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    backgroundColor: operationsTheme.colors.panel,
  },
  filterSummary: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.ink,
  },
  filterAction: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.olive,
  },
  /* v3:2189 — çip 38 dp yüksekliğinde bir KONTROL, satır içi bir etiket değil: dolgusu o yüzden
     büyüdü. Dokunma hedefi `compact` payıyla zaten 44'e tamamlanıyordu; değişen görsel ağırlık. */
  chip: {
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.badge,
    borderWidth: operationsTheme.border.base,
  },
  /* SEÇİLİ ÇİP MÜREKKEP, ZEYTİN DEĞİL (kullanıcı bulgusu 07.09 · tasarımdan ölçüldü).
     v3'ün çip yardımcısı (kaynak satır 4417-4419) iki hâl tanımlıyor:
       seçili → `bg #2f353a · fg #f5f1e6 · bd #2f353a`
       sönük  → `bg transparent · fg #2f353a · bd #ddd6c4`
     Üç hexin üçü de token: #2f353a paletin ayrı durağı DEĞİL, `ink` ailesinin tonu (token
     dosyasının kendi kuralı) · #f5f1e6 = `on-image` · #ddd6c4 = `sand-300`.

     Zeytin BURADA YANLIŞ ve sebebi anlamsal: zeytin bu ekranda "cevap bekliyor" demek (kart
     çerçevesi), yani seçili çip de zeytin olunca aynı renk iki ayrı şey söylüyordu. Mürekkep
     "seçili"dir ve başka hiçbir yerde bir durum taşımıyor. */
  chipActive: {
    backgroundColor: operationsTheme.colors.ink,
    borderColor: operationsTheme.colors.ink,
  },
  chipIdle: {
    borderColor: operationsTheme.colors['sand-300'],
  },
  chipActiveLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['on-image'],
  },
  chipIdleLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.ink,
  },
  /* İskelet listenin kenar boşluğunda durur; kartlar aynı yerde doğar. */
  skeleton: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space['2xl'],
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
  /* Kabuk kitte; burada kalan satırın dizilimi (kare + metin bloğu). */
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: operationsTheme.space.xl,
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
  /* ROZETLER — ortak geometri (v3:2205'in "TASLAK ONAY BEKLİYOR" rozetinden), ton ayrı.
     Şerit sarar: iki rozet yan yana sığmazsa alt satıra iner, kesilmez. */
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: operationsTheme.space.sm,
    marginTop: operationsTheme.space['2xs'],
  },
  badge: {
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.md,
    borderRadius: operationsTheme.radius.tight,
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    overflow: 'hidden',
  },
  /** "TASLAK ONAY BEKLİYOR" — yalnız bekleyen YZ taslağı olan satırda (v3:2205). */
  badgeDraft: {
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    color: operationsTheme.colors.terracotta,
  },
  /** Yapay zekâ KENDİ yürütüyor — zeytin, "sistem çalışıyor" ailesi. */
  badgeAi: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    color: operationsTheme.colors['olive-dark'],
  },
  /** Hibrit — ajan yazar, İNSAN gönderir: bir onay bekliyor, taslak rozetiyle aynı aile. */
  badgeHybrid: {
    backgroundColor: operationsTheme.colors['terracotta-bg'],
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
