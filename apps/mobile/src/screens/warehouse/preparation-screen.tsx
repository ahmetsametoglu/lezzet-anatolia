import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { PreparationLineContract, PreparationOrderContract } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsQtyField } from '@/components/operations/qty-field';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { TextAction } from '@/components/ui/text-action';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import { usePreparation } from './use-preparation.hook';
import { batchLabel, parseQty, productLabel, qtyToText } from './warehouse-format';
import { useWarehouseStatus } from './warehouse-status';

/*
  D1 · TOPLAMA (v2:314-350).

  ── TASARIMDA OLMAYAN BİR ADIM EKLENDİ: KUYRUK ──────────────────────────────
  v2'nin ekranı TEK siparişi çiziyor ("LZA-26-3M8C · Restaurant Bosphore · B2B") çünkü şablonun
  demo verisinde tek sipariş var — ama hub'ın kendi satırı "3 sipariş bekliyor" diyor. Üç siparişin
  hangisinin toplandığı bir tercih değil, KOLİNİN kimliğidir; ekranın onu uydurması yanlış koli
  demektir. Bu yüzden kuyruk BİR sipariş taşıyorsa doğrudan toplama açılır (tasarımın hâli), iki ve
  üzeri taşıyorsa önce seçim sorulur. Seçim ekranı tasarımın satır düzenini kullanır, yeni bir dil
  icat etmez.

  ── ADEDİN ANLAMI ───────────────────────────────────────────────────────────
  Alan "bu kayıtla kaç adet yazıyorum"u sorar (kümülatif değil) ve tavanı motorun ayırdığı parti
  toplamıdır. İkisinin de gerekçesi hook künyesinde, tek yerde — RPC'nin yazımı ABSOLÜT ve okuma
  eski parti dağılımını taşımıyor.

  ── ÇEVRİMDIŞI: KİLİT VAR, KUYRUK YOK (v2:290) ──────────────────────────────
  Bağlantı yokken onay düğmesi kapalıdır ve sebebini söyler. Yerel bir kuyruğa yazmak, depocuya
  "yazıldı" dedirtip rafla sistemi ayırırdı (21.13 hattı: çevrimdışı kuyruk bir ALTYAPI işidir,
  ekran hilesi değil).
*/

const t = warehouseCopy;

