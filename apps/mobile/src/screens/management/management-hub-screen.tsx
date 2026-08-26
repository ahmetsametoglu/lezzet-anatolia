import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { NotificationBell } from '@/components/operations/notification-bell';
import { OperationsSectionHeader } from '@/components/operations/section-header';
import { OperationsStaffMenu } from '@/components/operations/staff-menu';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { money } from '@/lib/operations/money';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { useOperationsNotifications } from '@/screens/operations/use-notifications.hook';
import { operationsTheme } from '@/theme/unistyles';
import type { ManagementQueue, ManagementSummary } from '@lezzet/types';
import { managementCopy } from './copy';
import { useManagementHub } from './use-management-hub.hook';

/*
  YÖNETİM KÖKÜ · KARAR KUTUSU (v2:483-528) — bölümün kökü, altı işin kapısı.

  Kurye (21.10) ve depo (21.11) köklerinin açtığı yol aynen: başlık üçlüsü ORTAK komponenttendir
  (`OperationsSectionHeader` + zil), gövde ekranın kendisidir.

  ── ARTIK GERÇEK UÇTAN (21.12) ──────────────────────────────────────────────
  Kuyruk `/management/hub`tan okunur; fixture dönemi kapandı. v2'nin üç hâli artık üçü de gerçek:
  `kList` (kuyruk) · `kEmpty` (boş kutu) · `kError` (yüklenemedi + tekrar dene — uç bağlandığı gün
  gerçek düşüşle geldi, fixture künyesinin vaadi buydu).

  ── KUYRUK SATIR DEĞİL, KARAR ALANIDIR ──────────────────────────────────────
  v2'nin beş satırı beş karar ALANIdır (sözleşme künyesi): her alan canlı sayısını ve en taze
  örneğini taşır, sıfır sayılı alan HİÇ çizilmez — ölü satır, dokununca boş ekran açan bir kapı
  olurdu. Alan içi döküm hedef ekranın işi; kutu bir yönlendirmedir, liste değil.

  ── BOŞ HÂLİN "GÜN ÖZETİ →" EYLEMİ KUTUNUN ALTINDA ──────────────────────────
  Tasarımda bu metin eylemi boş kutunun İÇİNDE duruyor (v2:501). `OperationsNoticeBlock` yalnız
  "Tekrar dene" yuvası taşıyor; ortak komponente ikinci yuva açmak kit değişikliğidir (kurum 08.08).
  Sapma bilinçli ve küçük: eylem kutunun hemen altında, aynı hizada duruyor.

  ── SATIRIN AÇTIĞI ADRESİ EKRAN BİLİR ───────────────────────────────────────
  Sözleşme hedefi ADLANDIRIR (alan anahtarı), adresi (`/complaint`) yazmaz: rota adresleri
  navigasyonun bilgisidir, verinin değil (aynı karar: `(sections)/_layout.tsx`in ikon haritası).
*/

const t = managementCopy;
const shell = operationsCopy;

/** Karar satırının aciliyeti — nokta bunun rengidir (v2:332-336). */
type DecisionTone = 'alert' | 'attention' | 'go' | 'warehouse' | 'quiet';
/** Satırın açtığı ekran. */
type DecisionTarget = 'complaint' | 'exception' | 'offer' | 'supply' | 'intent';

interface DecisionRow {
  id: DecisionTarget;
  title: string;
  subtitle: string;
  tone: DecisionTone;
  /** "top bizde" — cevap sırası bizde (v2:493); yoksa rozet çizilmez. */
  ourTurn?: boolean;
  /** Şikâyet başının kimliği — satır o kaydı açar (`/complaint?id=`); yoksa alan adresi. */
  complaintId?: string;
}

/**
 * Noktanın rengi — satır ANLAM taşır, çeviri burada (tek yer).
 *
 * Bildirim ekranının `DOT_COLOR`u ile birleştirilMEdi: orada `courier` bir BÖLÜM kimliğidir, burada
 * `go` "karar hazır, yeşil ışık" demektir. İki sözlüğü tek ada indirmek, iki ekranın aynı noktayı
 * iki farklı sebeple yeşile boyaması demekti.
 */
const TONE_COLOR = {
  alert: operationsTheme.colors.error,
  attention: operationsTheme.colors.terracotta,
  go: operationsTheme.colors.olive,
  warehouse: operationsTheme.colors.warehouse,
  quiet: operationsTheme.colors.ink,
} as const satisfies Record<DecisionTone, string>;

/**
 * Hedef → adres. Rotalar `app/(operations)` altında düz durur (depo emsali: `/picking`, `/intake`).
 *
 * `intent` SOSYAL GELEN KUTUSUNA gider (bilinçli sapma, 26.08): v2 ayrı bir "sipariş niyeti"
 * ekranı çiziyordu ama o çizim sosyal gelen kutusundan (15.15) ÖNCEYDİ — bugün gerçek kutu var
 * ve tek mesajlık bir kopyası, aynı konuşmanın ikinci zayıf ekranı olurdu (CLAUDE §1). Sipariş
 * masada kurulur (doc 04 Y6 v1); konuşma kutudan okunur ve cevaplanır.
 */
