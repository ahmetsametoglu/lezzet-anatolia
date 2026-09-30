import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { ReturnDispositionEnum, UNASSIGNED_RETURNS, type ReturnDisposition, type ReturningCourierContract } from '@lezzet/types';

import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsProductThumb } from '@/components/operations/product-thumb';
import { OperationsQuantityBox } from '@/components/operations/quantity-box';
import { OperationsQuantitySheet } from '@/components/operations/quantity-sheet';
import { quantityTotal } from '@/components/operations/quantity-value';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsScreenChrome } from '@/components/operations/screen-scroll';
import { OperationsHeadBleed } from '@/components/operations/head-bleed';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { FormScroll } from '@lezzet/mobile-kit/src/components/ui/form-scroll';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { qtySheetCopy, warehouseCopy } from './copy';
import { useCourierReturn } from './use-courier-return.hook';
import { useSubjectBack } from './use-subject-back.hook';
import { useWarehouseStatus } from './warehouse-status';

/*
  D6 · Kurye dönüşü kabulü: rampa listesi → bir kuryenin dönüşü; eksen kuryedir, çünkü mal kurye başına devredilir ve araç
  bir kez boşalır, araçta kalan yalnız listelenir. Serbest ürün satırı yalnız araçta kayıtlı adedi söyler: tasarımdaki
  "alınan · satılan" ikilisini sistem ayrı tutmuyor ve ekrana yazılamayan sayı uydurulmaz (CLAUDE §1).
*/

const t = warehouseCopy;

/** Rampaya dönen mal müşteride kalmamıştır: akıbeti rafa dönüş ya da imhadır; sıra tipten gelir (`ReturnDispositionEnum`). */
const DISPOSITIONS: readonly ReturnDisposition[] = ReturnDispositionEnum.exclude(['goodwill']).options;

/** İlk yük iskeleti — künye satırı ve iki kurye kartı; ekranın gerçekten çizdiği bloklar. */
const RETURN_SKELETON = [40, 116, 116];

