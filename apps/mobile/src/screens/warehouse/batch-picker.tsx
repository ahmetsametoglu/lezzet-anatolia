import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsProductThumb } from '@/components/operations/product-thumb';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsSurface } from '@/components/operations/surface';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { TextField } from '@/components/ui/text-field';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import type { UseBatchScanResult } from './use-batch-scan.hook';
import type { UseBatchSubjectResult } from './use-batch-subject.hook';
import { shortDate } from './warehouse-format';

/*
  KONU SEÇİCİ — "hangi parti" sorusunun EKRANI (D4 · D4b · v3:08/09), 02.09.

  ── İKİ EKRAN, TEK SEÇİCİ ───────────────────────────────────────────────────
  Sayım ve stok düşümü aynı soruyla başlıyor; ayrı ayrı çizilseydi bir gün ayrışırlardı. Değişen
  yalnız CÜMLE (*"Hangi parti sayılacak?"* ↔ *"Hangi partiden düşülecek?"*) ve o da prop.

  ── OKUTMA FAB'DA, LİSTE EKRANDA (kullanıcı isteği 03.09) ──────────────────
  Okutma en hızlı yoldur ve öyle kalmalı; ama listenin üstünde tam genişlikte bir şerit olarak
  duruyordu ve ekranın ilk üçte birini yiyordu (soru bloğu + düğme + çipler + arama). Şimdi ekranın
  sağ altında sabit bir FAB: kaydırırken de erişilir, listeyi hiç itmiyor. Çekmece ve çoğul-eşleşme
  listesi BURADA kaldı — onlar listenin işi.

  ── "HANGİ DOLABIN ÖNÜNDESİN" = FİLTRE (kullanıcı kararı 03.09) ────────────
  Yatayda kayan bir çip sırası; seçilen dolabın partileri SÜZÜLÜR (önce yalnız öne alınıyordu —
  gerekçesi ve düşüşü `use-batch-subject` künyesinde). İSTEĞE BAĞLI: seçmeden de her şey çalışır,
  aynı çipe ikinci dokunuş süzgeci kaldırır. Depoda alan tanımlı değilse sıra hiç çizilmez.

  ── SATIR: ALAN ROZETTE, ADET SAĞDA (kullanıcı bulgusu 03.09) ───────────────
  Eski satır *"NE-001 · Derin dondurucu 1 · sistemde 14"* diyordu ve kullanıcı "dondurucuda 1 var,
  sistemde 14" diye okudu — alan adının sonundaki rakam, yanındaki adetle bitişince sayı gibi
  görünüyordu. Şimdi alan kendi rozetinde, adet sağda büyük ve altında "sistemde" yazıyor: iki
  sayı aynı satırda yan yana durmuyor.

  ── SATIRIN SOLUNDA ÜRÜN KARESİ (kullanıcı isteği 03.09) ────────────────────
  Depocu rafta kutuya bakıyor, listede adı okuyor; kare ikisini tek bakışta eşliyor. Kapaksız
  üründe monogram (`OperationsProductThumb`) — boş bir kutu değil, adın baş harfleri.

  ── LİSTENİN ÜÇ HÂLİ AYRI ŞEYLER SÖYLER ─────────────────────────────────────
  · **yükleniyor** — iskelet; halka değil (satırın kendi boyunda, veri gelince sayfa zıplamasın).
    **Yalnız iskelet** (kullanıcı bulgusu 03.09): satırlar eskiden durumdan bağımsız çiziliyordu
    ve arama her tur yenilenirken üstte üç iskelet, altında ÖNCEKİ turun satırları duruyordu —
    depocu bayat satıra basabilirdi. Satırlar artık yalnız `ready`de çizilir.
  · **hata** — "yüklenemedi" + tekrar dene. Boş listeyle KARIŞMAMALI: biri arıza, öteki cevap.
  · **boş** — sorgu varsa *"bu terimle eşleşen yok"*, yoksa *"bu depoda stoğu duran parti yok"*.
    İki cümle ayrı, çünkü ikisi ayrı şey: biri aramanın sonucu, öteki deponun hâli.

  ── LİSTE SAYFA SAYFA GELİR (kullanıcı bulgusu 03.09) ──────────────────────
  Eskiden deponun TAMAMI tek turda okunuyordu (`truncated` ile "ilk 60" deniyordu). Artık keyset
  sayfalama: ekran dibe yaklaşınca sonraki sayfa gelir, altta tek satır "yükleniyor" der. Sayfa
  iskeleti DEĞİL — iskelet listeyi gizler ve depocu okuduğu satırı kaybederdi.
*/

const t = warehouseCopy;

/** İskelet satır yüksekliği (dp) — parti satırının kendi boyu (ad + künye + rozet). */
const ROW_SKELETON_HEIGHT = 84;
const SKELETON_ROWS = [ROW_SKELETON_HEIGHT, ROW_SKELETON_HEIGHT, ROW_SKELETON_HEIGHT];

