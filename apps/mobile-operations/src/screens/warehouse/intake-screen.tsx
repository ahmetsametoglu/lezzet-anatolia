import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View, type ScrollView } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
// Ömür kararı MOTORDAN: ekran kendi yüzdesini kurmaz — kabul kapısı da aynı motoru çağırıyor ve
// ikisi ayrışsaydı ekran bir şey der, kayıt başkasını yazardı (`CLAUDE §1`).
import { meetsMlor } from '@lezzet/domain-core';
import type { IntakeFormRowContract, VariantSearchRowContract } from '@lezzet/types';

import { OperationsQuantityBox } from '@/components/operations/quantity-box';
import { OperationsQuantitySheet } from '@/components/operations/quantity-sheet';
import { quantityTotal } from '@/components/operations/quantity-value';
import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsDateKeypad } from '@/components/operations/date-keypad';
import { OperationsDateSheet } from '@/components/operations/date-sheet';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsAmountKeypad } from '@/components/operations/amount-keypad';
import { OperationsQtyReasonRow } from '@/components/operations/qty-reason-row';
import { OperationsStepperGroup } from '@/components/operations/stepper-group';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsScanFab, scanFabRoom } from '@/components/operations/scan-fab';
import { OperationsScreenChrome } from '@/components/operations/screen-scroll';
import { OperationsHeadBleed } from '@/components/operations/head-bleed';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsSurface } from '@/components/operations/surface';
import { OperationsProductThumb } from '@/components/operations/product-thumb';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { BottomSheet } from '@lezzet/mobile-kit/src/components/ui/bottom-sheet';
import { FormScroll } from '@lezzet/mobile-kit/src/components/ui/form-scroll';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { TextField } from '@lezzet/mobile-kit/src/components/ui/text-field';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { searchIntakeVariants } from '@/lib/api/warehouse';
import { warehouseCopy } from './copy';
import { useIntake, type IntakeRowState } from './use-intake.hook';
import { parseDate, productLabel, shortDate } from './warehouse-format';
import { trackWarehouse, useWarehouseStatus } from './warehouse-status';

/* Mal kabul: konusuz açılış bekleyen sevkiyatları listeler, konu (tedarik siparişi ya da plansız kabul) rotadan gelir. Fark
   özeti yalnız sapan satırları gösterir ki aranan fark kalabalıkta kaybolmasın; parçalı kabul meşrudur (DOMAIN §4). */

const t = warehouseCopy;

/**
 * İlk yük kartının boyu kapalı satırın ölçüsüdür (`controlSm` 46 + 2 × `space['2xl']`); yer tutucu satırın boyunda olmazsa veri
 * gelince sayfa zıplar.
 */
const LINE_SKELETON_HEIGHT = 74;

/** Okutulan satır üste getirilirken bırakılan nefes — satır ekranın tepesine yapışmasın. */
const SCROLL_MARGIN = 24;

/** Bekleyen listesinin künyesi; toplam kalem burada kurulur, çünkü uç yalnız sevkiyat başına kalem sayısı verir. */
function pendingSummary(pending: readonly { lineCount: number }[]): string {
  const lines = String(pending.reduce((sum, row) => sum + row.lineCount, 0));
  return pending.length === 1
    ? fillCopy(t.intake.pendingSummaryOne, { lines })
    : fillCopy(t.intake.pendingSummary, { n: String(pending.length), lines });
}

/**
 * Satır tamam mı: adet girilmiş ve SKT çözülmüş. Koşul `use-intake`in `complete` hesabıyla aynı kalmalı, yoksa künye "3 tamam"
 * derken kayıt düğmesi kapalı kalır.
 */
function isRowDone(state: { qty: number | null; expiryText: string }): boolean {
  return state.qty !== null && state.qty > 0 && parseDate(state.expiryText) !== null;
}

