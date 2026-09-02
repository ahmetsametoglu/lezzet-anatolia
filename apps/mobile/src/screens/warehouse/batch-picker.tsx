import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { toastInfo } from '@/lib/toast/toast-store';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsSurface } from '@/components/operations/surface';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { TextField } from '@/components/ui/text-field';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import { useBatchScan } from './use-batch-scan.hook';
import type { UseBatchSubjectResult } from './use-batch-subject.hook';
import { shortDate } from './warehouse-format';

/*
  KONU SEÇİCİ — "hangi parti" sorusunun EKRANI (D4 · D4b · v3:08/09), 02.09.

  ── İKİ EKRAN, TEK SEÇİCİ ───────────────────────────────────────────────────
  Sayım ve stok düşümü aynı soruyla başlıyor; ayrı ayrı çizilseydi bir gün ayrışırlardı. Değişen
  yalnız CÜMLE (*"Hangi parti sayılacak?"* ↔ *"Hangi partiden düşülecek?"*) ve o da prop.

  ── OKUTMA ÖNCE, LİSTE SONRA ────────────────────────────────────────────────
  Sıra tasarımın sırası ve doğru olan bu: rafta duran depocunun en hızlı yolu etiketi okutmaktır.
  Liste onun YEDEĞİ — etiket yırtılmış, silinmiş ya da hiç yapıştırılmamışsa. İkisi yer değiştirseydi
  hızlı yol ekranın dibinde kalırdı.

  ── LİSTENİN ÜÇ HÂLİ AYRI ŞEYLER SÖYLER ─────────────────────────────────────
  · **yükleniyor** — iskelet; halka değil (satırın kendi boyunda, veri gelince sayfa zıplamasın).
  · **hata** — "yüklenemedi" + tekrar dene. Boş listeyle KARIŞMAMALI: biri arıza, öteki cevap.
  · **boş** — sorgu varsa *"bu terimle eşleşen yok"*, yoksa *"bu depoda stoğu duran parti yok"*.
    İki cümle ayrı, çünkü ikisi ayrı şey: biri aramanın sonucu, öteki deponun hâli.

  Tavana dayanan liste ayrıca SÖYLER (`truncated`): sessiz kırpma, depocunun "listede yok" deyip
  yanlış partiye gitmesi demekti (CLAUDE §1).
*/

const t = warehouseCopy;

/** İskelet satır yüksekliği (dp) — parti satırının kendi boyu (ad + künye, iki satır). */
const ROW_SKELETON_HEIGHT = 72;
const SKELETON_ROWS = [ROW_SKELETON_HEIGHT, ROW_SKELETON_HEIGHT, ROW_SKELETON_HEIGHT];

interface BatchPickerProps {
  /** Boş hâlin sorusu — ekranına göre değişen tek şey. */
  title: string;
  body: string;
  /** Ekranın kendi kuralı (D4b: *"süresi geçmiş mal buraya girmez"*); verilmezse çizilmez. */
  footnote?: string;
  subject: UseBatchSubjectResult;
  testID: string;
}

export function BatchPicker({ title, body, footnote, subject, testID }: BatchPickerProps) {
  /*
    OKUTMA DA BURADA (02.09): iki ekranın ikisi de aynı çekmeceyi, aynı çoğul-eşleşme sorusunu ve
    aynı bildirim kanalını istiyordu. Ekranlarda bırakılsaydı üç parça (çekmece · seçim listesi ·
    toast köprüsü) iki dosyada birden yaşardı — kopyanın en sinsi türü, çünkü ikisi de çalışır.
  */
  const scan = useBatchScan(subject.select);

  /* BİLDİRİM KANALI TOAST (kullanıcı kararı 01.09): ekrana yapıştırılan satır yok, uygulamanın
     tek bildirim dili var. `toastInfo` SESSİZ — titreşimi `useNotice` tonuna göre zaten veriyor. */
  useEffect(() => {
    if (scan.notice !== null) toastInfo(scan.notice.text);
  }, [scan.notice]);

  return (
    <View style={styles.block} testID={testID}>
      <OperationsNoticeBlock variant="empty" title={title} description={body} testID={`${testID}-prompt`} />

      {/* OKUTMA HIZLI YOL: dolu zeytin düğme — listeden görsel olarak da ayrı durur. */}
      <PressableSurface
        onPress={scan.openScan}
        feedback="shadow"
        style={styles.scanCta}
        accessibilityLabel={t.adjustment.scan.cta}
        testID={`${testID}-scan`}
      >
        <Text style={styles.scanCtaLabel}>{t.adjustment.scan.cta}</Text>
      </PressableSurface>

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

      {subject.batches.map((batch) => (
        <OperationsSurface
          key={batch.stockId}
          tone="card"
          padding="md"
          chevron
          onPress={() => subject.select(batch)}
          accessibilityLabel={batch.name}
          testID={`${testID}-row-${batch.stockId}`}
        >
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {batch.name}
            </Text>
            <Text style={styles.rowMeta} numberOfLines={1}>
              {fillCopy(t.adjustment.picker.row, {
                /* LOTSUZ PARTİ GİZLENMEZ, SÖYLENİR: kabulde lot boş bırakmak meşru ve etiketi
                   olmayan parti sayımın en çok gerektiği partidir (sözleşme künyesi). */
                code: batch.lotNumber ?? t.adjustment.picker.noLot,
                area: batch.storageAreaName ?? t.adjustment.picker.noArea,
                qty: String(batch.physicalQty),
              })}
            </Text>
          </View>
        </OperationsSurface>
      ))}

      {subject.truncated ? (
        <Text style={styles.hint} testID={`${testID}-truncated`}>
          {fillCopy(t.adjustment.picker.truncated, { n: String(subject.batches.length) })}
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
  scanCta: {
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['olive-dark'],
  },
  scanCtaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors.cream,
  },
  heading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space.sm,
  },
  rowBody: {
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
  hint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
});
