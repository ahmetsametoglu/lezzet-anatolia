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
import { FormScroll } from '@/components/ui/form-scroll';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { qtySheetCopy, warehouseCopy } from './copy';
import { useCourierReturn } from './use-courier-return.hook';
import { useSubjectBack } from './use-subject-back.hook';
import { useWarehouseStatus } from './warehouse-status';

/*
  D6 · KURYE DÖNÜŞÜ KABULÜ (v3:14 + tasarım "D6 Rampa Listesi", 04.09).

  ── EKRAN İKİ KATMAN: RAMPA LİSTESİ → BİR KURYENİN DÖNÜŞÜ ───────────────────
  Liste 04.09'da doğdu. Öncesinde ekran doğrudan TEK kuryeyle açılıyordu ve o kurye kodun içine
  yazılmıştı — aynı gün iki kurye döndüğünde ekranın verecek cevabı yoktu. Eksen kurye: para sefer
  başına kapanır, MAL kurye başına devredilir (araç bir yerdedir ve bir kez boşalır).

  ── ÜÇ AKIBET, ÜÇ FARKLI GERÇEK ─────────────────────────────────────────────
  `restock` malı stoğa geri koyar (**sebep notu zorunlu** — soğuk zincir beyanı, kuralı veri
  zorlar), `discard` fiiliden düşer, `goodwill` mala DOKUNMAZ (müşteride kaldı) ve yalnız kayıt
  düşer. Üçü aynı listede satır satır seçilebilir — bir kolinin yarısı iade, yarısı jest olabilir.

  ── ARAÇTA KALAN KABUL EDİLMEZ ──────────────────────────────────────────────
  Ulaşılamayan durağın kutusu ve araçtaki başka seferlerin yükü yalnız LİSTELENİR: dokunulabilir
  çizmek, olmayan bir eylemi varmış gibi göstermek olurdu (v2:505 · v3:14).

  ── TASARIMDAN BİLİNÇLİ SAPMA: "alınan · satılan" YAZILMAZ ──────────────────
  v3:14 her serbest ürün satırında *"araca alınan X · kapıda satılan Y"* yazıyor. Sistem o iki
  sayıyı ayrı tutmuyor — araç deposundaki adet zaten ikisinin FARKI (`courier/return.ts` künyesi:
  *"ikinci bir hesap bir gün birincisinden ayrılırdı"*). Satır bu yüzden yalnız araçta KAYITLI
  adedi söyler. Ekrana yazılamayan bir sayı uydurulmaz (CLAUDE §1).
*/

const t = warehouseCopy;

/** Üç akıbet — sırası TİPTEN gelir (`ReturnDispositionEnum`), ekran kendi listesini yazmaz. */
const DISPOSITIONS: readonly ReturnDisposition[] = ReturnDispositionEnum.options;

/** İlk yük iskeleti — künye satırı ve iki kurye kartı; ekranın gerçekten çizdiği bloklar. */
const RETURN_SKELETON = [40, 116, 116];