const TARGET_ROUTE = {
  complaint: '/complaint',
  exception: '/order-exception',
  offer: '/offer-approval',
  supply: '/supply-suggestion',
  intent: '/social',
} as const satisfies Record<DecisionTarget, string>;

/**
 * Karar kutusunun satırları — sayılar uçtan, cümleler sözlükten. Sıfır sayılı alan HİÇ dönmez.
 * Sıra v2'nin sırası: şikâyet → istisna → teklif → tedarik → niyet (aciliyet aynı eksende azalır).
 */
function decisionRowsOf(queue: ManagementQueue): DecisionRow[] {
  const rows: DecisionRow[] = [];

  if (queue.complaints.count > 0) {
    const head = queue.complaints.head;
    rows.push({
      id: 'complaint',
      title: fillCopy(t.hub.rows.complaint.title, { n: String(queue.complaints.count) }),
      subtitle:
        head === null
          ? ''
          : fillCopy(t.hub.rows.complaint.subtitle, {
              who: head.customerName,
              ref:
                head.orderReferenceNo === null
                  ? ''
                  : fillCopy(t.hub.rows.complaint.refPart, { ref: head.orderReferenceNo }),
            }),
      tone: 'alert',
      ourTurn: head?.awaitingReply === true,
      // En taze bekleyen doğrudan açılır — ekran parametresiz de çalışır (`next`), ama kutunun
      // gösterdiği satırla açılan talebin AYNI olması kimlikle garanti edilir.
      complaintId: head?.ticketId,
    });
  }

  if (queue.exceptions.count > 0) {
    const head = queue.exceptions.head;
    const ref = head?.referenceNo ?? t.hub.rows.exception.noRef;
    const lines = String(head?.shortLineCount ?? 0);
    rows.push({
      id: 'exception',
      title: t.hub.rows.exception.title,
      subtitle:
        queue.exceptions.count > 1
          ? fillCopy(t.hub.rows.exception.subtitleMore, { ref, lines, more: String(queue.exceptions.count - 1) })
          : fillCopy(t.hub.rows.exception.subtitle, { ref, lines }),
      tone: 'attention',
    });
  }

  if (queue.offers.candidateCount > 0) {
    rows.push({
      id: 'offer',
      title: t.hub.rows.offer.title,
      subtitle: fillCopy(t.hub.rows.offer.subtitle, { n: String(queue.offers.candidateCount) }),
      tone: 'go',
    });
  }

  if (queue.supply.groupCount > 0 || queue.supply.unmappedVariantCount > 0) {
    rows.push({
      id: 'supply',
      title: t.hub.rows.supply.title,
      subtitle:
        queue.supply.unmappedVariantCount > 0
          ? fillCopy(t.hub.rows.supply.subtitleUnmapped, {
              groups: String(queue.supply.groupCount),
              unmapped: String(queue.supply.unmappedVariantCount),
            })
          : fillCopy(t.hub.rows.supply.subtitle, { groups: String(queue.supply.groupCount) }),
      tone: 'warehouse',
    });
  }

  if (queue.intents.count > 0) {
    rows.push({
      id: 'intent',
      title: t.hub.rows.intent.title,
      subtitle: fillCopy(t.hub.rows.intent.subtitle, { n: String(queue.intents.count) }),
      tone: 'quiet',
    });
  }

  return rows;
}

export function ManagementHubScreen() {
  const router = useRouter();
  const unread = useOperationsNotifications().length;
  const { state, retry } = useManagementHub();
  const openSummary = () => router.navigate('/day-summary');

  return (
    <View style={styles.screen} testID="operations-section-management">
      <OperationsSectionHeader
        section="management"
        eyebrow={shell.sections.management.eyebrow}
        title={shell.sections.management.title}
        right={
          <NotificationBell
            onPress={() => router.navigate('/notifications')}
            accessibilityLabel={
              unread === 0 ? shell.bell.label : fillCopy(shell.bell.labelWithCount, { n: String(unread) })
            }
            count={unread}
            testID="operations-bell"
          />
        }
        identity={<OperationsStaffMenu testID="operations-staff-menu" />}
      />

      <ScrollView contentContainerStyle={styles.body} testID="management-hub-body">
        {/* Sosyal gelen kutusunun kapısı — karar kuyruğundan BAĞIMSIZ (kendi ekranı kendi ucunu
            okur): kuyruk okuması düşse de yazışma kapısı durur, o yüzden durum dalının DIŞINDA. */}
        <PressableSurface
          onPress={() => router.navigate('/social')}
          feedback="scale"
          style={styles.socialCard}
          accessibilityLabel={t.social.hubEntry.title}
          testID="management-hub-social"
        >
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{t.social.hubEntry.title}</Text>
            <Text style={styles.rowSubtitle}>{t.social.hubEntry.subtitle}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </PressableSurface>

        {state.status === 'loading' ? (
          <View style={styles.pending} testID="management-hub-loading">
            <ActivityIndicator color={operationsTheme.colors.olive} />
          </View>
        ) : state.status === 'error' ? (
          <View style={styles.emptyBlock}>
            <OperationsNoticeBlock
              variant="error"
              title={t.hub.error.title}
              description={t.hub.error.body}
              retry={{ label: t.hub.error.retry, onPress: retry }}
              testID="management-hub-error"
            />
          </View>
        ) : (
          <HubBody queue={state.hub.queue} summary={state.hub.summary} onOpenSummary={openSummary} />
        )}
      </ScrollView>
    </View>
  );
}

