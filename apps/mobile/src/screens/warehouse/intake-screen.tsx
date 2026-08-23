import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { IntakeFormRowContract } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsQtyField } from '@/components/operations/qty-field';
import { OperationsQtySlider } from '@/components/operations/qty-slider';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { AvatarThumb } from '@/components/ui/avatar-thumb';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { FormScroll } from '@/components/ui/form-scroll';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import { useIntake, type IntakeRowState, type ScannedCode } from './use-intake.hook';
import { parseDate, parseQty, productLabel, qtyToText, shortDate } from './warehouse-format';
import { useWarehouseStatus } from './warehouse-status';

/*
  D2 · MAL KABUL (v2:353-400).

  ── KONU (TEDARİK SİPARİŞİ) ROTADAN GELİR ───────────────────────────────────
  Bekleyen sevkiyatları listeleyen bir kapı bugün YOK: uç yalnız "şu siparişin formunu ver" diyor
  (`GET /intake/:purchaseOrderId`), "hangi siparişler bekliyor" demiyor. Ekran bu yüzden konusunu
  rotadan alır (bildirim derin bağı ya da yönetim ekranı) ve konusuz açıldığında bunu SÖYLER —
  uydurma bir sevkiyat listesi çizmek, depocuyu olmayan bir kolinin başına gönderirdi.

  ── SKT · LOT · HASAR ───────────────────────────────────────────────────────
  Üçü de v2'nin satır altı çipleri. SKT zorunlu (şema zorluyor), lot BOŞ bırakılabilir ama bilinçli
  olmalı (çip bunu yazıyor), hasar bir NOT alanı açar — fotoğraf yok, gerekçe hook künyesinde.

  ── FARK ÖZETİ YALNIZ SAPAN SATIRLARDIR ─────────────────────────────────────
  v2'nin başlığı birebir: "FARK ÖZETİ — YALNIZ SAPAN SATIRLAR". Uyan satırı listeye koymak, farkı
  aramayı zorlaştırırdı. Kabul yine YAZILIR: parçalı kabul meşrudur (DOMAIN §4).
*/

const t = warehouseCopy;

