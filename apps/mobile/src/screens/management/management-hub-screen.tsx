import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
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
import { managementCopy } from './copy';
import { DAY_SUMMARY, DECISION_QUEUE, type DecisionTarget, type DecisionTone } from './management-fixture';

/*
  YÖNETİM KÖKÜ · KARAR KUTUSU (v2:483-528) — bölümün kökü, altı işin kapısı.

  Kurye (21.10) ve depo (21.11) köklerinin açtığı yol aynen: başlık üçlüsü ORTAK komponenttendir
  (`OperationsSectionHeader` + zil), gövde ekranın kendisidir. Bu ekran 21.9'da yer tutucu olan
  `screens/operations/section-screen.tsx`in yerini aldı — o dosya (Para köküyle birlikte) SÖKÜLDÜ,
  çünkü dört bölümün dördü de artık kendi gövdesini çiziyor ve tüketicisi kalmamıştı.

  ── ÜÇ HÂLDEN İKİSİ ÇİZİLDİ ─────────────────────────────────────────────────
  v2 üç hâl gösteriyor: `kList` (kuyruk), `kEmpty` (boş kutu), `kError` (yüklenemedi + tekrar dene).
  Bu dilim UI-ONLY, yani okuma yapan bir kapı YOK — "yüklenemedi" hâli bugün DOĞABİLECEK bir hâl
  değil. Uydurma bir hata düğmesi çizmek, basıldığında hiçbir şey denemeyen bir "Tekrar dene"
  vaat etmek olurdu; hata hâli uç bağlandığı gün, gerçek düşüşle birlikte gelir. Boş hâl ise VERİNİN
  bir fonksiyonu (kuyruk boş olabilir) ve o yüzden yazıldı.

  ── BOŞ HÂLİN "GÜN ÖZETİ →" EYLEMİ KUTUNUN ALTINDA ──────────────────────────
  Tasarımda bu metin eylemi boş kutunun İÇİNDE duruyor (v2:501). `OperationsNoticeBlock` yalnız
  "Tekrar dene" yuvası taşıyor ve künyesi bu eylemi 21.12'ye bırakmış; ortak komponente ikinci bir
  yuva açmak bu dilimin yazı alanı DIŞINDA (kit değişikliği yöneticiye raporlanır — kurum 08.08).
  Sapma bilinçli ve küçük: eylem kutunun hemen altında, aynı hizada ve aynı sesle duruyor; kullanıcı
  için kaybolan bir kapı yok. Yuva açıldığı gün üç satır içeri taşınır.

  ── SATIRIN AÇTIĞI ADRESİ EKRAN BİLİR ───────────────────────────────────────
  Fixture hedefi ADLANDIRIR (`complaint`), adresi (`/complaint`) yazmaz: rota adresleri navigasyonun
  bilgisidir, verinin değil (aynı karar: `(sections)/_layout.tsx`in ikon haritası).
*/

const t = managementCopy;
const shell = operationsCopy;

/**
 * Noktanın rengi — fixture ANLAM taşır, çeviri burada (tek yer).
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

/** Hedef → adres. Rotalar `app/(operations)` altında düz durur (depo emsali: `/picking`, `/intake`). */
const TARGET_ROUTE = {
  complaint: '/complaint',
  exception: '/order-exception',
  offer: '/offer-approval',
  supply: '/supply-suggestion',
  intent: '/order-intent',
} as const satisfies Record<DecisionTarget, string>;

export function ManagementHubScreen() {
  const router = useRouter();
  const unread = useOperationsNotifications().length;
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
        {/* Sosyal gelen kutusunun kapısı — karar kuyruğundan BAĞIMSIZ (gerçek uca bağlı tek satır,
            fixture değil): kuyruk boşken de yazışma sürüyor olabilir, kapı iki hâlde de durur. */}
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

        {DECISION_QUEUE.length === 0 ? (
          <View style={styles.emptyBlock}>
            <OperationsNoticeBlock
              variant="empty"
              title={t.hub.empty.title}
              description={t.hub.empty.body}
              testID="management-hub-empty"
            />
            <PressableSurface
              onPress={openSummary}
              feedback="opacity"
              compact
              style={styles.emptyAction}
              accessibilityLabel={t.hub.empty.action}
              testID="management-hub-empty-summary"
            >
              <Text style={styles.emptyActionLabel}>{t.hub.empty.action}</Text>
            </PressableSurface>
          </View>
        ) : (
          <>
            <PressableSurface
              onPress={openSummary}
              feedback="scale"
              style={styles.summaryCard}
              accessibilityLabel={t.hub.summary.action}
              testID="management-hub-summary"
            >
              <Text style={styles.summaryEyebrow}>{t.hub.summary.eyebrow}</Text>
              <Text style={styles.summaryHeadline}>
                {fillCopy(t.hub.summary.headline, {
                  orders: String(DAY_SUMMARY.orderCount),
                  preparing: String(DAY_SUMMARY.preparingCount),
                  awaiting: String(DAY_SUMMARY.awaitingCollectionCount),
                })}
              </Text>
              <Text style={styles.summaryDetail}>
                {fillCopy(t.hub.summary.detail, {
                  revenue: money(DAY_SUMMARY.revenueCents),
                  complaints: String(DAY_SUMMARY.openComplaintCount),
                  shipments: String(DAY_SUMMARY.tomorrow.orderCount),
                })}
              </Text>
            </PressableSurface>

            <View style={styles.list}>
              {DECISION_QUEUE.map((row) => (
                <PressableSurface
                  key={row.id}
                  onPress={() => router.navigate(TARGET_ROUTE[row.target])}
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
        )}
      </ScrollView>
    </View>
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
