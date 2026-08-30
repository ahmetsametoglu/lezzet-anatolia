import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
// Ömür kararı MOTORDAN: ekran kendi yüzdesini kurmaz — kabul kapısı da aynı motoru çağırıyor ve
// ikisi ayrışsaydı ekran bir şey der, kayıt başkasını yazardı (`CLAUDE §1`).
import { meetsMlor } from '@lezzet/domain-core';
import type { IntakeFormRowContract, VariantSearchRowContract } from '@lezzet/types';

import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsDateSheet } from '@/components/operations/date-sheet';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsQtyField } from '@/components/operations/qty-field';
import { OperationsQtySlider } from '@/components/operations/qty-slider';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { FormScroll } from '@/components/ui/form-scroll';
import { Icon } from '@/components/ui/icon';
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

/**
 * Bekleyen listesinin künyesi (v3:517) — kaç sevkiyat, toplam kaç kalem.
 *
 * `lineCount` "kaç KALEM ısmarlandı"dır, kaç adet değil (sözleşme künyesi): depocu kaç satır
 * sayacağını bilir, kaç kutu taşıyacağını değil. Toplamı burada kuruyoruz çünkü uç yalnız satır
 * başına sayı veriyor — ikinci bir "özet" ucu, iki kez okunan aynı gerçeği bir kez daha okumak
 * olurdu (hub'ın aynı kuralı).
 */
function pendingSummary(pending: readonly { lineCount: number }[]): string {
  const lines = String(pending.reduce((sum, row) => sum + row.lineCount, 0));
  return pending.length === 1
    ? fillCopy(t.intake.pendingSummaryOne, { lines })
    : fillCopy(t.intake.pendingSummary, { n: String(pending.length), lines });
}

/**
 * Satır TAMAM mı — adet girilmiş VE SKT çözülmüş.
 *
 * Kural `use-intake.hook`un `complete` hesabının satır başına hâlidir ve oradan kopyalanmadı,
 * aynı iki koşulu okur: adet `null` değil ve sıfırdan büyük, tarih ayrıştırılabiliyor. İkisi
 * ayrışırsa künye "3 tamam" derken CTA "her satırda adet + SKT zorunlu" demeye devam ederdi.
 */
