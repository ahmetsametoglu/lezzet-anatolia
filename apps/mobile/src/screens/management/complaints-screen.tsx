import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { TicketTypeEnum, type ComplaintRow, type TicketType } from '@lezzet/types';

import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsScreenChrome } from '@/components/operations/screen-scroll';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsStatusBadge, type OperationsStatusTone } from '@/components/operations/status-badge';
import { OperationsSurface } from '@/components/operations/surface';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { pullRefreshColors } from '@/components/ui/pull-refresh';
import { agoOf } from '@/lib/operations/stamp';
import { fillCopy, operationsCopy, operationsFailureText } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { managementCopy } from './copy';
import { sameFilter, useComplaints, type ComplaintFilter } from './use-complaints.hook';

/*
  Y1 · TALEP LİSTESİ (Operasyon Mobil v3:29 "Talep ve şikâyetler") — 21.281.

  ── NİÇİN AÇILDI ────────────────────────────────────────────────────────────
  Ölçüldü (07.09): mobilde bir talebe ulaşmanın TEK yolu hub'ın karar kartıydı ve o da kuyruğun
  BAŞINDAKİ talebi açıyordu. Kartın dipnotu "6 açık" yazarken altıncısına gidilemiyordu; kapanmış
  bir talep hiç görünmüyordu. Sayı gösterip kapı açmayan bir ekran, olmayan bir yeteneği vaat eder.

  ── ŞERİT TEK SEÇİMLİ ───────────────────────────────────────────────────────
  Tasarımda her an TAM BİR çip koyu. Uç süzgeci iki eksende taşıyor (hâl + tür — orada "bozuk VE
  top bizde" meşru bir soru) ama EKRANIN hâli tek değerdir: iki bağımsız duruma bölmek, tasarımın
  hiç çizmediği bir kombinasyonu arayüzde temsil etmek olurdu.

  ── "KAPANDI" ÇİPİ TASARIMDA YOK, BURADA VAR ────────────────────────────────
  v3'ün şeridi beş çip çiziyor ve hiçbiri kapanmışları getirmiyor — ama aynı tasarımın LİSTESİNDE
  bir "KAPANDI · 12:05" satırı duruyor. İkisi birlikte tutarsız: kapanmış talep görünmeli ama
  onu getiren bir kapı yok. Çözüm onu "tümü"ye karıştırmak DEĞİL (o zaman şeridin sayısı yalan
  söylerdi: "tümü · 6" derken listede dokuz satır olurdu), kendi çipini vermek. Sayı ile liste
  ancak böyle aynı şeyi söyler.

  ── SLA SAYACI YOK ──────────────────────────────────────────────────────────
  Tasarımın satırı sağda "22 sa kaldı" yazıyor; talepte SLA kavramı yok ve bu bilinçli (detay
  ekranının künyesi, aynı karar). Yerinde SON HAREKETİN yaşı duruyor — operatörün gerçekten
  sorabileceği tek şey: "ne kadardır bekliyor".

  ── "2 GÖRSEL" DEĞİL "GÖRSEL VAR" (kullanıcı kararı 07.09) ──────────────────
  Görünüm ekin SAYISINI taşımıyor (`bool_or(cardinality(...))`), var/yok taşıyor. Sayı için şema
  değişmesi gerekirdi ve sayı tarama kararını değiştirmiyor: operatör zaten açacak.
*/

const t = managementCopy.complaints;

/** İskelet satırının yüksekliği — kartın gerçek boyu (rozet + ad + önizleme + alt şerit). */
const SKELETON_ROW_HEIGHT = 132;

/**
 * Tür rozetinin tonu — tasarımın kendi renk ailesi (v3:29).
 *
 * `damaged`/`missing` PARA işidir (iade doğurabilir) ve tasarım ikisini de kırmızı ailesiyle
 * yazıyor; `question` bir bilgi talebidir, sessiz. `other` de sessiz: adı olmayan bir sınıfa renk
 * vermek, olmayan bir aciliyet uydurmak olurdu.
 */
const TYPE_TONE: Record<TicketType, OperationsStatusTone> = {
  damaged: 'error',
  missing: 'error',
  question: 'idle',
  other: 'idle',
};