export function IntakeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ purchaseOrderId?: string }>();
  const purchaseOrderId =
    typeof params.purchaseOrderId === 'string' && params.purchaseOrderId.length > 0 ? params.purchaseOrderId : null;
  const intake = useIntake(purchaseOrderId);
  const { offline } = useWarehouseStatus();

  const header = (
    <OperationsStackHeader
      title={t.intake.title}
      subtitle={purchaseOrderId === null ? t.intake.captionUnplanned : t.intake.captionPlanned}
      onBack={() => router.back()}
      backLabel={t.common.back}
      testID="warehouse-intake-header"
    />
  );

  if (purchaseOrderId === null) {
    return (
      <View style={styles.screen} testID="warehouse-intake">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.intake.noSubject.title}
            description={t.intake.noSubject.body}
            testID="warehouse-intake-no-subject"
          />
        </View>
      </View>
    );
  }

  if (intake.status === 'loading') {
    return (
      <View style={styles.screen} testID="warehouse-intake">
        {header}
        <View style={styles.centered}>
          <LoadingState accessibilityLabel={t.intake.loading} label={t.intake.loading} testID="warehouse-intake-loading" />
        </View>
      </View>
    );
  }

  if (intake.status === 'error') {
    return (
      <View style={styles.screen} testID="warehouse-intake">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="error"
            title={t.intake.error.title}
            description={t.intake.error.body}
            retry={{ label: t.common.retry, onPress: intake.reload }}
            testID="warehouse-intake-error"
          />
        </View>
      </View>
    );
  }

  if (intake.rows.length === 0) {
    return (
      <View style={styles.screen} testID="warehouse-intake">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.intake.emptyForm.title}
            description={t.intake.emptyForm.body}
            testID="warehouse-intake-empty"
          />
        </View>
      </View>
    );
  }

  const cta = offline
    ? { label: t.common.offlineCta, enabled: false }
    : intake.sending
      ? { label: t.intake.cta.sending, enabled: false }
      : !intake.complete
        ? { label: t.intake.cta.pending, enabled: false }
        : { label: intake.differences.length > 0 ? t.intake.cta.partial : t.intake.cta.ready, enabled: true };

  return (
    <View style={styles.screen} testID="warehouse-intake">
      {header}

      <FormScroll contentContainerStyle={styles.list} testID="warehouse-intake-lines">
        {/* Tarama (Modül 23 · 23.4): barkodun buradaki TEK işi satırı bulmak — koli kodunda adet
            çarpan kadar önerilir, depocu düzeltebilir. Çevrimdışıyken çizilmez: çözüm sunucuda ve
            "sonra dene" diyecek bir kuyruğu yok. */}
        {offline ? null : (
          <PressableSurface
            onPress={intake.openScan}
            feedback="shadow"
            style={styles.scanCta}
            accessibilityLabel={t.intake.scan.cta}
            testID="warehouse-intake-scan-cta"
          >
            <Text style={styles.scanCtaLabel}>{t.intake.scan.cta}</Text>
          </PressableSurface>
        )}

        {intake.rows.map((row) => (
          <IntakeRow
            key={row.variantId}
            row={row}
            state={intake.stateOf(row.variantId)}
            onPatch={(patch) => intake.patch(row.variantId, patch)}
          />
        ))}

        {intake.differences.length === 0 ? null : (
          <View style={styles.diffBox} testID="warehouse-intake-differences">
            <Text style={styles.heading}>{t.intake.diffHeading}</Text>
            {intake.differences.map((row) => (
              <Text key={row.name} style={styles.diffRow}>
                {fillCopy(t.intake.diffRow, {
                  name: row.name,
                  expected: String(row.expected),
                  received: String(row.received),
                })}
              </Text>
            ))}
          </View>
        )}

        {intake.warnings.map((warning) => (
          <Text key={warning.name} style={styles.warning} testID="warehouse-intake-warning">
            {`${warning.name} — ${
              warning.remainingPercent === null
                ? t.intake.lifeUnknown
                : fillCopy(t.intake.lifeWarning, { pct: String(Math.round(warning.remainingPercent)) })
            }`}
          </Text>
        ))}

        <Text style={styles.footnote}>{t.intake.footnote}</Text>
        <Text style={styles.footnote}>{t.intake.photoNote}</Text>
      </FormScroll>

      <LinearGradient {...operationsTheme.gradient.stickyFade} style={styles.sticky}>
        {intake.notice === null ? null : (
          <Text
            style={[styles.notice, styles[`notice_${intake.notice.tone}`]]}
            accessibilityRole="alert"
            testID="warehouse-intake-notice"
          >
            {intake.notice.text}
          </Text>
        )}
        <PressableSurface
          onPress={intake.submit}
          disabled={!cta.enabled}
          feedback="shadow"
          style={[styles.cta, cta.enabled ? styles.ctaReady : styles.ctaIdle]}
          accessibilityLabel={cta.label}
          testID="warehouse-intake-cta"
        >
          <Text style={styles.ctaLabel}>{cta.label}</Text>
        </PressableSurface>
      </LinearGradient>

      <ScanSheet
        open={intake.scanOpen}
        title={t.intake.scan.title}
        hint={t.intake.scan.hint}
        onClose={intake.closeScan}
        onScan={intake.handleScan}
        testID="warehouse-intake-scan"
      />

      {/* Okutma çekmecesi (kullanıcı tasarımı 23.08): okutma bir SAYIM değil TANITIMDIR — kod bir
          kez okutulur, "kaç geldi" burada söylenir. Varsayılan adet okutulan birimin miktarı
          (koli → çarpan, tekil → 1); satıra ancak onayla yazılır. `key` her okutmada seçicinin
          eksenini tazeler: önceki okutmanın büyütülmüş penceresi yenisine miras kalmaz. */}
      <BottomSheet
        visible={intake.scanned !== null}
        title={t.intake.scan.drawerTitle}
        onClose={intake.cancelScanned}
        testID="warehouse-intake-scanned"
      >
        {intake.scanned === null ? null : (
          <>
            <View style={styles.scannedHead}>
              <AvatarThumb
                initial={intake.scanned.productName.slice(0, 1)}
                photoUri={intake.scanned.imageUrl}
                size="lg"
                accessibilityLabel={productLabel(intake.scanned.productName, intake.scanned.variantLabel)}
                testID="warehouse-intake-scanned-photo"
              />
              <View style={styles.scannedNames}>
                <Text style={styles.scannedName}>
                  {productLabel(intake.scanned.productName, intake.scanned.variantLabel)}
                </Text>
                <Text style={styles.scannedMeta}>{scanMeta(intake.scanned)}</Text>
                <Text style={styles.scannedMeta}>
                  {fillCopy(t.intake.expected, { qty: String(intake.scanned.expectedQty) })}
                </Text>
              </View>
            </View>
            <OperationsQtySlider
              key={intake.scanned.variantId}
              value={intake.scanned.qty}
              onChange={intake.setScannedQty}
              step={intake.scanned.qtyPerCode}
              expected={intake.scanned.expectedQty}
              accessibilityLabel={t.intake.scan.drawerQty}
              fineLabels={{ increase: t.intake.scan.drawerQtyIncrease, decrease: t.intake.scan.drawerQtyDecrease }}
              caption={qtyCaption(intake.scanned)}
              testID="warehouse-intake-scanned-qty"
            />
            <PressableSurface
              onPress={intake.confirmScanned}
              disabled={intake.scanned.qty <= 0}
              feedback="shadow"
              style={[styles.cta, intake.scanned.qty > 0 ? styles.ctaReady : styles.ctaIdle]}
              accessibilityLabel={t.intake.scan.drawerConfirm}
              testID="warehouse-intake-scanned-confirm"
            >
              <Text style={styles.ctaLabel}>{t.intake.scan.drawerConfirm}</Text>
            </PressableSurface>
          </>
        )}
      </BottomSheet>

      {/* Öğrenen eşleme (karar §1.3): tanınmayan kod için satır seçtirilir — kod o varyanta
          yazılır, bir daha sorulmaz. Aday kümesi FORMUN satırlarıdır: PO'lu kabulde gelen koli
          zaten siparişin bir kalemidir; katalog araması açmak, yanlış ürüne öğretmenin kapısını
          ardına kadar açardı. */}
      <BottomSheet
        visible={intake.learn !== null}
        title={t.intake.scan.learnTitle}
        onClose={intake.cancelLearn}
        testID="warehouse-intake-learn"
      >
        <Text style={styles.learnBody}>
          {fillCopy(t.intake.scan.learnBody, { code: intake.learn?.code ?? '' })}
        </Text>
        {intake.rows.map((row) => (
          <PressableSurface
            key={row.variantId}
            onPress={() => intake.teach(row.variantId)}
            feedback="tint"
            style={styles.learnRow}
            accessibilityLabel={productLabel(row.productName, row.variantLabel)}
          >
            <Text style={styles.learnRowLabel}>{productLabel(row.productName, row.variantLabel)}</Text>
            <Text style={styles.learnRowMeta}>{fillCopy(t.intake.expected, { qty: String(row.expectedQty) })}</Text>
          </PressableSurface>
        ))}
        <PressableSurface onPress={intake.cancelLearn} feedback="opacity" style={styles.learnCancel} accessibilityLabel={t.intake.scan.learnCancel}>
          <Text style={styles.learnCancelLabel}>{t.intake.scan.learnCancel}</Text>
        </PressableSurface>
      </BottomSheet>
    </View>
  );
}

