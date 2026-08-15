import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { ReturnDispositionEnum, type ReturnDisposition } from '@lezzet/types';

import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { FormScroll } from '@/components/ui/form-scroll';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import { COURIER_RETURN_FIXTURE, COURIER_RETURN_UNREACHED } from './courier-return-fixture';
import { useCourierReturn } from './use-courier-return.hook';
import { useWarehouseStatus } from './warehouse-status';

/*
  D6 · KURYE DÖNÜŞÜ KABULÜ (v2:483-510).

  ── ÜÇ AKIBET, ÜÇ FARKLI GERÇEK ─────────────────────────────────────────────
  `restock` malı stoğa geri koyar (**sebep notu zorunlu** — soğuk zincir beyanı, kuralı veri
  zorlar), `discard` fiiliden düşer, `goodwill` mala DOKUNMAZ (müşteride kaldı) ve yalnız kayıt
  düşer. Üçü aynı listede satır satır seçilebilir — bir kolinin yarısı iade, yarısı jest olabilir.

  ── ULAŞILAMAYANLAR KABUL EDİLMEZ ───────────────────────────────────────────
  v2:505'in bloğu bir LİSTE, bir form değil: araçta kalan mal bu ekrandan kayda geçmez, yarına
  devrolur. Dokunulabilir bir öğe gibi çizmek, olmayan bir eylemi varmış gibi gösterirdi.

  ── DÖKÜM FIXTURE, KAYIT GERÇEK ─────────────────────────────────────────────
  Gerekçe `courier-return-fixture.ts` künyesinde (okuma kapısı yok). Ekranın geri kalanı TAM.
*/

const t = warehouseCopy;

/** Üç akıbet — sırası TİPTEN gelir (`ReturnDispositionEnum`), ekran kendi listesini yazmaz. */
const DISPOSITIONS: readonly ReturnDisposition[] = ReturnDispositionEnum.options;

export function CourierReturnScreen() {
  const router = useRouter();
  const drop = COURIER_RETURN_FIXTURE;
  const returnState = useCourierReturn(drop);
  const { offline } = useWarehouseStatus();

  const cta = offline
    ? { label: t.common.offlineCta, enabled: false }
    : returnState.sending
      ? { label: t.return.cta.sending, enabled: false }
      : returnState.canSubmit
        ? { label: t.return.cta.ready, enabled: true }
        : { label: t.return.cta.pending, enabled: false };

  return (
    <View style={styles.screen} testID="warehouse-courier-return">
      <OperationsStackHeader
        title={t.return.title}
        subtitle={fillCopy(t.return.caption, { courier: drop.courierName })}
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="warehouse-return-header"
      />

      <FormScroll contentContainerStyle={styles.list} testID="warehouse-return-body">
        <Text style={styles.heading}>{t.return.heading}</Text>

        {drop.lines.map((line) => {
          const disposition = returnState.dispositionOf(line.orderItemId);
          return (
            <View key={line.orderItemId} style={styles.lineRow} testID={`warehouse-return-line-${line.orderItemId}`}>
              <Text style={styles.rowTitle}>{`${drop.referenceNo} · ${line.qty} × ${line.name}`}</Text>
              {drop.note === null ? null : (
                <Text style={styles.rowSub}>
                  {fillCopy(t.return.courierNote, { note: drop.note })}
                  {drop.hasPhoto ? ` · ${t.return.hasPhoto}` : ''}
                </Text>
              )}

              <View style={styles.chipRow}>
                {DISPOSITIONS.map((option) => (
                  <OperationsChoiceChip
                    key={option}
                    label={t.return.disposition[option]}
                    selected={disposition === option}
                    onPress={() => returnState.pick(line.orderItemId, option)}
                    fill
                    testID={`warehouse-return-${option}-${line.orderItemId}`}
                  />
                ))}
              </View>

              {disposition === 'restock' ? (
                <View style={styles.noteBlock} testID={`warehouse-return-note-block-${line.orderItemId}`}>
                  <Text style={styles.noteHint}>{t.return.restockNote}</Text>
                  <TextInput
                    value={returnState.noteOf(line.orderItemId)}
                    onChangeText={(text) => returnState.setNote(line.orderItemId, text)}
                    placeholder={t.return.notePlaceholder}
                    placeholderTextColor={operationsTheme.colors.muted}
                    accessibilityLabel={fillCopy(t.return.noteField, { name: line.name })}
                    style={styles.noteInput}
                    testID={`warehouse-return-note-${line.orderItemId}`}
                  />
                </View>
              ) : null}

              {disposition === 'goodwill' ? <Text style={styles.rowSub}>{t.return.goodwillNote}</Text> : null}
            </View>
          );
        })}

        <Text style={styles.heading}>{t.return.unreachedHeading}</Text>
        {COURIER_RETURN_UNREACHED.map((row) => (
          <Text key={row.referenceNo} style={styles.unreached} testID={`warehouse-return-unreached-${row.referenceNo}`}>
            {fillCopy(t.return.unreachedRow, { ref: row.referenceNo, n: String(row.parcels) })}
          </Text>
        ))}

        <Text style={styles.footnote}>{t.return.footnote}</Text>
      </FormScroll>

      <LinearGradient {...operationsTheme.gradient.stickyFade} style={styles.sticky}>
        {returnState.notice === null ? null : (
          <Text
            style={[styles.notice, styles[`notice_${returnState.notice.tone}`]]}
            accessibilityRole="alert"
            testID="warehouse-return-notice"
          >
            {returnState.notice.text}
          </Text>
        )}
        <PressableSurface
          onPress={returnState.submit}
          disabled={!cta.enabled}
          feedback="shadow"
          style={[styles.cta, cta.enabled ? styles.ctaReady : styles.ctaIdle]}
          accessibilityLabel={cta.label}
          testID="warehouse-return-cta"
        >
          <Text style={styles.ctaLabel}>{cta.label}</Text>
        </PressableSurface>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['8xl'],
    gap: operationsTheme.space.sm,
  },
  heading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space.lg,
  },
  lineRow: {
    gap: operationsTheme.space.sm,
    paddingVertical: operationsTheme.space.lg,
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  rowTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  rowSub: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  chipRow: {
    flexDirection: 'row',
    gap: operationsTheme.space.md,
  },
  noteBlock: {
    gap: operationsTheme.space.sm,
  },
  noteHint: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.terracotta,
  },
  noteInput: {
    minHeight: operationsTheme.size.controlSm,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.ink,
  },
  /** v2:506 — soluk, dokunulamaz: araçta kalan mal bu ekrandan kayda geçmez. */
  unreached: {
    opacity: 0.55,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
    paddingVertical: operationsTheme.space.md,
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingVertical: operationsTheme.space.lg,
  },
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: operationsTheme.space.xl,
    paddingBottom: operationsTheme.space['3xl'],
    paddingHorizontal: operationsTheme.space['5xl'],
  },
  notice: {
    marginBottom: operationsTheme.space.md,
    padding: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.control,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
  },
  notice_ok: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    color: operationsTheme.colors['olive-dark'],
  },
  notice_warn: {
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    color: operationsTheme.colors.terracotta,
  },
  notice_error: {
    backgroundColor: operationsTheme.colors['error-bg'],
    color: operationsTheme.colors.error,
  },
  cta: {
    height: operationsTheme.size.controlLg,
    borderRadius: operationsTheme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaReady: {
    backgroundColor: operationsTheme.colors.ink,
    boxShadow: operationsTheme.shadow['hard-on-ink'],
  },
  ctaIdle: { backgroundColor: operationsTheme.colors['disabled-fill'] },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['on-image'],
  },
});
