import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { IntakeFormRowContract, VariantSearchRowContract } from '@lezzet/types';

import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsQtyField } from '@/components/operations/qty-field';
import { OperationsQtySlider } from '@/components/operations/qty-slider';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { FormScroll } from '@/components/ui/form-scroll';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { searchIntakeVariants } from '@/lib/api/warehouse';
import { warehouseCopy } from './copy';
import { useIntake, type IntakeRowState, type ScannedCode } from './use-intake.hook';
import { parseDate, parseQty, productLabel, qtyToText, shortDate } from './warehouse-format';
import { trackWarehouse, useWarehouseStatus } from './warehouse-status';

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
  const params = useLocalSearchParams<{ purchaseOrderId?: string; unplanned?: string }>();
  const purchaseOrderId =
    typeof params.purchaseOrderId === 'string' && params.purchaseOrderId.length > 0 ? params.purchaseOrderId : null;
  /** Plansız kabul (23.13): PO'suz gelen mal — satırları depocu kurar. */
  const unplanned = params.unplanned === '1' && purchaseOrderId === null;
  const intake = useIntake(purchaseOrderId, unplanned);
  const { offline } = useWarehouseStatus();
  const [searchOpen, setSearchOpen] = useState(false);

  const header = (
    <OperationsStackHeader
      title={t.intake.title}
      subtitle={
        unplanned ? t.intake.captionUnplanned : purchaseOrderId === null ? t.intake.captionPending : t.intake.captionPlanned
      }
      onBack={() => router.back()}
      backLabel={t.common.back}
      testID="warehouse-intake-header"
    />
  );

  /*
    KONUSUZ AÇILIŞ = BEKLEYEN SEVKİYAT LİSTESİ (24.08). Eskiden burada "bu ekranın konusu yok"
    yazıyordu ve mal kabule YALNIZ derin bağlantıyla girilebiliyordu; sipariş kimliği her
    tazelemede değiştiği için o yol sürekli kırılıyordu (ölçüldü). Uç 21.11d'den beri hazırdı.
  */
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
          </View>
        ) : (
          <FormScroll contentContainerStyle={styles.list} testID="warehouse-intake-pending">
            {/* PLANSIZ KABULÜN KAPISI (23.13) — listenin ÜSTÜNDE değil altında olurdu ama kabul
                bekleyen sevkiyat sayısı değişken; sabit yer sabit alışkanlık demek. Siparişi
                girilmemiş mal da bir kabuldür ve tek dokunuşluk uzakta olmalı. */}
            <PressableSurface
              onPress={() => router.push('/intake?unplanned=1')}
              feedback="shadow"
              style={styles.scanCta}
              accessibilityLabel={t.intake.unplannedCta}
              testID="warehouse-intake-unplanned-cta"
            >
              <Text style={styles.scanCtaLabel}>{t.intake.unplannedCta}</Text>
            </PressableSurface>
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
                <View style={styles.pendingNames}>
                  <Text style={styles.pendingRef}>{row.referenceNo ?? '—'}</Text>
                  <Text style={styles.pendingMeta}>{row.supplierName ?? '—'}</Text>
                </View>
                <Text style={styles.pendingMeta}>{fillCopy(t.intake.pendingLines, { n: String(row.lineCount) })}</Text>
              </PressableSurface>
            ))}
          </FormScroll>
        )}
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
            <>
              <PressableSurface
                onPress={intake.openScan}
                feedback="shadow"
                style={styles.scanCta}
                accessibilityLabel={t.intake.scan.cta}
                testID="warehouse-intake-scan-cta"
              >
                <Text style={styles.scanCtaLabel}>{t.intake.scan.cta}</Text>
              </PressableSurface>
              <PressableSurface
                onPress={() => setSearchOpen(true)}
                feedback="shadow"
                style={styles.scanCta}
                accessibilityLabel={t.intake.searchCta}
                testID="warehouse-intake-search-cta"
              >
                <Text style={styles.scanCtaLabel}>{t.intake.searchCta}</Text>
              </PressableSurface>
            </>
          )}
        </View>
        <ScanSheet
          open={intake.scanOpen}
          title={t.intake.scan.title}
          hint={t.intake.scan.hint}
          onClose={intake.closeScan}
          onScan={intake.handleScan}
          testID="warehouse-intake-scan"
        />
        <VariantSearchSheet
          visible={searchOpen}
          onClose={() => setSearchOpen(false)}
          onPick={(variant) => {
            intake.addManualRow(variant);
            setSearchOpen(false);
          }}
        />
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
        {/* Arama YALNIZ plansızda: PO'lu kabulde satır kümesi siparişten gelir ve dışarıdan satır
            eklemek fark raporunun göremeyeceği bir yere "beklenmedik mal" yazmak olurdu (23.4). */}
        {offline || !unplanned ? null : (
          <PressableSurface
            onPress={() => setSearchOpen(true)}
            feedback="shadow"
            style={styles.scanCta}
            accessibilityLabel={t.intake.searchCta}
            testID="warehouse-intake-search-cta"
          >
            <Text style={styles.scanCtaLabel}>{t.intake.searchCta}</Text>
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
            {/* ÜRÜN KARTI — fotoğraf ARKA PLAN, künye onun üstünde (kullanıcı isteği 24.08).
                Önce yan yana duruyordu (kare fotoğraf + sağda metin) ve dar kalıyordu: çekmecenin
                işi "doğru malı mı tuttum" bakışı, o bakışa en çok yardım eden şey fotoğrafın
                KENDİSİ. Şablonun kendi deseni de bu (`ProductPhotoCard`: ad fotoğrafın İÇİNDE);
                o komponent kullanılmadı çünkü kare ve rozet/fiyat yuvaları taşıyor — burada
                geniş bir bant ve üç satır künye var. Gradyan yazının okunması için, tokenlardan. */}
            <View style={styles.scannedCard}>
              {intake.scanned.imageUrl === null ? null : (
                <Image
                  source={{ uri: intake.scanned.imageUrl }}
                  style={styles.scannedPhoto}
                  accessibilityIgnoresInvertColors
                  testID="warehouse-intake-scanned-photo"
                />
              )}
              <LinearGradient {...operationsTheme.gradient.photoBottom} style={styles.scannedScrim} pointerEvents="none" />
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
        title={intake.learn?.variantId === null ? t.intake.scan.learnTitle : t.intake.scan.learnUnitTitle}
        onClose={intake.cancelLearn}
        testID="warehouse-intake-learn"
      >
        {intake.learn === null ? null : intake.learn.variantId === null ? (
          <>
            <Text style={styles.learnBody}>{fillCopy(t.intake.scan.learnBody, { code: intake.learn.code })}</Text>
            {intake.rows.map((row) => (
              <PressableSurface
                key={row.variantId}
                onPress={() => intake.pickLearnVariant(row.variantId)}
                feedback="tint"
                style={styles.learnRow}
                accessibilityLabel={productLabel(row.productName, row.variantLabel)}
              >
                <Text style={styles.learnRowLabel}>{productLabel(row.productName, row.variantLabel)}</Text>
                <Text style={styles.learnRowMeta}>{fillCopy(t.intake.expected, { qty: String(row.expectedQty) })}</Text>
              </PressableSurface>
            ))}
          </>
        ) : (
          /* 2. ADIM (23.12): bu kod NEYİ sayıyor? Çarpan öğrenme anında yazılmazsa yazılacak
             başka yeri yok — web'de kod ekleme bilinçle kapalı (öğrenme kabuldedir, karar §1.3). */
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
              <OperationsQtySlider
                value={intake.learn.qtyPerCode}
                onChange={intake.setLearnQty}
                step={1}
                accessibilityLabel={t.intake.scan.learnUnitQty}
                fineLabels={{ increase: t.intake.scan.drawerQtyIncrease, decrease: t.intake.scan.drawerQtyDecrease }}
                caption={t.intake.scan.learnUnitCaption}
                testID="warehouse-intake-learn-qty"
              />
            )}
            <PressableSurface
              onPress={intake.confirmLearn}
              disabled={intake.learn.kind === 'case' && intake.learn.qtyPerCode < 2}
              feedback="shadow"
              style={[
                styles.cta,
                intake.learn.kind === 'unit' || intake.learn.qtyPerCode >= 2 ? styles.ctaReady : styles.ctaIdle,
              ]}
              accessibilityLabel={t.intake.scan.learnConfirm}
              testID="warehouse-intake-learn-confirm"
            >
              <Text style={styles.ctaLabel}>{t.intake.scan.learnConfirm}</Text>
            </PressableSurface>
          </>
        )}
        <PressableSurface onPress={intake.cancelLearn} feedback="opacity" style={styles.learnCancel} accessibilityLabel={t.intake.scan.learnCancel}>
          <Text style={styles.learnCancelLabel}>{t.intake.scan.learnCancel}</Text>
        </PressableSurface>
      </BottomSheet>
    </View>
  );
}