/**
 * Süzgeç şeridi — tasarımın sırası: tümü → türler → top bizde → kapandı.
 *
 * **"top bizde" çipi KIRMIZI ailede** (v3:29: `bd:#e0b9b2 · bg:#f4e3e0 · fg:#a44a3f`). Öteki
 * çipler bir SINIF soruyor ("hangi tür"), bu bir ACİLİYET soruyor ("kim bekliyor") ve tasarım
 * farkı renkle söylüyor. Kitin `error` tonu boştaki çipte de rengini taşıyor (30.08'de
 * düzeltilmiş kural) — tam da burada gerekli olan davranış.
 */
function stripOf(
  counts: ReturnType<typeof useComplaints>['counts'],
): { key: string; label: string; count: number; filter: ComplaintFilter; tone: 'filter' | 'error' }[] {
  return [
    { key: 'all', label: t.filterAll, count: counts.all, filter: { kind: 'all' }, tone: 'filter' },
    ...TicketTypeEnum.options.map((type) => ({
      key: type,
      // Tür adları DETAYIN sözlüğünden (`complaint.kind`): aynı kelimenin ikinci bir kopyası,
      // bir gün ekranla çekmecenin farklı konuşmasının tek yoluydu.
      label: managementCopy.complaint.kind[type].toLocaleLowerCase('tr'),
      count: counts.byType[type] ?? 0,
      filter: { kind: 'type' as const, type },
      tone: 'filter' as const,
    })),
    { key: 'awaiting', label: t.filterAwaiting, count: counts.awaiting, filter: { kind: 'awaiting' }, tone: 'error' },
    { key: 'resolved', label: t.filterResolved, count: counts.resolved, filter: { kind: 'resolved' }, tone: 'filter' },
  ];
}