export function CourierReturnScreen() {
  const router = useRouter();
  const returnState = useCourierReturn();
  const { offline } = useWarehouseStatus();
  const [qtyVariantId, setQtyVariantId] = useState<string | null>(null);
  const [splitTarget, setSplitTarget] = useState<{
    orderItemId: string;
    disposition: ReturnDisposition;
    name: string;
    qty: number;
  } | null>(null);

  /* Bildirimler toast'a gider; köprü `useNotice`ın içinde, gerekçesi orada. */

  const detail = returnState.detail;
  /* Geri: DETAYDAN LİSTEYE, listeden hub'a. Android tuşu ve iOS kaydırması da aynı yolu izler
     (`useSubjectBack`) — D5'te ölçülen kusurun aynısı burada da doğardı: konu açıkken geri, iki
     adım birden atıp depo ekranına düşerdi. */
  const leaveDetail = useCallback(() => returnState.select(null), [returnState]);
  useSubjectBack(detail !== null, leaveDetail);

  const header = (
    <OperationsStackHeader
      title={detail === null ? t.return.title : (detail.courierName ?? t.return.orphanName)}
      subtitle={detail === null ? listCaptionOf(returnState.couriers) : detailSubtitleOf(detail)}
      onBack={() => (detail === null ? router.back() : leaveDetail())}
      backLabel={t.common.back}
      testID="warehouse-return-header"
    />
  );

  if (returnState.status === 'loading') {
    return (
      <View style={styles.screen} testID="warehouse-courier-return">
        {header}
        <OperationsSkeletonList heights={RETURN_SKELETON} label={t.return.title} />
      </View>
    );
  }

  // ── LİSTE ──────────────────────────────────────────────────────────────────
  if (detail === null) {
    const withCourier = returnState.couriers.filter((row) => row.courierId !== null);
    const orphans = returnState.couriers.filter((row) => row.courierId === null);

    return (
      <View style={styles.screen} testID="warehouse-courier-return">
        {header}
        <FormScroll contentContainerStyle={styles.list} testID="warehouse-return-body">
          {returnState.status === 'error' ? (
            <Text style={styles.emptyBody} testID="warehouse-return-error">
              {t.return.loadError}
            </Text>
          ) : returnState.couriers.length === 0 ? (
            <View style={styles.empty} testID="warehouse-return-empty">
              <Text style={styles.emptyTitle}>{t.return.emptyTitle}</Text>
              <Text style={styles.emptyBody}>{t.return.emptyBody}</Text>
            </View>
          ) : null}

          {withCourier.length === 0 ? null : <Text style={styles.heading}>{t.return.queueHeading}</Text>}
          {withCourier.map((row) => (
            <CourierCard key={row.courierId} row={row} onPress={() => returnState.select(row.courierId)} />
          ))}

          {orphans.length === 0 ? null : <Text style={styles.heading}>{t.return.orphanHeading}</Text>}
          {orphans.map((row) => (
            <CourierCard key={UNASSIGNED_RETURNS} row={row} onPress={() => returnState.select(UNASSIGNED_RETURNS)} />
          ))}

          {returnState.couriers.length === 0 ? null : <Text style={styles.footnote}>{t.return.listFoot}</Text>}
        </FormScroll>
      </View>
    );
  }

  // ── DETAY ──────────────────────────────────────────────────────────────────
  const expectedQty = detail.freeGoods.reduce((sum, line) => sum + line.onVanQty, 0);
  const countedQty = detail.freeGoods.reduce((sum, line) => sum + returnState.countOf(line.variantId), 0);
  const qtyLine = detail.freeGoods.find((line) => line.variantId === qtyVariantId) ?? null;

  const cta = offline
    ? { label: t.common.offlineCta, enabled: false }
    : returnState.sending
      ? { label: t.return.cta.sending, enabled: false }
      : returnState.canSubmit
        ? { label: t.return.cta.ready, enabled: true }
        : { label: t.return.cta.pending, enabled: false };

  return (
    <View style={styles.screen} testID="warehouse-courier-return">
      {/* Kabuk davranışları tek kapıdan: `FormScroll` sarılamadığı için krom kapısı. Başlık kaydırıcının içinde, dışarıda
          kalsaydı mikro şerit inince altında asılı kalırdı. */}
      <OperationsScreenChrome
        title={detail === null ? t.return.title : (detail.courierName ?? t.return.orphanName)}
        caption={operationsCopy.sections.warehouse.tab}
      >
        {(bind) => (
      <FormScroll {...bind} contentContainerStyle={styles.list} testID="warehouse-return-body">
        <OperationsHeadBleed pad="6xl">{header}</OperationsHeadBleed>

        {detail.drops.length === 0 ? null : <Text style={styles.heading}>{t.return.heading}</Text>}

        {detail.drops.flatMap((drop) =>
          drop.lines.map((line) => {
            const pending = line.pendingQty > 0;
            const split = returnState.isSplit(line.orderItemId);
            const disposition = returnState.dispositionOf(line.orderItemId);
            const splitTotal = DISPOSITIONS.reduce((sum, option) => sum + returnState.splitQtyOf(line.orderItemId, option), 0);
            const needsNote = split ? returnState.splitQtyOf(line.orderItemId, 'restock') > 0 : disposition === 'restock';
            const writtenNotes = [...new Set(line.returns.flatMap((entry) => (entry.note ? [entry.note] : [])))];
            return (
              <View key={line.orderItemId} style={styles.lineRow} testID={`warehouse-return-line-${line.orderItemId}`}>
                <Text style={styles.rowTitle}>
                  {fillCopy(t.return.dropLine, {
                    ref: drop.referenceNo ?? '—',
                    qty: String(line.pendingQty + line.returns.reduce((sum, entry) => sum + entry.qty, 0)),
                    name: line.name,
                  })}
                </Text>
                {drop.note === null ? null : (
                  <Text style={styles.rowSub}>{fillCopy(t.return.courierNote, { note: drop.note })}</Text>
                )}

                {/* Yazılmış akıbet seçici değil kayıttır: ikinci kez gönderilen `restock` stoğa iki kez yazılırdı. Bir satırın
                    adetleri farklı akıbet alabildiği için kayıt payları adetleriyle sayar. */}
                {line.returns.length === 0 ? null : (
                  <Text style={styles.written} testID={`warehouse-return-written-${line.orderItemId}`}>
                    {fillCopy(t.return.written, {
                      disposition: line.returns
                        .map((entry) =>
                          fillCopy(t.return.writtenPart, { qty: String(entry.qty), disposition: t.return.disposition[entry.disposition] }),
                        )
                        .join(' · '),
                    })}
                  </Text>
                )}
                {/* Beyan geri okunur: görünmezse zorunlu not bir form töreni olurdu, depocu ne beyan ettiğini satırda görmeli. */}
                {writtenNotes.map((note, index) => (
                  <Text
                    key={note}
                    style={styles.rowSub}
                    testID={`warehouse-return-written-note-${line.orderItemId}${index === 0 ? '' : `-${index}`}`}
                  >
                    {fillCopy(t.return.writtenNote, { note })}
                  </Text>
                ))}

                {!pending ? null : split ? (
                  <>
                    {DISPOSITIONS.map((option) => {
                      const qty = returnState.splitQtyOf(line.orderItemId, option);
                      return (
                        <View key={option} style={styles.qtyRow}>
                          <View style={styles.qtyText}>
                            <Text style={styles.rowTitle}>{t.return.disposition[option]}</Text>
                          </View>
                          <OperationsQuantityBox
                            value={qty === 0 ? null : qty}
                            caption={t.return.qtyCaption}
                            dashed={qty === 0}
                            onPress={() =>
                              setSplitTarget({ orderItemId: line.orderItemId, disposition: option, name: line.name, qty: line.pendingQty })
                            }
                            accessibilityLabel={`${line.name} · ${t.return.disposition[option]}`}
                            accessibilityHint={t.common.qtyHint}
                            testID={`warehouse-return-split-${option}-${line.orderItemId}`}
                          />
                        </View>
                      );
                    })}
                    <View style={styles.summary} testID={`warehouse-return-split-summary-${line.orderItemId}`}>
                      <Text style={[styles.rowTitle, splitTotal === line.pendingQty ? null : styles.holdNote]}>
                        {fillCopy(t.return.splitSummary, { marked: String(splitTotal), total: String(line.pendingQty) })}
                      </Text>
                    </View>
                  </>
                ) : (
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
                )}

                {/* Akıbetlerin bedeli seçimden önce, düğmelerin altında her zaman yazılı: depocu partinin düşeceğini öğrenmeden
                    imhayı seçmemeli. */}
                {!pending ? null : (
                  <View style={styles.hintBlock} testID={`warehouse-return-hint-${line.orderItemId}`}>
                    <Text style={styles.rowSub}>{t.return.dispositionHint.rules}</Text>
                  </View>
                )}

                {pending && needsNote ? (
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

                {/* Ayırma yalnız iki adetten itibaren: tek adetin bölünecek payı yok ve sık yol tek dokunuşla kalır. */}
                {pending && line.pendingQty >= 2 ? (
                  <PressableSurface
                    onPress={() => returnState.setSplit(line.orderItemId, !split)}
                    feedback="scale"
                    style={styles.splitLink}
                    accessibilityLabel={split ? t.return.unsplitLink : t.return.splitLink}
                    testID={`warehouse-return-split-toggle-${line.orderItemId}`}
                  >
                    <Text style={styles.cardOpen}>{split ? t.return.unsplitLink : t.return.splitLink}</Text>
                  </PressableSurface>
                ) : null}
              </View>
            );
          }),
        )}

        {detail.freeGoods.length === 0 ? null : (
          <>
            <Text style={styles.heading}>{t.return.freeGoodsHeading}</Text>
            {/* Sürülen seferde devir yok: araç bugün boşalmıyor, sayaçlar sıfırdan açılıyor ve sebebi burada yazılı. */}
            {detail.drivingRuns === 0 ? null : (
              <Text style={[styles.rowSub, styles.holdNote]} testID="warehouse-return-driving-hold">
                {t.return.drivingHold}
              </Text>
            )}
            {detail.freeGoods.map((line) => {
              const counted = returnState.countOf(line.variantId);
              return (
                <View key={line.variantId} style={styles.lineRow} testID={`warehouse-return-free-${line.variantId}`}>
                  <View style={styles.qtyRow}>
                    <OperationsProductThumb name={line.name} photoUri={line.imageUrl} />
                    <View style={styles.qtyText}>
                      <Text style={styles.rowTitle}>{line.name}</Text>
                      {line.variantLabel.length === 0 ? null : <Text style={styles.rowSub}>{line.variantLabel}</Text>}
                    </View>
                    <OperationsQuantityBox
                      value={counted}
                      caption={t.return.qtyCaption}
                      tone={counted === line.onVanQty ? 'ink' : 'diff'}
                      onPress={() => setQtyVariantId(line.variantId)}
                      accessibilityLabel={line.name}
                      accessibilityHint={t.common.qtyHint}
                      testID={`warehouse-return-qty-${line.variantId}`}
                    />
                  </View>
                  <Text style={styles.rowSub}>{fillCopy(t.return.freeGoodsHint, { n: String(line.onVanQty) })}</Text>
                </View>
              );
            })}
            <View style={styles.summary} testID="warehouse-return-free-summary">
              <Text style={styles.rowTitle}>
                {fillCopy(t.return.freeGoodsSummary, { expected: String(expectedQty), counted: String(countedQty) })}
              </Text>
              {countedQty >= expectedQty ? null : <Text style={styles.rowSub}>{t.return.freeGoodsShort}</Text>}
            </View>
          </>
        )}

        {detail.boxesDown.length + detail.boxesStay.length === 0 ? null : (
          <>
            <Text style={styles.heading}>{t.return.boxesHeading}</Text>
            <View style={styles.lineRow}>
              {detail.boxesDown.map((card) => (
                <View key={card.orderId} style={styles.boxRow} testID={`warehouse-return-box-down-${card.orderId}`}>
                  <Text style={styles.boxName}>{`${card.customerName} · ${card.referenceNo ?? '—'}`}</Text>
                  <Text style={styles.boxWhy}>{fillCopy(t.return.boxDown, { n: String(card.boxes.length) })}</Text>
                </View>
              ))}
              {detail.boxesStay.map((card) => (
                <View key={card.orderId} style={[styles.boxRow, styles.boxStay]} testID={`warehouse-return-box-stay-${card.orderId}`}>
                  {/* Kimlik sebebe göre değişir: ulaşılamayan kutu bir müşterinindir ve sipariş referansıyla anılır, sefer
                      kodu yalnız "başka seferin yükü" satırında ayırt edicidir. */}
                  <Text style={styles.boxName}>
                    {card.reason === 'other_run' && card.runReferenceNo !== null
                      ? card.runReferenceNo
                      : `${card.customerName} · ${card.referenceNo ?? '—'}`}
                  </Text>
                  <Text style={styles.boxWhy}>
                    {`${fillCopy(t.return.boxCount, { n: String(card.boxes.length) })} · ${t.return.boxStay[card.reason]}`}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={styles.footnote}>{t.return.footnote}</Text>
      </FormScroll>
        )}
      </OperationsScreenChrome>

      <LinearGradient {...operationsTheme.gradient.stickyFade} style={styles.sticky}>
        {/* ÇEVRİMDIŞI SEBEBİ (v3:1284) — kilidin gerekçesi akıbetin kendisinde: dönen mal stoğa
            GİRER ya da İMHA olur, ikisi de bir stok hareketidir ve bağlantı ister. */}
        {!offline ? null : (
          <View style={styles.locked} testID="warehouse-return-locked">
            <Text style={styles.lockedTitle}>{t.return.locked.title}</Text>
            <Text style={styles.lockedBody}>{t.return.locked.body}</Text>
          </View>
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

      {splitTarget === null ? null : (
        <OperationsQuantitySheet
          visible
          title={fillCopy(t.return.splitSheet.title, { disposition: t.return.disposition[splitTarget.disposition] })}
          value={{ cases: [], loose: returnState.splitQtyOf(splitTarget.orderItemId, splitTarget.disposition) }}
          caseSizes={[]}
          onChange={(next) => returnState.setSplitQty(splitTarget.orderItemId, splitTarget.disposition, quantityTotal(next))}
          copy={qtySheetCopy({
            ...t.return.splitSheet,
            title: fillCopy(t.return.splitSheet.title, { disposition: t.return.disposition[splitTarget.disposition] }),
            keypadTitle: fillCopy(t.return.splitSheet.keypadTitle, { disposition: t.return.disposition[splitTarget.disposition] }),
            subject: fillCopy(t.return.splitSheet.subject, { name: splitTarget.name, qty: String(splitTarget.qty) }),
          })}
          onClose={() => setSplitTarget(null)}
          testID="warehouse-return-split-sheet"
        />
      )}

      {qtyLine === null ? null : (
        <OperationsQuantitySheet
          visible
          title={t.return.qtySheet.title}
          value={{ cases: [], loose: returnState.countOf(qtyLine.variantId) }}
          caseSizes={[]}
          onChange={(next) => returnState.setCount(qtyLine.variantId, quantityTotal(next))}
          copy={qtySheetCopy({
            ...t.return.qtySheet,
            subject: fillCopy(t.return.qtySheet.subject, { name: qtyLine.name, qty: String(qtyLine.onVanQty) }),
          })}
          onClose={() => setQtyVariantId(null)}
          testID="warehouse-return-qty-sheet"
        />
      )}
    </View>
  );
}

/** Rampa kartı — bir kurye ya da kuryesiz küme. Sayılar İŞİ söyler, araçtakiler ikinci satırda. */
function CourierCard({ row, onPress }: { row: ReturningCourierContract; onPress: () => void }) {
  const work = [
    row.pendingLines > 0 ? fillCopy(t.return.partLines, { n: String(row.pendingLines) }) : null,
    row.boxesDownCount > 0 ? fillCopy(t.return.partBoxesDown, { n: String(row.boxesDownCount) }) : null,
  ].filter((part): part is string => part !== null);
  const onVan = [
    row.freeGoodsQty > 0 ? fillCopy(t.return.partFreeGoods, { n: String(row.freeGoodsQty) }) : null,
    row.boxesStayCount > 0 ? fillCopy(t.return.partBoxesStay, { n: String(row.boxesStayCount) }) : null,
  ].filter((part): part is string => part !== null);

  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      style={styles.card}
      accessibilityLabel={row.courierName ?? t.return.orphanName}
      testID={`warehouse-return-courier-${row.courierId ?? UNASSIGNED_RETURNS}`}
    >
      <View style={styles.cardHead}>
        <View style={[styles.cardTile, row.courierId === null ? styles.cardTileQuiet : styles.cardTileOlive]}>
          <Icon
            name={row.courierId === null ? 'transfer' : 'courier'}
            size={operationsTheme.size.cardTileIcon}
            color={row.courierId === null ? operationsTheme.colors.muted : operationsTheme.colors['olive-dark']}
          />
        </View>
        <Text style={styles.cardName} numberOfLines={1}>
          {row.courierName ?? t.return.orphanName}
        </Text>
        {row.vehicleLabel === null ? null : (
          <Text style={styles.plate} numberOfLines={1}>
            {row.vehicleLabel}
          </Text>
        )}
      </View>

      {work.length === 0 ? null : (
        <Text style={styles.cardFact} testID={`warehouse-return-work-${row.courierId ?? UNASSIGNED_RETURNS}`}>
          {work.join(' · ')}
        </Text>
      )}
      {onVan.length === 0 ? null : <Text style={styles.cardFact}>{onVan.join(' · ')}</Text>}

      {/* KURYESİZ küme kendi sebebini söyler; ARAÇSIZ kurye de. Sürülen sefer varsa uyarı kiremit:
          araç bugün boşalmayacak, malın tamamını devralmak yanlış olur. */}
      {row.courierId === null ? (
        <Text style={styles.cardMeta}>{t.return.orphanMeta}</Text>
      ) : row.drivingRuns > 0 ? (
        <Text style={[styles.cardMeta, styles.cardWarn]} testID={`warehouse-return-driving-${row.courierId}`}>
          {fillCopy(t.return.cardDriving, { n: String(row.drivingRuns) })}
        </Text>
      ) : row.vehicleLabel === null ? (
        <Text style={styles.cardMeta}>{t.return.cardNoVehicle}</Text>
      ) : null}

      <Text style={styles.cardOpen}>{t.return.open}</Text>
    </PressableSurface>
  );
}

/** Liste künyesi — kaç kurye bekliyor. Boş listede cümle kurulmaz; boş hâl kendi metnini yazıyor. */
function listCaptionOf(couriers: readonly ReturningCourierContract[]): string | undefined {
  return couriers.length === 0 ? undefined : fillCopy(t.return.listCaption, { n: String(couriers.length) });
}

/**
 * Detay künyesi: plaka ve sürülen sefer. "Rota kapandı" yazılmaz: teslim alma kurye eksenli, kapanış sefer eksenli;
 * kapanmamış seferi olan kurye de mal teslim eder.
 */
function detailSubtitleOf(detail: { vehicleLabel: string | null; drivingRuns: number }): string | undefined {
  const parts = [
    detail.vehicleLabel,
    detail.drivingRuns > 0 ? fillCopy(t.return.subtitleDriving, { n: String(detail.drivingRuns) }) : null,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? undefined : parts.join(' · ');
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
  /** Rampa kartı — transfer kuyruğunun kart geometrisi (v3:1097), içeriği kurye künyesi. */
  card: {
    gap: operationsTheme.space.md,
    backgroundColor: operationsTheme.colors.panel,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['2xl'],
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
  },
  cardTile: {
    width: operationsTheme.size.cardTile,
    height: operationsTheme.size.cardTile,
    borderRadius: operationsTheme.radius.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTileOlive: { backgroundColor: operationsTheme.colors['olive-bg'] },
  cardTileQuiet: { backgroundColor: operationsTheme.colors['neutral-bg'] },
  cardName: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  /** Plaka künyenin sağ ucunda: "hangi araç" sorusunun tek tekil cevabı (`vehicleLabelOf`). */
  plate: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.body,
    backgroundColor: operationsTheme.colors['neutral-bg'],
    borderRadius: operationsTheme.radius.badge,
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.md,
    overflow: 'hidden',
  },
  cardFact: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.body,
  },
  cardMeta: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  cardWarn: { color: operationsTheme.colors.terracotta },
  /** Sürülen seferde devrin durduğunu söyleyen satır — uyarı tonu, kartın kendi rengiyle aynı. */
  holdNote: { color: operationsTheme.colors.terracotta },
  /** Yazılmış akıbetin sonucu — seçici değil, KAYIT: zeytin harf, dokunulacak bir şey yok. */
  written: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['olive-dark'],
  },
  cardOpen: {
    alignSelf: 'flex-end',
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['olive-dark'],
  },
  empty: {
    gap: operationsTheme.space.sm,
    paddingTop: operationsTheme.space['8xl'],
  },
  emptyTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  emptyBody: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  /** Detayın satırı da kart: çizgiyle ayrılan satır künyeye karışıyordu. */
  lineRow: {
    gap: operationsTheme.space.sm,
    backgroundColor: operationsTheme.colors.panel,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['2xl'],
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
  /** Üç akıbetin bedeli — düğmelerin altında, HER ZAMAN görünür (seçimden önce okunmalı). */
  hintBlock: {
    gap: operationsTheme.space['2xs'],
  },
  noteBlock: {
    gap: operationsTheme.space.sm,
  },
  /** Solda ad, sağda adet kutusu — serbest ürün sayımı ve akıbet payları aynı satır düzenini kullanır. */
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
  },
  qtyText: { flex: 1 },
  /** Ayırma bağlantısı sağa yaslı, kartın "aç →" diliyle. */
  splitLink: { alignSelf: 'flex-end' },
  /** Sayımın toplamı — kum zeminli özet, kartlardan bir kademe sessiz. */
  summary: {
    gap: operationsTheme.space['2xs'],
    backgroundColor: operationsTheme.colors['neutral-bg'],
    borderRadius: operationsTheme.radius.control,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
  },
  boxRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: operationsTheme.space.md,
    paddingVertical: operationsTheme.space.sm,
  },
  /** ARAÇTA KALAN soluk ve dokunulamaz: bu ekrandan kayda geçmez, yarına devrolur (v2:506). */
  boxStay: { opacity: 0.55 },
  boxName: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.ink,
  },
  boxWhy: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
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
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
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
    // Gölge yok: tasarımda sert gölge kullanılmıyor.
  },
  ctaIdle: { backgroundColor: operationsTheme.colors['disabled-fill'] },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['on-image'],
  },
});
