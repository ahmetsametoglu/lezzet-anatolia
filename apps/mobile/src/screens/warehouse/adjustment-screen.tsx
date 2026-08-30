import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { WarehouseAdjustmentReasonEnum, type WarehouseAdjustmentReason } from '@lezzet/types';

import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsQtyField } from '@/components/operations/qty-field';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { FormScroll } from '@/components/ui/form-scroll';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import { useAdjustment } from './use-adjustment.hook';
import { parseQty, qtyToText } from './warehouse-format';
import { useWarehouseStatus } from './warehouse-status';

/*
  D4 · SAYIM / DÜZELTME (v2:427-455).

  ── KONU (PARTİ) ROTADAN GELİR ──────────────────────────────────────────────
  Ekran "hangi parti" sorusunu KENDİ soramaz: depo partilerini listeleyen bir okuma kapısı bugün yok
  (`batch-view` terfisi = 06.13). Parti D3'ten taşınır — tasarımın kendi yolu: *"'İmha edilmeli' →
  Sayım/Düzeltme"*. D3 bugün fixture olduğu için taşınan kimlik de gerçek değil ve kapı `not_found`
  döner; ekran o reddi AYNEN gösterir (sahte bir başarı ekranı basmaktansa).

  Konusuz açılırsa (hub'dan doğrudan) ekran bunu söyler ve form ÇİZİLMEZ: partisiz bir sayım
  formu, dolduran kişiye neyin düşeceğini söylemeyen bir formdur.

  ── İŞARET ─────────────────────────────────────────────────────────────────
  Alandaki eksi "stoktan düştü"dür (operatörün dili); kapıya ters işaretle gider. Gerekçe ve tek
  çevirici hook künyesinde — burada tekrar edilmiyor.
*/

const t = warehouseCopy;

/** Dört sebep — sırası TİPTEN gelir, ekran kendi listesini yazmaz (hook künyesi). */
const REASONS: readonly WarehouseAdjustmentReason[] = WarehouseAdjustmentReasonEnum.options;