export function PreparationScreen() {
  const router = useRouter();
  const picking = usePreparation();
  const { offline } = useWarehouseStatus();

  const order = picking.order;
  const header = (
    <OperationsStackHeader
      title={t.picking.title}
      subtitle={order === null ? undefined : captionOf(order)}
      onBack={() => (order !== null && picking.orders.length > 1 ? picking.select(null) : router.back())}
      backLabel={t.common.back}
      testID="warehouse-picking-header"
    />
  );

  if (picking.status === 'loading') {
    return (
      <View style={styles.screen} testID="warehouse-picking">
        {header}
        <View style={styles.centered}>
          <LoadingState accessibilityLabel={t.picking.loading} label={t.picking.loading} testID="warehouse-picking-loading" />
        </View>
      </View>
    );
  }

  if (picking.status === 'error') {
    return (
      <View style={styles.screen} testID="warehouse-picking">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="error"
            title={t.picking.error.title}
            description={t.picking.error.body}
            retry={{ label: t.common.retry, onPress: picking.reload }}
            testID="warehouse-picking-error"
          />
        </View>
      </View>
    );
  }

  if (picking.orders.length === 0) {
    return (
      <View style={styles.screen} testID="warehouse-picking">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.picking.empty.title}
            description={t.picking.empty.body}
            testID="warehouse-picking-empty"
          />
        </View>
      </View>
    );
  }

  if (order === null) {
    return (
      <View style={styles.screen} testID="warehouse-picking">
        {header}
        <ScrollView contentContainerStyle={styles.list} testID="warehouse-picking-queue">
          <Text style={styles.heading}>{t.picking.queueHeading}</Text>
          {picking.orders.map((row) => (
            <PressableSurface
              key={row.orderId}
              onPress={() => picking.select(row.orderId)}
              feedback="scale"
              style={styles.queueRow}
              accessibilityLabel={captionOf(row)}
              testID={`warehouse-picking-order-${row.orderId}`}
            >
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{captionOf(row)}</Text>
                <Text style={styles.rowSub}>
                  {fillCopy(t.picking.queueLines, {
                    picked: String(row.pickedLineCount),
                    total: String(row.lineCount),
                  })}
                  {row.pickedLineCount > 0 && row.pickedLineCount < row.lineCount ? ` · ${t.picking.queueHalf}` : ''}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </PressableSurface>
          ))}
        </ScrollView>
      </View>
    );
  }

  const cta = ctaOf(picking.resolved, picking.anyShort, picking.sending, offline);

  return (
    <View style={styles.screen} testID="warehouse-picking">
      {header}

      <ScrollView contentContainerStyle={styles.list} testID="warehouse-picking-lines">
        {order.lines.map((line) => (
          <LineRow
            key={line.itemId}
            line={line}
            qty={picking.lineState(line.itemId).qty}
            shortReported={picking.lineState(line.itemId).shortReported}
            capacity={picking.capacityOf(line)}
            onQty={(value) => picking.setQty(line.itemId, value, picking.capacityOf(line))}
            onComplete={() =>
              picking.setQty(line.itemId, Math.min(line.orderedQty, picking.capacityOf(line)), picking.capacityOf(line))
            }
            onShort={() => picking.reportShort(line.itemId)}
          />
        ))}
        <Text style={styles.footnote}>{t.picking.footnote}</Text>
      </ScrollView>

      {/* YAPIŞKAN CTA — liste altından akar, gradyan onu kesmeden bitirir (kurye emsali). */}
      <LinearGradient {...operationsTheme.gradient.stickyFade} style={styles.sticky}>
        {picking.notice === null ? null : (
          <Text
            style={[styles.notice, styles[`notice_${picking.notice.tone}`]]}
            accessibilityRole="alert"
            testID="warehouse-picking-notice"
          >
            {picking.notice.text}
          </Text>
        )}
        <PressableSurface
          onPress={picking.submit}
          disabled={!cta.enabled}
          feedback="shadow"
          style={[styles.cta, cta.enabled ? styles.ctaReady : styles.ctaIdle]}
          accessibilityLabel={cta.label}
          testID="warehouse-picking-cta"
        >
          <Text style={[styles.ctaLabel, cta.enabled ? styles.ctaLabelReady : styles.ctaLabelIdle]}>{cta.label}</Text>
        </PressableSurface>
      </LinearGradient>
    </View>
  );
}

/** Sipariş künyesi (v2:319) — referans · müşteri · kanal. Tutar ve adres YOK (sözleşme de vermiyor). */
function captionOf(order: PreparationOrderContract): string {
  return [order.referenceNo ?? t.picking.noReference, order.customerName, t.common.channel[order.channel]].join(' · ');
}

/** CTA'nın üç hâli (v2'nin `dTopCta`sı) + çevrimdışı kilidi. */
function ctaOf(
  resolved: boolean,
  anyShort: boolean,
  sending: boolean,
  offline: boolean,
): { label: string; enabled: boolean } {
  if (offline) return { label: t.common.offlineCta, enabled: false };
  if (sending) return { label: t.picking.cta.sending, enabled: false };
  if (!resolved) return { label: t.picking.cta.pending, enabled: false };
  return { label: anyShort ? t.picking.cta.reported : t.picking.cta.ready, enabled: true };
}

interface LineRowProps {
  line: PreparationLineContract;
  qty: number;
  shortReported: boolean;
  capacity: number;
  onQty: (qty: number | null) => void;
  onComplete: () => void;
  onShort: () => void;
}

