import { useLocalSearchParams, useRouter } from 'expo-router';
import { toastInfo } from '@/lib/toast/toast-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
// Ömür kararı MOTORDAN: ekran kendi yüzdesini kurmaz — kabul kapısı da aynı motoru çağırıyor ve
// ikisi ayrışsaydı ekran bir şey der, kayıt başkasını yazardı (`CLAUDE §1`).
import { meetsMlor } from '@lezzet/domain-core';
import type { IntakeFormRowContract, VariantSearchRowContract } from '@lezzet/types';

import { OperationsQuantitySheet } from '@/components/operations/quantity-sheet';
import { quantityTotal } from '@/components/operations/quantity-value';
import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsDateSheet } from '@/components/operations/date-sheet';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsAmountKeypad } from '@/components/operations/amount-keypad';
import { OperationsQtyReasonRow } from '@/components/operations/qty-reason-row';
import { OperationsStepperGroup } from '@/components/operations/stepper-group';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsStickyBar } from '@/components/operations/sticky-bar';
import { OperationsSurface } from '@/components/operations/surface';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { FormScroll } from '@/components/ui/form-scroll';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { TextField } from '@/components/ui/text-field';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { searchIntakeVariants } from '@/lib/api/warehouse';
import { warehouseCopy } from './copy';
import { useIntake, type IntakeRowState } from './use-intake.hook';
import { parseDate, productLabel, shortDate } from './warehouse-format';
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
 * İlk yükte çizilen yer tutucu kartın yüksekliği (dp).
 *
 * KAPALI satırın gerçek ölçüsünden türer, uydurma değil: "say →" düğmesi 46 (`controlSm`) ve
 * `lineRow`un dikey dolgusu 2×14 (`space['2xl']`) — toplam 74. Aynı sayı `skeleton-list.tsx`
 * künyesinde de "kuyruk satırı 74" diye ölçülmüş; yer tutucu, yerini tuttuğu şeyin boyunda
 * olmazsa veri gelince sayfa yine zıplar ve skeletonun tek işi zaten bunu önlemek.
 */