function isRowDone(state: { qty: number | null; expiryText: string }): boolean {
  return state.qty !== null && state.qty > 0 && parseDate(state.expiryText) !== null;
}

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
      /* Plansız kabulün BAŞLIĞI ayrı (v3:756): "Mal Kabul" beklenen adetlerle çalışılan ekranın
         adı; siparişsiz mal onun bir kipi değil, başka bir iş. Aynı başlık ikisini de taşıyınca
         depocu hangi ekranda olduğunu ancak künyeden anlıyordu. */
      title={unplanned ? t.intake.unplannedTitle : t.intake.title}
      /* Bekleyen listesinde künye LİSTEYİ anlatır (v3:517 `ov.maKabulAlt`), kategoriyi değil:
         "bekleyen sevkiyatlar" bir başlık tekrarıydı; "2 bekleyen sevkiyat · 11 kalem" depocunun
         işe başlamadan önce sorduğu şeyin cevabı. Liste okunamadıysa sayı da yok — künye
         kategoriye düşer, uydurulmaz. */
      subtitle={
        unplanned
          ? t.intake.captionUnplanned
          : purchaseOrderId === null
            ? (intake.status === 'ready' ? pendingSummary(intake.pending) : t.intake.captionPending)
            : /* FORMDA künye İLERLEMEYİ söyler (v3:598 `maDetayAlt`): "tedarik siparişi · 5 kalem ·
                 1 tamam". "gönderildi" bir kategoriydi ve depocu zaten oraya gönderildiği için
                 girmişti; kaçının bittiği ise her satırdan sonra değişen tek sayı. Satır henüz
                 yüklenmediyse kategoriye düşer — sıfır yazmak "hiçbiri bitmedi" der ve o an
                 doğru değildir. */
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
          /* AŞAĞI ÇEKİNCE YENİLE — YALNIZ LİSTEDE (kullanıcı isteği 30.08). Rampada yeni bir
             sevkiyat "kabul bekliyor"a düştüğünde depocu ekrandan çıkıp geri giriyordu.
             **Kabul FORMUNDA çekme YOK ve olmamalı:** form bir kez okunuyor (hook künyesi) ve
             tazeleme, depocunun yazdığı adetleri sessizce silerdi. */
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
                  {/* DURUM ALANDAN GELİR, sabit "gönderildi" DEĞİL (v3:531 · 30.08): liste hem
                      `sent` hem `partially_received` taşıyor (uç künyesi) ve ikisi ayrı cümledir
                      — birinde koli hiç açılmadı, ötekinde bu ikinci turdur ve formdaki beklenen
                      adetler KALANDIR. Sabit yazsaydık listenin yarısı için yalan olurdu. */}
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

            {/* PLANSIZ KABUL LİSTENİN SONUNDA (v3:574). 23.13'te listenin ÜSTÜNDEYDİ ve gerekçesi
                "bekleyen sevkiyat sayısı değişken, sabit yer sabit alışkanlık" idi. v3 onu listenin
                sonuna, kendi satırı olarak koyuyor ve gerekçe değişiyor: plansız kabul ISTISNADIR
                — beklenen adet yoktur, sayım onunla doğrulanamaz. Kuyruğun üstünde durması onu
                normal yol gibi gösteriyordu. Boş hâlde ise TEK yol olduğu için orada kalıyor. */}
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
            /*
              ARAMA ÖĞRENMEDEN AÇILDIYSA KOD DA BU ÜRÜNE GİDER (kullanıcı kararı 25.08).

              Depocu tanınmayan bir kod okuttu, ürünü aradı ve buldu — kodu ikinci kez okutmasını
              istemek, zaten yaptığı işi tekrarlatmak olurdu. `learn.variantId === null` koşulu
              şart: arama öğrenmeden BAĞIMSIZ da açılabiliyor (boş hâlin kendi düğmesi) ve o
              turda ortada öğretilecek bir kod yok.
            */
            if (intake.learn !== null && intake.learn.variantId === null) {
              intake.pickLearnVariant(variant.variantId);
            }
            setSearchOpen(false);
          }}
        />
        {/* Boş hâlde de ÇİZİLİR: plansız kabulün ilk okutması tanınmayan bir kod olabilir ve
            çekmece yoksa ekran hiç kıpırdamaz (cihaz turu 25.08 — künyesi `LearnSheet`te). */}
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
        {offline ? (
          /* ÇEVRİMDIŞI: SEBEP YAZILIR, DÜĞME GİZLENMEZ (v3:610). Eskiden okutma düğmesi sessizce
             çizilmiyordu ve depocu "düğme nerede" diye arıyordu; kilit bir yokluk değil, bir
             cevaptır. Metin neden yazılamayacağını da söylüyor: çevrimdışı sayılan adet iki
             deponun stokunu bozar. Okumak serbest — satırlar duruyor. */
          /* KİLİDİN METNİ KİPE GÖRE (v3:610 vs 813): planlı kabulde sorun SAYIMIN doğruluğudur
             ("çevrimdışı sayılan adet iki deponun stokunu bozabilir"); plansızda henüz sayılacak
             bir şey yok, sorun SATIRIN kendisinin doğamamasıdır (kod eşleşmesi ve parti oluşumu
             sunucuda). Tek metin ikisini de anlatsaydı, ikisinde de yarısı yanlış olurdu. */
          <View style={styles.formLocked} testID="warehouse-intake-locked">
            <Text style={styles.formLockedTitle}>
              {unplanned ? t.intake.unplannedLocked.title : t.intake.formLocked.title}
            </Text>
            <Text style={styles.formLockedBody}>
              {unplanned ? t.intake.unplannedLocked.body : t.intake.formLocked.body}
            </Text>
          </View>
        ) : (
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
            unplanned={unplanned}
            mlorPercent={intake.mlorPercent}
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
            {/* AD FOTOĞRAFIN ÜSTÜNE DEĞİL, ALTINA (cihazda görüldü 30.08). Kart bir "kahraman
                görsel"di: ad ve künye fotoğrafın üstüne, karartma gradyanıyla yazılıyordu. Ürün
                fotoğrafları BEYAZ zeminli stüdyo çekimleri ve alttan karartma beyazın üstünde
                açık gri kalıyor — "1 koli = 24 adet" okunmuyordu. Tasarım da burada kahraman
                görsel istemiyor; fotoğraf bir DOĞRULAMA ("doğru malı mı tuttum"), bir başlık
                değil. */}
            <View style={styles.scannedCard}>
              {intake.scanned.imageUrl === null ? null : (
                <Image
                  source={{ uri: intake.scanned.imageUrl }}
                  style={styles.scannedPhoto}
                  accessibilityIgnoresInvertColors
                  testID="warehouse-intake-scanned-photo"
                />
              )}
            </View>
            <View style={styles.scannedNames}>
              <Text style={styles.scannedName}>
                {productLabel(intake.scanned.productName, intake.scanned.variantLabel)}
              </Text>
              <Text style={styles.scannedMeta}>{scanMeta(intake.scanned)}</Text>
              <Text style={styles.scannedMeta}>
                {fillCopy(t.intake.expected, { qty: String(intake.scanned.expectedQty) })}
              </Text>
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

      <LearnSheet intake={intake} onLearnSearch={() => setSearchOpen(true)} />
    </View>
  );
}

