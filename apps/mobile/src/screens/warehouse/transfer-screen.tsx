import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsQtyField } from '@/components/operations/qty-field';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import { useTransfer } from './use-transfer.hook';
import { parseQty, qtyToText, shortDate } from './warehouse-format';
import { useWarehouseStatus } from './warehouse-status';

/*
  D5 · TRANSFER — RAMPADA SAYIM (v2:458-480).

  Ekranın tek kuralı satır adedinin ÜÇ hâlidir: boş (sayılmadı) · 0 (geldi ama kayıp) · N. Boş satır
  kabulü BLOKLAR ve bu bir ekran nezaketi değil, kapının da kuralı — gerekçe hook künyesinde.

  ── TASARIMDA OLMAYAN ADIM: TRANSFER SEÇİMİ ─────────────────────────────────
  D1 ile aynı gerekçe: v2 tek transferi çiziyor, gerçekte aynı anda birden çok sevkiyat yolda
  olabilir ve hangisinin sayıldığı bir tercih değil, KAYDIN kimliğidir. Tek transfer varsa doğrudan
  sayım açılır (tasarımın hâli).

  ── ÇEVRİMDIŞI KİLİDİ (v2:290) ──────────────────────────────────────────────
  Bağlantı yokken kabul kapalıdır. Rampada sayılmış ama yazılamamış bir transfer, iki depoda birden
  görünmeyen mal demektir; yerel kuyruk o riski gizler, çözmez.
*/

const t = warehouseCopy;

export function TransferScreen() {
  const router = useRouter();
  const transferState = useTransfer();
  const { offline } = useWarehouseStatus();

  const transfer = transferState.transfer;
  const header = (
    <OperationsStackHeader
      title={t.transfer.title}
      subtitle={transfer === null ? undefined : fillCopy(t.transfer.caption, { ref: transfer.referenceNo })}
      onBack={() =>
        transfer !== null && transferState.transfers.length > 1 ? transferState.select(null) : router.back()
      }
      backLabel={t.common.back}
      testID="warehouse-transfer-header"
    />
  );

  if (transferState.status === 'loading') {
    return (
      <View style={styles.screen} testID="warehouse-transfer">
        {header}
        <View style={styles.centered}>
          <LoadingState
            accessibilityLabel={t.transfer.loading}
            label={t.transfer.loading}
            testID="warehouse-transfer-loading"
          />
        </View>
      </View>
    );
  }

  if (transferState.status === 'error') {
    return (
      <View style={styles.screen} testID="warehouse-transfer">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="error"
            title={t.transfer.error.title}
            description={t.transfer.error.body}
            retry={{ label: t.common.retry, onPress: transferState.reload }}
            testID="warehouse-transfer-error"
          />
        </View>
      </View>
    );
  }

  if (transferState.transfers.length === 0) {
    return (
      <View style={styles.screen} testID="warehouse-transfer">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.transfer.empty.title}
            description={t.transfer.empty.body}
            testID="warehouse-transfer-empty"
          />
        </View>
      </View>
    );
  }

  if (transfer === null) {
    return (
      <View style={styles.screen} testID="warehouse-transfer">
        {header}
        <ScrollView contentContainerStyle={styles.list} testID="warehouse-transfer-queue">
          <Text style={styles.heading}>{t.transfer.queueHeading}</Text>
          {transferState.transfers.map((row) => (
            <PressableSurface
              key={row.transferId}
              onPress={() => transferState.select(row.transferId)}
              feedback="scale"
              style={styles.queueRow}
              accessibilityLabel={row.referenceNo}
              testID={`warehouse-transfer-row-${row.transferId}`}
            >
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{row.referenceNo}</Text>
                <Text style={styles.rowSub}>
                  {fillCopy(t.transfer.queueLines, {
                    n: String(row.lines.length),
                    date: shortDate(row.dispatchedAt.slice(0, 10)) ?? row.dispatchedAt,
                  })}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </PressableSurface>
          ))}
        </ScrollView>
      </View>
    );
  }

  const cta = offline
    ? { label: t.common.offlineCta, enabled: false }
    : transferState.sending
      ? { label: t.transfer.cta.sending, enabled: false }
      : transferState.counted
        ? { label: t.transfer.cta.ready, enabled: true }
        : { label: t.transfer.cta.pending, enabled: false };

  return (
    <View style={styles.screen} testID="warehouse-transfer">
      {header}

      <ScrollView contentContainerStyle={styles.list} testID="warehouse-transfer-lines">
        <Text style={styles.heading}>{t.transfer.heading}</Text>

        {transfer.lines.map((line) => {
          const counted = transferState.countOf(line.lineId);
          const missing = transferState.missingLineIds.includes(line.lineId);
          return (
            <View key={line.lineId} style={styles.lineRow} testID={`warehouse-transfer-line-${line.lineId}`}>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{line.name}</Text>
                <Text style={[styles.rowSub, missing ? styles.rowSubMissing : undefined]}>
                  {missing
                    ? t.transfer.missing
                    : fillCopy(t.transfer.dispatched, { qty: String(line.dispatchedQty) })}
                </Text>
              </View>
              <OperationsQtyField
                value={qtyToText(counted)}
                onChangeText={(text) => transferState.setCount(line.lineId, parseQty(text))}
                /* Yer tutucu "—": alanın boş olması bir DEĞER değil, bir eksikliktir ve sıfırla
                   karışmaması için görsel olarak da ayrı durur (v2:468). */
                placeholder="—"
                accessibilityLabel={fillCopy(t.transfer.qtyLabel, { name: line.name })}
                tone={counted === null ? 'muted' : counted === line.dispatchedQty ? 'neutral' : 'diff'}
                testID={`warehouse-transfer-qty-${line.lineId}`}
              />
            </View>
          );
        })}

        <Text style={styles.footnote}>{t.transfer.footnote}</Text>
      </ScrollView>

      <LinearGradient {...operationsTheme.gradient.stickyFade} style={styles.sticky}>
        {transferState.notice === null ? null : (
          <Text
            style={[styles.notice, styles[`notice_${transferState.notice.tone}`]]}
            accessibilityRole="alert"
            testID="warehouse-transfer-notice"
          >
            {transferState.notice.text}
          </Text>
        )}
        <PressableSurface
          onPress={transferState.submit}
          disabled={!cta.enabled}
          feedback="shadow"
          style={[styles.cta, cta.enabled ? styles.ctaReady : styles.ctaIdle]}
          accessibilityLabel={cta.label}
          testID="warehouse-transfer-cta"
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
  heading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space.sm,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space['3xl'],
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space.xl,
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
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
  /** Kapının "sayılmadı" dediği satır — cevaptan gelir, ekran tahmin etmez. */
  rowSubMissing: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    color: operationsTheme.colors.error,
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
    paddingVertical: operationsTheme.space.xl,
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
});