export function ComplaintsScreen() {
  const router = useRouter();
  const list = useComplaints();
  const now = new Date();

  const renderRow = ({ item }: { item: ComplaintRow }) => {
    const closed = item.status === 'resolved';
    /* Çeviri satırı: dil VARSA dille, yoksa yalnız "çeviri var". Dil saptanmamışken bir kod
       uydurmak, olmayan bir olguyu ekrana yazmak olurdu (04.09 kuralı). */
    const translation = !item.previewTranslated
      ? null
      : item.previewLanguage === null
        ? t.translatedNoLang
        : fillCopy(t.translated, { lang: item.previewLanguage.toLocaleUpperCase('tr') });

    return (
      <OperationsSurface
        tone="panel"
        padding="md"
        onPress={() => router.navigate({ pathname: '/complaint', params: { id: item.ticketId } })}
        style={[styles.row, item.awaitingReply ? styles.rowAwaiting : closed ? styles.rowClosed : styles.rowIdle]}
        /* Çerçevenin ve rozetin rengi ekran okuyucuya ulaşmaz — durum ADA eklenir. */
        accessibilityLabel={`${managementCopy.complaint.kind[item.type]} · ${item.customerName}${
          item.awaitingReply ? ` — ${t.ourTurn}` : closed ? ` — ${t.closed}` : ''
        }`}
        testID={`management-complaints-row-${item.ticketId}`}
      >
        <View style={styles.badges}>
          <OperationsStatusBadge label={managementCopy.complaint.kind[item.type].toLocaleUpperCase('tr')} tone={TYPE_TONE[item.type]} />
          <OperationsStatusBadge
            label={closed ? t.closed : item.awaitingReply ? t.ourTurn : t.theirTurn}
            tone={closed ? 'idle' : item.awaitingReply ? 'critical' : 'idle'}
            testID={`management-complaints-turn-${item.ticketId}`}
          />
          {/* SLA yerine son hareketin yaşı — künyedeki gerekçe. */}
          <Text style={styles.age}>{agoOf(item.lastMessageAt, now)}</Text>
        </View>

        <Text style={styles.name} numberOfLines={1}>
          {item.customerName}
        </Text>
        {/* ÖNİZLEME TIRNAK İÇİNDE (v3:29): kartta iki ayrı ses var — bizim yazdığımız etiketler ve
            MÜŞTERİNİN cümlesi. Tırnak o ikisini ayıran tek işaret; onsuz alıntı, sistemin kendi
            notu gibi okunuyor. */}
        <Text style={styles.preview} numberOfLines={2}>
          {fillCopy(t.quoted, { text: item.preview })}
        </Text>

        <View style={styles.meta}>
          {item.hasAttachment ? (
            <View style={styles.metaPair}>
              {/* Tasarımın fotoğraf makinesi ikonu — "görsel" kelimesinin yanında, kitin ikon kapısından. */}
              <Icon name="camera" size={operationsTheme.text['body-sm']} color={operationsTheme.colors.muted} />
              <Text style={styles.metaStrong}>{t.attachment}</Text>
            </View>
          ) : null}
          {translation === null ? null : <Text style={styles.metaText}>{translation}</Text>}
          {item.orderReferenceNo === null ? null : <Text style={styles.metaText}>{item.orderReferenceNo}</Text>}
          <Text style={styles.chevron}>›</Text>
        </View>
      </OperationsSurface>
    );
  };

  return (
    <View style={styles.screen} testID="management-complaints">
      <OperationsStackHeader
        title={t.title}
        subtitle={fillCopy(t.caption, { open: String(list.counts.all), awaiting: String(list.counts.awaiting) })}
        onBack={() => router.back()}
        backLabel={managementCopy.common.back}
        testID="management-complaints-header"
      />

      {/* Şerit YATAY KAYAR (v3: `overflow-x:auto`) — yedi çip telefona sığmıyor ve sarmalamak
          süzgeci iki satırlık bir bloğa çevirip listeyi aşağı iterdi. */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={stripOf(list.counts)}
        keyExtractor={(chip) => chip.key}
        contentContainerStyle={styles.chips}
        style={styles.chipRail}
        renderItem={({ item: chip }) => (
          <OperationsChoiceChip
            label={`${chip.label} · ${chip.count}`}
            tone={chip.tone}
            selected={sameFilter(list.filter, chip.filter)}
            onPress={() => list.setFilter(chip.filter)}
            testID={`management-complaints-filter-${chip.key}`}
          />
        )}
      />

      {list.status === 'loading' ? (
        <View style={styles.skeleton}>
          <OperationsSkeletonList
            heights={[SKELETON_ROW_HEIGHT, SKELETON_ROW_HEIGHT, SKELETON_ROW_HEIGHT]}
            label={t.loading}
            testID="management-complaints-loading"
          />
        </View>
      ) : list.status === 'error' ? (
        <View style={styles.noticeWrap}>
          {/* BAŞLIK NE düştüğünü, ALT SATIR NİÇİN düştüğünü söyler (15.17'nin ortak sözlüğü). */}
          <OperationsNoticeBlock
            variant="error"
            title={t.error.title}
            description={operationsFailureText(list.failure)}
            retry={{ label: t.error.retry, onPress: list.retry }}
            testID="management-complaints-error"
          />
        </View>
      ) : list.rows.length === 0 ? (
        <View style={styles.noticeWrap}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.empty.title}
            description={t.empty.body}
            testID="management-complaints-empty"
          />
        </View>
      ) : (
        /* KABUK DAVRANIŞLARI TEK KAPIDAN (21.178) — `FlatList` sarılamaz (iç içe kaydırıcı
           sanallaştırmayı öldürür). Şerit listenin DIŞINDA: süzgeç bir gezinme aracı, aşağı
           kaydırırken elden çıkmamalı (sosyal gelen kutusunun aynı kararı). */
        <OperationsScreenChrome title={t.title} caption={operationsCopy.sections.management.tab}>
          {(bind) => (
            <FlatList
              {...bind}
              data={list.rows}
              keyExtractor={(row) => row.ticketId}
              renderItem={renderRow}
              contentContainerStyle={styles.list}
              onEndReached={list.loadMore}
              onEndReachedThreshold={0.5}
              refreshControl={
                <RefreshControl
                  refreshing={list.refreshing}
                  onRefresh={list.refresh}
                  {...pullRefreshColors(operationsTheme.colors.olive)}
                />
              }
              ListFooterComponent={
                list.loadingMore ? (
                  <Text style={styles.footerNote}>{t.tail.loading}</Text>
                ) : list.tailFailed ? (
                  <PressableSurface
                    onPress={list.loadMore}
                    feedback="opacity"
                    compact
                    accessibilityLabel={t.tail.failed}
                    testID="management-complaints-tail-retry"
                  >
                    <Text style={[styles.footerNote, styles.footerRetry]}>{t.tail.failed}</Text>
                  </PressableSurface>
                ) : list.hasMore ? null : (
                  /* Liste bitince tasarımın dipnotu (v3:29). İki CÜMLE de artık DOĞRU: sıra
                     `queueSortAt`ten geliyor (bekleyen üstte) ve kapanmış kart sönük zeminde
                     duruyor. Sıralama düzelmeden yazılsaydı ekran olmayan bir kuralı vaat ederdi. */
                  <View>
                    <Text style={styles.footerNote}>{t.tail.end}</Text>
                    <Text style={styles.footnote}>{t.footnote}</Text>
                  </View>
                )
              }
              testID="management-complaints-list"
            />
          )}
        </OperationsScreenChrome>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: operationsTheme.colors.cream },
  /** Şerit yatay kayar; kabın kendisi büyümemeli (`flexGrow:0`), yoksa listeyi aşağı iter. */
  chipRail: { flexGrow: 0 },
  chips: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space.md,
    gap: operationsTheme.space.sm,
  },
  skeleton: { paddingHorizontal: operationsTheme.space['6xl'], paddingTop: operationsTheme.space['2xl'] },
  noticeWrap: { paddingHorizontal: operationsTheme.space['6xl'], paddingTop: operationsTheme.space['2xl'] },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space['8xl'],
    /* Kartları AYIRAN şey çizgi değil boşluk (v3 · sosyal kuyruğun aynı kararı). */
    gap: operationsTheme.space.md,
  },

  /* SATIR BİR KART (v3:29) ve ÇERÇEVESİ bir DURUM taşıyor — kuyrukta gözün aradığı tek şey
     "kim cevap bekliyor". Kapanmış kart ayrıca SÖNÜK zeminde: listede durur ama sırayı kendine
     çağırmaz. */
  row: { gap: operationsTheme.space.sm },
  /* ÜÇ KADEME, TASARIMIN KENDİ AYRIMI (v3:29): bizden beklenen kart KIRMIZI çerçeveli ve BEYAZ
     zeminli — listede öne çıkar; bekleyen kart kum çerçeveli; kapanmış kart ise çerçevesiz ve
     SÖNÜK zeminde durur ("kapanan kayıtlar solar ama silinmez" — tasarımın kendi dipnotu). */
  /* Gölge YALNIZ bu kademede (v3:29 ölçümü): akışın içinde bir gömlek öne çıkar. Taşıyıcı işaret
     çerçeve ve zemin; gölge onların üstüne binen ince bir vurgu (token künyesi). */
  rowAwaiting: {
    borderColor: operationsTheme.colors.error,
    backgroundColor: operationsTheme.colors.card,
    boxShadow: operationsTheme.shadow.card,
  },
  rowIdle: { borderColor: operationsTheme.colors['sand-500'] },
  rowClosed: { borderColor: 'transparent', backgroundColor: operationsTheme.colors['neutral-bg'] ?? operationsTheme.colors.cream },

  badges: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.sm, flexWrap: 'wrap' },
  /** Son hareketin yaşı — rozetlerin sağ ucunda; SLA yerine geçen olgu (dosya künyesi). */
  age: {
    marginLeft: 'auto',
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  /*
    AD 14/700 — `body-sm` (kullanıcı bulgusu 07.09: *"bu listenin tasarımı çok kötüydü"*).

    `card-title` (24/600, Lora) yazılmıştı ve kartın ağırlık merkezini ada kaydırıyordu: tasarımda
    (v3:29 `font:700 14px/1.4 'Karla'`) ad bir SATIR, başlık değil — kartta okunması gereken şey
    rozetlerle önizlemedir, ad yalnız "kim". Token setinin künyesi bu eşlemeyi zaten yazıyor:
    *"liste başlığı 14 → `body-sm`"*.
  */
  name: {
    fontFamily: operationsTheme.font.body['700'],
    fontSize: operationsTheme.text['body-sm'],
    lineHeight: operationsTheme.text['body-sm'] * 1.4,
    color: operationsTheme.colors.ink,
  },
  /** Önizleme 11,5/1.5 — tasarımın `micro` durağı; tırnak metnin kendisinde (`quoted`). */
  preview: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * 1.5,
    color: operationsTheme.colors.muted,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.md },
  metaPair: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.xs },
  metaText: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  /** "2 görsel" tasarımda KALIN, "DE · çeviri var" düz — ek bir olgu, çeviri bir niteleme. */
  metaStrong: {
    fontFamily: operationsTheme.font.body['700'],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  chevron: {
    marginLeft: 'auto',
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['sand-500'],
  },

  footerNote: {
    paddingVertical: operationsTheme.space.lg,
    textAlign: 'center',
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  footerRetry: { color: operationsTheme.colors['olive-dark'] },
  /** Tasarımın kapanış cümlesi — listenin KURALINI anlatır, bir satırı değil; o yüzden sola dayalı. */
  footnote: {
    paddingBottom: operationsTheme.space.lg,
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * 1.5,
    color: operationsTheme.colors.muted,
  },
});