function LineRow({ line, qty, shortReported, capacity, onQty, onComplete, onShort }: LineRowProps) {
  const name = productLabel(line.productName, line.variantLabel);
  const first = line.suggestion[0];
  const wanted =
    first === undefined
      ? fillCopy(t.picking.line.wantedNoBatch, { qty: String(line.orderedQty) })
      : fillCopy(t.picking.line.wanted, {
          qty: String(line.orderedQty),
          batch: batchLabel(null, first.expiryDate),
        });
  const complete = qty >= Math.min(line.orderedQty, capacity) && capacity > 0;

  return (
    <View style={styles.lineRow} testID={`warehouse-picking-line-${line.itemId}`}>
      <View style={styles.lineHead}>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{name}</Text>
          <Text style={styles.rowSub}>{wanted}</Text>
        </View>
        <OperationsQtyField
          value={qtyToText(qty)}
          onChangeText={(text) => onQty(parseQty(text))}
          accessibilityLabel={fillCopy(t.picking.line.qtyLabel, { name })}
          tone={complete ? 'done' : 'neutral'}
          size="sm"
          testID={`warehouse-picking-qty-${line.itemId}`}
        />
        <PressableSurface
          onPress={onComplete}
          feedback="scale"
          compact
          style={[styles.completeChip, complete ? styles.completeChipOn : styles.completeChipOff]}
          accessibilityLabel={t.picking.line.complete}
          testID={`warehouse-picking-all-${line.itemId}`}
        >
          <Text style={[styles.completeLabel, complete ? styles.completeLabelOn : styles.completeLabelOff]}>
            {t.picking.line.complete}
          </Text>
        </PressableSurface>
      </View>

      {line.pinnedStockId === null ? null : (
        <Text style={styles.pinned} testID={`warehouse-picking-pinned-${line.itemId}`}>
          {t.picking.line.pinned}
        </Text>
      )}

      {line.shortfallQty === 0 ? null : (
        <Text style={styles.shortHint}>{fillCopy(t.picking.line.shortfallHint, { qty: String(line.shortfallQty) })}</Text>
      )}

      {line.pickedQty === 0 ? null : (
        /* Yarım iş: eski parti dağılımı okunamıyor, yeni kayıt öncekinin YERİNE geçiyor —
           sessizce üstüne yazmak depocunun bilmediği bir kaybı doğururdu (hook künyesi). */
        <Text style={styles.shortHint} testID={`warehouse-picking-previous-${line.itemId}`}>
          {fillCopy(t.picking.line.previous, { qty: String(line.pickedQty) })}
        </Text>
      )}

      {shortReported ? (
        <Text style={styles.shortReported}>{t.picking.line.shortReported}</Text>
      ) : complete ? null : (
        <TextAction
          label={t.picking.line.shortLink}
          onPress={onShort}
          testID={`warehouse-picking-short-${line.itemId}`}
        />
      )}
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
    fontWeight: operationsTheme.text['eyebrow--font-weight'],
    // Harf aralığı token'da `em` (yazı boyuna göreli) tutulur; RN mutlak dp ister — çeviri
    // `emToDp` ile, tek yerden (`theme/parse.ts` künyesi).
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
    fontWeight: operationsTheme.text['button--font-weight'],
    color: operationsTheme.colors.ink,
  },
  rowSub: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  chevron: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors['sand-600'],
  },
  completeChip: {
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.lg,
    borderWidth: operationsTheme.border.base,
    borderRadius: operationsTheme.radius.badge,
  },
  completeChipOn: {
    backgroundColor: operationsTheme.colors.olive,
    borderColor: operationsTheme.colors.olive,
  },
  completeChipOff: {
    backgroundColor: 'transparent',
    borderColor: operationsTheme.colors['olive-line'],
  },
  completeLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    fontWeight: operationsTheme.text['button--font-weight'],
  },
  completeLabelOn: { color: operationsTheme.colors.card },
  completeLabelOff: { color: operationsTheme.colors['olive-dark'] },
  pinned: {
    alignSelf: 'flex-start',
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    color: operationsTheme.colors.terracotta,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    fontWeight: operationsTheme.text['button--font-weight'],
  },
  shortHint: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    fontWeight: operationsTheme.text['button--font-weight'],
    color: operationsTheme.colors.terracotta,
  },
  shortReported: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    fontWeight: operationsTheme.text['button--font-weight'],
    color: operationsTheme.colors.muted,
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
    fontWeight: operationsTheme.text['button--font-weight'],
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
  /** v2'nin kapalı CTA'sı: gölgesiz, soluk dolgu — basılamaz olduğunu RENGİYLE de söyler. */
  ctaIdle: { backgroundColor: operationsTheme.colors['disabled-fill'] },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    fontWeight: operationsTheme.text['button--font-weight'],
  },
  ctaLabelReady: { color: operationsTheme.colors.card },
  ctaLabelIdle: { color: operationsTheme.colors.card },
});