/** Çekmecenin künye satırı: kodun TÜRÜ ve kesinlik derecesi — SKU/tedarikçi eşleşmesi barkod kadar kesin değildir, ekran bunu söyler. */
function scanMeta(scanned: ScannedCode): string {
  if (scanned.source === 'sku') return t.intake.scan.drawerSku;
  if (scanned.source === 'supplier_code') return t.intake.scan.drawerSupplier;
  return scanned.kind === 'case'
    ? fillCopy(t.intake.scan.drawerCase, { n: String(scanned.qtyPerCode) })
    : t.intake.scan.drawerUnit;
}

/** Koli dökümü ("10 koli + 3 adet") — yalnız gerçek koli kodunda; tekilde sayının kendisi yeter. */
function qtyCaption(scanned: ScannedCode): string | undefined {
  if (scanned.kind !== 'case' || scanned.qtyPerCode <= 1) return undefined;
  const cases = Math.floor(scanned.qty / scanned.qtyPerCode);
  const loose = scanned.qty % scanned.qtyPerCode;
  return loose === 0
    ? fillCopy(t.intake.scan.drawerCases, { k: String(cases) })
    : fillCopy(t.intake.scan.drawerCasesPlus, { k: String(cases), m: String(loose) });
}

interface IntakeRowProps {
  row: IntakeFormRowContract;
  state: IntakeRowState;
  onPatch: (patch: Partial<IntakeRowState>) => void;
}