interface VariantSearchSheetProps {
  visible: boolean;
  onClose: () => void;
  onPick: (variant: { variantId: string; productName: string; variantLabel: string }) => void;
}

/**
 * **PLANSIZ KABULÜN ÜRÜN ARAMASI** (23.13) — sayfaya özel, kite terfi etmedi: bugün tek çağıranı
 * var ve ikinci bir yüzey doğduğunda ortak yanı ölçülür (CLAUDE §1'in "önce var mı?" sorusu bu
 * yönde de işler — olmayan bir ortaklık için ortak komponent yazmak da bir duplikasyondur).
 *
 * Arama SUNUCUDA (`GET /warehouse/variants`): katalog istemciye indirilip filtrelenmez (STACK §6).
 * Her tuşta çağrılır ama yarış korumalı — geç dönen eski cevap yenisini ezmez.
 */
function VariantSearchSheet({ visible, onClose, onPick }: VariantSearchSheetProps) {
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
    <BottomSheet visible={visible} title={t.intake.searchTitle} onClose={onClose} testID="warehouse-intake-search">
      <TextInput
        value={query}
        onChangeText={search}
        placeholder={t.intake.searchPlaceholder}
        placeholderTextColor={operationsTheme.colors.muted}
        autoFocus
        style={styles.textInput}
        accessibilityLabel={t.intake.searchTitle}
        testID="warehouse-intake-search-input"
      />
      <Text style={styles.learnRowMeta}>{t.intake.searchHint}</Text>
      {query.trim().length > 0 && rows.length === 0 ? (
        <Text style={styles.learnRowMeta}>{t.intake.searchEmpty}</Text>
      ) : null}
      {rows.map((row) => (
        <PressableSurface
          key={row.variantId}
          onPress={() => onPick(row)}
          feedback="tint"
          style={styles.learnRow}
          accessibilityLabel={productLabel(row.productName, row.variantLabel)}
          testID={`warehouse-intake-search-${row.variantId}`}
        >
          <Text style={styles.learnRowLabel}>{productLabel(row.productName, row.variantLabel)}</Text>
          <Text style={styles.learnRowMeta}>{row.sku ?? ''}</Text>
        </PressableSurface>
      ))}
    </BottomSheet>
  );
}