interface HubBodyProps {
  queue: ManagementQueue;
  summary: ManagementSummary;
  onOpenSummary: () => void;
}

function HubBody({ queue, summary, onOpenSummary }: HubBodyProps) {
  const router = useRouter();
  const rows = decisionRowsOf(queue);

  if (rows.length === 0) {
    return (
      <View style={styles.emptyBlock}>
        <OperationsNoticeBlock
          variant="empty"
          title={t.hub.empty.title}
          description={t.hub.empty.body}
          testID="management-hub-empty"
        />
        <PressableSurface
          onPress={onOpenSummary}
          feedback="opacity"
          compact
          style={styles.emptyAction}
          accessibilityLabel={t.hub.empty.action}
          testID="management-hub-empty-summary"
        >
          <Text style={styles.emptyActionLabel}>{t.hub.empty.action}</Text>
        </PressableSurface>
      </View>
    );
  }

  return (
    <>
      <PressableSurface
        onPress={onOpenSummary}
        feedback="scale"
        style={styles.summaryCard}
        accessibilityLabel={t.hub.summary.action}
        testID="management-hub-summary"
      >
        <Text style={styles.summaryEyebrow}>{t.hub.summary.eyebrow}</Text>
        <Text style={styles.summaryHeadline}>
          {fillCopy(t.hub.summary.headline, {
            orders: String(summary.orderCount),
            preparing: String(summary.preparingCount),
            awaiting: String(summary.pendingPayment.count),
          })}
        </Text>
        <Text style={styles.summaryDetail}>
          {fillCopy(t.hub.summary.detail, {
            revenue: money(summary.revenueCents),
            complaints: String(summary.openComplaintCount),
            shipments: String(summary.tomorrow.orderCount),
          })}
        </Text>
      </PressableSurface>

      <View style={styles.list}>
        {rows.map((row) => (
          <PressableSurface
            key={row.id}
            onPress={() =>
              row.complaintId === undefined
                ? router.navigate(TARGET_ROUTE[row.id])
                : router.navigate({ pathname: '/complaint', params: { id: row.complaintId } })
            }
            feedback="scale"
            style={styles.row}
            accessibilityLabel={`${row.title} — ${row.subtitle}`}
            testID={`management-decision-${row.id}`}
          >
            <View style={[styles.dot, { backgroundColor: TONE_COLOR[row.tone] }]} />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
            </View>
            {row.ourTurn === true ? <Text style={styles.ourTurn}>{t.common.ourTurn}</Text> : null}
            <Text style={styles.chevron}>›</Text>
          </PressableSurface>
        ))}
      </View>

      <Text style={styles.footnote}>{t.hub.footnote}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  body: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space['8xl'],
  },
  pending: {
    paddingTop: operationsTheme.space['8xl'],
    alignItems: 'center',
  },
  emptyBlock: {
    paddingTop: operationsTheme.space['7xl'],
    gap: operationsTheme.space.lg,
  },
  emptyAction: {
    alignSelf: 'center',
  },
  emptyActionLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.olive,
  },
  /** Sosyal gelen kutusu kartı — özet kartının kardeşi; kanal markaları alt satırda metinle. */
  socialCard: {
    marginTop: operationsTheme.space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.card,
  },
  /** v2:504 — kuyruğun ÜSTÜNDEKİ özet kartı; günün fotoğrafına tek dokunuşluk kapı. */
  summaryCard: {
    marginTop: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
    gap: operationsTheme.space['2xs'],
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.card,
  },
  summaryEyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  summaryHeadline: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    lineHeight: operationsTheme.text['body-sm'] * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.ink,
  },
  summaryDetail: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  list: {
    paddingTop: operationsTheme.space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space['2xl'],
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  /** v2:490 — 10×10 daire. Ölçü `space`ten geliyor (bildirim satırıyla aynı karar, tek desen). */
  dot: {
    width: operationsTheme.space.lg,
    height: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.pill,
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
  rowSubtitle: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  /** "top bizde" — cevap sırasının BİZDE olduğunu söyleyen çerçeveli rozet (v2:493). */
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
  chevron: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors['sand-600'],
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingVertical: operationsTheme.space['2xl'],
  },
});