/**
 * **Öğrenen eşleme çekmecesi** (karar §1.3) — tanınmayan kod için satır seçtirilir; kod o varyanta
 * yazılır, bir daha sorulmaz. Aday kümesi FORMUN satırlarıdır: PO'lu kabulde gelen koli zaten
 * siparişin bir kalemidir; katalog araması açmak, yanlış ürüne öğretmenin kapısını ardına kadar
 * açardı.
 *
 * ── AYRI BİLEŞEN, ÇÜNKÜ İKİ DALDA ÇİZİLİYOR (cihaz turu 25.08) ──────────────
 * Ekranın plansız-boş hâli erken dönüyor ve çekmece yalnız ANA dalda duruyordu: plansız kabulde
 * tanınmayan bir kod okutulunca `setLearn` çalışıyor, state doğru kuruluyor ve **hiçbir şey
 * görünmüyordu**. Sessiz arızanın tam tanımı — kod doğru, yüzey yok; depocu kamerayı suçlar.
 * Cihazda ölçülerek bulundu (TANINMAYAN etiketi okutuldu, ekran kıpırdamadı).
 *
 * Kopyalamak yerine bileşen: iki dalda iki nüsha olsaydı biri gün gelip ötekinden ayrışırdı ve
 * ayrışma yine sessiz olurdu.
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
            /*
              ADAY LİSTESİ BOŞ — plansız kabulde İLK okutma tanınmayan bir kod olduğunda (cihaz
              turu 25.08). Eski hâl *"Satırı seçin"* diyor ve altında hiçbir satır çizmiyordu:
              depocu boşluğa bakıp çıkmaza giriyordu.

              Çözüm iki adımı BİRLEŞTİRİYOR (kullanıcı kararı 25.08): arama açılır, seçilen ürün
              hem satırı açar hem kodu alır. Ayrı bırakılsaydı depocu ürünü ekleyip kodu İKİNCİ
              kez okutmak zorunda kalırdı — ve okutma zaten yaptığı işti.
            */
            <>
              <Text style={styles.learnBody}>{fillCopy(t.intake.scan.learnEmptyBody, { code: intake.learn.code })}</Text>
              <PressableSurface
                onPress={onLearnSearch}
                feedback="shadow"
                style={[styles.cta, styles.ctaReady]}
                accessibilityLabel={t.intake.scan.learnEmptyCta}
                testID="warehouse-intake-learn-search"
              >
                <Text style={styles.ctaLabel}>{t.intake.scan.learnEmptyCta}</Text>
              </PressableSurface>
            </>
          ) : (
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
          )
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
  );
}

interface VariantSearchSheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Seçilen satır BÜTÜN olarak geçer, üç alana indirilmez (30.08): satır artık kodunu ve tarih
   * rejimini de taşıyor ve kabul satırı bunların hepsini istiyor. Daraltılmış bir imza, yeni bir
   * alan eklendiğinde onu SESSİZCE düşürürdü — tip hiçbir şey demezdi.
   */
  onPick: (variant: VariantSearchRowContract) => void;
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
  /** Plansız kabulde beklenen YOKTUR; planlıda sıfır kalan "karşılandı" demektir (aşağıdaki künye). */
  unplanned: boolean;
  /** MLOR eşiği (%) — SUNUCUDAN gelen ayar; satırın kendi değeri değil, formun kuralı. */
  mlorPercent: number;
  onPatch: (patch: Partial<IntakeRowState>) => void;
}