/** Öğrenme 2. adımının başlığındaki ürün adı — satır kümesi zaten ekranın elinde, ikinci arama yok. */
function nameOfRow(rows: readonly IntakeFormRowContract[], variantId: string): string {
  const row = rows.find((candidate) => candidate.variantId === variantId);
  return row === undefined ? '—' : productLabel(row.productName, row.variantLabel);
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
          {/* Plansızda BEKLENEN YOKTUR (23.13) — kıyaslanacak sipariş yok. "beklenen 0" yazmak,
              olmayan bir beklentiyi sıfır diye göstermek olurdu (CLAUDE §1: ölçülemeyen değer
              sıfır değildir); satır bunun yerine hiç künye taşımaz. */}
          {row.expectedQty === 0 ? null : (
            <Text style={styles.rowSub}>{fillCopy(t.intake.expected, { qty: String(row.expectedQty) })}</Text>
          )}
        </View>
        <OperationsQtyField
          value={qtyToText(state.qty)}
          onChangeText={(text) => onPatch({ qty: parseQty(text) })}
          accessibilityLabel={fillCopy(t.intake.qtyLabel, { name })}
          // Sapma tonu da beklentinin VARLIĞINA bağlı: beklenen yokken her sayı "farklı" görünürdü.
          tone={state.qty === null ? 'muted' : row.expectedQty === 0 || state.qty === row.expectedQty ? 'neutral' : 'diff'}
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
    flexShrink: 1,
    gap: operationsTheme.space['2xs'],
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
  /* Fotoğraflı bant. Yükseklik `circleSm` (96) + künyenin nefesi: kart bir kahraman görsel değil,
     tanıma yetecek kadar fotoğraf + üç satır künye. Kırpılır (`overflow`), yoksa fotoğrafın köşeleri
     yuvarlak çerçeveyi taşar. */
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
  /** Yazının okunması için alt karartma — token'dan (katalog kartının aynı gradyanı). */
  scannedScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  scannedNames: {
    gap: operationsTheme.space['2xs'],
    padding: operationsTheme.space['2xl'],
  },
  scannedName: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['card-title--font-weight']],
    fontSize: operationsTheme.text['card-title'],
    color: operationsTheme.colors['on-image'],
  },
  scannedMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors['on-image-soft'],
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
