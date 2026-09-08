import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsHeadBleed } from '@/components/operations/head-bleed';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsScreenChrome } from '@/components/operations/screen-scroll';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsStatusBadge } from '@/components/operations/status-badge';
import { OperationsSurface } from '@/components/operations/surface';
import { FormScroll } from '@/components/ui/form-scroll';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy, operationsCopy, operationsFailureText } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import type { B2bQueueRow } from '@lezzet/types';
import { managementCopy } from './copy';
import { b2bAgeText, b2bFlagBadgeTone, b2bFlagTone, b2bStatusTone } from './b2b-format';
import { useB2bQueue, type B2bTab } from './use-b2b-queue.hook';

/*
  KURUMSAL BAŞVURU LİSTESİ (21.217 · tasarım `b2bListe`).

  ── TEK KAYITTA LİSTE ATLANIR (kullanıcı kararı 07.09) ──────────────────────
  Tek bekleyen başvuru varsa ekran kendini çizmeden başvuruya geçiyor: tek satırlık bir liste
  operatöre bir dokunuş fazladan ödetip hiçbir şey söylemez. Ölçüt SAYFA DEĞİL KÜMENİN sayacı
  (`single`, uçtan) — `rows.length === 1` yalnız ilk sayfa doluysa doğru cevabı verirdi.

  ── BAYRAK SIRAYI SÖYLER ────────────────────────────────────────────────────
  Satır dört şey taşıyor: ad · bayrak · şehir/ülke · yaş. Bayrak olmasaydı liste "kaç tane var"ı
  söyler, "önce hangisi"ni söylemezdi ve sıra yalnız yaşa kalırdı — oysa temiz bir başvuru on
  saniyede kapanır, mükerrer olan masaya kalır.
*/

const t = managementCopy;

/** İskelet kutusu satırın KENDİ ölçüsünden: iki dolgu + ad satırı + künye satırı. */
const ROW_HEIGHT =
  operationsTheme.space.lg * 2 +
  operationsTheme.text.control * operationsTheme.text['lead--line-height'] +
  operationsTheme.text.micro * operationsTheme.text['lead--line-height'] +
  operationsTheme.space['2xs'];

export function B2bApplicationsScreen() {
  const router = useRouter();
  const queue = useB2bQueue();
  const { state, tab, counts, single } = queue;

  /* Yönlendirme ÇİZİMDEN SONRA (effect): render sırasında gezinmek React'in uyardığı şey ve
     ekran bir kare boş görünürdü. `replace` — atlanan liste geri yığınında durmamalı. */
  useEffect(() => {
    if (tab === 'pending' && single !== null) router.replace(`/b2b-application?id=${single}`);
  }, [router, single, tab]);

  const header = (
    <OperationsStackHeader
      title={t.b2b.listTitle}
      subtitle={t.b2b.listCaption}
      onBack={() => router.back()}
      backLabel={t.common.back}
      testID="management-b2b-list-header"
    />
  );

  const sekmeler = (
    <View style={styles.tabs}>
      {(['pending', 'decided'] as const).map((key) => (
        <OperationsChoiceChip
          key={key}
          label={`${key === 'pending' ? t.b2b.tabPending : t.b2b.tabDecided} · ${key === 'pending' ? counts.pending : counts.decided}`}
          selected={tab === key}
          onPress={() => queue.setTab(key as B2bTab)}
          tone="filter"
          testID={`management-b2b-tab-${key}`}
        />
      ))}
    </View>
  );

  return (
    <View style={styles.screen} testID="management-b2b-list">
      {state.status === 'ready' && state.rows.length > 0 ? null : header}

      {state.status === 'loading' ? (
        <View style={styles.block}>
          {sekmeler}
          <OperationsSkeletonList
            heights={[ROW_HEIGHT, ROW_HEIGHT, ROW_HEIGHT]}
            label={t.b2b.loading}
            testID="management-b2b-loading"
          />
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="error"
            title={t.common.error.title}
            description={operationsFailureText(state.failure)}
            retry={{ label: t.common.error.retry, onPress: queue.retry }}
            testID="management-b2b-error"
          />
        </View>
      ) : state.rows.length === 0 ? (
        <View style={styles.block}>
          {sekmeler}
          {/* BOŞ HÂL SEKME BAŞINA (tasarım kararı): "Karar verilmiş" boş olabilir ve o hâlde de
              ekranda durmak gerekir — bölümün tamamını kapatmak, arşivi görünmez yapardı. */}
          <OperationsNoticeBlock
            variant="empty"
            title={t.b2b.emptyTitle}
            description={t.b2b.emptyBody}
            testID="management-b2b-empty"
          />
        </View>
      ) : (
        /* KABUK KROM KAPISINDAN (21.178): `FormScroll` sarılamıyor, çünkü sayfalama için
           `onEndReached` istiyoruz ve düz `ScrollView` onu bilmiyor. */
        <OperationsScreenChrome title={t.b2b.listTitle} caption={operationsCopy.sections.management.tab}>
          {(bind) => (
            <FormScroll {...bind} contentContainerStyle={styles.body} onEndReached={queue.loadMore} testID="management-b2b-list-body">
              <OperationsHeadBleed pad="6xl" padTop="sm">
                {header}
              </OperationsHeadBleed>
              {sekmeler}
              {state.rows.map((row) => (
                <QueueRow key={row.customerId} row={row} onPress={() => router.push(`/b2b-application?id=${row.customerId}`)} />
              ))}
              {queue.loadingMore ? <Text style={styles.footnote}>{t.b2b.loading}</Text> : null}
              <Text style={styles.footnote}>{t.b2b.footnote}</Text>
            </FormScroll>
          )}
        </OperationsScreenChrome>
      )}
    </View>
  );
}