export function CourierReturnScreen() {
  const router = useRouter();
  const returnState = useCourierReturn();
  const { offline } = useWarehouseStatus();
  const [qtyVariantId, setQtyVariantId] = useState<string | null>(null);

  /* BİLDİRİM KANALI TOAST (kullanıcı kararı 01.09) — ekrana yapıştırılan satır KALKTI; toast'a
     basan köprü de 07.09'da BURADAN KALKTI ve `useNotice`ın içine girdi. Gerekçesi orada. */

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
      {/* KABUK DAVRANIŞLARI TEK KAPIDAN (21.178) — `FormScroll` sarılamadığı için KROM kapısı.
          Başlık kaydırıcının İÇİNDE: dışarıda kalsaydı mikro şerit inince altında asılı kalırdı. */}
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
            // İşaretlenmiş satır SALT-OKUNUR: ikinci kez gönderilirse `restock` stoğa iki kez yazılır.
            const written = line.disposition;
            const disposition = written ?? returnState.dispositionOf(line.orderItemId);
            return (
              <View key={line.orderItemId} style={styles.lineRow} testID={`warehouse-return-line-${line.orderItemId}`}>
                <Text style={styles.rowTitle}>
                  {fillCopy(t.return.dropLine, {
                    ref: drop.referenceNo ?? '—',
                    qty: String(line.fulfilledQty),
                    name: line.name,
                  })}
                </Text>
                {drop.note === null ? null : (
                  <Text style={styles.rowSub}>{fillCopy(t.return.courierNote, { note: drop.note })}</Text>
                )}

                {/* AKIBETİ YAZILMIŞ SATIR SEÇİCİ ÇİZMEZ, SONUCU YAZAR: çipleri kapalı göstermek
                    dokunulabilir görünen ölü bir kontrol olurdu ve ikinci kez gönderilen `restock`
                    stoğa iki kez yazardı. Satır listede duruyor çünkü depocu neyi karara bağladığını
                    görmeden kalanı işaretleyemez (`listWarehouseReturns` künyesi). */}
                {written !== null ? (
                  <>
                    <Text style={styles.written} testID={`warehouse-return-written-${line.orderItemId}`}>
                      {fillCopy(t.return.written, { disposition: t.return.disposition[written] })}
                    </Text>
                    {/* BEYAN GERİ OKUNUR (04.09): "stoğa dön"de zorunlu tutulan soğuk zincir cümlesi
                        artık kaleme yazılıyor. Görünmezse zorunluluk bir forma doldurma töreni olur;
                        depocu ne beyan ettiğini kendi satırında görmeli. */}
                    {line.note === null || line.note.length === 0 ? null : (
                      <Text style={styles.rowSub} testID={`warehouse-return-written-note-${line.orderItemId}`}>
                        {fillCopy(t.return.writtenNote, { note: line.note })}
                      </Text>
                    )}
                  </>
                ) : (
                  <>
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

                    {/*
                      SONUÇLAR SEÇİMDEN ÖNCE (v3:1244) — üç akıbetin bedeli düğmelerin ALTINDA, her
                      zaman yazılı. Eskiden ipucu ancak seçildikten SONRA çıkıyordu ve "İmha: parti
                      düşer" hiç yazmıyordu: depocu partinin düşeceğini öğrenmeden imhayı
                      seçebiliyordu.
                    */}
                    <View style={styles.hintBlock} testID={`warehouse-return-hint-${line.orderItemId}`}>
                      <Text style={styles.rowSub}>{t.return.dispositionHint.rules}</Text>
                      <Text style={styles.rowSub}>{t.return.dispositionHint.goodwill}</Text>
                    </View>
                  </>
                )}

                {disposition === 'restock' && written === null ? (
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
              </View>
            );
          }),
        )}

        {detail.freeGoods.length === 0 ? null : (
          <>
            <Text style={styles.heading}>{t.return.freeGoodsHeading}</Text>
            {/* SÜRÜLEN SEFERDE DEVİR YOK (04.09): araç bugün boşalmıyor, sayaçlar sıfırdan açılıyor
                ve sebebi burada yazılı — uyarı varken varsayılanın tersini yapması kusurdu. */}
            {detail.drivingRuns === 0 ? null : (
              <Text style={[styles.rowSub, styles.holdNote]} testID="warehouse-return-driving-hold">
                {t.return.drivingHold}
              </Text>
            )}
            {detail.freeGoods.map((line) => {
              const counted = returnState.countOf(line.variantId);
              return (
                <View key={line.variantId} style={styles.lineRow} testID={`warehouse-return-free-${line.variantId}`}>
                  <View style={styles.freeRow}>
                    <OperationsProductThumb name={line.name} photoUri={line.imageUrl} />
                    <View style={styles.freeText}>
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
                  {/*
                    KİMLİK SEBEBE GÖRE DEĞİŞİR (cihazda görüldü 04.09) — satır sefer kodunu yazıyordu
                    ve ULAŞILAMAYAN kutuda bu yanlış: o kutu bir MÜŞTERİNİN, depocunun rampada
                    ayırması gereken şey de o. Sefer kodu yalnız "başka seferin yükü" satırında
                    doğru cevap, çünkü orada ayırt edici olan sefer (v3:14 de ikisini böyle çiziyor:
                    ulaşılamayanı sipariş referansıyla, öteki seferi `SF-…` ile anıyor).
                  */}
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
 * Detay künyesi: plaka ve sürülen sefer. ~~"rota kapandı"~~ KALKTI (04.09) — teslim alma kurye
 * eksenli, kapanış sefer eksenli; kapanmamış seferi olan kurye de mal teslim eder, yani o cümle
 * ekranda her zaman doğru değildi (CLAUDE §1: doğrulanamayan bilgi yazılmaz).
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
  /** Detayın satırı da KART (D5'in 04.09 kararı): çizgiyle ayrılan satır künyeye karışıyordu. */
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
  freeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
  },
  freeText: { flex: 1 },
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
    // Gölge YOK: v3'te sert gölge sıfır kez geçiyor (ölçüldü — v2'de 3, v3'te 0).
  },
  ctaIdle: { backgroundColor: operationsTheme.colors['disabled-fill'] },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['on-image'],
  },
});