const LINE_SKELETON_HEIGHT = 74;

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
  const purchaseOrderId = typeof params.purchaseOrderId === 'string' && params.purchaseOrderId.length > 0 ? params.purchaseOrderId : null;
  /** Plansız kabul (23.13): PO'suz gelen mal — satırları depocu kurar. */
  const unplanned = params.unplanned === '1' && purchaseOrderId === null;
  const intake = useIntake(purchaseOrderId, unplanned);
  const { offline } = useWarehouseStatus();

  /*
    BİLDİRİM KANALI TOAST (kullanıcı kararı 01.09) — ekrana yapıştırılan satır KALKTI.

    Uygulamanın tek bir bildirim dili var (`ToastHost`, kökte) ve depo ekranlarının her biri kendi
    satırını çiziyordu: aynı iş, ekran sayısı kadar görsel dil. Cümle artık her yerden aynı yoldan
    geçiyor. `toastInfo` SESSİZ olan ve bu bilinçli: titreşimi `useNotice` tonuna göre ZATEN yazma
    anında veriyor (künyesi orada); `toastSuccess`/`toastError` seçilseydi her bildirim iki kez
    titrerdi.
  */
  useEffect(() => {
    if (intake.notice !== null) toastInfo(intake.notice.text);
  }, [intake.notice]);
  const [searchOpen, setSearchOpen] = useState(false);

  /*
    OKUTMA PENCERESİ İLE ADET ÇEKMECESİ ARASINDA EL SIKIŞMA YOK — ve gerekmiyor.

    Arıza 30.08'de burada bulunmuştu (iOS: koli okutulunca satır sayıyor ama çekmece ekranın altında
    asılı kalıyor). Sebebi iki `Modal`ın çakışmasıydı: iOS kapanmakta olanın üstüne yenisini
    sunmuyor, panelin yerleşimi hiç ölçülmüyor ve ölçüme bağlı açılış hiç tetiklenmiyordu. Çare o
    gün bu ekranın içine elle yazılmıştı: bir bayrak, iki `onDismiss` teli.

    01.09'da çekmece `@gorhom/bottom-sheet`e geçti ve RN `Modal`ı kullanmıyor — kendi portalına
    asılıyor. Sınırlamanın kendisi ortadan kalktığı için kapı da söküldü (künyesi
    `components/ui/bottom-sheet.tsx`).
  */

  /* ARAMADAN SEÇİLEN ÜRÜN, ÇEKMECE KAPANANA KADAR BEKLER (künyesi `onPick`te). İki kanca da aynı
     yere bağlı — `onClosed` her platformda, `onDismiss` yalnız iOS'ta gelir; ikinci çağrı zararsız,
     çünkü bekleyen seçim ilk çağrıda tüketiliyor. */
  const [pickedVariant, setPickedVariant] = useState<VariantSearchRowContract | null>(null);
  const addPickedRow = useCallback(() => {
    if (pickedVariant === null) return;
    intake.addManualRow(pickedVariant);
    setPickedVariant(null);
  }, [intake, pickedVariant]);

  /*
    ARAMA ÇEKMECESİ TEK TANIM, İKİ KULLANIM (kullanıcı bulgusu 30.08).

    Ekran plansız kabulde İKİ ayrı blok döndürüyor (liste boş / liste dolu) ve çekmece yalnız
    boş bloktaydı. Sonucu: ilk ürün eklendikten sonra "Ürün ara ve ekle" düğmesi duruyor ama
    bastığında hiçbir şey açılmıyordu — ikinci ürün hiç eklenemiyordu. Çekmece bu yüzden bir
    kez tanımlanıp iki blokta da çiziliyor; ikinci bir kopya yazmak aynı davranışı iki yerde
    bakmak olurdu (CLAUDE §1).
  */
  const renderSearchSheet = () => (
    <VariantSearchSheet
      visible={searchOpen}
      onClose={() => setSearchOpen(false)}
      onClosed={addPickedRow}
      onDismissed={addPickedRow}
      onPick={(variant) => {
        /* SATIR ÇEKMECE KAPANDIKTAN SONRA EKLENİR (kullanıcı bulgusu 30.08, iki platformda).
           Sebebi bu ekranın kendi yapısı: plansız kabulde liste BOŞKEN ayrı bir dönüş bloğu
           çiziliyor (yukarıdaki `rows.length === 0 && unplanned` dalı) ve arama çekmecesi o
           bloğun içinde. Satır hemen eklenseydi liste dolar, ekran öteki bloğa geçer ve blok
           SÖKÜLÜRDÜ — çekmece React tarafından kaldırıldığı için ne `onClosed` ne `onDismiss`
           gelir, yani "kapandı" sinyali hiç doğmazdı. Adet çekmecesi de o sinyali beklediği
           için hiç açılmıyordu.

           Sıra bu yüzden ters: seçim yalnız BEKLETİLİR, çekmece kapanır, satır ondan sonra
           eklenir. Böylece blok değişimi kapanışın ardına düşer ve iki `Modal` aynı pencerede
           çakışmaz. */
        setPickedVariant(variant);
        setSearchOpen(false);
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
  );


  const header = (
    <OperationsStackHeader
      /* Plansız kabulün BAŞLIĞI ayrı (v3:756): "Mal Kabul" beklenen adetlerle çalışılan ekranın
         adı; siparişsiz mal onun bir kipi değil, başka bir iş. Aynı başlık ikisini de taşıyınca
         depocu hangi ekranda olduğunu ancak künyeden anlıyordu. */
      /* FORMDA BAŞLIK SEVKİYATIN KODUDUR (v3:05 · kullanıcı bulgusu 30.08), sabit "Mal kabul"
         DEĞİL. Depocunun elindeki kâğıtta yazan şey `TS-26-4VXQEC`; ekranın adını zaten oraya
         nasıl geldiğinden biliyor. Uç künyeyi 21.11d'den beri gönderiyordu, hook onu düşürüyordu
         ve başlık sabitti — yani veri vardı, ekrana hiç ulaşmıyordu.

         Kod OKUNAMADIYSA ekranın adına düşer: künyesiz bir sevkiyatı "—" diye başlıklamak,
         okunamayan bir kimliği boş bir kimlik gibi gösterirdi. */
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
    /* İLK YÜK SKELETON, HALKA DEĞİL (kullanıcı kararı 30.08). Halka yerleşim tutmaz: söndüğü an
       sayfa zıplar ve depocu o ana kadar ekranın ne olacağını göremez. Kutular gelecek KALEM
       KARTLARININ yerini tutuyor — ölçü uydurma değil, `lineRow`un kendi yüksekliği
       (`skeleton-list.tsx` künyesi: ölçü ÇAĞIRANDAN gelir). */
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
            /* İKİ DÜĞME AYNI GÖRÜNMEZ (kullanıcı bulgusu N3, 30.08): ikisi de zeytin çerçeveli
               çizilmişti ve hangisinin asıl yol olduğu okunmuyordu. Tasarım ayırıyor — okutma
               ZEYTİN çerçeve + ikon (asıl yol), arama KUM çerçeve (yedek yol). Gölge yok: v3
               operasyon yüzeyinde sert gölge hiç kullanılmıyor. */
            <View style={styles.altCtas}>
              <SecondaryButton
                label={t.intake.scan.cta}
                onPress={intake.openScan}
                tone="olive"
                elevation="flat"
                icon="scan"
                testID="warehouse-intake-scan-cta"
              />
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
        <ScanSheet
          open={intake.scanOpen}
          title={t.intake.scan.title}
          hint={t.intake.scan.hint}
          onClose={intake.closeScan}
          onScan={intake.handleScan}
          testID="warehouse-intake-scan"
        />
        {renderSearchSheet()}
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

  /*
    DÜĞME ASIL EYLEMİ YAZAR, KAPIYI DEĞİL (Komponent Envanteri M1e, 30.08).
    Envanterin yapışkan taban kuralı: *"üstte gradient maske, gerekiyorsa TEK SATIR KAPI METNİ,
    sonra tek birincil buton."* Eskiden kapı metni düğmenin ETİKETİNE giriyordu ("Her satırda adet
    + SKT zorunlu") ve düğme ne yapacağını hiç söylemiyordu; tasarım karesinde ise düğme pasifken
    de "Kabulü kaydet" yazıyor, eksik olan şey üstteki gri satırda duruyor.
  */
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
      {header}

      <FormScroll contentContainerStyle={styles.list} testID="warehouse-intake-lines">
        {/* ÖĞRENİLEN KOD LİSTENİN ÜSTÜNDE KALIR (v3:05 · kullanıcı bulgusu 30.08). Önceden yalnız
            geçip giden bir bildirimdi; oysa öğrenme bir ADIM değil bir SONUÇTUR — o kod bir dahaki
            kabulde tanınacak ve depocunun bunu görmesi, aynı koliyi ikinci kez öğretmeye
            kalkışmasını önler. Kart kapatılmıyor: kaybolması gereken bir uyarı değil, kabul
            bitene kadar doğru kalan bir kayıt. */}
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
            <Text style={styles.formLockedTitle}>{unplanned ? t.intake.unplannedLocked.title : t.intake.formLocked.title}</Text>
            <Text style={styles.formLockedBody}>{unplanned ? t.intake.unplannedLocked.body : t.intake.formLocked.body}</Text>
          </View>
        ) : (
          <View style={styles.altCtas}>
            <SecondaryButton
              label={t.intake.scan.cta}
              onPress={intake.openScan}
              tone="olive"
              elevation="flat"
              icon="scan"
              testID="warehouse-intake-scan-cta"
            />
          </View>
        )}
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
            lotSuggestions={intake.lotsUsedBy(row.variantId)}
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

      <OperationsStickyBar>
        {gateNote === null ? null : (
          <Text style={styles.stickyNote} testID="warehouse-intake-gate">
            {gateNote}
          </Text>
        )}
        <PrimaryButton
          label={cta.label}
          /* BAŞARIDA EKRAN KAPANIR (kullanıcı bulgusu 30.08): kabul yazıldıysa bu ekranda
             yapılacak iş kalmadı — depocu sevkiyat listesine döner ve siparişin listeden
             düştüğünü görür. Sonucu toast söylüyor (`use-intake` künyesi), yani kapanan
             ekranda okunmayacak bir şerit beklemiyor. */
          onPress={() => intake.submit({ onDone: () => router.back() })}
          disabled={!cta.enabled}
          elevation="flat"
          testID="warehouse-intake-cta"
        />

        {/*
          İKİNCİ YOL: KISMİ KAYIT (v3:05 · `act.kismiKabul`) — tasarımın yapışkan çubuğunda ayrı
          bir düğme ve ayrı bir karar. Rampada koli koli gelen bir sevkiyatta "her satırı say"
          beklemesi gerçek dışı: mal geldiği kadarıyla stoğa girmeli, kalanı açık kalmalı.

          KOŞULU BİZİM kararımız, tasarımın değil: şablon düğmeyi hep çiziyor, biz yalnız
          "hepsi sayılmamış AMA en az biri sayılmış" hâlinde çiziyoruz. Hepsi sayılıyken ikinci
          düğme birinciyle aynı şeyi daha kötü yapardı; hiçbiri sayılmamışken de kapıya boş bir
          kabul göndermeye davet ederdi.
        */}
        {offline || intake.complete || !intake.hasAnyCounted ? null : (
          <>
            <SecondaryButton
              label={t.intake.cta.partialAction}
              onPress={() => intake.submit({ partial: true })}
              tone="sand"
              elevation="flat"
              disabled={intake.sending}
              testID="warehouse-intake-partial-cta"
            />
            <Text style={styles.stickyNote}>{t.intake.cta.partialNote}</Text>
          </>
        )}
      </OperationsStickyBar>

      <ScanSheet
        open={intake.scanOpen}
        title={t.intake.scan.title}
        hint={t.intake.scan.hint}
        onClose={intake.closeScan}
        onScan={intake.handleScan}
        testID="warehouse-intake-scan"
      />

      {renderSearchSheet()}

      {/* OKUTMA ÇEKMECESİ SÖKÜLDÜ (kullanıcı kararı 30.08 · tasarım deseni). Burada bir
          "Okutulan ürün" paneli vardı: fotoğraf + kaydırıcı + "Satıra ekle". Tasarımda böyle bir
          çekmece HİÇ YOK — okutulan kod ANINDA sayılır ve adet çekmecesi açılır
          (`v3.dc.html:4005-4010`): paket barkodu tek pakete +1, koli barkodu o boydan +1 koli.
          Panel iki adım ve fazladan bir soru getiriyordu ("kaç tane?"), oysa koli barkodu kaç adet
          olduğunu KENDİSİ söylüyor (`qtyPerCode`); kaydırıcı da v3'te hiç geçmiyor. Satırın
          açılması artık `pendingCount` sinyaliyle. */}

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
            /* KİTİN TEK ADET DESENİ (kullanıcı kararı 02.09: "o kaydırmalı komponent komple
               kalksın") — kaydırıcının son kullanıcısıydı. Taban 2: koli en az iki paket,
               `confirmLearn`in kilidi de aynı kuralda. Ortadaki rakam bu çekmecede çekmece açmaz
               (çekmece çekmece açamaz); çarpan çoğu zaman 6–24 arası, ± yeter. */
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
    /* SABİT YÜKSEKLİK (kullanıcı bulgusu N4, 30.08): çekmece boşken içeriği kadar açılıyordu —
       yani arama kutusu ekranın dibinde bir şerit gibi. Yazmaya başlayınca satırlar geldikçe
       çekmece BÜYÜYORDU ve altındaki liste her tuşta zıplıyordu. `fill` boyu baştan sabitler;
       arama bir çekmece değil bir SAYFA gibi açılır. */
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
        /* SATIR TASARIMIN SATIRI (kullanıcı bulgusu N1, 30.08): ad + "kod · stok N" + yön oku.
           Önceki hâli iki çıplak metindi ve SKU'yu tek başına yazıyordu — depocunun sorduğu
           "bu üründen bende var mı" sorusunun cevabı ekranda hiç yoktu.

           ÖN İZLEME GÖRSELİ kullanıcının eklemesi (tasarımda yok): aynı ürünün 225 g ve 450 g
           boyları yan yana geldiğinde metin ayırt etmeye yetmiyor. Görsel YOKSA yer tutucu da
           çizilmez — boş bir gri kare, ürünün fotoğrafı yok bilgisini vermez, sadece kirletir. */
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
              <Image source={{ uri: row.imageUrl }} style={styles.searchThumb} accessibilityIgnoresInvertColors />
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

/* `scanMeta` ve `qtyCaption` SİLİNDİ (kullanıcı kararı 30.08): ikisi de sökülen "Okutulan ürün"
   çekmecesinin künye satırlarıydı. Kodun türü ve kesinlik derecesi artık satırın kendi künyesinde
   duruyor (`IntakeRowState.scan` → "koli barkodu · çarpan 12"), koli dökümünü de adet çekmecesi
   canlı yazıyor ("2 × 12 + 3 tek paket = 27 paket"). */

interface IntakeRowProps {
  row: IntakeFormRowContract;
  state: IntakeRowState;
  /** Plansız kabulde beklenen YOKTUR; planlıda sıfır kalan "karşılandı" demektir (aşağıdaki künye). */
  unplanned: boolean;
  /** MLOR eşiği (%) — SUNUCUDAN gelen ayar; satırın kendi değeri değil, formun kuralı. */
  mlorPercent: number;
  /**
   * Lot ÖNERİLERİ — bu kabulde başka satırlara girilmiş kodlar (kullanıcı kararı 30.08).
   *
   * Ekran seviyesinde hesaplanır, satırda değil: satır yalnız kendi durumunu bilir, "bu sevkiyatta
   * hangi lotlar yazıldı" sorusu FORMUN sorusudur. Kendi kodu listede olmaz — depocuya zaten
   * yazdığı şeyi önermek gürültüdür.
   */
  lotSuggestions: string[];
  /**
   * Bu satır AZ ÖNCE OKUTULDU mu (kullanıcı kararı 30.08). Okutma adedi kendisi yazıyor; geriye
   * depocuyu o satıra götürmek kalıyor — satır açılır ve adet çekmecesi gelir, tıpkı tasarımın
   * `sheet:'adet'` adımı gibi. Sinyal bir kez tüketilir, yoksa çekmece her çizimde açılırdı.
   */
  pendingCount: boolean;
  onCountConsumed: () => void;
  onPatch: (patch: Partial<IntakeRowState>) => void;
}

function IntakeRow({ row, state, unplanned, mlorPercent, pendingCount, onCountConsumed, lotSuggestions, onPatch }: IntakeRowProps) {
  const [dateOpen, setDateOpen] = useState(false);
  const [qtyOpen, setQtyOpen] = useState(false);
  /** Hasar sayacının ortasındaki rakam TUŞ TAKIMINI açar (kullanıcı kararı 02.09; künye aşağıda). */
  const [damageQtyOpen, setDamageQtyOpen] = useState(false);
  const [lotOpen, setLotOpen] = useState(false);
  /* Hasar SEBEBİ çekmecesinin AÇIKLIĞI artık ekranın durumu değil: kalıp kite taşındı ve çekmeceyi
     `OperationsQtyReasonRow` kendi içinde tutuyor (02.09) — açılışı ekranın bilmesi gereken bir şey
     değildi, yalnız seçilen sebep ekranın verisi. */

  /* OKUTULAN SATIR KENDİLİĞİNDEN AÇILIR ve adet çekmecesini getirir (tasarım: okutma → `sheet:
     'adet'`). Sinyal hemen tüketiliyor: ikinci bir çizimde çekmece yeniden açılmasın. */
  useEffect(() => {
    if (!pendingCount) return;
    setExpanded(true);
    setQtyOpen(true);
    onCountConsumed();
  }, [pendingCount, onCountConsumed]);
  /* SATIR SAYILDIĞINDA AÇILIR. Ölçüt adedin GİRİLMİŞ olması (`qty !== null`), sıfırdan büyük
     olması değil: "0 adet geldi" de bir sayımdır ve o satırın SKT'si sorulmaz ama sapma özetine
     girer. Sıfırı kapalı saymak, depocunun bilinçli beyanını "hiç dokunmadım"la eşitlerdi. */
  const [expanded, setExpanded] = useState(false);
  const counted = state.qty !== null || expanded;
  const name = productLabel(row.productName, row.variantLabel);
  const expiry = parseDate(state.expiryText);
  const damaged = state.damageOpen;
  // Tarih girilmeden ölçüt YOKTUR — `meetsMlor`a boş bir tarih vermek, olmayan bir ölçümden karar
  // üretmek olurdu. `null` = "henüz sorulmadı"; motorun kendi `null`ı ("ömür bilinmiyor") ondan ayrı
  // ve o da uyarı üretmiyor (`ok: true` ile döner).
  const life = expiry === null ? null : meetsMlor(expiry, row.shelfLifeDays, new Date(), mlorPercent);

  return (
    <View style={[styles.lineRow, counted ? null : styles.lineRowIdle]} testID={`warehouse-intake-line-${row.variantId}`}>
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
          /*
            ADET KUTUSU CİHAZ KLAVYESİNİ AÇMAZ (v3 · görsel ajanı ölçümü 30.08, fark #1).

            Tasarım bu çözümü ADIYLA reddediyor: tuş takımı çekmecesinin künyesi *"Cihaz klavyesi
            açılmaz — eldivenle de basılabilecek büyük tuşlar."* Bu bir para kararı değil ELDİVEN
            kararı ve depocunun eli de eldivenli — rampada koli tutarken sistem klavyesinin küçük
            tuşları ıskalanıyor.

            Not kuyruğundaki N2 bunu *"kutu tipleri veri modelinde yok, o yüzden klavye"* diye
            kaydetmişti ve o kayıt YANLIŞTI: eksik veri yalnız `sheetAdet`in "kaç koli geldi"
            listesini engelliyor, tuş takımını değil. Tuş takımı zaten vardı (21.159, para).
          */
          <PressableSurface
            onPress={() => setQtyOpen(true)}
            feedback="scale"
            style={styles.qtyBox}
            accessibilityLabel={fillCopy(t.intake.qtyLabel, { name })}
            accessibilityHint={t.intake.qtyHint}
            testID={`warehouse-intake-qty-${row.variantId}`}
          >
            <Text
              style={[
                styles.qtyValue,
                // Sapma tonu beklentinin VARLIĞINA bağlı: beklenen yokken her sayı "farklı" görünürdü.
                state.qty === null
                  ? styles.qtyValueMuted
                  : row.expectedQty === 0 || state.qty === row.expectedQty
                    ? null
                    : styles.qtyValueDiff,
              ]}
            >
              {state.qty === null ? '—' : String(state.qty)}
            </Text>
            <Text style={styles.qtyCaption} accessibilityElementsHidden importantForAccessibility="no">
              {t.intake.qtyCaption}
            </Text>
          </PressableSurface>
        ) : (
          <PressableSurface
            /* Düğme satırı AÇAR ve ÇEKMECEYİ DE AÇAR (kullanıcı bulgusu 30.08): eskiden yalnız
               satırı açıyordu, depocu adedi girmek için bir kez daha ADET kutusuna dokunmak
               zorundaydı. "Say" bir niyet cümlesidir — dokunan kişi saymaya başlamak istiyor,
               satırı seyretmek değil.

               Adedi YAZMAZ, yalnız kapıyı açar: beklenen adedi otomatik doldurmayı bir kez
               yazmıştım ve yanlıştı — o hâlde "saydım" ile "dokundum" aynı kayda düşerdi. Sayı
               depocunun beyanıdır; ekran onu asla onun yerine söylemez (CLAUDE §1). */
            onPress={() => {
              setExpanded(true);
              setQtyOpen(true);
            }}
            feedback="scale"
            style={styles.countCta}
            accessibilityLabel={fillCopy(t.intake.qtyLabel, { name })}
            testID={`warehouse-intake-count-${row.variantId}`}
          >
            <Text style={styles.countCtaLabel}>{t.intake.countCta}</Text>
          </PressableSurface>
        )}
      </View>

      {/* Kapalı satırın tek künyesi: SKT kuralı ve lot durumu — açmadan da ne isteneceği görünür.
          İkisi de DOLGULU rozet ve ayrı ailelerden: zorunluluk terracotta, durum nötr krem. */}
      {counted ? null : (
        <View style={styles.chipRow}>
          <Text style={[styles.badge, styles.badgeRequired]}>{fillCopy(t.intake.dateTag, { type: row.dateType })}</Text>
          <Text style={[styles.badge, styles.badgeLot]}>
            {fillCopy(t.intake.lot.short, { lot: state.lotText.length === 0 ? '—' : state.lotText })}
          </Text>
        </View>
      )}

      {counted ? (
        <>
          {/*
        AÇIK SATIRIN KÜNYE SATIRI (v3:05) — rozet + KAYNAK NOTU, başka hiçbir şey.

        Buradaki dört çipten üçü tasarımda YOK ve niçin olmadığı ölçülünce anlaşılıyor:
        · "SKT gir *" durum çipi — durumu ALANIN KENDİSİ söylüyor (aşağıda, kırmızı çerçeveyle).
          Çip ayrıca dursaydı aynı bilgi iki yerde olur, biri güncellenmediği gün çelişirdi.
        · lot ve hasar — tasarımda ÇİP DEĞİL ALAN (aşağıdaki satır). Çip "aç/kapa" der; alan
          "burayı doldur" der ve ikisi farklı davranış: lot bir DEĞER taşır, bir bayrak değil.

        Yerine gelen `kaynakNotu`, satırın adedinin nereden geldiğini söyler ("barkod okutulmadı"
        ⟷ okutuldu). Denetim bilgisi: elle sayılan satırla okutulan satır aynı görünmemeli.
      */}
          <View style={styles.chipRow}>
            {/* TARİH REJİMİ ÜRÜNDEN (v3:606). Etiketin iki yarısı iki ayrı şey: "SKT ZORUNLU" her
            satırda aynı (sözleşme kuralı — `expiryDate` zorunlu), "DLC/DDM" ise ÜRÜNE göre
            değişiyor ve depocunun kutunun üstünde arayacağı yazı bu. Kapalı satırla AYNI rozet:
            açıkken gri olsaydı depocu zorunluluğun kalktığını sanabilirdi. */}
            <Text style={[styles.badge, styles.badgeRequired]} testID={`warehouse-intake-datetype-${row.variantId}`}>
              {fillCopy(t.intake.dateTag, { type: row.dateType })}
            </Text>
            <Text style={styles.sourceNote} testID={`warehouse-intake-source-${row.variantId}`}>
              {state.scan === null ? t.intake.source.manual : t.intake.source.scanned}
            </Text>
          </View>

          {/* OKUTMA KUTUSU (v3:05 · `okutTuru`/`okutNotu`) — satır okutularak açıldıysa NEYİN
          okutulduğunu söyler. Zeytin ton bilinçli: bu bir uyarı değil, bir DOĞRULAMA — kutunun
          üstündeki kod ile kayıt eşleşti. Elle sayılan satırda hiç çizilmez, çünkü söyleyecek
          bir şey yok. */}
          {state.scan === null ? null : (
            <View style={styles.scanNote} testID={`warehouse-intake-scan-note-${row.variantId}`}>
              <Text style={styles.scanNoteTitle}>{t.intake.scan.kind[state.scan.kind]}</Text>
              <Text style={styles.scanNoteBody}>{fillCopy(t.intake.scan.perCode, { n: String(state.scan.qtyPerCode) })}</Text>
            </View>
          )}

          {/* SKT SEÇİCİYLE GİRİLİR, KLAVYEYLE DEĞİL (v3 · `00-ortak` → `openSkt`).
          Rampada koli tutulurken, eldivenle yazılan tarih iki yerden bozuluyordu: olmayan gün
          ("31.02") ve belirsiz biçim ("2.6.26" mi 6.2.26 mı). Üç sütunlu seçicide ikisi de
          imkânsız — gün listesi ayın gerçek uzunluğu kadar. Alan artık bir GİRDİ değil, seçiciyi
          açan düğme. */}
          {/* SATIRIN ÜÇ ÖĞESİ TASARIMDAN (kullanıcı bulgusu N2, 30.08): takvim ikonu · seçili tarih ·
          "seç →". Önceki hâli çıplak bir metindi ve dokunulabilir olduğu hiçbir yerden
          anlaşılmıyordu — depocu tarihi yazmayı bekleyip klavye açılmayınca duruyordu. */}
          {/* ALAN DURUMU KENDİ ÜSTÜNDE TAŞIR (v3:05 — `c2.sktAlan` üçlüsü): SKT girilmemişken çerçeve,
          ikon ve metin TERRACOTTA, girilmişse nötr. Ayrı bir "SKT gir *" çipi bu yüzden yok —
          eksikliği söyleyen şey alanın kendisi. Metin de bir yer tutucu değil EYLEM: "gg.aa.yyyy"
          neyin isteneceğini söylüyordu ama ne yapılacağını değil; alan zaten klavye açmıyor. */}
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
              /* YEŞİL = LOT GİRİLDİ (tasarım `lotAlan`, `v3.dc.html:3969`): dolu alan yeşile
                 boyanır, boş alan dolgusuz kalır. Eskiden yeşil olan şey "lot yok" seçimiydi —
                 yani gösterge tersine çalışıyor, hiçbir kod girilmemiş satır tamamlanmış gibi
                 görünüyordu. "Lot yok" bilinçli bir boşluktur; işaretini METNİ taşır, rengi
                 değil. */
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

          {/* HASARIN TUŞ TAKIMI — sayacın ortasındaki rakamdan; ADET ÇEKMECESİ DEĞİL (kullanıcı
              kararı 02.09: koli sorulmayan yerde çekmece gürültü — hasar paket paket işaretlenir).
              CANLI: her tuş sayaca yazılır, kapatmak yeter. Tavan tuşta: kabul edilen adetten
              fazlasını yazacak tuş işlemez. */}
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
              <Text style={styles.lifeText}>{fillCopy(t.intake.lifeInline, { pct: String(Math.round(life.remainingPercent ?? 0)) })}</Text>
              <Text style={styles.lifeHint}>{fillCopy(t.intake.lifeInlineHint, { mlor: String(Math.round(mlorPercent)) })}</Text>
            </View>
          )}

          {/*
        LOT ÇEKMECESİ (v3 · `sheetLot`) — cihazda görüldü 30.08: "lot seç" düğmesi VARDI ama
        altında ayrıca ham bir metin kutusu duruyordu, yani TEK değer için İKİ kontrol. Düğme
        değeri göstermiyor, kutu neyin sorulduğunu söylemiyordu.

        Tasarımın çekmecesi ADAY LİSTESİ sunuyor ("Okunan koliden gelen adaylar — biri geri
        çağırma anahtarı olur"); okutma yanıtı lot TAŞIMADIĞI için o liste bugün boş. Çekmecenin
        kendisi yine de doğru yer: elle giriş de, "bilinçli boş" kararı da orada veriliyor ve
        satır tek bir alanla temsil ediliyor. Adaylar sözleşme genişleyince buraya eklenir
        (kayıt: `v3-tasarim-veri-modeli-notlari.md`).
      */}
          <BottomSheet
            visible={lotOpen}
            title={t.intake.lot.sheet.title}
            onClose={() => setLotOpen(false)}
            testID={`warehouse-intake-lot-sheet-${row.variantId}`}
          >
            <Text style={styles.learnRowMeta}>{t.intake.lot.sheet.hint}</Text>

            {/* ALANIN KENDİSİ KAYITTIR, ONAY DÜĞMESİ YOK (kullanıcı kararı 30.08). Eskiden altta
                iki düğme vardı ("Lot yok" ve "Yaz") ve ikisi de aynı şeyi ikinci kez soruyordu:
                kutuya yazılan kod zaten satıra işleniyordu, "Yaz" yalnız çekmeceyi kapatıyordu.
                Bugün kutu doluysa lot VARDIR, boşsa YOKTUR; temizleme kutunun sağındaki düğmede.
                Böylece "bilinçli boş" ayrı bir beyan olmaktan çıktı — boş bırakmak zaten karardır
                ve sözleşme de onu `lotNumber: null` diye taşıyor. */}
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

            {/* ÖNERİLER — bugünkü tek kaynak AYNI KABULDE girilen lotlar. Bir sevkiyatın satırları
                çoğunlukla aynı lottan ya da iki üç lottan gelir; depocu bir kez yazar, ötekilerde
                seçer. Tasarımın kaynağı başkadır ("okunan koliden gelen adaylar") ve o veri bugün
                hiçbir uçtan gelmiyor — kaynağı saklamak, listeye olmayan bir kesinlik atfetmek
                olurdu. Depodaki partilerin lotları ikinci kaynak olarak sözleşme genişleyince
                eklenecek (kullanıcı kararı 30.08). */}
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

          {/* HASAR KARTI (v3:05 · `hasarAcik`) — tasarımın kendi bloğu: adet SAYILIR, sebep
              İŞARETLENİR, not isteğe bağlı kalır. Eskiden yalnız serbest bir not kutusu vardı ve
              "kaç paket hasarlı" sorusu hiç sorulmuyordu; oysa kabul edilen adet değişmiyor,
              hasar onun İÇİNDEN işaretleniyor. */}
          {damaged ? (
            <View style={styles.damageCard} testID={`warehouse-intake-damage-card-${row.variantId}`}>
              <Text style={styles.damageTitle}>{t.intake.damage.title}</Text>
              {/* SAYAÇLAR SORU CÜMLESİNİN SONUNDA (kullanıcı kararı 30.08 — tasarımdan sapma):
                  şablon "sağlam/hasarlı" ikilisini sayacın SAĞINA koyuyor; kullanıcı onu gri
                  metnin devamına aldı ve sağdaki alanı sebep düğmesine ayırdı. Sayı zaten cümlenin
                  konusu ("4 paketin kaçı"), bir kelime sonra tekrar etmesi doğal okunuyor. */}
              <Text style={styles.damageQuestion}>
                {fillCopy(t.intake.damage.question, { n: String(state.qty ?? 0) })}{' '}
                <Text style={styles.damageSound}>
                  {fillCopy(t.intake.damage.sound, { n: String(Math.max(0, (state.qty ?? 0) - state.damagedQty)) })}
                </Text>
                {' · '}
                <Text style={styles.damageBroken}>{fillCopy(t.intake.damage.broken, { n: String(state.damagedQty) })}</Text>
              </Text>

              {/* ADET SOLDA, SEBEP SAĞDA — kalıp 02.09'da KİTE TAŞINDI (`qty-reason-row`).
                  Burada doğmuştu ve burada kalsaydı ikinci kullanıcısı (D4b · stok düşümü) onu
                  ancak kopyalayarak alabilirdi. Ekranın kendi kuralı prop olarak duruyor: tavan
                  KABUL EDİLEN ADET — hasar toplamın içinden işaretlenir, onu aşamaz. */}
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

              {/* SERBEST NOT KUTUSU YOK — tasarımda öyle bir alan hiç çizilmemiş (kullanıcı
                  bulgusu 30.08). Eski koddan taşımıştım ve bu bir FAZLALIKTI: hasarın ne olduğunu
                  dört sebep çipi söylüyor, serbest metin aynı bilgiyi ikinci kez ve denetlenemez
                  biçimde topluyordu. Kaldırıldı; `damageNote` alanı sözleşmede duruyor ama ekran
                  onu artık doldurmuyor.

                  DİPNOT TASARIMDAN SAPIYOR VE SEBEBİ ÖLÇÜLDÜ: şablon "hasarlı paketler stoğa
                  'hasarlı' olarak girer" diyor; bizde öyle bir ayrım YOK — sözleşmede satır başına
                  hasar alanı bulunmuyor, bilgi kabul notuna yazılıyor. Tasarımın cümlesini aynen
                  yazmak, depocuya olmayan bir makineyi vaat etmek olurdu (CLAUDE §1). */}
              <Text style={styles.damageFootnote}>{t.intake.damage.footnote}</Text>
            </View>
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
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['8xl'],
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
  /*
    SAYILMAMIŞ SATIR SOLUK (v3:05 — `opacity:.7`, kullanıcı bulgusu 30.08).

    Tasarımın listeyi okutma biçimi bu: sayılmış satırlar tam parlaklıkta, sayılmamışlar geride.
    Depocu altı kalemlik bir siparişte "nerede kaldım"ı KAYDIRMADAN görüyor — kartların içine
    bakmasına gerek yok, parlaklık söylüyor. Bizde hepsi opaktı ve liste düz bir duvardı.

    Opaklık bir DURUM göstergesi, engellilik değil: satır dokunulabilir olmayı sürdürüyor
    (`disabled` verilmiyor) ve ekran okuyucuya hiçbir şey söylenmiyor — orada bilgi zaten
    "say →" düğmesinin adında.
  */
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
  /* SKT GİRİLMEMİŞ HÂL: DOLGUSUZ, yalnız kenar ve metin uyarı tonunda (kullanıcı bulgusu 30.08).
     Tasarımın kuralı tek satırda yazılı (`v3.dc.html:3968`) ve iki hâli birden tanımlıyor:
       boş  → `bg:#fff · bd:#d9a97f · fg:#b05c2e`
       dolu → `bg:#f2f7e8 · bd:#c3d3a4 · fg:#46601f`
     Yani DOLGU BİR TAMAMLANDI İŞARETİDİR: alan doldukça yeşile boyanır, boş alan dolgusuz kalır.
     Bizde tersiydi — boş alan şeftaliye boyanıyor, dolan alan nötr kalıyordu; gösterge tersine
     çalışıyor, ekranda renkli olan şey "yapılmamış" oluyordu. Eski künye bunu bilinçli sanmıştı
     ("dolgulu kutu engel gibi okunur"); gerekçe kendi içinde tutarlıydı ama tasarımın anlamını
     ters çeviriyordu. Kenar artık `warning-line` (#d9a97f — tasarımın kenarıyla BİREBİR). */
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
  /* ADET KUTUSU — `OperationsQtyField`in çerçevesiyle AYNI ölçüde ama girdi değil DÜĞME: tuş
     takımını açar. Ölçüler "say →" kutusuyla da aynı kaynaktan; üçü de aynı yerde durmalı ki
     satır sayıldığında sağ kenar zıplamasın. */
  qtyBox: {
    width: operationsTheme.size.avatarLg + operationsTheme.space['2xl'],
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  qtyValue: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.step,
    color: operationsTheme.colors.ink,
    lineHeight: operationsTheme.text.step,
  },
  qtyValueMuted: { color: operationsTheme.colors.muted },
  qtyValueDiff: { color: operationsTheme.colors.terracotta },
  qtyCaption: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text['badge-sm'],
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text['badge-sm']),
    color: operationsTheme.colors['tab-inactive'],
  },
  /* Yapışkan çubuğun dipnotu — kısmi kaydın ne YAPACAĞINI söyler, ortalanmış ve en sessiz ton.
     Düğmenin etiketine sığmayan tek şey sonucudur: kalan satırlar açık kalır. */
  stickyNote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['tab-inactive'],
    textAlign: 'center',
  },
  /* ── ÖĞRENİLEN KOD KARTI ve SATIRIN OKUTMA KUTUSU — ikisi de ZEYTİN ailesinden (v3:05).
     Ton bilinçli: ikisi de bir DOĞRULAMA anlatıyor ("kod artık tanınıyor", "kutunun üstündeki kod
     ile kayıt eşleşti"), bir uyarı değil. Terracotta olsaydı depocu bir sorun sanırdı. */
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
  /* KAPALI SATIRIN "say →" DÜĞMESİ — kesikli, çünkü bir kayıt değil bir DAVET: burada henüz
     sayılmış bir şey yok. Dolu bir düğme, satırı sayılmış gibi gösterirdi. */
  /*
    "say →" KUTUSU, ADET KUTUSUNUN TA KENDİ ÖLÇÜSÜNDE (v3:05 · kullanıcı bulgusu 30.08).

    Tasarım ikisini AYNI kutuya çiziyor (`min-width:74; height:52; border-radius:15`) ve fark
    yalnız çerçevede: sayılmamışta KESİKLİ + beyaz, sayılmışta düz + tonlu. Sebebi ölçülünce
    görünüyor — satır sayıldığında kutu YERİNDE KALIR, yalnız içi değişir.

    Bizdeki hâl 120×46'lık bir haptı: "say →"ye basıldığı anda kutu daralıp uzuyor ve satırın
    sağ kenarı zıplıyordu. Ölçüler artık `OperationsQtyField`in `md` kutusuyla aynı kaynaktan
    (`avatarLg + space['2xl']` = 70 · `controlLg` = 52) — ikisi ayrı yazılsaydı biri bir gün
    ötekinden kayardı ve zıplama sessizce geri gelirdi.
  */
  countCta: {
    width: operationsTheme.size.avatarLg + operationsTheme.space['2xl'],
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    // Ölçülen #c4bda9 → `sand-500` (#cdc4a8, Δ9/7/1). Bir kanalda eşiğin 1 üstünde; kesikli bir
    // çerçevede o fark görülemiyor ve yeni bir kum durağı açmak paleti sebepsiz büyütürdü.
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  countCtaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  /*
    KAPALI SATIRIN İKİ ROZETİ (v3:05) — dolgulu, çerçevesiz, `tight` yarıçapta.

    Bizdeki hâl çerçeveli/zeminsizdi ve ikisi de aynı griydi; tasarım ikisini AYRI ailelere
    koyuyor çünkü ayrı şeyler söylüyorlar: SKT bir ZORUNLULUK (terracotta — dikkat), lot bir
    DURUM (nötr krem — bilgi). Aynı tonda çizmek, depocuya ikisini aynı ağırlıkta okutuyordu.
  */
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
  /* SEBEP DÜĞMESİ — sayacın sağındaki boş alan (kullanıcı kararı 30.08). Boşken kum çerçeveli
     ve sessiz; sebep seçilince hasar ailesine geçer (kenar + metin), çünkü artık bir beyan var. */
  /* LOT ALANI + TEMİZLE (kullanıcı kararı 30.08): kutu esner, temizle içeriği kadar yer kaplar
     ve YALNIZ dolu kutuda çizilir — boş kutunun yanında "temizle" bir şey vaat edip yapmazdı. */
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
  /* Görselin ölçüsü satırın iki metnini taşıyan yükseklik: daha büyüğü satırı bir KARTA çevirir
     ve liste taranabilir olmaktan çıkar. Kare kırpma — ürün fotoğrafları 3:2 yükleniyor ve
     kareye ortadan oturuyor (`Komponent Envanteri` oran künyesi). */
  searchThumb: {
    width: operationsTheme.size.thumb,
    height: operationsTheme.size.thumb,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors['sand-50'],
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