function IntakeRow({ row, state, onPatch }: IntakeRowProps) {
  const name = productLabel(row.productName, row.variantLabel);
  const expiry = parseDate(state.expiryText);
  const damaged = state.damageNote.length > 0;

  return (
    <View style={styles.lineRow} testID={`warehouse-intake-line-${row.variantId}`}>
      <View style={styles.lineHead}>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{name}</Text>
          <Text style={styles.rowSub}>{fillCopy(t.intake.expected, { qty: String(row.expectedQty) })}</Text>
        </View>
        <OperationsQtyField
          value={qtyToText(state.qty)}
          onChangeText={(text) => onPatch({ qty: parseQty(text) })}
          accessibilityLabel={fillCopy(t.intake.qtyLabel, { name })}
          tone={state.qty === null ? 'muted' : state.qty === row.expectedQty ? 'neutral' : 'diff'}
          testID={`warehouse-intake-qty-${row.variantId}`}
        />
      </View>

      <View style={styles.chipRow}>
        {/* SKT alanı: zorunlu olduğu ÇİPTE değil, kapıda — çip yalnız durumu söyler (v2:369). */}
        <Text
          style={[styles.chip, expiry === null ? styles.chipMissing : styles.chipDone]}
          testID={`warehouse-intake-expiry-state-${row.variantId}`}
        >
          {expiry === null ? t.intake.expiry.missing : fillCopy(t.intake.expiry.set, { date: shortDate(expiry) ?? expiry })}
        </Text>
        <PressableSurface
          onPress={() => onPatch({ lotSkipped: !state.lotSkipped })}
          feedback="scale"
          compact
          selected={state.lotSkipped}
          style={[styles.chipButton, state.lotSkipped ? styles.chipSkipped : styles.chipIdle]}
          accessibilityLabel={state.lotSkipped ? t.intake.lot.empty : fillCopy(t.intake.lot.known, { lot: state.lotText })}
          testID={`warehouse-intake-lot-toggle-${row.variantId}`}
        >
          <Text style={[styles.chipLabel, state.lotSkipped ? styles.chipLabelSkipped : styles.chipLabelIdle]}>
            {state.lotSkipped ? t.intake.lot.empty : fillCopy(t.intake.lot.known, { lot: state.lotText || '—' })}
          </Text>
        </PressableSurface>
        <PressableSurface
          onPress={() => onPatch({ damageNote: damaged ? '' : ' ' })}
          feedback="scale"
          compact
          selected={damaged}
          style={[styles.chipButton, damaged ? styles.chipDamaged : styles.chipIdle]}
          accessibilityLabel={damaged ? t.intake.damage.set : t.intake.damage.idle}
          testID={`warehouse-intake-damage-toggle-${row.variantId}`}
        >
          <Text style={[styles.chipLabel, damaged ? styles.chipLabelDamaged : styles.chipLabelIdle]}>
            {damaged ? t.intake.damage.set : t.intake.damage.idle}
          </Text>
        </PressableSurface>
      </View>

      <TextInput
        value={state.expiryText}
        onChangeText={(text) => onPatch({ expiryText: text })}
        keyboardType="numbers-and-punctuation"
        placeholder={t.intake.expiry.placeholder}
        placeholderTextColor={operationsTheme.colors.muted}
        accessibilityLabel={fillCopy(t.intake.expiry.field, { name })}
        style={styles.textInput}
        testID={`warehouse-intake-expiry-${row.variantId}`}
      />

      {state.lotSkipped ? null : (
        <TextInput
          value={state.lotText}
          onChangeText={(text) => onPatch({ lotText: text })}
          autoCapitalize="characters"
          placeholder="GAZ-7120"
          placeholderTextColor={operationsTheme.colors.muted}
          accessibilityLabel={fillCopy(t.intake.lot.field, { name })}
          style={styles.textInput}
          testID={`warehouse-intake-lot-${row.variantId}`}
        />
      )}

      {damaged ? (
        <TextInput
          value={state.damageNote}
          onChangeText={(text) => onPatch({ damageNote: text })}
          placeholder={t.intake.damage.placeholder}
          placeholderTextColor={operationsTheme.colors.muted}
          accessibilityLabel={fillCopy(t.intake.damage.field, { name })}
          style={styles.textInput}
          testID={`warehouse-intake-damage-${row.variantId}`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
  },
  block: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space['7xl'],
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['8xl'],
  },
  lineRow: {
    gap: operationsTheme.space.sm,
    paddingVertical: operationsTheme.space['2xl'],
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  lineHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  rowBody: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  rowTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  rowSub: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: operationsTheme.space.md,
  },
  chip: {
    paddingVertical: operationsTheme.space.sm,
    paddingHorizontal: operationsTheme.space.lg,
    borderWidth: operationsTheme.border.base,
    borderRadius: operationsTheme.radius.badge,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
  chipMissing: {
    borderColor: operationsTheme.colors.terracotta,
    color: operationsTheme.colors.terracotta,
  },
  chipDone: {
    borderColor: operationsTheme.colors['olive-line'],
    backgroundColor: operationsTheme.colors['olive-bg'],
    color: operationsTheme.colors['olive-dark'],
  },
  chipButton: {
    paddingVertical: operationsTheme.space.sm,
    paddingHorizontal: operationsTheme.space.lg,
    borderWidth: operationsTheme.border.base,
    borderRadius: operationsTheme.radius.badge,
  },
  chipIdle: { borderColor: operationsTheme.colors['sand-500'] },
  chipSkipped: { borderColor: operationsTheme.colors.terracotta },
  chipDamaged: {
    borderColor: operationsTheme.colors.error,
    backgroundColor: operationsTheme.colors['error-bg'],
  },
  chipLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
  chipLabelIdle: { color: operationsTheme.colors.ink },
  chipLabelSkipped: { color: operationsTheme.colors.terracotta },
  chipLabelDamaged: { color: operationsTheme.colors.error },
  textInput: {
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.card,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.ink,
  },
  diffBox: {
    marginTop: operationsTheme.space.xl,
    gap: operationsTheme.space.xs,
    padding: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.panel,
  },
  heading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  diffRow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.terracotta,
  },
  warning: {
    marginTop: operationsTheme.space.md,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.terracotta,
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space.xl,
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
    backgroundColor: operationsTheme.colors.olive,
    boxShadow: operationsTheme.shadow.hard,
  },
  ctaIdle: { backgroundColor: operationsTheme.colors['disabled-fill'] },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors.card,
  },
  // Tarama CTA'sı kabul CTA'sından KASITLI farklı (çerçeveli, dolgusuz): asıl iş kabulü
  // kaydetmektir, tarama ona giden bir yardımcı — iki dolu düğme hangisinin birincil olduğunu
  // belirsizleştirirdi.
  scanCta: {
    marginTop: operationsTheme.space['2xl'],
    height: operationsTheme.size.controlLg,
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.olive,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: operationsTheme.colors.card,
  },
  scanCtaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors.olive,
  },
  scannedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space['2xl'],
  },
  scannedNames: {
    flexShrink: 1,
    gap: operationsTheme.space['2xs'],
  },
  scannedName: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  scannedMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  learnBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
    paddingBottom: operationsTheme.space.xl,
  },
  learnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space.xl,
    borderTopWidth: operationsTheme.border.base,
    borderTopColor: operationsTheme.colors['sand-300'],
  },
  learnRowLabel: {
    flexShrink: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  learnRowMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  learnCancel: {
    marginTop: operationsTheme.space.xl,
    alignItems: 'center',
    paddingVertical: operationsTheme.space.lg,
  },
  learnCancelLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors.muted,
  },
});