interface BatchPickerProps {
  /** Ekranın kendi kuralı (D4b: *"süresi geçmiş mal buraya girmez"*); verilmezse çizilmez. */
  footnote?: string;
  subject: UseBatchSubjectResult;
  /**
   * Okutma durumu — ekrandan gelir (03.09). Hook eskiden BURADAYDI ve okutma düğmesi de listenin
   * üstünde bir şeritti; kullanıcı okutmayı FAB'a taşıttı ve FAB kaydırılan içeriğin İÇİNDE
   * duramaz (`scan-fab` künyesi: konum dış kaba). Hook ekrana çıkınca çekmece ve seçim listesi
   * burada kaldı — onlar listenin işi, düğme ekranın.
   */
  scan: UseBatchScanResult;
  testID: string;
}

export function BatchPicker({ footnote, subject, scan, testID }: BatchPickerProps) {
  return (
    <View style={styles.block} testID={testID}>
      {/* "HANGİ PARTİ SAYILACAK?" BLOĞU KALDIRILDI (kullanıcı 03.09: *"son maksadı nedir? İhtiyaç
          yoksa kaldır"*). Ölçüldü: fonksiyonu yoktu — kesikli çerçeveli bir başlık, okutunca dolmuyor,
          parti seçilince bütün seçiciyle birlikte kayboluyordu. Ekranın ilk çeyreğini yiyen bir
          cümleydi; cümle başlığın altına indi (`noSubject`), liste yukarı çıktı. */}
      {subject.areas.length === 0 ? null : (
        <View style={styles.areaBlock} testID={`${testID}-areas`}>
          <Text style={styles.heading}>{t.adjustment.area.heading}</Text>
          {/* ÇİPLER YATAYDA KAYAR (kullanıcı isteği 03.09): sarmalı ızgara altı dolapta üç satıra
              çıkıyor ve listeyi ekranın dışına itiyordu. Yatay şerit yüksekliği sabit tutuyor;
              `bleed` kenar boşluğunu delip çipleri ekranın kenarına kadar kaydırıyor. */}
          <View style={styles.chipBleed}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {subject.areas.map((area) => (
                <OperationsChoiceChip
                  key={area.id}
                  label={area.name}
                  selected={subject.activeAreaId === area.id}
                  onPress={() => subject.chooseArea(area.id)}
                  testID={`${testID}-area-${area.id}`}
                />
              ))}
            </ScrollView>
          </View>
          <Text style={styles.hint}>{t.adjustment.area.hint}</Text>
        </View>
      )}

      <Text style={styles.heading}>{t.adjustment.picker.heading}</Text>

      <TextField
        value={subject.query}
        onChangeText={subject.setQuery}
        placeholder={t.adjustment.picker.searchPlaceholder}
        accessibilityLabel={t.adjustment.picker.searchLabel}
        density="compact"
        testID={`${testID}-search`}
      />

      {subject.status === 'loading' ? (
        <OperationsSkeletonList
          heights={SKELETON_ROWS}
          label={t.adjustment.picker.loading}
          testID={`${testID}-loading`}
        />
      ) : null}

      {subject.status === 'error' ? (
        <OperationsNoticeBlock
          variant="error"
          title={t.adjustment.picker.error}
          retry={{ label: t.common.retry, onPress: subject.reload }}
          testID={`${testID}-error`}
        />
      ) : null}

      {subject.status === 'ready' && subject.batches.length === 0 ? (
        <Text style={styles.hint} testID={`${testID}-empty`}>
          {subject.query.trim().length === 0
            ? t.adjustment.picker.empty
            : fillCopy(t.adjustment.picker.emptySearch, { q: subject.query.trim() })}
        </Text>
      ) : null}

      {subject.status !== 'ready' ? null : subject.batches.map((batch) => (
        <OperationsSurface
          key={batch.stockId}
          tone="card"
          padding="md"
          chevron
          onPress={() => subject.select(batch)}
          accessibilityLabel={batch.name}
          testID={`${testID}-row-${batch.stockId}`}
        >
          <View style={styles.row}>
            <OperationsProductThumb name={batch.name} photoUri={batch.imageUrl} size="md" testID={`${testID}-row-thumb-${batch.stockId}`} />
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {batch.name}
              </Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {fillCopy(t.adjustment.picker.row, {
                  /* PARTİ NUMARASI (03.09): bizim kimliğimiz, her partide var — lotsuz parti artık
                     "lot yazılmamış" diye değil, numarasıyla anılır. Lot varsa rozette. */
                  code: batch.batchNo,
                  dateType: batch.dateType,
                  date: shortDate(batch.expiryDate) ?? batch.expiryDate,
                })}
              </Text>
              <View style={styles.badgeRow}>
                {batch.lotNumber === null ? null : (
                  <Text style={[styles.badge, styles.badgeLot]} numberOfLines={1} testID={`${testID}-row-lot-${batch.stockId}`}>
                    {fillCopy(t.adjustment.picker.rowLot, { lot: batch.lotNumber })}
                  </Text>
                )}
                <Text
                  style={[
                    styles.badge,
                    batch.storageAreaId !== null && batch.storageAreaId === subject.activeAreaId
                      ? styles.badgeHere
                      : styles.badgeArea,
                  ]}
                  numberOfLines={1}
                  testID={`${testID}-row-area-${batch.stockId}`}
                >
                  {batch.storageAreaName ?? t.adjustment.picker.noArea}
                </Text>
              </View>
            </View>
            <View style={styles.rowQty}>
              <Text style={styles.rowQtyValue} testID={`${testID}-row-qty-${batch.stockId}`}>
                {batch.physicalQty}
              </Text>
              <Text style={styles.rowQtyLabel}>{t.adjustment.picker.rowQty}</Text>
            </View>
          </View>
        </OperationsSurface>
      ))}

      {/* SONRAKİ SAYFA YOLDA — listenin ALTINDA tek satır; iskelet DEĞİL (o listeyi gizlerdi ve
          depocu okuduğu satırı kaybederdi). Sayfa gelince satırlar altına eklenir. */}
      {subject.loadingMore ? (
        <Text style={styles.hint} testID={`${testID}-loading-more`}>
          {t.adjustment.picker.loadingMore}
        </Text>
      ) : null}

      {footnote === undefined ? null : <Text style={styles.hint}>{footnote}</Text>}

      <ScanSheet
        open={scan.open}
        title={t.adjustment.scan.title}
        hint={t.adjustment.scan.hint}
        onClose={scan.closeScan}
        onScan={scan.handleScan}
        testID={`${testID}-scan-sheet`}
      />

      {/* ÇOĞUL EŞLEŞME SORULUR, SEÇİLMEZ: lot numarası benzersiz değil ve ilkini kendiliğinden
          almak, depocunun elinde tutmadığı bir partiden mal düşürmek olurdu. Satır künyesi
          AYIRT EDİCİ olanı yazıyor — adet ve tarih: ikisi de aynı ürünün partisi olduğu için ad
          tek başına seçtirmez. */}
      <BottomSheet
        visible={scan.picking !== null}
        title={t.adjustment.scan.pickTitle}
        onClose={scan.cancelPicking}
        testID={`${testID}-pick`}
      >
        <Text style={styles.hint}>
          {scan.picking === null
            ? ''
            : fillCopy(t.adjustment.scan.pickBody, {
                code: scan.picking.code,
                n: String(scan.picking.batches.length),
              })}
        </Text>
        {(scan.picking?.batches ?? []).map((batch) => (
          <OperationsSurface
            key={batch.stockId}
            tone="card"
            padding="md"
            onPress={() => scan.pick(batch)}
            accessibilityLabel={batch.name}
            testID={`${testID}-pick-${batch.stockId}`}
          >
            <View style={styles.row}>
              <OperationsProductThumb name={batch.name} photoUri={batch.imageUrl} size="md" />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {batch.name}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {fillCopy(t.adjustment.scan.pickRow, {
                    qty: String(batch.physicalQty),
                    date: shortDate(batch.expiryDate) ?? batch.expiryDate,
                  })}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {batch.storageAreaName === null
                    ? t.adjustment.scan.pickNoArea
                    : fillCopy(t.adjustment.scan.pickArea, { area: batch.storageAreaName })}
                </Text>
              </View>
            </View>
          </OperationsSurface>
        ))}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: operationsTheme.space.md,
  },
  heading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space.sm,
  },
  areaBlock: {
    gap: operationsTheme.space.md,
  },
  /* Çip şeridi kenar boşluğunu DELER: yatay kayan bir sıra, ekranın kenarında bitmiş görünmeli —
     içeride bitince "liste burada bitti" der ve depocu kaydırmayı denemez (ruler'ın aynı kararı). */
  chipBleed: {
    marginHorizontal: -operationsTheme.space['6xl'],
  },
  chipRow: {
    flexDirection: 'row',
    gap: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space['6xl'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  rowBody: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  rowTitle: {
    fontFamily: operationsTheme.font.body[600],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  rowMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: operationsTheme.space.xs,
    paddingTop: operationsTheme.space['2xs'],
  },
  /** Lot rozeti KUM, alan rozetinden daha sessiz: kimlik parti numarasıdır, lot ek bilgi. */
  badgeLot: {
    backgroundColor: operationsTheme.colors['sand-300'],
    color: operationsTheme.colors.muted,
  },
  badge: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    paddingHorizontal: operationsTheme.space.md,
    paddingVertical: operationsTheme.space['2xs'],
    borderRadius: operationsTheme.radius.badge,
    overflow: 'hidden',
  },
  badgeArea: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
    color: operationsTheme.colors.muted,
  },
  /** Depocunun DURDUĞU dolap — zeytin: "bu parti burada" tek bakışta ayrılsın. */
  badgeHere: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    color: operationsTheme.colors['olive-dark'],
  },
  rowQty: {
    alignItems: 'flex-end',
    minWidth: operationsTheme.size.controlLg,
  },
  /** Sayı SERİF (Lora): bağlam kartının aynı ayrımı — büyük sayılar başlık ailesinden. */
  rowQtyValue: {
    fontFamily: operationsTheme.font.display[600],
    fontSize: operationsTheme.text['card-title'],
    color: operationsTheme.colors.ink,
  },
  rowQtyLabel: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  hint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
});