function IntakeRow({ row, state, unplanned, mlorPercent, onPatch }: IntakeRowProps) {
  const [dateOpen, setDateOpen] = useState(false);
  /* SATIR SAYILDIĞINDA AÇILIR. Ölçüt adedin GİRİLMİŞ olması (`qty !== null`), sıfırdan büyük
     olması değil: "0 adet geldi" de bir sayımdır ve o satırın SKT'si sorulmaz ama sapma özetine
     girer. Sıfırı kapalı saymak, depocunun bilinçli beyanını "hiç dokunmadım"la eşitlerdi. */
  const [expanded, setExpanded] = useState(false);
  const counted = state.qty !== null || expanded;
  const name = productLabel(row.productName, row.variantLabel);
  const expiry = parseDate(state.expiryText);
  const damaged = state.damageNote.length > 0;
  // Tarih girilmeden ölçüt YOKTUR — `meetsMlor`a boş bir tarih vermek, olmayan bir ölçümden karar
  // üretmek olurdu. `null` = "henüz sorulmadı"; motorun kendi `null`ı ("ömür bilinmiyor") ondan ayrı
  // ve o da uyarı üretmiyor (`ok: true` ile döner).
  const life = expiry === null ? null : meetsMlor(expiry, row.shelfLifeDays, new Date(), mlorPercent);

  return (
    <View style={styles.lineRow} testID={`warehouse-intake-line-${row.variantId}`}>
      <View style={styles.lineHead}>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{name}</Text>
          {/*
            SIFIR BEKLENEN İKİ AYRI ŞEY DEMEK (ölçüldü 30.08, yerel veritabanından):
            `expectedQty` KALANDIR (`purchase_order_progress.missing_qty`), ısmarlanan değil.
            Beş kalemlik bir siparişte dördü tamamen alınmıştı ve dördü de künyesiz çizilmişti —
            plansız kabuldeki "beklenti yok" hâliyle birebir aynı görünüyordu.

            · PLANSIZDA (23.13) kıyaslanacak sipariş YOKTUR ve v3 bunu SÖYLÜYOR: "beklenen yok".
              Sayı değil KELİME — "beklenen 0" yazmak olmayan bir beklentiyi sıfır diye göstermek
              olurdu (CLAUDE §1); "yok" demek beklentinin kendisinin bulunmadığını söyler.
            · PLANLI siparişte sıfır kalan "beklenti KARŞILANDI" demektir ve bu bir bilgidir —
              depocu ikinci turda o kaleme dokunmayacağını bilmeli. Sessizlik ikisini eşitliyordu.
          */}
          {row.expectedQty > 0 ? (
            /* TEDARİKÇİ KODU BEKLENEN ADEDİN YANINDA (v3:604 · 30.08): depocunun elindeki kâğıt
               bizim katalogumuz değil TEDARİKÇİNİN irsaliyesi ve satırı onunla eşleştirmenin kesin
               anahtarı bu kod — ürün adı çevrilmiş, boy etiketi bizim dilimizde. Kodu olmayan
               kalemde (eşlemesiz açılmış) yalnız beklenen yazılır; "—" koymak, olmayan bir kodu
               boş bir kod gibi gösterirdi. */
            <Text style={styles.rowSub} testID={`warehouse-intake-expected-${row.variantId}`}>
              {row.supplierCode === null
                ? fillCopy(t.intake.expected, { qty: String(row.expectedQty) })
                : fillCopy(t.intake.expectedWithCode, { qty: String(row.expectedQty), code: row.supplierCode })}
            </Text>
          ) : unplanned ? (
            /* PLANSIZDA SATIRIN KODU SKU'DUR (v3:657 · 30.08): sipariş kalemi yok, yani tedarikçi
               kodu da yok — satırı tanıtan tek kod bizimkisi. Satır aramadan da okutmadan da
               açılabiliyor ve ikisi artık aynı alanı taşıyor (uç künyesi); SKU'suz varyantta
               kelime hâli yazılır, "SKU —" değil. */
            <Text style={styles.rowSub} testID={`warehouse-intake-none-${row.variantId}`}>
              {row.sku === null ? t.intake.expectedNone : fillCopy(t.intake.expectedNoneWithSku, { sku: row.sku })}
            </Text>
          ) : (
            <Text style={styles.rowDone} testID={`warehouse-intake-done-${row.variantId}`}>
              {t.intake.expectedDone}
            </Text>
          )}
        </View>
        {/* SAYILMAMIŞ SATIR KAPALI DURUR (v3:05): sağda kesikli "say →", altında hiçbir alan yok.
            Altı kalemlik bir sipariş açıkken üç ekran sürüyordu ve depocu hangi satıra geldiğini
            kaydırarak arıyordu; kapalı hâlde altısı da tek ekrana sığıyor. Sayı girilir girilmez
            satır AÇILIR — çünkü o andan sonra SKT ve lot da sorulacak. */}
        {counted ? (
          <OperationsQtyField
            value={qtyToText(state.qty)}
            onChangeText={(text) => onPatch({ qty: parseQty(text) })}
            accessibilityLabel={fillCopy(t.intake.qtyLabel, { name })}
            // Sapma tonu da beklentinin VARLIĞINA bağlı: beklenen yokken her sayı "farklı" görünürdü.
            tone={state.qty === null ? 'muted' : row.expectedQty === 0 || state.qty === row.expectedQty ? 'neutral' : 'diff'}
            testID={`warehouse-intake-qty-${row.variantId}`}
          />
        ) : (
          <PressableSurface
            /* Düğme satırı AÇAR, adedi YAZMAZ. Bir an beklenen adedi otomatik doldurmayı yazmıştım
               ve yanlıştı: o hâlde "saydım" ile "dokundum" aynı kayda düşerdi. Sayı depocunun
               beyanıdır; ekran onu asla onun yerine söylemez (CLAUDE §1). */
            onPress={() => setExpanded(true)}
            feedback="scale"
            style={styles.countCta}
            accessibilityLabel={fillCopy(t.intake.qtyLabel, { name })}
            testID={`warehouse-intake-count-${row.variantId}`}
          >
            <Text style={styles.countCtaLabel}>{t.intake.countCta}</Text>
          </PressableSurface>
        )}
      </View>

      {/* Kapalı satırın tek künyesi: SKT kuralı ve lot durumu — açmadan da ne isteneceği görünür. */}
      {counted ? null : (
        <View style={styles.chipRow}>
          <Text style={styles.dateTag}>{fillCopy(t.intake.dateTag, { type: row.dateType })}</Text>
          <Text style={styles.chip}>{fillCopy(t.intake.lot.short, { lot: state.lotText.length === 0 ? '—' : state.lotText })}</Text>
        </View>
      )}

      {counted ? (
      <>
      <View style={styles.chipRow}>
        {/* SKT alanı: zorunlu olduğu ÇİPTE değil, kapıda — çip yalnız durumu söyler (v2:369). */}
        <Text
          style={[styles.chip, expiry === null ? styles.chipMissing : styles.chipDone]}
          testID={`warehouse-intake-expiry-state-${row.variantId}`}
        >
          {expiry === null ? t.intake.expiry.missing : fillCopy(t.intake.expiry.set, { date: shortDate(expiry) ?? expiry })}
        </Text>
        {/* TARİH REJİMİ ÜRÜNDEN (v3:606 · 30.08). Etiketin iki yarısı iki ayrı şey: "SKT ZORUNLU"
            her satırda aynı (sözleşme kuralı — `expiryDate` zorunlu), "DLC/DDM" ise ÜRÜNE göre
            değişiyor ve depocunun kutunun üstünde arayacağı yazı bu. Çip değil ETİKET: dokunulacak
            bir şey değil, satırın kuralını söylüyor. */}
        <Text style={styles.dateTag} testID={`warehouse-intake-datetype-${row.variantId}`}>
          {fillCopy(t.intake.dateTag, { type: row.dateType })}
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

      {/* SKT SEÇİCİYLE GİRİLİR, KLAVYEYLE DEĞİL (v3 · `00-ortak` → `openSkt`).
          Rampada koli tutulurken, eldivenle yazılan tarih iki yerden bozuluyordu: olmayan gün
          ("31.02") ve belirsiz biçim ("2.6.26" mi 6.2.26 mı). Üç sütunlu seçicide ikisi de
          imkânsız — gün listesi ayın gerçek uzunluğu kadar. Alan artık bir GİRDİ değil, seçiciyi
          açan düğme. */}
      <PressableSurface
        onPress={() => setDateOpen(true)}
        feedback="scale"
        style={styles.textInput}
        accessibilityLabel={fillCopy(t.intake.expiry.field, { name })}
        testID={`warehouse-intake-expiry-${row.variantId}`}
      >
        <Text style={expiry === null ? styles.fieldPlaceholder : styles.fieldValue}>
          {expiry === null ? t.intake.expiry.placeholder : (shortDate(expiry) ?? expiry)}
        </Text>
      </PressableSurface>

      <OperationsDateSheet
        visible={dateOpen}
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
          setDateOpen(false);
        }}
        onClose={() => setDateOpen(false)}
        testID={`warehouse-intake-expiry-sheet-${row.variantId}`}
      />

      {/* KALAN ÖMÜR SATIRIN İÇİNDE, KAYITTAN SONRA DEĞİL (v3:610 · 30.08).
          Uyarı zaten vardı ama yalnız kabul YAZILDIKTAN sonra, ekranın altında (`intake.warnings`)
          — yani depocu kararı verdikten sonra. Şablonun istediği an başka: SKT girilir girilmez,
          o satırın içinde. Karar "kabul edeyim mi" sorusudur ve cevabı yazmadan ÖNCE gerekir.

          Hesap MOTORDAN (`meetsMlor`, `@lezzet/domain-core`): ekran kendi yüzdesini kurmaz — kapı
          da aynı motoru çağırıyor ve ikisi ayrışsaydı ekran bir şey der, kayıt başkasını yazardı.
          Eşik SUNUCUDAN (`mlorPercent`, ayar): koda gömülseydi operatör eşiği değiştirdiği gün
          ekranın söylediği kural sistemin kuralı olmaktan çıkardı.

          ENGELLEMEZ (DOMAIN §4) ve raf ömrü bilinmiyorsa hiç görünmez: ölçüt yokken uyarı üretmek
          yanlış alarmdır (`remainingShelfLifePercent` `null` döner). */}
      {life === null || life.ok ? null : (
        <View style={styles.lifeBox} testID={`warehouse-intake-life-${row.variantId}`}>
          <Text style={styles.lifeText}>
            {fillCopy(t.intake.lifeInline, { pct: String(Math.round(life.remainingPercent ?? 0)) })}
          </Text>
          <Text style={styles.lifeHint}>{fillCopy(t.intake.lifeInlineHint, { mlor: String(Math.round(mlorPercent)) })}</Text>
        </View>
      )}

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
      </>
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
    // Kartlar arası nefes: ayraç çizgisi kalktı, boşluk onun işini görüyor.
    gap: operationsTheme.space.lg,
  },
  /* SATIR BİR KART (v3:05). Kesik çizgiyle ayrılmış düz satırlardı ve altı kalem tek bir metin
     bloğu gibi okunuyordu; kart her kalemi kendi işi yapıyor — depocu birini sayarken ötekiler
     görsel olarak "bekleyen" kalıyor. */
  lineRow: {
    gap: operationsTheme.space.sm,
    padding: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.card,
    backgroundColor: operationsTheme.colors.panel,
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
  /* Seçici düğmesinin içindeki iki hâl: değer varsa mürekkep, yoksa yer tutucu tonunda. */
  fieldValue: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  fieldPlaceholder: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.muted,
  },
  /* KAPALI SATIRIN "say →" DÜĞMESİ — kesikli, çünkü bir kayıt değil bir DAVET: burada henüz
     sayılmış bir şey yok. Dolu bir düğme, satırı sayılmış gibi gösterirdi. */
  countCta: {
    minWidth: operationsTheme.size.circleSm,
    height: operationsTheme.size.controlSm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: operationsTheme.space.xl,
    borderWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
  },
  countCtaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
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
  dateTag: {
    alignSelf: 'center',
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
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
