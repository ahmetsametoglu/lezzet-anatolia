import { useRouter } from 'expo-router';
import { Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { FormScroll } from '@/components/ui/form-scroll';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { courierCopy } from './copy';
import { runLabel } from './courier-format';
import { expectedLabel, useDayClose } from './use-day-close.hook';

/*
  KURYE · SEFER KAPANIŞI (v2:217-262) — sayaçlar · para sayımı · not · iki adımlı onay.

  Kararların tamamı `use-day-close.hook.ts` künyesinde. Ekranın iki kendi kararı:
  1. **Fark sütunu bozuk girdide "—" yazar** (v2 her hâlde bir tutar yazıyor, çünkü şablonun girdisi
     bozuk olamıyor). Ölçülemeyen fark sıfır değildir — "0,00 €" yazmak, sayılmamış bir kasayı
     "tamı tamına tuttu" diye okuturdu (CLAUDE §1).
  2. **Kapanışın öznesi başlıkta yazılı** (18.08): başlık altına seferin künyesi (rota adı + SF
     kodu) geliyor — kurye iki sefer sürdüyse hangisini kapattığını okumadan onaylamamalı. Sefer
     yoksa form hiç çizilmez; boş bir sayım formu, olmayan bir mutabakatı davet ederdi.
*/

const t = courierCopy;

interface CounterCardProps {
  value: number;
  label: string;
  tone: 'delivered' | 'pending' | 'returned';
  testID: string;
}

/** Üç sayaç karosu (v2:227-231) — aynı iskelet, üç ton; tek yerde. */
function CounterCard({ value, label, tone, testID }: CounterCardProps) {
  return (
    <View style={[styles.counter, styles[`counter_${tone}`]]} testID={testID}>
      <Text style={[styles.counterValue, styles[`counterText_${tone}`]]}>{value}</Text>
      <Text style={[styles.counterLabel, styles[`counterText_${tone}`]]}>{label}</Text>
    </View>
  );
}

export function CourierDayCloseScreen() {
  const router = useRouter();
  const dayClose = useDayClose();
  const run = dayClose.draft?.run ?? null;

  const header = (
    <OperationsStackHeader
      title={t.dayClose.title}
      subtitle={run === null ? undefined : runLabel(run)}
      onBack={() => router.back()}
      backLabel={t.dayClose.back}
      testID="courier-day-close-header"
    />
  );

  if (dayClose.status === 'loading') {
    return (
      <View style={styles.screen} testID="courier-day-close">
        {header}
        <View style={styles.centered}>
          <LoadingState accessibilityLabel={t.dayClose.loading} label={t.dayClose.loading} />
        </View>
      </View>
    );
  }

  if (dayClose.status === 'error' || dayClose.draft === null) {
    return (
      <View style={styles.screen} testID="courier-day-close">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="error"
            title={t.dayClose.error.title}
            description={t.dayClose.error.body}
            retry={{ label: t.dayClose.error.retry, onPress: dayClose.reload }}
            testID="courier-day-close-error"
          />
        </View>
      </View>
    );
  }

  // SEFER YOK: bu bir arıza değil, sakin bir gerçek — kapanış bir seferin mutabakatıdır ve
  // sürülmemiş bir seferin sayımı da yoktur. Boş bir form çizmek, olmayan bir kaydı davet ederdi.
  if (run === null) {
    return (
      <View style={styles.screen} testID="courier-day-close">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.dayClose.noRun.title}
            description={t.dayClose.noRun.body}
            testID="courier-day-close-no-run"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="courier-day-close">
      {header}

      <FormScroll contentContainerStyle={styles.body} testID="courier-day-close-body">
        {dayClose.closed ? (
          <View style={styles.closedBox} testID="courier-day-close-readonly">
            <Text style={styles.closedText}>{t.dayClose.closed}</Text>
          </View>
        ) : null}
        {dayClose.openWarning === null ? null : (
          <View style={styles.warnBox} testID="courier-day-close-warning">
            <Text style={styles.warnBoxText}>{dayClose.openWarning}</Text>
          </View>
        )}

        <View style={styles.counters}>
          <CounterCard
            value={dayClose.deliveredCount}
            label={t.dayClose.counters.delivered}
            tone="delivered"
            testID="courier-count-delivered"
          />
          <CounterCard
            value={dayClose.pendingCount}
            label={t.dayClose.counters.pending}
            tone="pending"
            testID="courier-count-pending"
          />
          <CounterCard
            value={dayClose.returnedCount}
            label={t.dayClose.counters.returned}
            tone="returned"
            testID="courier-count-returned"
          />
        </View>
        <Text style={styles.hintText}>{t.dayClose.countersNote}</Text>

        <View style={styles.moneyBlock}>
          <Text style={styles.sectionHeading}>{t.dayClose.moneyHeading}</Text>
          {dayClose.rows.map((row) => (
            <View key={row.method} style={styles.moneyRow} testID={`courier-money-${row.method}`}>
              <View style={styles.moneyLabels}>
                <Text style={styles.moneyName}>{row.label}</Text>
                <Text style={styles.moneyExpected}>{expectedLabel(row.expectedCents)}</Text>
              </View>
              <TextInput
                value={row.countedText}
                onChangeText={(value) => dayClose.setCounted(row.method, value)}
                editable={!dayClose.closed}
                keyboardType="decimal-pad"
                accessibilityLabel={fillCopy(t.dayClose.countLabel, { method: row.label })}
                style={[styles.moneyInput, dayClose.closed ? styles.moneyInputLocked : undefined]}
                testID={`courier-money-input-${row.method}`}
              />
              <Text
                style={[
                  styles.difference,
                  row.differenceCents === null
                    ? styles.differenceUnknown
                    : row.differenceCents === 0
                      ? styles.differenceZero
                      : row.differenceCents < 0
                        ? styles.differenceShort
                        : styles.differenceOver,
                ]}
                testID={`courier-money-diff-${row.method}`}
              >
                {row.differenceLabel}
              </Text>
            </View>
          ))}
          <Text style={styles.hintText}>{t.dayClose.differenceNote}</Text>
        </View>

        <View style={styles.noteBlock}>
          <Text style={styles.sectionHeading}>{t.dayClose.noteHeading}</Text>
          <TextInput
            value={dayClose.note}
            onChangeText={dayClose.setNote}
            editable={!dayClose.closed}
            placeholder={t.dayClose.notePlaceholder}
            placeholderTextColor={operationsTheme.colors.muted}
            accessibilityLabel={t.dayClose.noteLabel}
            style={[styles.noteInput, dayClose.closed ? styles.moneyInputLocked : undefined]}
            testID="courier-day-close-note"
          />
        </View>
      </FormScroll>

      <View style={styles.footer}>
        {dayClose.notice === null ? null : (
          <Text
            style={[
              styles.notice,
              dayClose.notice.tone === 'ok'
                ? styles.noticeOk
                : dayClose.notice.tone === 'info'
                  ? styles.noticeInfo
                  : styles.noticeError,
            ]}
            accessibilityRole="alert"
            testID="courier-day-close-notice"
          >
            {dayClose.notice.text}
          </Text>
        )}

        {dayClose.confirming ? (
          <>
            <View style={styles.confirmBox} testID="courier-day-close-confirm-box">
              <Text style={styles.confirmText}>{t.dayClose.confirmBox}</Text>
            </View>
            <View style={styles.confirmRow}>
              <PressableSurface
                onPress={dayClose.cancelConfirm}
                feedback="scale"
                grow
                style={[styles.confirmButton, styles.confirmCancel]}
                accessibilityLabel={t.dayClose.cancel}
                testID="courier-day-close-cancel"
              >
                <Text style={styles.confirmCancelLabel}>{t.dayClose.cancel}</Text>
              </PressableSurface>
              <PressableSurface
                onPress={dayClose.close}
                feedback="shadow"
                grow={1.3}
                style={[styles.confirmButton, styles.confirmYes]}
                accessibilityLabel={t.dayClose.confirm}
                testID="courier-day-close-confirm"
              >
                <Text style={styles.confirmYesLabel}>
                  {dayClose.sending ? t.dayClose.sending : t.dayClose.confirm}
                </Text>
              </PressableSurface>
            </View>
          </>
        ) : (
          <PressableSurface
            onPress={dayClose.askConfirm}
            disabled={dayClose.closed}
            feedback="shadow"
            style={[styles.cta, dayClose.closed ? styles.ctaClosed : styles.ctaOpen]}
            accessibilityLabel={dayClose.closed ? t.dayClose.ctaClosed : t.dayClose.cta}
            testID="courier-day-close-cta"
          >
            <Text style={styles.ctaLabel}>{dayClose.closed ? t.dayClose.ctaClosed : t.dayClose.cta}</Text>
          </PressableSurface>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  centered: { flex: 1, justifyContent: 'center' },
  block: { paddingHorizontal: operationsTheme.space['6xl'] },
  body: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space['6xl'],
    gap: operationsTheme.space['2xl'],
  },
  closedBox: {
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['3xl'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  closedText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['field-label--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.body,
  },
  warnBox: {
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['3xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.terracotta,
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.panel,
  },
  warnBoxText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['field-label--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.terracotta,
  },
  counters: { flexDirection: 'row', gap: operationsTheme.space.lg },
  counter: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.control,
  },
  counter_delivered: { backgroundColor: operationsTheme.colors['olive-bg'] },
  counter_pending: { backgroundColor: operationsTheme.colors['neutral-bg'] },
  counter_returned: { backgroundColor: operationsTheme.colors['error-bg'] },
  counterValue: {
    // v2: `800 22px` — Karla'nın 800'ü yüklenmiyor; en yakın gerçek kesit 700 (`fonts.ts`).
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.icon,
  },
  counterLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['badge-sm'],
  },
  counterText_delivered: { color: operationsTheme.colors['olive-dark'] },
  counterText_pending: { color: operationsTheme.colors.muted },
  counterText_returned: { color: operationsTheme.colors.error },
  moneyBlock: { gap: operationsTheme.space['2xs'] },
  sectionHeading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  moneyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space.lg,
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  moneyLabels: { flex: 1 },
  moneyName: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  moneyExpected: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  moneyInput: {
    width: operationsTheme.size.circleSm,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.lg,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.card,
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.body,
    textAlign: 'right',
    color: operationsTheme.colors.ink,
  },
  moneyInputLocked: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
    borderColor: operationsTheme.colors['disabled-line'],
    color: operationsTheme.colors['disabled-text'],
  },
  difference: {
    width: operationsTheme.size.avatarLg,
    textAlign: 'right',
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.note,
  },
  differenceZero: { color: operationsTheme.colors.muted },
  differenceShort: { color: operationsTheme.colors.error },
  differenceOver: { color: operationsTheme.colors['olive-dark'] },
  differenceUnknown: { color: operationsTheme.colors.muted },
  noteBlock: { gap: operationsTheme.space.sm },
  noteInput: {
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.panel,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  hintText: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  footer: {
    gap: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space.lg,
    paddingBottom: operationsTheme.space['3xl'],
  },
  notice: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    padding: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.control,
  },
  noticeOk: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    color: operationsTheme.colors['olive-dark'],
  },
  noticeInfo: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
    color: operationsTheme.colors.body,
  },
  noticeError: {
    backgroundColor: operationsTheme.colors['error-bg'],
    color: operationsTheme.colors.error,
  },
  confirmBox: {
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['3xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.error,
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.panel,
  },
  confirmText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['field-label--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    lineHeight: operationsTheme.text['field-label'] * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.error,
  },
  confirmRow: { flexDirection: 'row', gap: operationsTheme.space.md },
  // `flex` düğme stilinde DEĞİL (23.08 ölçümü — `PressableSurface.grow` künyesi).
  confirmButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
  },
  confirmCancel: { borderColor: operationsTheme.colors['sand-500'] },
  confirmCancelLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  confirmYes: {
    backgroundColor: operationsTheme.colors.error,
    borderColor: operationsTheme.colors.error,
    boxShadow: operationsTheme.shadow.hard,
  },
  confirmYesLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.card,
  },
  cta: {
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
  },
  ctaOpen: {
    backgroundColor: operationsTheme.colors.ink,
    boxShadow: operationsTheme.shadow['hard-on-ink'],
  },
  ctaClosed: { backgroundColor: operationsTheme.colors['disabled-fill'] },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['on-image'],
  },
});