export function IntakeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ purchaseOrderId?: string; unplanned?: string }>();
  const purchaseOrderId = typeof params.purchaseOrderId === 'string' && params.purchaseOrderId.length > 0 ? params.purchaseOrderId : null;
  /** Plansız kabul: siparişsiz gelen mal, satırları depocu kurar. */
  const unplanned = params.unplanned === '1' && purchaseOrderId === null;
  const intake = useIntake(purchaseOrderId, unplanned);
  const { offline } = useWarehouseStatus();

  const [searchOpen, setSearchOpen] = useState(false);

  /* Tek kart açık (akordeon): kural satırların arasında olduğu için açıklık ekranın durumudur; açık kartlar alt alta
     dizilince depocu hangi satırda olduğunu kaydırarak arardı. */
  const [openRow, setOpenRow] = useState<string | null>(null);
  /** Kaydırıcı ve satırların ölçülen y'si — okutulan satırı görünür kılmak için (aşağıdaki künye). */
  const scroll = useRef<ScrollView>(null);
  const rowY = useRef<Record<string, number>>({});

  /* Okutulan satır ekrana getirilir: okutma satırı açıp adet çekmecesini getirir, satır ekranın dışındaysa çekmece kapanınca
     depocu boş listeye bakardı. */
  useEffect(() => {
    const target = intake.pendingCount;
    if (target === null) return;
    setOpenRow(target);
    const y = rowY.current[target];
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - SCROLL_MARGIN), animated: true });
  }, [intake.pendingCount]);

  /** Satırın anahtarı — aynı satıra ikinci dokunuş onu KAPATIR. */
  const toggleRow = useCallback((variantId: string) => {
    setOpenRow((current) => (current === variantId ? null : variantId));
  }, []);

  /* ARAMADAN SEÇİLEN ÜRÜN, ÇEKMECE KAPANANA KADAR BEKLER (künyesi `onPick`te). İki kanca da aynı
     yere bağlı — `onClosed` her platformda, `onDismiss` yalnız iOS'ta gelir; ikinci çağrı zararsız,
     çünkü bekleyen seçim ilk çağrıda tüketiliyor. */
  const [pickedVariant, setPickedVariant] = useState<VariantSearchRowContract | null>(null);
  const addPickedRow = useCallback(() => {
    if (pickedVariant === null) return;
    intake.addManualRow(pickedVariant);
    setPickedVariant(null);
  }, [intake, pickedVariant]);

  /* Arama çekmecesi bir kez tanımlanır ve plansız kabulün iki dalında (liste boş / dolu) çizilir; yalnız boş dalda dursaydı
     ilk üründen sonra arama açılmazdı. */
  const renderSearchSheet = () => (
    <VariantSearchSheet
      visible={searchOpen}
      onClose={() => setSearchOpen(false)}
      onClosed={addPickedRow}
      onDismissed={addPickedRow}
      onPick={(variant) => {
        /* Satır çekmece kapandıktan sonra eklenir: hemen eklenseydi liste dolar, ekran boş daldan dolu dala geçer ve sökülen
           çekmecenin kapanış sinyali hiç gelmezdi. Seçim bu yüzden bekletilir, adet çekmecesi kapanışın ardından açılır. */
        setPickedVariant(variant);
        setSearchOpen(false);
        /* Arama tanınmayan kodu öğretmek için açıldıysa kod da seçilen ürüne yazılır, depocu kodu ikinci kez okutmasın.
           Arama boş hâlin düğmesinden öğrenmesiz de açılabildiği için koşul `variantId === null` ister. */
        if (intake.learn !== null && intake.learn.variantId === null) {
          intake.pickLearnVariant(variant.variantId);
        }
        setSearchOpen(false);
      }}
    />
  );


  const header = (
    <OperationsStackHeader
      /* Plansız kabulün BAŞLIĞI ayrı (v3:756): "Mal Kabul" beklenen adetlerle çalışılan ekranın
         adı; siparişsiz mal onun bir kipi değil, başka bir iş. Aynı başlık ikisini de taşıyınca
         depocu hangi ekranda olduğunu ancak künyeden anlıyordu. */
      /* Formun başlığı sevkiyatın kodudur, çünkü depocunun elindeki kâğıtta o yazar; kod okunamadıysa ekranın adına düşer,
         "—" okunamayan kimliği boş gösterirdi. */
      title={unplanned ? t.intake.unplannedTitle : (intake.purchaseOrder?.referenceNo ?? t.intake.title)}
      /* Bekleyen listesinde künye LİSTEYİ anlatır (v3:517 `ov.maKabulAlt`), kategoriyi değil:
         "bekleyen sevkiyatlar" bir başlık tekrarıydı; "2 bekleyen sevkiyat · 11 kalem" depocunun
         işe başlamadan önce sorduğu şeyin cevabı. Liste okunamadıysa sayı da yok — künye
         kategoriye düşer, uydurulmaz. */
      subtitle={
        unplanned
          ? t.intake.captionUnplanned
          : purchaseOrderId === null
            ? intake.status === 'ready'
              ? pendingSummary(intake.pending)
              : t.intake.captionPending
            : /* Formda künye ilerlemeyi söyler (kaç kalem, kaçı tamam); satır henüz yüklenmediyse kategoriye düşer, çünkü
                 sıfır yazmak o an doğru olmayan "hiçbiri bitmedi" cümlesidir. */
              intake.rows.length === 0
              ? t.intake.captionPlanned
              : fillCopy(t.intake.formSummary, {
                  n: String(intake.rows.length),
                  done: String(intake.rows.filter((row) => isRowDone(intake.stateOf(row.variantId))).length),
                })
      }
      onBack={() => router.back()}
      backLabel={t.common.back}
      testID="warehouse-intake-header"
    />
  );

  /* Konusuz açılış bekleyen sevkiyatları listeler; kabule yalnız derin bağlantıyla girilseydi bağlantı kırıldığında ekran
     kapalı kalırdı. */
  if (purchaseOrderId === null && !unplanned && intake.status !== 'loading') {
    return (
      <View style={styles.screen} testID="warehouse-intake">
        {header}
        {intake.status === 'error' ? (
          <View style={styles.block}>
            <OperationsNoticeBlock
              variant="error"
              title={t.intake.error.title}
              description={t.intake.error.body}
              retry={{ label: t.common.retry, onPress: intake.reload }}
              testID="warehouse-intake-error"
            />
          </View>
        ) : intake.pending.length === 0 ? (
          <View style={styles.block}>
            <OperationsNoticeBlock
              variant="empty"
              title={t.intake.noPending.title}
              description={t.intake.noPending.body}
              testID="warehouse-intake-no-subject"
            />
            {/* Boş hâlde plansız kabul TEK yoldur (v3:551): bekleyen sevkiyat yokken gelen mal
                ancak buradan yazılır. Listeli hâlde satırın sonuna iner — orada bir istisna,
                burada tek çıkış. */}
            <PressableSurface
              onPress={() => router.push('/intake?unplanned=1')}
              feedback="shadow"
              style={styles.unplannedRow}
              accessibilityLabel={t.intake.unplannedCta}
              testID="warehouse-intake-unplanned-empty-cta"
            >
              {/* ARTI KENDİ BEYAZ KARESİNDE (v3:04) — zeytin kesikli zeminde çıplak bir artı
                  kayboluyordu; kare onu "basılacak şey" yapıyor. */}
              <View style={styles.unplannedPlusBox}>
                <Text style={styles.unplannedPlus}>＋</Text>
              </View>
              <View style={styles.pendingNames}>
                <Text style={styles.pendingRef}>{t.intake.unplannedCta}</Text>
                <Text style={styles.pendingMeta}>{t.intake.unplannedRow}</Text>
              </View>
            </PressableSurface>
          </View>
        ) : (
          /* Aşağı çekince yenileme yalnız listededir; formda tazeleme depocunun yazdığı adetleri sessizce silerdi. */
          <FormScroll
            contentContainerStyle={styles.list}
            refresh={{ onRefresh: intake.refresh, refreshing: intake.reloading }}
            testID="warehouse-intake-pending"
          >
            <Text style={styles.heading}>{t.intake.pendingHeading}</Text>
            {intake.pending.map((row) => (
              <PressableSurface
                key={row.purchaseOrderId}
                onPress={() => router.push(`/intake?purchaseOrderId=${row.purchaseOrderId}`)}
                feedback="shadow"
                style={styles.pendingRow}
                accessibilityLabel={row.referenceNo ?? row.supplierName ?? t.intake.title}
                testID={`warehouse-intake-pending-${row.purchaseOrderId}`}
              >
                {/* İKON KENDİ KARE ZEMİNİNDE (v3:04) — çıplak ikon satırın metniyle aynı ağırlıkta
                    duruyordu; zemin onu bir "tür işareti" hâline getiriyor ve göz satırları önce
                    ondan tarıyor. */}
                <View style={styles.pendingIcon}>
                  <Icon name="intake" size={operationsTheme.size.rowIcon} color={operationsTheme.colors.olive} />
                </View>
                <View style={styles.pendingNames}>
                  <Text style={styles.pendingRef}>{row.referenceNo ?? '—'}</Text>
                  {/* Durum alandan gelir: liste hem `sent` hem `partially_received` taşır ve ikincisinde formdaki beklenen
                      adetler kalandır. */}
                  <Text style={styles.pendingMeta}>
                    {fillCopy(t.intake.pendingMeta, {
                      supplier: row.supplierName ?? '—',
                      status: t.intake.pendingStatus[row.status],
                    })}
                  </Text>
                </View>
                <View style={styles.pendingTail}>
                  <Text style={styles.pendingMeta}>{fillCopy(t.intake.pendingLines, { n: String(row.lineCount) })}</Text>
                  {/* SABİT bir etiket ve öyle kalmalı: SKT her satırda zorunludur (sözleşme
                      kuralı, `IntakeFormLineSchema.expiryDate`), siparişe göre değişmez. Alan gibi
                      görünmesin diye vurgusuz — depocuya kabule başlamadan önce ne isteneceğini
                      söylüyor, bir sipariş özelliği bildirmiyor. */}
                  {/* TERRACOTTA (v3:04): sabit bir etiket ama SESSİZ değil — depocu kabule
                      başlamadan önce elinde SKT okunacak mal olduğunu bilmeli, ve o bilgiyi
                      formda değil BURADA, koliyi açmadan önce alıyor. */}
                  <Text style={styles.pendingTag}>{t.intake.pendingSktTag}</Text>
                </View>
              </PressableSurface>
            ))}

            {/* Plansız kabul listenin sonunda kendi satırıdır, çünkü istisnadır: beklenen adet yoktur ve sayım onunla
                doğrulanamaz. */}
            <PressableSurface
              onPress={() => router.push('/intake?unplanned=1')}
              feedback="shadow"
              style={styles.unplannedRow}
              accessibilityLabel={t.intake.unplannedCta}
              testID="warehouse-intake-unplanned-cta"
            >
              {/* ARTI KENDİ BEYAZ KARESİNDE (v3:04) — zeytin kesikli zeminde çıplak bir artı
                  kayboluyordu; kare onu "basılacak şey" yapıyor. */}
              <View style={styles.unplannedPlusBox}>
                <Text style={styles.unplannedPlus}>＋</Text>
              </View>
              <View style={styles.pendingNames}>
                <Text style={styles.pendingRef}>{t.intake.unplannedCta}</Text>
                <Text style={styles.pendingMeta}>{t.intake.unplannedRow}</Text>
              </View>
            </PressableSurface>

            <Text style={styles.pendingFootnote}>{t.intake.pendingFootnote}</Text>
          </FormScroll>
        )}
      </View>
    );
  }

  if (intake.status === 'loading') {
    /* İlk yük iskelettir, halka değil: kutular gelecek kalem kartlarının boyunda durur ki veri gelince sayfa zıplamasın. */
    return (
      <View style={styles.screen} testID="warehouse-intake">
        {header}
        <View style={styles.loading}>
          <OperationsSkeletonList
            heights={[LINE_SKELETON_HEIGHT, LINE_SKELETON_HEIGHT, LINE_SKELETON_HEIGHT]}
            label={t.intake.loading}
            testID="warehouse-intake-loading"
          />
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

  /* Plansızda BOŞ liste bir arıza değil, akışın başlangıcı: depocu ürünleri kendisi ekleyecek. */
  if (intake.rows.length === 0 && unplanned) {
    return (
      <View style={styles.screen} testID="warehouse-intake">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.intake.unplannedEmpty.title}
            description={t.intake.unplannedEmpty.body}
            testID="warehouse-intake-unplanned-empty"
          />
          {offline ? null : (
            /* Arama yedek yoldur ve kum çerçeveyle çizilir; asıl yol yüzen okutma düğmesidir. */
            <View style={styles.altCtas}>
              <SecondaryButton
                label={t.intake.searchCta}
                onPress={() => setSearchOpen(true)}
                tone="sand"
                elevation="flat"
                testID="warehouse-intake-search-cta"
              />
            </View>
          )}
        </View>
        <OperationsScanFab
          icon="scan"
          accessibilityLabel={t.intake.scan.cta}
          onPress={intake.openScan}
          disabled={offline}
          testID="warehouse-intake-scan-cta"
        />
        <ScanSheet
          open={intake.scanOpen}
          title={t.intake.scan.title}
          hint={t.intake.scan.hint}
          onClose={intake.closeScan}
          onScan={intake.handleScan}
          testID="warehouse-intake-scan"
        />
        {renderSearchSheet()}
        {/* Öğrenme çekmecesi boş hâlde de çizilir: plansız kabulün ilk okutması tanınmayan bir kod olabilir ve çekmece
            yoksa ekran hiç kıpırdamaz. */}
        <LearnSheet intake={intake} onLearnSearch={() => setSearchOpen(true)} />
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

  /* Düğme asıl eylemi yazar, kapının sebebini değil: eksik olan şey düğmenin üstündeki tek satırlık kapı metnindedir. */
  const cta = offline
    ? { label: t.common.offlineCta, enabled: false }
    : intake.sending
      ? { label: t.intake.cta.sending, enabled: false }
      : intake.complete
        ? { label: intake.differences.length > 0 ? t.intake.cta.partial : t.intake.cta.ready, enabled: true }
        : { label: t.intake.cta.ready, enabled: false };

  /* KAPI METNİ — niçin kapalı olduğunu ve NE KADAR KALDIĞINI söyler (v3:05 "0/5 satır dolu").
     Sayaç olmadan depocu kaç satırın eksik olduğunu ancak listeyi baştan sona gezerek görüyordu. */
  const gateNote =
    offline || intake.sending || intake.complete || intake.rows.length === 0
      ? null
      : fillCopy(t.intake.cta.gate, { filled: String(intake.filledCount), total: String(intake.rows.length) });

  return (
    <View style={styles.screen} testID="warehouse-intake">
      {/* `FormScroll` klavye farkında kendi kaydırıcısı olduğu için sarılamaz, mikro başlığı krom kapısı çizer. Başlık
          kaydırıcının içindedir, dışarıda kalsaydı mikro başlık inince altında asılı kalırdı. */}
      <OperationsScreenChrome
        title={unplanned ? t.intake.unplannedTitle : (intake.purchaseOrder?.referenceNo ?? t.intake.title)}
        caption={operationsCopy.sections.warehouse.tab}
      >
        {(bind) => (
      <FormScroll
        {...bind}
        /* Liste sonu dairenin payını bırakır, yoksa kapı satırı ve kayıt düğmesi dairenin altında kalır. */
        contentContainerStyle={[styles.list, { paddingBottom: scanFabRoom() }]}
        scrollRef={scroll}
        testID="warehouse-intake-lines"
      >
        <OperationsHeadBleed pad="6xl">{header}</OperationsHeadBleed>

        {/* Öğrenilen kod listenin üstünde kalır: depocu kodun bir dahaki kabulde tanınacağını görürse aynı koliyi ikinci
            kez öğretmeye kalkmaz. Kart kapatılmaz, kabul bitene kadar doğru kalan bir kayıttır. */}
        {intake.learned === null ? null : (
          <View style={styles.learnedCard} testID="warehouse-intake-learned">
            <Text style={styles.learnedTitle}>
              {fillCopy(t.intake.scan.learnedCard.title, {
                code: intake.learned.code,
                name: intake.learned.name,
              })}
            </Text>
            <Text style={styles.learnedBody}>
              {fillCopy(t.intake.scan.learnedCard.body, {
                kind: t.intake.scan.kind[intake.learned.kind],
                n: String(intake.learned.qtyPerCode),
              })}
            </Text>
          </View>
        )}
        {offline ? (
          /* Çevrimdışıyken sebep yazılır: kilit bir yokluk değil cevaptır ve çevrimdışı sayılan adet iki deponun stokunu
             bozar. Satırlar durur, okumak serbesttir. */
          /* KİLİDİN METNİ KİPE GÖRE (v3:610 vs 813): planlı kabulde sorun SAYIMIN doğruluğudur
             ("çevrimdışı sayılan adet iki deponun stokunu bozabilir"); plansızda henüz sayılacak
             bir şey yok, sorun SATIRIN kendisinin doğamamasıdır (kod eşleşmesi ve parti oluşumu
             sunucuda). Tek metin ikisini de anlatsaydı, ikisinde de yarısı yanlış olurdu. */
          <View style={styles.formLocked} testID="warehouse-intake-locked">
            <Text style={styles.formLockedTitle}>{unplanned ? t.intake.unplannedLocked.title : t.intake.formLocked.title}</Text>
            <Text style={styles.formLockedBody}>{unplanned ? t.intake.unplannedLocked.body : t.intake.formLocked.body}</Text>
          </View>
        ) : null}
        {/* Arama YALNIZ plansızda: PO'lu kabulde satır kümesi siparişten gelir ve dışarıdan satır
            eklemek fark raporunun göremeyeceği bir yere "beklenmedik mal" yazmak olurdu (23.4). */}
        {offline || !unplanned ? null : (
          <View style={styles.altCtas}>
            <SecondaryButton
              label={t.intake.searchCta}
              onPress={() => setSearchOpen(true)}
              tone="sand"
              elevation="flat"
              testID="warehouse-intake-search-cta"
            />
          </View>
        )}

        {intake.rows.map((row) => (
          <IntakeRow
            key={row.variantId}
            row={row}
            state={intake.stateOf(row.variantId)}
            unplanned={unplanned}
            mlorPercent={intake.mlorPercent}
            pendingCount={intake.pendingCount === row.variantId}
            onCountConsumed={intake.clearPendingCount}
            expanded={openRow === row.variantId}
            onToggle={() => toggleRow(row.variantId)}
            onLayoutY={(y) => {
              rowY.current[row.variantId] = y;
            }}
            lotSuggestions={intake.lotsUsedBy(row.variantId)}
            dateSuggestions={intake.datesUsedBy(row.variantId)}
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

        {/* Kayıt düğmeleri listenin sonundadır, yapışkan çubukta değil: çubuk açık kartın hasar ve sebep satırını örterdi
            ve kabul zaten her satır sayıldıktan sonra verilen karardır. */}
        <View style={styles.formActions}>
          {gateNote === null ? null : (
            <Text style={styles.stickyNote} testID="warehouse-intake-gate">
              {gateNote}
            </Text>
          )}
          <PrimaryButton
            label={cta.label}
            /* Başarıda ekran kapanır: yapılacak iş kalmadı, sonucu toast söyler ve depocu sevkiyatın listeden düştüğünü
               görür. */
            onPress={() => intake.submit({ onDone: () => router.back() })}
            disabled={!cta.enabled}
            elevation="flat"
            testID="warehouse-intake-cta"
          />

          {/* Kısmi kayıt ikinci yoldur: koli koli gelen sevkiyatta mal geldiği kadarıyla stoğa girer, kalanı açık kalır.
              Yalnız "hepsi sayılmamış ama en az biri sayılmış" hâlde çizilir; öteki hâllerde ya birinci düğmenin kötü
              kopyası ya boş kabule davet olurdu. */}
          {offline || intake.complete || !intake.hasAnyCounted ? null : (
            <>
              <SecondaryButton
                label={t.intake.cta.partialAction}
                onPress={() => intake.submit({ partial: true })}
                /* Kiremit ton: kısmi kayıt hata değil, geri alınamayan bir sapmadır; sevkiyat kısmen teslim alındıya döner
                   ve kalan satırlar açık kalır. */
                tone="terracotta"
                elevation="flat"
                disabled={intake.sending}
                testID="warehouse-intake-partial-cta"
              />
              <Text style={styles.stickyNote}>{t.intake.cta.partialNote}</Text>
            </>
          )}
        </View>
      </FormScroll>
        )}
      </OperationsScreenChrome>

      {/* Okutma yüzen düğmededir, çünkü akıştaki düğme liste kaydıkça kaybolur; çevrimdışıyken söner, sebebini listedeki kilit
          yazar. */}
      <OperationsScanFab
        icon="scan"
        accessibilityLabel={t.intake.scan.cta}
        onPress={intake.openScan}
        disabled={offline}
        testID="warehouse-intake-scan-cta"
      />

      <ScanSheet
        open={intake.scanOpen}
        title={t.intake.scan.title}
        hint={t.intake.scan.hint}
        onClose={intake.closeScan}
        onScan={intake.handleScan}
        testID="warehouse-intake-scan"
      />

      {renderSearchSheet()}

      <LearnSheet intake={intake} onLearnSearch={() => setSearchOpen(true)} />
    </View>
  );
}

/**
 * Öğrenen eşleme çekmecesi: tanınmayan kod için satır seçtirilir ve kod o varyanta yazılır; aday kümesi formun satırlarıdır,
 * katalog araması yanlış ürüne öğretmenin kapısını açardı. Ayrı bileşendir, çünkü ekranın iki dalında da çizilmeli ve iki nüsha
 * zamanla sessizce ayrışırdı.
 */
function LearnSheet({ intake, onLearnSearch }: { intake: ReturnType<typeof useIntake>; onLearnSearch: () => void }) {
  return (
    <BottomSheet
      visible={intake.learn !== null}
      title={intake.learn?.variantId === null ? t.intake.scan.learnTitle : t.intake.scan.learnUnitTitle}
      onClose={intake.cancelLearn}
      testID="warehouse-intake-learn"
    >
      {intake.learn === null ? null : intake.learn.variantId === null ? (
        intake.rows.length === 0 ? (
          /* Aday listesi boşsa (plansız kabulün ilk okutması) arama açılır ve seçilen ürün hem satırı açar hem kodu alır;
             ayrı olsaydı depocu kodu ikinci kez okuturdu. */
          <>
            <Text style={styles.learnBody}>{fillCopy(t.intake.scan.learnEmptyBody, { code: intake.learn.code })}</Text>
            <PrimaryButton
              label={t.intake.scan.learnEmptyCta}
              onPress={onLearnSearch}
              elevation="flat"
              testID="warehouse-intake-learn-search"
            />
          </>
        ) : (
          <>
            <Text style={styles.learnBody}>{fillCopy(t.intake.scan.learnBody, { code: intake.learn.code })}</Text>
            {/* SATIRLAR KART, AYRAÇ DEĞİL (tasarım karesi `02f-Bilinmeyen-Kod-Esleme`): her aday
                kendi kartında durur, künyesinde TEDARİKÇİ KODU da vardır ("beklenen 10 · GAZ-7120")
                ve sağında yön oku. Ayraçlı düz satırlar bir liste gibi okunuyordu; oysa burada
                yapılan şey seçmek — kartlar dokunulabilir olduğunu söylüyor. */}
            {intake.rows.map((row) => (
              <PressableSurface
                key={row.variantId}
                onPress={() => intake.pickLearnVariant(row.variantId)}
                feedback="scale"
                style={styles.learnCard}
                accessibilityLabel={productLabel(row.productName, row.variantLabel)}
              >
                <View style={styles.learnCardBody}>
                  <Text style={styles.learnRowLabel}>{productLabel(row.productName, row.variantLabel)}</Text>
                  <Text style={styles.learnRowMeta}>
                    {row.supplierCode === null
                      ? fillCopy(t.intake.expected, { qty: String(row.expectedQty) })
                      : `${fillCopy(t.intake.expected, { qty: String(row.expectedQty) })} · ${row.supplierCode}`}
                  </Text>
                </View>
                <Text style={styles.learnChevron}>›</Text>
              </PressableSurface>
            ))}
            {/* DİPNOT (tasarım): eşlemenin ne olduğunu ve yanlışının nasıl geri alınacağını söyler. */}
            <Text style={styles.learnFootnote}>{t.intake.scan.learnFootnote}</Text>
          </>
        )
      ) : (
        /* İkinci adım: bu kod neyi sayıyor? Çarpan öğrenme anında yazılmazsa yazılacak başka yer yok, web'de kod ekleme
           bilinçle kapalıdır. */
        <>
          <Text style={styles.learnBody}>
            {fillCopy(t.intake.scan.learnUnitBody, {
              name: nameOfRow(intake.rows, intake.learn.variantId),
            })}
          </Text>
          <View style={styles.learnKindRow}>
            <OperationsChoiceChip
              label={t.intake.scan.learnUnitSingle}
              selected={intake.learn.kind === 'unit'}
              onPress={() => intake.setLearnKind('unit')}
              fill
              testID="warehouse-intake-learn-unit"
            />
            <OperationsChoiceChip
              label={t.intake.scan.learnUnitCase}
              selected={intake.learn.kind === 'case'}
              onPress={() => intake.setLearnKind('case')}
              fill
              testID="warehouse-intake-learn-case"
            />
          </View>
          {intake.learn.kind === 'unit' ? null : (
            /* Kitin tek adet sayacı; taban 2, çünkü koli en az iki pakettir ve `confirmLearn` de aynı kuralla kilitlenir.
               Çekmece içinden çekmece açılmadığı için ortadaki rakam tuş takımı açmaz. */
            <View style={styles.learnQty}>
              <OperationsStepperGroup
                value={intake.learn.qtyPerCode}
                onChange={intake.setLearnQty}
                min={2}
                size="lg"
                label={t.intake.scan.learnUnitQty}
                testID="warehouse-intake-learn-qty"
              />
              <Text style={styles.learnQtyCaption}>{t.intake.scan.learnUnitCaption}</Text>
            </View>
          )}
          <PrimaryButton
            label={t.intake.scan.learnConfirm}
            onPress={intake.confirmLearn}
            disabled={intake.learn.kind === 'case' && intake.learn.qtyPerCode < 2}
            elevation="flat"
            testID="warehouse-intake-learn-confirm"
          />
        </>
      )}
      <PressableSurface
        onPress={intake.cancelLearn}
        feedback="opacity"
        style={styles.learnCancel}
        accessibilityLabel={t.intake.scan.learnCancel}
      >
        <Text style={styles.learnCancelLabel}>{t.intake.scan.learnCancel}</Text>
      </PressableSurface>
    </BottomSheet>
  );
}

interface VariantSearchSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Çekmece SÖKÜLDÜĞÜNDE (her platform) — bekleyen seçimin satıra dönüştüğü an. */
  onClosed?: () => void;
  /** Çekmece EKRANDAN GERÇEKTEN KALKTIĞINDA (iOS `Modal.onDismiss`) — aynı işi yapar. */
  onDismissed?: () => void;
  /** Seçilen satır bütün geçer: daraltılmış bir imza satıra yeni alan eklendiğinde onu sessizce düşürürdü. */
  onPick: (variant: VariantSearchRowContract) => void;
}

/**
 * Plansız kabulün ürün araması; tek çağıranı olduğu için sayfaya özeldir. Arama sunucudadır ve yarış korumalıdır, geç dönen
 * eski cevap yenisini ezmez.
 */
function VariantSearchSheet({ visible, onClose, onClosed, onDismissed, onPick }: VariantSearchSheetProps) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<VariantSearchRowContract[]>([]);
  const generation = useRef(0);

  useEffect(() => {
    if (!visible) {
      // Kapanışta sıfırlanır: bir sonraki açılış önceki aramanın kuyruğuyla başlamamalı.
      setQuery('');
      setRows([]);
      return;
    }
  }, [visible]);

  const search = useCallback((next: string) => {
    setQuery(next);
    const run = (generation.current += 1);
    void (async () => {
      const result = await trackWarehouse(searchIntakeVariants(next));
      if (run !== generation.current) return;
      setRows(result.error === null ? result.data.variants : []);
    })();
  }, []);

  return (
    /* Sabit yükseklik (`fill`): içeriği kadar açılan çekmece sonuçlar geldikçe büyür ve her tuşta zıplardı. */
    <BottomSheet
      visible={visible}
      title={t.intake.searchTitle}
      fill
      onClose={onClose}
      onClosed={onClosed}
      onDismissed={onDismissed}
      testID="warehouse-intake-search"
    >
      <TextField
        value={query}
        onChangeText={search}
        placeholder={t.intake.searchPlaceholder}
        accessibilityLabel={t.intake.searchTitle}
        density="compact"
        testID="warehouse-intake-search-input"
      />
      <Text style={styles.learnRowMeta}>{t.intake.searchHint}</Text>
      {query.trim().length > 0 && rows.length === 0 ? <Text style={styles.learnRowMeta}>{t.intake.searchEmpty}</Text> : null}
      {rows.map((row) => (
        /* Satır ad, "kod · stok N" ve yön okunu taşır, çünkü depocunun sorusu "bu üründen bende var mı"dır. Görsel aynı
           ürünün boylarını ayırır; görsel yoksa yer tutucu çizilmez, boş kare bilgi vermez. */
        <OperationsSurface
          key={row.variantId}
          tone="card"
          padding="md"
          chevron
          onPress={() => onPick(row)}
          accessibilityLabel={`${productLabel(row.productName, row.variantLabel)} — ${searchMeta(row)}`}
          testID={`warehouse-intake-search-${row.variantId}`}
        >
          <View style={styles.searchRow}>
            {row.imageUrl === null ? null : (
              <OperationsProductThumb name={productLabel(row.productName, row.variantLabel)} photoUri={row.imageUrl} size="md" />
            )}
            <View style={styles.searchBody}>
              <Text style={styles.searchName} numberOfLines={1}>
                {productLabel(row.productName, row.variantLabel)}
              </Text>
              <Text style={styles.searchMeta} numberOfLines={1}>
                {searchMeta(row)}
              </Text>
            </View>
          </View>
        </OperationsSurface>
      ))}
    </BottomSheet>
  );
}

/** Satırın künyesi — tasarımın biçimi: `GAZ-7120 · stok 24`. Kod yoksa yalnız stok yazılır. */
function searchMeta(row: VariantSearchRowContract): string {
  const stock = fillCopy(t.intake.searchStock, { qty: String(row.stockQty) });
  return row.sku === null ? stock : `${row.sku} · ${stock}`;
}

/** Öğrenme 2. adımının başlığındaki ürün adı — satır kümesi zaten ekranın elinde, ikinci arama yok. */
function nameOfRow(rows: readonly IntakeFormRowContract[], variantId: string): string {
  const row = rows.find((candidate) => candidate.variantId === variantId);
  return row === undefined ? '—' : productLabel(row.productName, row.variantLabel);
}

interface IntakeRowProps {
  row: IntakeFormRowContract;
  state: IntakeRowState;
  /** Plansız kabulde beklenen YOKTUR; planlıda sıfır kalan "karşılandı" demektir (aşağıdaki künye). */
  unplanned: boolean;
  /** MLOR eşiği (%) — SUNUCUDAN gelen ayar; satırın kendi değeri değil, formun kuralı. */
  mlorPercent: number;
  /** Bu kabulde başka satırlara girilmiş lotlar: soru formundur, satırın değil, ve satırın kendi kodu listede olmaz. */
  lotSuggestions: string[];
  /** Aynı kabulde başka satırlara yazılmış SKT'ler (ISO), tarih tuş takımının hızlı çipleri. */
  dateSuggestions: string[];
  /**
   * Bu satır az önce okutuldu mu: satır açılır ve adet çekmecesi gelir; sinyal bir kez tüketilir, yoksa çekmece her çizimde
   * açılırdı.
   */
  pendingCount: boolean;
  onCountConsumed: () => void;
  /** Satır AÇIK mı — akordeon kuralı ekranda (künyesi orada); satır kendi açıklığını tutmaz. */
  expanded: boolean;
  onToggle: () => void;
  /** Satırın listedeki y'si — okutulan satırı ekrana getiren kaydırma bunu kullanır. */
  onLayoutY: (y: number) => void;
  onPatch: (patch: Partial<IntakeRowState>) => void;
}

function IntakeRow({
  row,
  state,
  unplanned,
  mlorPercent,
  pendingCount,
  onCountConsumed,
  expanded,
  onToggle,
  onLayoutY,
  lotSuggestions,
  dateSuggestions,
  onPatch,
}: IntakeRowProps) {
  /** SKT alanı tuş takımını açar; tekerlek tuş takımındaki bağlantıdadır. */
  const [dateOpen, setDateOpen] = useState(false);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [qtyOpen, setQtyOpen] = useState(false);
  /** Hasar sayacının ortasındaki rakam tuş takımını açar. */
  const [damageQtyOpen, setDamageQtyOpen] = useState(false);
  const [lotOpen, setLotOpen] = useState(false);

  /* OKUTULAN SATIR KENDİLİĞİNDEN AÇILIR ve adet çekmecesini getirir (tasarım: okutma → `sheet:
     'adet'`). Sinyal hemen tüketiliyor: ikinci bir çizimde çekmece yeniden açılmasın. */
  useEffect(() => {
    if (!pendingCount) return;
    // Satırı AÇAN ve ekrana getiren taraf EKRAN (akordeon künyesi); burada yalnız çekmece açılır.
    setQtyOpen(true);
    onCountConsumed();
  }, [pendingCount, onCountConsumed]);
  /* Sayılmış mı ölçütü adedin girilmiş olmasıdır: "0 adet geldi" de bir sayımdır, sıfırı sayılmamış saymak bilinçli beyanı
     "dokunmadım"la eşitlerdi. Açıklık ayrı bir şeydir, açık olan tek satırı ekran seçer. */
  const measured = state.qty !== null;
  const counted = expanded;
  const name = productLabel(row.productName, row.variantLabel);
  const expiry = parseDate(state.expiryText);
  const damaged = state.damageOpen;
  // Tarih girilmeden ölçüt YOKTUR — `meetsMlor`a boş bir tarih vermek, olmayan bir ölçümden karar
  // üretmek olurdu. `null` = "henüz sorulmadı"; motorun kendi `null`ı ("ömür bilinmiyor") ondan ayrı
  // ve o da uyarı üretmiyor (`ok: true` ile döner).
  const life = expiry === null ? null : meetsMlor(expiry, row.shelfLifeDays, new Date(), mlorPercent);

  return (
    <View
      style={[styles.lineRow, measured ? null : styles.lineRowIdle]}
      /* Satırın listedeki yeri ÖLÇÜLÜR: okutulan satırı ekrana getiren kaydırma bunu kullanıyor
         (ekranın künyesi). Hesaplanamaz — kartların boyu içeriğe göre değişiyor. */
      onLayout={(event) => onLayoutY(event.nativeEvent.layout.y)}
      testID={`warehouse-intake-line-${row.variantId}`}
    >
      <View style={styles.lineHead}>
        {/* Başlık kartın anahtarıdır: dokunuş açar, ikinci dokunuş kapatır. */}
        <PressableSurface
          onPress={onToggle}
          feedback="opacity"
          grow
          compact
          style={styles.rowBody}
          /* Ad tek başına yetmez: aynı ad çekmecelerde de geçer ve ekran okuyucu iki hedefi ayırt edemez. */
          accessibilityLabel={fillCopy(t.intake.rowToggle, { name })}
          accessibilityHint={counted ? t.intake.rowCollapse : t.intake.rowExpand}
          testID={`warehouse-intake-row-toggle-${row.variantId}`}
        >
          <Text style={styles.rowTitle}>{name}</Text>
          {/* Sıfır beklenen iki ayrı şeydir: plansızda kıyaslanacak sipariş yoktur ve "beklenen yok" yazılır, planlıda
              sıfır kalan beklentinin karşılandığını söyler. `expectedQty` kalandır, ısmarlanan değil. */}
          {row.expectedQty > 0 ? (
            /* Tedarikçi kodu beklenen adedin yanındadır: depocunun elindeki kâğıt tedarikçinin irsaliyesidir ve satırı
               onunla eşleştiren kesin anahtar bu koddur. Kodsuz kalemde yalnız beklenen yazılır. */
            <Text style={styles.rowSub} testID={`warehouse-intake-expected-${row.variantId}`}>
              {row.supplierCode === null
                ? fillCopy(t.intake.expected, { qty: String(row.expectedQty) })
                : fillCopy(t.intake.expectedWithCode, { qty: String(row.expectedQty), code: row.supplierCode })}
            </Text>
          ) : unplanned ? (
            /* Plansızda satırın kodu SKU'dur, çünkü sipariş kalemi ve tedarikçi kodu yoktur; SKU'suz varyantta kelime hâli
               yazılır. */
            <Text style={styles.rowSub} testID={`warehouse-intake-none-${row.variantId}`}>
              {row.sku === null ? t.intake.expectedNone : fillCopy(t.intake.expectedNoneWithSku, { sku: row.sku })}
            </Text>
          ) : (
            <Text style={styles.rowDone} testID={`warehouse-intake-done-${row.variantId}`}>
              {t.intake.expectedDone}
            </Text>
          )}
        </PressableSurface>
        {/* Sayılmamış satır kapalı durur (kesikli "say →") ki altı kalemlik sipariş tek ekrana sığsın; sayı girilince satır
            açılır, çünkü sonra SKT ve lot sorulur. */}
        {/* ADET KUTUSU: satır açıksa HER ZAMAN, kapalıysa yalnız SAYILMIŞSA. Kesikli "say →"
            kapalı ve sayılmamış satırın davetidir — açık satırda o davet zaten kabul edilmiştir. */}
        {measured || counted ? (
          /* Adet kutusu cihaz klavyesini açmaz: eldivenli elle sistem klavyesinin küçük tuşları ıskalanır, tuş takımının
             büyük tuşları basılır. */
          /* Adet kutusu kittedir (`quantity-box`), transfer kabulü de aynısını çizer. Sapma tonu beklentinin varlığına
             bağlıdır, beklenen yokken her sayı "farklı" görünürdü. */
          <OperationsQuantityBox
            value={state.qty}
            caption={t.intake.qtyCaption}
            tone={
              state.qty === null ? 'muted' : row.expectedQty === 0 || state.qty === row.expectedQty ? 'ink' : 'diff'
            }
            onPress={() => setQtyOpen(true)}
            accessibilityLabel={fillCopy(t.intake.qtyLabel, { name })}
            accessibilityHint={t.intake.qtyHint}
            testID={`warehouse-intake-qty-${row.variantId}`}
          />
        ) : (
          <OperationsQuantityBox
            /* Düğme beklenen adedi yazar ama otomatik değil: dokunuşun kendisi beyandır, kendiliğinden dolu satırlar
               sayılmamış siparişi "sayıldı" gösterirdi. Beklenen yoksa düğme yalnız satırı açar. */
            onPress={() => {
              onToggle();
              if (row.expectedQty > 0) {
                onPatch({ qty: row.expectedQty, breakdown: { cases: [], loose: row.expectedQty } });
                return;
              }
              setQtyOpen(true);
            }}
            value={null}
            placeholderValue={row.expectedQty > 0 ? row.expectedQty : null}
            caption={row.expectedQty > 0 ? t.intake.countExpectedCaption : undefined}
            label={t.intake.countCta}
            dashed
            tone="muted"
            accessibilityLabel={
              row.expectedQty > 0
                ? fillCopy(t.intake.countExpectedLabel, { name, qty: String(row.expectedQty) })
                : fillCopy(t.intake.qtyLabel, { name })
            }
            testID={`warehouse-intake-count-${row.variantId}`}
          />
        )}
      </View>

      {/* Kapalı satırın özeti rozetlerdedir ve durumu söyler: SKT girilmemişse zorunluluk, girilmişse tarihin kendisi; lot
          yalnız girildiyse; hasar sağa yaslı, yalnız beyan varsa adediyle. */}
      {counted ? null : (
        <View style={styles.chipRow}>
          {measured && expiry !== null ? (
            <Text style={[styles.badge, styles.badgeDate]} testID={`warehouse-intake-date-badge-${row.variantId}`}>
              {fillCopy(t.intake.dateBadge, { type: row.dateType, date: shortDate(expiry) ?? expiry })}
            </Text>
          ) : (
            <Text style={[styles.badge, styles.badgeRequired]}>{fillCopy(t.intake.dateTag, { type: row.dateType })}</Text>
          )}
          {state.lotText.length === 0 ? null : (
            <Text style={[styles.badge, styles.badgeLot]}>{fillCopy(t.intake.lot.short, { lot: state.lotText })}</Text>
          )}
          {damaged && state.damagedQty > 0 ? (
            <Text style={[styles.badge, styles.badgeDamage]} testID={`warehouse-intake-damage-badge-${row.variantId}`}>
              {fillCopy(t.intake.damage.broken, { n: String(state.damagedQty) })}
            </Text>
          ) : null}
        </View>
      )}

      {counted ? (
        <>
          {/* Açık satırın künye satırı yalnız rozet ve kaynak notudur: SKT durumunu alanın kendisi söyler, lot ve hasar çip
              değil alandır. Kaynak notu adedin okutmadan mı elle mi geldiğini söyler, denetimde ikisi aynı görünmemeli. */}
          <View style={styles.chipRow}>
            {/* Tarih rejimi üründen: "SKT ZORUNLU" her satırda aynıdır, "DLC/DDM" ürüne göre değişir ve depocunun kutuda
                arayacağı yazıdır. Kapalı satırla aynı rozettir, gri olsaydı zorunluluk kalkmış sanılırdı. */}
            <Text style={[styles.badge, styles.badgeRequired]} testID={`warehouse-intake-datetype-${row.variantId}`}>
              {fillCopy(t.intake.dateTag, { type: row.dateType })}
            </Text>
            <Text style={styles.sourceNote} testID={`warehouse-intake-source-${row.variantId}`}>
              {state.scan === null ? t.intake.source.manual : t.intake.source.scanned}
            </Text>
          </View>

          {/* Okutma kutusu satırın neyle okutulduğunu söyler; zeytin ton bir doğrulamadır, elle sayılan satırda çizilmez. */}
          {state.scan === null ? null : (
            <View style={styles.scanNote} testID={`warehouse-intake-scan-note-${row.variantId}`}>
              <Text style={styles.scanNoteTitle}>{t.intake.scan.kind[state.scan.kind]}</Text>
              <Text style={styles.scanNoteBody}>{fillCopy(t.intake.scan.perCode, { n: String(state.scan.qtyPerCode) })}</Text>
            </View>
          )}

          {/* SKT alanı bir girdi değil, tuş takımını açan düğmedir: eldivenle cihaz klavyesinde yazılan tarih olmayan gün
              ve belirsiz biçim üretir. */}
          {/* Alan takvim ikonu, tarih ve "seç →" taşır ki dokunulabilir olduğu okunsun. */}
          {/* Alan durumunu kendi üstünde taşır: SKT yoksa çerçeve, ikon ve metin uyarı tonundadır; ayrı bir "SKT gir" çipi
              bu yüzden yok. */}
          <PressableSurface
            onPress={() => setDateOpen(true)}
            feedback="scale"
            style={[styles.expiryField, expiry === null ? styles.expiryFieldMissing : styles.expiryFieldFilled]}
            accessibilityLabel={fillCopy(t.intake.expiry.field, { name })}
            accessibilityHint={t.intake.expiry.pick}
            testID={`warehouse-intake-expiry-${row.variantId}`}
          >
            <Icon
              name="calendar"
              size={operationsTheme.size.stripIcon}
              color={expiry === null ? operationsTheme.colors.terracotta : operationsTheme.colors['olive-dark']}
            />
            <Text
              style={expiry === null ? styles.fieldMissing : styles.fieldFilled}
              testID={`warehouse-intake-expiry-state-${row.variantId}`}
            >
              {expiry === null ? t.intake.expiry.missing : (shortDate(expiry) ?? expiry)}
            </Text>
            <Text style={styles.fieldPick}>{t.intake.expiry.pick}</Text>
          </PressableSurface>

          {/* LOT VE HASAR: İKİ ALAN, İKİ ÇİP DEĞİL (v3:05 · `openLot` + `tg.hasarNotu`).
          Lot bir DEĞER taşıyor ("lot seç" → "L-2291"), hasar ise bir NOT açıyor; çip ikisini de
          aç/kapa anahtarına indirgiyordu ve lotun değeri hiçbir yerde görünmüyordu. */}
          <View style={styles.fieldRow}>
            <PressableSurface
              onPress={() => setLotOpen(true)}
              feedback="scale"
              grow
              selected={state.lotText.length > 0}
              /* Dolu lot alanı yeşile boyanır, boş alan dolgusuz kalır: "lot yok" bilinçli bir boşluktur, işaretini metni
                 taşır. */
              style={[styles.subField, state.lotText.length > 0 ? styles.subFieldFilled : null]}
              accessibilityLabel={state.lotText.length === 0 ? t.intake.lot.pick : fillCopy(t.intake.lot.known, { lot: state.lotText })}
              testID={`warehouse-intake-lot-toggle-${row.variantId}`}
            >
              <Text style={state.lotText.length > 0 ? styles.subFieldLabelFilled : styles.subFieldLabel}>
                {state.lotText.length > 0 ? state.lotText : t.intake.lot.pick}
              </Text>
            </PressableSurface>
            <PressableSurface
              /* Kartı AÇAR, hasar "beyan etmez": sayaç 0'dan başlar. Kapatınca beyan da silinir —
                 açık bir kartın kapanması "yanlış alarmdı" demektir. */
              onPress={() =>
                onPatch(damaged ? { damageOpen: false, damagedQty: 0, damageReason: null, damageNote: '' } : { damageOpen: true })
              }
              feedback="scale"
              selected={damaged}
              style={[styles.subField, damaged ? styles.subFieldDamaged : null]}
              accessibilityLabel={damaged ? t.intake.damage.set : t.intake.damage.idle}
              testID={`warehouse-intake-damage-toggle-${row.variantId}`}
            >
              <Text style={damaged ? styles.subFieldLabelDamaged : styles.subFieldLabel}>
                {damaged ? fillCopy(t.intake.damage.set, { n: String(state.damagedQty) }) : t.intake.damage.idle}
              </Text>
            </PressableSurface>
          </View>


          {/* Hasarın tuş takımı adet çekmecesi değildir, çünkü hasar paket paket işaretlenir. Her tuş sayaca canlı yazılır;
              tavan kabul edilen adettir. */}
          <OperationsAmountKeypad
            visible={damageQtyOpen}
            title={t.intake.damage.keypad.title}
            value={String(state.damagedQty)}
            expected={null}
            unit={t.common.keypad.unitPack}
            allowDecimals={false}
            max={state.qty ?? 0}
            hint={fillCopy(t.intake.damage.keypad.hint, { name, n: String(state.qty ?? 0) })}
            footnote={fillCopy(t.intake.damage.keypad.footnote, { n: String(state.qty ?? 0) })}
            deleteLabel={t.common.keypad.delete}
            onChange={(text) => onPatch({ damagedQty: text.length === 0 ? 0 : Number.parseInt(text, 10) })}
            onClose={() => setDamageQtyOpen(false)}
            testID={`warehouse-intake-damage-keypad-${row.variantId}`}
          />

          {/* SKT altı rakamla girilir: kolideki tarih okunup yazılır, aynı kabulün öteki tarihleri çiptir. Tarihi
              okunamayan koli için çekmecedeki "takvimden seç" tekerleği açar. */}
          <OperationsDateKeypad
            visible={dateOpen}
            title={t.intake.expiry.sheet.title}
            subject={fillCopy(t.intake.expiry.sheet.subject, {
              name,
              selected: expiry === null ? t.intake.expiry.sheet.none : (shortDate(expiry) ?? expiry),
            })}
            value={expiry ?? ''}
            suggestions={dateSuggestions}
            copy={t.intake.expiry.keypad}
            onConfirm={(iso) => {
              onPatch({ expiryText: iso });
              setDateOpen(false);
            }}
            onWheel={() => {
              setDateOpen(false);
              setWheelOpen(true);
            }}
            onClose={() => setDateOpen(false)}
            testID={`warehouse-intake-expiry-sheet-${row.variantId}`}
          />

          <OperationsDateSheet
            visible={wheelOpen}
            title={t.intake.expiry.sheet.title}
            subject={fillCopy(t.intake.expiry.sheet.subject, {
              name,
              selected: expiry === null ? t.intake.expiry.sheet.none : (shortDate(expiry) ?? expiry),
            })}
            value={expiry ?? ''}
            shelfLifeDays={row.shelfLifeDays}
            columnLabels={{
              day: t.intake.expiry.sheet.day,
              month: t.intake.expiry.sheet.month,
              year: t.intake.expiry.sheet.year,
            }}
            confirmLabel={t.intake.expiry.sheet.confirm}
            cancelLabel={t.intake.expiry.sheet.cancel}
            onConfirm={(iso) => {
              onPatch({ expiryText: iso });
              setWheelOpen(false);
            }}
            onClose={() => setWheelOpen(false)}
            testID={`warehouse-intake-expiry-wheel-${row.variantId}`}
          />

          {/* Kalan ömür uyarısı SKT girilir girilmez satırın içindedir, çünkü "kabul edeyim mi" kararı yazmadan önce
              verilir. Hesap motordan, eşik sunucudandır ve engellemez (DOMAIN §4); raf ömrü bilinmiyorsa uyarı üretilmez. */}
          {life === null || life.ok ? null : (
            <View style={styles.lifeBox} testID={`warehouse-intake-life-${row.variantId}`}>
              <Text style={styles.lifeText}>{fillCopy(t.intake.lifeInline, { pct: String(Math.round(life.remainingPercent ?? 0)) })}</Text>
              <Text style={styles.lifeHint}>{fillCopy(t.intake.lifeInlineHint, { mlor: String(Math.round(mlorPercent)) })}</Text>
            </View>
          )}

          {/* Lot çekmecesi: tek değer tek kontrolle girilir, elle giriş de bilinçli boş da burada verilir. Tasarımın
              "okunan koliden adaylar" listesi okutma yanıtı lot taşımadığı için yoktur. */}
          <BottomSheet
            visible={lotOpen}
            title={t.intake.lot.sheet.title}
            onClose={() => setLotOpen(false)}
            testID={`warehouse-intake-lot-sheet-${row.variantId}`}
          >
            <Text style={styles.learnRowMeta}>{t.intake.lot.sheet.hint}</Text>

            {/* Alanın kendisi kayıttır, onay düğmesi yok: kutu doluysa lot vardır, boşsa yoktur ve sözleşme bunu
                `lotNumber: null` diye taşır. */}
            <View style={styles.lotFieldRow}>
              <View style={styles.lotFieldInput}>
                <TextField
                  value={state.lotText}
                  onChangeText={(text) => onPatch({ lotText: text })}
                  placeholder="GAZ-7120"
                  accessibilityLabel={fillCopy(t.intake.lot.field, { name })}
                  density="compact"
                  testID={`warehouse-intake-lot-${row.variantId}`}
                />
              </View>
              {state.lotText.length === 0 ? null : (
                <PressableSurface
                  onPress={() => onPatch({ lotText: '' })}
                  feedback="scale"
                  style={styles.lotClear}
                  accessibilityLabel={t.intake.lot.sheet.clear}
                  testID={`warehouse-intake-lot-clear-${row.variantId}`}
                >
                  <Text style={styles.lotClearLabel}>{t.intake.lot.sheet.clear}</Text>
                </PressableSurface>
              )}
            </View>

            {/* Öneriler aynı kabulde girilen lotlardır: sevkiyatın satırları çoğunlukla aynı lottan gelir, depocu bir kez
                yazar, ötekilerde seçer. */}
            {lotSuggestions.length === 0 ? null : (
              <View style={styles.lotSuggestions}>
                <Text style={styles.lotSuggestionsLabel}>{t.intake.lot.sheet.suggestions}</Text>
                {lotSuggestions.map((code) => (
                  <PressableSurface
                    key={code}
                    onPress={() => {
                      onPatch({ lotText: code });
                      setLotOpen(false);
                    }}
                    feedback="scale"
                    selected={state.lotText === code}
                    style={[styles.lotSuggestion, state.lotText === code ? styles.lotSuggestionSet : null]}
                    testID={`warehouse-intake-lot-suggestion-${row.variantId}-${code}`}
                  >
                    <Text style={state.lotText === code ? styles.subFieldLabelFilled : styles.subFieldLabel}>{code}</Text>
                  </PressableSurface>
                ))}
              </View>
            )}
          </BottomSheet>

          {/* Hasar kartı: adet sayılır, sebep işaretlenir; hasar kabul edilen adedin içinden işaretlenir, onu değiştirmez. */}
          {damaged ? (
            <View style={styles.damageCard} testID={`warehouse-intake-damage-card-${row.variantId}`}>
              <Text style={styles.damageTitle}>{t.intake.damage.title}</Text>
              {/* Sayaçlar soru cümlesinin sonundadır, sağdaki alan sebep düğmesine kalır. */}
              <Text style={styles.damageQuestion}>
                {fillCopy(t.intake.damage.question, { n: String(state.qty ?? 0) })}{' '}
                <Text style={styles.damageSound}>
                  {fillCopy(t.intake.damage.sound, { n: String(Math.max(0, (state.qty ?? 0) - state.damagedQty)) })}
                </Text>
                {' · '}
                <Text style={styles.damageBroken}>{fillCopy(t.intake.damage.broken, { n: String(state.damagedQty) })}</Text>
              </Text>

              {/* Adet solda, sebep sağda (kitin `qty-reason-row` kalıbı); tavan kabul edilen adettir, hasar toplamı aşamaz. */}
              <OperationsQtyReasonRow
                qty={state.damagedQty}
                onQtyChange={(next) => onPatch({ damagedQty: next })}
                qtyLabel={fillCopy(t.intake.damage.broken, { n: String(state.damagedQty) })}
                max={state.qty ?? 0}
                onPressQty={() => setDamageQtyOpen(true)}
                qtyHint={t.common.keypadHint}
                reason={state.damageReason}
                reasons={t.intake.damage.reasons}
                onReasonChange={(reason) => onPatch({ damageReason: reason })}
                reasonPlaceholder={t.intake.damage.reasonPick}
                sheetTitle={t.intake.damage.reasonTitle}
                sheetHint={t.intake.damage.reasonHint}
                testID={`warehouse-intake-damage-${row.variantId}`}
              />

              {/* Serbest not kutusu yok: hasarın ne olduğunu sebep çipleri denetlenebilir biçimde söyler. Dipnot tasarımdan
                  sapar, çünkü satır başına "hasarlı stok" ayrımı yoktur ve bilgi kabul notuna yazılır. */}
              <Text style={styles.damageFootnote}>{t.intake.damage.footnote}</Text>
            </View>
          ) : null}
        </>
      ) : null}

      {/* Adet çekmecesi kartın kökündedir, açık dalın içinde değil: kapalı ama sayılmış kartta adet düzeltmek kartı açmayı
          gerektirmez. Öteki çekmeceler yalnız açık kartta tetiklenir, yerlerinde kalırlar. */}
        {/* ADET ÇEKMECESİ — tuş takımı DEĞİL (v3 `sheetAdet`; künyesi komponentte). Toplam ile döküm
        TEK yamada yazılır: ikisi ayrı gitseydi biri bir gün ötekinden geride kalırdı. */}
        <OperationsQuantitySheet
          visible={qtyOpen}
          title={t.intake.qtySheet.title}
          value={state.breakdown}
          caseSizes={row.caseSizes}
          onChange={(next) => onPatch({ breakdown: next, qty: quantityTotal(next) })}
          copy={{
            ...t.intake.qtySheet,
            /* Künye satırı v3'ün kendi cümlesi: ürün + boy + SAYININ KAYNAĞI ("barkod okutulmadı"
           ya da "koli barkodu okundu"). Kaynak denetim bilgisidir — elle sayılmış satırla
           okutularak sayılmış satır aynı görünmemeli (satırın `scan` alanının künyesi). */
            subject: fillCopy(t.intake.qtySheet.subject, {
              name,
              source: state.scan === null ? t.intake.source.manual : t.intake.source.scanned,
            }),
          }}
          onClose={() => setQtyOpen(false)}
          testID={`warehouse-intake-qty-sheet-${row.variantId}`}
        />
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
  /* Skeleton ORTALANMAZ — yerini tuttuğu liste yukarıdan başlıyor. Ortalasaydık kutular veri
     gelince yukarı sıçrardı, yani halkanın çözdüğümüz sorununu geri getirirdi. */
  loading: {
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space['3xl'],
  },
  block: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space['7xl'],
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    /* Kayıt düğmeleri listenin içinde olduğu için alt nefes listenin kendi sonudur. */
    paddingBottom: operationsTheme.space['8xl'],
    // Kartlar arası nefes: ayraç çizgisi kalktı, boşluk onun işini görüyor.
    gap: operationsTheme.space.lg,
  },
  /* SATIR BİR KART (v3:05). Kesik çizgiyle ayrılmış düz satırlardı ve altı kalem tek bir metin
     bloğu gibi okunuyordu; kart her kalemi kendi işi yapıyor — depocu birini sayarken ötekiler
     görsel olarak "bekleyen" kalıyor. */
  lineRow: {
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.card,
    backgroundColor: operationsTheme.colors.panel,
  },
  /* Sayılmamış satır soluktur: depocu "nerede kaldım"ı kaydırmadan parlaklıktan görür. Opaklık durum göstergesidir,
     engellilik değil; satır dokunulabilir kalır. */
  lineRowIdle: { opacity: 0.7 },
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
  /* Seçici düğmesinin içindeki iki hâl: değer varsa mürekkep, yoksa yer tutucu tonunda. */
  fieldValue: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  /* Dolu alanın METNİ de yeşil ailesinden (tasarım `fg:#46601f` → `olive-dark`): kutu yeşile
     boyanınca mürekkep metin ailesinden düşüyordu. */
  fieldFilled: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors['olive-dark'],
  },
  /* SKT ALANI (v3 · `openSkt`): 50 dp, kontrol yarıçapı, `sand-300` kenar — girdi değil SEÇİCİ
     açan bir satır. Kenarlık `ink` DEĞİL: alan kendi başına bir karar taşımıyor, kararı çekmece
     veriyor; mürekkep kenar onu doldurulacak bir kutu gibi gösteriyordu. */
  expiryField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    height: operationsTheme.size.controlMd,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  /* SKT girilmemiş alan dolgusuzdur, yalnız kenar ve metin uyarı tonundadır: dolgu bir tamamlandı işaretidir, alan doldukça
     yeşile boyanır. */
  expiryFieldMissing: {
    borderColor: operationsTheme.colors['warning-line'],
  },
  /* SKT GİRİLMİŞ HÂL: yeşil onay. Depocu listeye bakınca yeşil olanların bittiğini görür. */
  expiryFieldFilled: {
    borderColor: operationsTheme.colors['olive-line'],
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  fieldMissing: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.terracotta,
  },
  /* "seç →" bir DÜĞME DEĞİL, alanın ne yaptığını söyleyen işaret — dokunulan şey satırın
     tamamı. Ayrı bir dokunma hedefi olsaydı satırın ortasına basan depocu hiçbir şey açamazdı. */
  fieldPick: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['tab-inactive'],
  },
  /* LOT + HASAR SATIRI (v3:05): lot esner, hasar içeriği kadar. 46 dp — SKT alanından (50) bir
     kademe alçak, çünkü ikisi aynı hiyerarşide değil: SKT zorunlu, bunlar isteğe bağlı. */
  fieldRow: {
    flexDirection: 'row',
    gap: operationsTheme.space.md,
  },
  subField: {
    height: operationsTheme.size.controlSm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  /* Lot GİRİLMİŞ hâl — tasarımın `lotAlan` kuralı: dolu alan yeşil onay taşır. */
  subFieldFilled: {
    borderColor: operationsTheme.colors['olive-line'],
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  subFieldDamaged: {
    borderColor: operationsTheme.colors['error-line'],
    backgroundColor: operationsTheme.colors['error-bg'],
  },
  subFieldLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.muted,
  },
  subFieldLabelFilled: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors['olive-dark'],
  },
  subFieldLabelDamaged: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.error,
  },
  /* Yapışkan çubuğun dipnotu — kısmi kaydın ne YAPACAĞINI söyler, ortalanmış ve en sessiz ton.
     Düğmenin etiketine sığmayan tek şey sonucudur: kalan satırlar açık kalır. */
  /** Kayıt düğmeleri listenin son bloğu — kartlardan bir kademe geniş nefesle ayrılır. */
  formActions: {
    marginTop: operationsTheme.space['2xl'],
    gap: operationsTheme.space.lg,
  },
  stickyNote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['tab-inactive'],
    textAlign: 'center',
  },
  /* Öğrenilen kod kartı ve okutma kutusu zeytin ailesindendir, çünkü ikisi de doğrulama anlatır; uyarı tonu depocuya sorun
     sandırırdı. */
  learnedCard: {
    gap: operationsTheme.space['2xs'],
    padding: operationsTheme.space.xl,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  learnedTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors['olive-dark'],
  },
  learnedBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.body,
  },
  scanNote: {
    gap: operationsTheme.space['2xs'],
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  scanNoteTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors['olive-dark'],
  },
  scanNoteBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.body,
  },
  /* Kaynak notu — rozetin YANINDA, düz metin. Rozet olsaydı zorunlulukla aynı ağırlıkta okunurdu;
     bu bir künye, bir kural değil. */
  sourceNote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  fieldPlaceholder: {
    flex: 1,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.muted,
  },
  /* Kapalı satırın iki rozeti ayrı ailelerdedir: SKT bir zorunluluktur (uyarı tonu), lot bir durumdur (nötr). */
  badge: {
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.md,
    borderRadius: operationsTheme.radius.tight,
    overflow: 'hidden',
  },
  badgeRequired: {
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text['badge-sm'],
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text['badge-sm']),
    color: operationsTheme.colors.terracotta,
  },
  /** SKT GİRİLMİŞ hâli — zorunluluk uyarısı değil, ölçülmüş bir DEĞER: zeytin ailesi. */
  badgeDate: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors['olive-dark'],
  },
  /** Hasar rozeti sağa yaslanır, kapalı kartın tek kırmızı işaretidir. */
  badgeDamage: {
    marginLeft: 'auto',
    backgroundColor: operationsTheme.colors['error-bg'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.error,
  },
  badgeLot: {
    backgroundColor: operationsTheme.colors.cream,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors['tab-inactive'],
  },
  /* HASAR KARTI (v3:05) — kabul satırının içinde açılan kırmızı aileli blok. Kartı ailesine
     bağlayan şey ZEMİN değil KENARDIR (token künyesi §4): zemin `error-bg`, kenar `error-line`. */
  damageCard: {
    gap: operationsTheme.space.lg,
    padding: operationsTheme.space['3xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['error-line'],
    borderRadius: operationsTheme.radius.card,
    backgroundColor: operationsTheme.colors['error-bg'],
  },
  damageTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.error,
  },
  damageQuestion: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.body,
  },
  /** Sayaç solda, sağlam/hasarlı sayacı sağda — tasarımın iki sütunu. */
  damageRow: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space['3xl'] },
  damageTally: { gap: operationsTheme.space['2xs'] },
  damageSound: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors['olive-dark'],
  },
  damageBroken: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.error,
  },
  /* Lot kutusu esner, temizle düğmesi içeriği kadar yer kaplar ve yalnız dolu kutuda çizilir. */
  lotFieldRow: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.lg },
  lotFieldInput: { flex: 1 },
  lotClear: {
    height: operationsTheme.size.controlSm,
    justifyContent: 'center',
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  lotClearLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.muted,
  },
  lotSuggestions: { gap: operationsTheme.space.md },
  lotSuggestionsLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  /** Öneri satırı — dokunulunca lot yazılır ve çekmece kapanır (tek adım). */
  lotSuggestion: {
    height: operationsTheme.size.controlLg,
    justifyContent: 'center',
    paddingHorizontal: operationsTheme.space['3xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  lotSuggestionSet: {
    borderColor: operationsTheme.colors['olive-line'],
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  damageReasonField: {
    height: operationsTheme.size.controlMd,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  damageReasonFieldSet: { borderColor: operationsTheme.colors['error-line'] },
  damageReasonIdle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.muted,
  },
  damageReasonLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.error,
  },
  /** Çekmecedeki sebep satırı — tam genişlik, seçili olan hasar ailesine geçer. */
  damageReasonRow: {
    height: operationsTheme.size.controlLg,
    justifyContent: 'center',
    paddingHorizontal: operationsTheme.space['3xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  damageReasonRowSet: {
    borderColor: operationsTheme.colors['error-line'],
    backgroundColor: operationsTheme.colors['error-bg'],
  },
  damageFootnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
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
  /* Tarih rejimi etiketi — çip DEĞİL: dokunulacak bir şey değil, satırın kuralı. Çerçevesiz ve
     üstbaşlık ölçüsünde ki yanındaki SKT çipiyle karışmasın. */
  /* Kalan ömür uyarısı — UYARI tonunda (terracotta ailesi, "SKT gir *" çipiyle aynı dil) ama
     ENGEL görünümünde değil: dolgulu bir kutu, kabulü durduran bir hata gibi okunurdu. */
  lifeBox: {
    marginTop: operationsTheme.space.sm,
    padding: operationsTheme.space.md,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    gap: operationsTheme.space['2xs'],
  },
  lifeText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.terracotta,
  },
  lifeHint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.body,
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
  // Tarama CTA'sı kabul CTA'sından KASITLI farklı (çerçeveli, dolgusuz): asıl iş kabulü
  // kaydetmektir, tarama ona giden bir yardımcı — iki dolu düğme hangisinin birincil olduğunu
  // belirsizleştirirdi.
  /* Düğmenin KENDİSİ kitten geliyor; ekranın yazdığı tek şey üstündeki nefes. Sarmalayıcı gerekli
     çünkü `SecondaryButton` dış boşluğunu bilmez — kendi kutusunun dışını çağıran kurar. */
  altCtas: {
    marginTop: operationsTheme.space['2xl'],
    gap: operationsTheme.space['2xl'],
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
    padding: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  pendingNames: {
    /* `flex: 1`, `flexShrink` DEĞİL: satıra ikon girdi ve künye kalan boşluğu ALMALI — yalnız
       shrink ile kısa referanslar sola yapışıp sağdaki kalem sayısıyla arasında boşluk kalırdı. */
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  /* Plansız kabul satırı — listenin ISTISNASI olduğu için kesikli çerçeve: bekleyen sevkiyatların
     düz çerçevesiyle aynı ağırlıkta durursa normal yol gibi okunur. */
  /* PLANSIZ KABUL ZEYTİN KESİKLİ (v3:04): kesik çizgi "bu satır bir kayıt değil, bir davet"
     demek; zeytin de onu bir EYLEM yapıyor. Kum tonundayken listenin sonundaki sessiz bir
     dipnot gibi duruyordu ve depocu siparişsiz malı nereye yazacağını arıyordu. */
  unplannedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    padding: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderColor: operationsTheme.colors['olive-line'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  /* Kabul kilidi — okutma düğmesinin YERİNE geçer (v3:610); gizlenen bir düğme sebebi olmayan
     bir eksiklik gibi görünür. Kuyruğun kilidiyle aynı desen. */
  formLocked: {
    backgroundColor: operationsTheme.colors['error-bg'],
    borderRadius: operationsTheme.radius.control,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    gap: operationsTheme.space['2xs'],
  },
  formLockedTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.error,
  },
  formLockedBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.error,
  },
  /** "Bu kalem tamamlandı" — sıfır kalanın PLANLI siparişteki anlamı; sessizlik değil, bilgi. */
  rowDone: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.olive,
  },
  unplannedPlusBox: {
    width: operationsTheme.size.avatarMd,
    height: operationsTheme.size.avatarMd,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  unplannedPlus: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors.olive,
  },
  pendingFootnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space.md,
  },
  pendingRef: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  pendingMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  /* Satırın sağ ucu: kalem sayısı + SKT etiketi alt alta. Yan yana dizilseydi satır üç sütuna
     bölünür ve künye (referans + tedarikçi + durum) sıkışırdı. */
  pendingTail: { alignItems: 'flex-end', gap: operationsTheme.space['2xs'] },
  /* SKT etiketi bir DURUM değil bir kural hatırlatması — künyeden bile hafif dursun diye üstbaşlık
     ölçüsünde ve aralıklı; rozet gibi çerçevelenirse siparişe özel bir işaret sanılır. */
  /* İkonun kare zemini — satırın "tür işareti". */
  pendingIcon: {
    width: operationsTheme.size.avatarMd,
    height: operationsTheme.size.avatarMd,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  pendingTag: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.terracotta,
  },
  /* Fotoğraflı bant: tanımaya yetecek fotoğraf ve üç satır künye; kırpılır, yoksa fotoğrafın köşeleri yuvarlak çerçeveyi
     taşar. */
  scannedCard: {
    height: operationsTheme.size.circleSm + operationsTheme.space['8xl'],
    borderRadius: operationsTheme.radius.card,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: operationsTheme.colors['sand-300'],
  },
  /** Fotoğraf kartın TAMAMINI kaplar; yoksa kum zemin kalır — baş harf YOK, ad zaten üstünde. */
  scannedPhoto: {
    ...StyleSheet.absoluteFillObject,
  },
  scannedNames: {
    gap: operationsTheme.space['2xs'],
    paddingTop: operationsTheme.space.lg,
  },
  scannedName: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['card-title--font-weight']],
    fontSize: operationsTheme.text['card-title'],
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
  learnKindRow: {
    flexDirection: 'row',
    gap: operationsTheme.space.xl,
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
  /** Aday KARTI (tasarım `02f`) — ad + künye solda, yön oku sağda. */
  learnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['3xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  learnCardBody: { flex: 1, gap: operationsTheme.space['2xs'] },
  learnChevron: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors['tab-inactive'],
  },
  learnFootnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
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
  /* ── Arama satırı (N1) — kutu kitten (`OperationsSurface tone="card"`), içerik burada. */
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
  },
  searchBody: { flex: 1, gap: operationsTheme.space['2xs'], minWidth: 0 },
  searchName: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  searchMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  learnQty: { gap: operationsTheme.space.sm },
  learnQtyCaption: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
    textAlign: 'center',
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