function QueueRow({ row, onPress }: { row: B2bQueueRow; onPress: () => void }) {
  const meta = fillCopy(t.b2b.row.meta, {
    city: row.city ?? t.b2b.row.noCity,
    country: row.country,
    age: b2bAgeText(row.appliedAt),
  });

  return (
    <PressableSurface onPress={onPress} feedback="scale" testID={`management-b2b-row-${row.customerId}`}>
      <OperationsSurface tone="card" padding="md" style={styles.row}>
        {/* TONUN ŞERİDİ — bayrak iki kez okunuyor: renk şeritte, ANLAM rozette. Renk tek başına
            anlam taşımaz (tasarım kuralı), o yüzden şerit rozetin yerine geçmiyor. */}
        <View style={[styles.rail, { backgroundColor: b2bFlagTone(row.flag.tone) }]} />
        <View style={styles.rowBody}>
          <View style={styles.rowHead}>
            <Text style={styles.name} numberOfLines={1}>
              {row.name}
            </Text>
            {/* Karar rozeti YALNIZ karar verilmişte: bekleyen sekmesinde her satırda aynı şeyi
                tekrarlayan bir rozet bilgi değil gürültüdür. */}
            {row.status === 'pending' ? null : (
              <OperationsStatusBadge label={t.b2b.status[row.status]} tone={b2bStatusTone(row.status)} />
            )}
            <OperationsStatusBadge label={row.flag.label} tone={b2bFlagBadgeTone(row.flag.tone)} />
          </View>
          <Text style={styles.meta}>{meta}</Text>
        </View>
      </OperationsSurface>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: operationsTheme.colors.cream },
  block: { paddingTop: operationsTheme.space.sm, paddingHorizontal: operationsTheme.space['6xl'], gap: operationsTheme.space.lg },
  body: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.sm,
    paddingBottom: operationsTheme.space['8xl'],
    gap: operationsTheme.space.lg,
  },
  tabs: { flexDirection: 'row', gap: operationsTheme.space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.md },
  rail: { width: 5, alignSelf: 'stretch', borderRadius: operationsTheme.radius.tight },
  rowBody: { flex: 1, gap: operationsTheme.space['2xs'], minWidth: 0 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.sm },
  name: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  meta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
});