export function AdjustmentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ stockId?: string; code?: string; name?: string }>();
  const adjustment = useAdjustment();
  const { offline } = useWarehouseStatus();

  const stockId = typeof params.stockId === 'string' && params.stockId.length > 0 ? params.stockId : null;
  const subject = [params.code, params.name].filter((part): part is string => typeof part === 'string' && part.length > 0);

  const header = (
    <OperationsStackHeader
      title={t.adjustment.title}
      subtitle={subject.length === 0 ? t.adjustment.noSubject : subject.join(' · ')}
      onBack={() => router.back()}
      backLabel={t.common.back}
      testID="warehouse-adjustment-header"
    />
  );

  if (stockId === null) {
    return (
      <View style={styles.screen} testID="warehouse-adjustment">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.adjustment.noSubjectBlock.title}
            description={t.adjustment.noSubjectBlock.body}
            testID="warehouse-adjustment-no-subject"
          />
          {/* ÇIKIŞ YOLU BLOĞUN İÇİNDE (v3:914) — "hangi parti" diye sorup cevabın nerede olduğunu
              söylememek, depocuyu geri tuşuna mahkûm ederdi. Şablon iki yol gösteriyor; ikincisi
              ("parti etiketini okut") bugün yazılamadı — parti etiketini çözen bir uç yok
              (`codes/resolve` varyant çözüyor). Uyuşmazlık defterinde. */}
          <PressableSurface
            onPress={() => router.navigate('/near-expiry')}
            feedback="scale"
            style={styles.toNearExpiry}
            accessibilityLabel={t.adjustment.toNearExpiry}
            testID="warehouse-adjustment-to-near-expiry"
          >
            <Text style={styles.toNearExpiryLabel}>{t.adjustment.toNearExpiry}</Text>
          </PressableSurface>
        </View>
      </View>
    );
  }

  const cta = offline
    ? { label: t.common.offlineCta, enabled: false }
    : adjustment.sending
      ? { label: t.adjustment.cta.sending, enabled: false }
      : adjustment.canSubmit
        ? { label: t.adjustment.cta.ready, enabled: true }
        : { label: t.adjustment.cta.pending, enabled: false };

  return (
    <View style={styles.screen} testID="warehouse-adjustment">
      {header}

      <FormScroll contentContainerStyle={styles.list} testID="warehouse-adjustment-body">
        <View style={styles.section}>
          <Text style={styles.heading}>{t.adjustment.reasonHeading}</Text>
          <View style={styles.chipRow}>
            {REASONS.map((reason) => (
              <OperationsChoiceChip
                key={reason}
                label={t.adjustment.reason[reason]}
                selected={adjustment.reason === reason}
                onPress={() => adjustment.pickReason(reason)}
                testID={`warehouse-adjustment-reason-${reason}`}
              />
            ))}
          </View>
          <Text style={styles.hint}>{t.adjustment.reasonNote}</Text>
        </View>

        <View style={styles.qtyRow}>
          <View style={styles.qtyLabels}>
            <Text style={styles.qtyTitle}>{t.adjustment.qtyLabel}</Text>
            <Text style={styles.hint}>{t.adjustment.qtyHelp}</Text>
          </View>
          <OperationsQtyField
            value={qtyToText(adjustment.qty)}
            onChangeText={(text) => adjustment.setQty(parseQty(text))}
            accessibilityLabel={t.adjustment.qtyField}
            signed
            size="lg"
            tone={adjustment.isRestock ? 'done' : adjustment.qty !== null && adjustment.qty < 0 ? 'down' : 'neutral'}
            testID="warehouse-adjustment-qty"
          />
        </View>

        {/* Fazla YALNIZ sayım farkındadır; başka sebeple stok artmaz (v2'nin `dSayOk`u). */}
        {adjustment.isRestock && !adjustment.surplusAllowed ? (
          <View style={styles.warnBox} testID="warehouse-adjustment-surplus-warning">
            <Text style={styles.warnText}>{t.adjustment.surplusOnlyCount}</Text>
          </View>
        ) : null}

        {adjustment.isRestock && adjustment.surplusAllowed ? (
          <View style={styles.section} testID="warehouse-adjustment-note-block">
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>{t.adjustment.noteRequired}</Text>
            </View>
            <TextInput
              value={adjustment.note}
              onChangeText={adjustment.setNote}
              placeholder={t.adjustment.notePlaceholder}
              placeholderTextColor={operationsTheme.colors.muted}
              accessibilityLabel={t.adjustment.noteField}
              style={styles.noteInput}
              testID="warehouse-adjustment-note"
            />
          </View>
        ) : null}

        <View style={styles.refBox}>
          <Text style={styles.heading}>{t.adjustment.refHeading}</Text>
          <Text style={styles.refValue} testID="warehouse-adjustment-ref">
            {adjustment.referenceNo ?? t.adjustment.refPending}
          </Text>
          <Text style={styles.hint}>{t.adjustment.refHelp}</Text>
        </View>
      </FormScroll>

      <LinearGradient {...operationsTheme.gradient.stickyFade} style={styles.sticky}>
        {adjustment.notice === null ? null : (
          <Text
            style={[styles.notice, styles[`notice_${adjustment.notice.tone}`]]}
            accessibilityRole="alert"
            testID="warehouse-adjustment-notice"
          >
            {adjustment.notice.text}
          </Text>
        )}
        {/* ÇEVRİMDIŞI: SEBEP YAZILIR (v3:983) — düğmenin üstünde, düğmenin yerine değil. Burada
            düğme KALIYOR (kabul ekranlarının aksine): CTA zaten kapalı ve "kaydet" fiilinin
            görünür kalması, işin bittiğinde ne olacağını söylüyor. Eksik olan sebepti — depocu
            neden kaydedemediğini bilmeden bekliyordu. */}
        {!offline ? null : (
          <View style={styles.locked} testID="warehouse-adjustment-locked">
            <Text style={styles.lockedTitle}>{t.adjustment.locked.title}</Text>
            <Text style={styles.lockedBody}>{t.adjustment.locked.body}</Text>
          </View>
        )}
        <PressableSurface
          onPress={() => adjustment.submit(stockId)}
          disabled={!cta.enabled}
          feedback="shadow"
          style={[styles.cta, cta.enabled ? styles.ctaReady : styles.ctaIdle]}
          accessibilityLabel={cta.label}
          testID="warehouse-adjustment-cta"
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
  block: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space['7xl'],
    gap: operationsTheme.space['2xl'],
  },
  /** Boş hâlin çıkış yolu — "hangi parti" sorusunun cevabının bulunduğu yere götürür. */
  toNearExpiry: {
    alignItems: 'center',
    paddingVertical: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
  },
  toNearExpiryLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['olive-dark'],
  },
  /** Çevrimdışı sebebi — CTA'nın ÜSTÜNDE; düğme kalıyor, eksik olan sebepti. */
  locked: {
    backgroundColor: operationsTheme.colors['error-bg'],
    borderRadius: operationsTheme.radius.control,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.xl,
    gap: operationsTheme.space['2xs'],
    marginBottom: operationsTheme.space.lg,
  },
  lockedTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.error,
  },
  lockedBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.error,
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['8xl'],
    gap: operationsTheme.space['2xl'],
  },
  section: {
    gap: operationsTheme.space.md,
    paddingTop: operationsTheme.space.sm,
  },
  heading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: operationsTheme.space.md,
  },
  hint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  qtyLabels: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  qtyTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  warnBox: {
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['terracotta-bg'],
  },
  warnText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
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
  refBox: {
    gap: operationsTheme.space['2xs'],
    padding: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.panel,
  },
  refValue: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text['card-title-sm'],
    color: operationsTheme.colors.ink,
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
