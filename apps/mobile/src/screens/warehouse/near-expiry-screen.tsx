import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsKeypadPanel } from '@/components/operations/keypad-panel';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStepperGroup } from '@/components/operations/stepper-group';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import type { NearExpiryBatchContract } from '@lezzet/types';

import { productLabel } from './warehouse-format';
import { urgencyOf, useNearExpiry } from './use-near-expiry.hook';

/*
  D3 · YAKIN-SKT TURU (v2:403-424) — bölümün TEK salt-okunur ekranı.

  ── EKRANDA HİÇBİR İŞARETLEME YOK, VE BU TASARIMIN KARARI ───────────────────
  v2 birebir: *"Karar sistemce türetilir — bu liste fiziksel ayıklama rehberidir; işaretleme yok."*
  Depocu burada bir şey seçmez, onaylamaz, indirim oranı girmez (o yönetimde onaylanır). Tek eylem
  tasarımın çizdiği geçiştir: *"'İmha edilmeli' → Sayım/Düzeltme"* ve o geçiş partiyi D4'e TAŞIR —
  D4'ün "hangi parti" sorusunun bugünkü tek cevabı bu.

  ── LİSTE ARTIK GERÇEK (21.187 · fikstür söküldü) ───────────────────────────
  Künye buraya *"kapısı yok, ekranın kendisi TAM yazıldı — o gün yalnız veri kaynağı değişir"*
  diye yazılmıştı. O gün geldi: uç açıldı (`/api/v1/warehouse/near-expiry`), fikstür söküldü,
  ekranın yapısına dokunulmadı. Değişen tek şey satırların nereden geldiği.

  ── KAPININ DİLİ EKRANIN DİLİDİR ────────────────────────────────────────────
  Karar adları motorun (`none · can_offer · offer_open · must_discard`); ekran kendi eş anlamlısını
  (`offer_candidate`, `discard`) TAŞIMIYOR. İkinci bir adlandırma, aynı kavramı iki dilde yaşatmak
  ve bir gün birini çevirmeyi unutmaktı (CLAUDE §1).
*/

const t = warehouseCopy;

export function NearExpiryScreen() {
  const router = useRouter();
  const nearExpiry = useNearExpiry();
  /** Çekmecenin konusu — `null` = kapalı. Adet ayrı tutuluyor: depocu kısmi imha yazabilir. */
  const [discardTarget, setDiscardTargetState] = useState<NearExpiryBatchContract | null>(null);
  const [discardQty, setDiscardQty] = useState(0);
  /** Çekmecenin adımı: sayaç · tuş takımı. Her açılış sayaçla başlar. */
  const [discardStep, setDiscardStep] = useState<'form' | 'keypad'>('form');
  /* Çekmece açılırken adet partinin TAMAMI ile başlar: imha edilen mal çoğunlukla partinin
     hepsidir ve depocuya sayı yazdırmak, bildiği bir şeyi tekrarlatmak olurdu. Azaltabilir. */
  const setDiscardTarget = (batch: NearExpiryBatchContract | null) => {
    setDiscardTargetState(batch);
    setDiscardQty(batch?.qty ?? 0);
    setDiscardStep('form');
  };

  /* Partiyi D4'e taşıyan tek yol — hem satırdaki bağ hem alttaki düğme buradan geçiyor.
     İki ayrı çağrı yazsaydık biri bir gün ötekinden başka parametre gönderirdi. */
  return (
    <View style={styles.screen} testID="warehouse-near-expiry">
      <OperationsStackHeader
        title={t.nearExpiry.title}
        subtitle={t.nearExpiry.caption}
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="warehouse-near-expiry-header"
      />

      {/*
        ÜÇ HÂL, ÜÇ CEVAP (skeleton yapısı 31.08).

        Ekran bugüne kadar yalnız DOLU listeyi çiziyordu: fikstürle çalışırken veri her zaman
        oradaydı ve yükleme diye bir an yoktu. Gerçek kapıya bağlanınca üç hâl birden doğdu ve
        üçü de ayrı şey söylüyor — okunuyor · okunamadı · okundu ve boş.
      */}
      {nearExpiry.status === 'loading' ? (
        /* İLK YÜK SKELETON, HALKA DEĞİL (hub ve mal kabulle aynı karar): halka yerleşim tutmaz ve
           söndüğü an sayfa zıplar. Ölçü satırın KENDİ yüksekliği — künye + rejim satırı + çubuk. */
        <View style={styles.block}>
          <OperationsSkeletonList
            heights={[ROW_SKELETON_HEIGHT, ROW_SKELETON_HEIGHT, ROW_SKELETON_HEIGHT]}
            label={t.nearExpiry.loading}
            testID="warehouse-near-expiry-loading"
          />
        </View>
      ) : nearExpiry.status === 'error' ? (
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="error"
            title={t.nearExpiry.error.title}
            description={t.nearExpiry.error.body}
            retry={{ label: t.common.retry, onPress: nearExpiry.reload }}
            testID="warehouse-near-expiry-error"
          />
        </View>
      ) : nearExpiry.batches.length === 0 ? (
        /* BOŞ LİSTE BİR ARIZA DEĞİL, İYİ HABER: bu depoda bugün karar bekleyen parti yok. Hata
           bloğuyla aynı görünmemeli — "okunamadı" ile "okundu ve boş" iki ayrı cevaptır. */
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.nearExpiry.empty.title}
            description={t.nearExpiry.empty.body}
            testID="warehouse-near-expiry-empty"
          />
        </View>
      ) : (
      <ScrollView contentContainerStyle={styles.list} testID="warehouse-near-expiry-list">
        {/* REJİM KURALI EN ÜSTTE (tasarım 31.08) — listeyi okumadan önce okunacak tek cümle.
            Bu blok olmadan ekran doğru kararı gösteriyor ama SEBEBİNİ söylemiyordu: "geçti" yazan
            her satır imhalık sanılıyordu ve depocu satılabilir malı çöpe atabilirdi. */}
        <View style={styles.rule} testID="warehouse-near-expiry-rule">
          <Text style={styles.ruleTitle}>{t.nearExpiry.regimeRule.title}</Text>
          <Text style={styles.ruleBody}>{t.nearExpiry.regimeRule.body}</Text>
        </View>
        {nearExpiry.batches.map((batch) => {
          /* Aciliyet ve künye SATIRDA türetiliyor (hook'un künyesi): kapı günü sayı olarak veriyor,
             rengin eşiği ve "2 gün" cümlesi ekranın kararı. */
          const urgency = urgencyOf(batch.daysLeft);
          // Künye PARTİ NUMARASIYLA (03.09): her partide var; lot boşsa satır boş kalmaz.
          const code = batch.batchNo;
          /* Bu parti imha edildi mi — referans hook'ta duruyor (liste yeniden okunmuyor). */
          const discardRef = nearExpiry.discarded[batch.stockId];
          const done = discardRef !== undefined;
          const regime = regimeOf(batch);
          return (
          /* SATIR BİR KARTTIR VE TONU KARARINI SÖYLER (v3:07 · düzeltme 30.08). Önce kesik çizgiyle
             ayrılmış düz satırlardı; tasarım her partiyi kendi zeminine oturtuyor ve karar renkten
             de okunuyor: imhalık KIRMIZI zeminli, kararı olmayan KESİKLİ ve sessiz, ötekiler sakin
             krem. Depocu listeyi okumadan önce ayıklıyor — kart bunu mümkün kılan şey. */
          <View
            key={batch.stockId}
            style={[styles.row, done ? styles.row_done : styles[`row_${batch.decision}`]]}
            testID={`warehouse-near-expiry-${code}`}
          >
            <View style={styles.rowHead}>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{productLabel(batch.productName, batch.variantLabel)}</Text>
                {/* KÜNYE RAFI DA SÖYLER (tasarım 31.08): depocu malı rafta arayacak. Alan
                    atanmamışsa yazılmaz — uydurma bir raf adı, olmayan bir rafa gönderirdi. */}
                <Text style={[styles.rowSub, styles[`urgency_${urgency}`]]}>
                  {fillCopy(t.nearExpiry.row, { qty: String(batch.qty), days: daysLabelOf(batch.daysLeft) })}
                  {batch.shelfLabel === null ? '' : ` · raf ${batch.shelfLabel}`}
                </Text>
              </View>
              {/*
                ROZET YALNIZ İMHA HÂLLERİNDE (kullanıcı kararı 31.08 — D3 SAF DEPOCU EKRANI).

                Ekran iki kitleye birden konuşuyordu: fiziksel tura çıkan depocu ve fiyat kararı
                veren yönetici. Teklif rozetleri ("teklif açık", "teklife girebilir") depocuya HİÇ
                iş vermiyor — teklif kararı günde bir kez ve toplu, yönetimin Y3 ekranında veriliyor
                (`management/offer-approval-screen`). Bir ekranın kime konuştuğu belirsizse ikisine
                de yarım hizmet eder.

                Kalan tek rozet imhanın kendisi: depocunun bu ekrandaki tek eylemi.
              */}
              {!done && batch.decision !== 'must_discard' ? null : (
                <Text
                  style={[styles.decision, done ? styles.decision_done : styles.decision_must_discard]}
                  testID={`warehouse-near-expiry-${code}-verdict`}
                >
                  {done ? t.nearExpiry.discard.done : t.nearExpiry.decision.must_discard}
                </Text>
              )}
            </View>

            {/* TARİH REJİMİ VE SONUCU (tasarım 31.08) — kararın SEBEBİ. "6 gün geçti" tek başına
                imhalık mı satılabilir mi söylemiyordu; rejim onu söylüyor. */}
            <View style={styles.regimeRow}>
              <Text style={[styles.regimeTag, styles[`regime_${regime}`]]} testID={`warehouse-near-expiry-${code}-regime`}>
                {t.nearExpiry.regime[regime]}
              </Text>
              <Text style={styles.regimeNote}>{t.nearExpiry.regimeNote[regime]}</Text>
              <Text style={[styles.outcome, outcomeToneOf(batch)]}>{outcomeOf(batch)}</Text>
            </View>

            {/*
              İMHA EYLEMİ ARTIK BU EKRANDA (tasarım 31.08 · akış kuralı 2: *"eylem, kararın doğduğu
              ekranda durur"*).

              Eskiden satır depocuyu D4'e (sayım/düzeltme) gönderiyor, orada sebebi ELLE "süresi
              geçti" diye seçtiriyordu — sistemin zaten bildiği şeyi yeniden sormak. Düğme yalnız
              imhalık ve henüz imha edilmemiş satırda çizilir.
            */}
            {batch.decision !== 'must_discard' || done ? null : (
              <PressableSurface
                onPress={() => setDiscardTarget(batch)}
                feedback="scale"
                style={styles.discardCta}
                accessibilityLabel={fillCopy(t.nearExpiry.discard.cta, { n: String(batch.qty) })}
                testID={`warehouse-near-expiry-${code}-discard`}
              >
                <Text style={styles.discardCtaLabel}>
                  {fillCopy(t.nearExpiry.discard.cta, { n: String(batch.qty) })}
                </Text>
              </PressableSurface>
            )}

            {/* OLAY REFERANSI SATIRDA KALIR: depocu ne yazdığını görüyor ve tur devam ediyor —
                ekran kapanmıyor (tasarım: *"satır 'imha edildi'ye döner · aynı ekranda kalır"*). */}
            {!done ? null : (
              <Text style={styles.discardRef} testID={`warehouse-near-expiry-${code}-ref`}>
                {discardRef}
              </Text>
            )}
          </View>
          );
        })}

        <Text style={styles.footnote}>{t.nearExpiry.footnote}</Text>

        {nearExpiry.discardError === null ? null : (
          <Text style={styles.discardError} accessibilityRole="alert" testID="warehouse-near-expiry-discard-error">
            {nearExpiry.discardError}
          </Text>
        )}
      </ScrollView>
      )}

      {/*
        İMHA ÇEKMECESİ (tasarım `00-ortak`) — SEBEP SORULMAZ, yalnız adet.

        Tarih geçmişse sebep bellidir; sormak, sistemin bildiği bir şeyi depocuya yeniden
        yazdırmaktır (akış kuralı 3). Bağlam iki sayı: partide kalan ve ürünün depodaki toplamı —
        depocu 12 adeti imha ederken depoda 200 adet daha olduğunu bilmeli.
      */}
      <BottomSheet
        visible={discardTarget !== null}
        title={
          discardTarget === null
            ? ''
            : fillCopy(t.nearExpiry.discard.title, {
                name: productLabel(discardTarget.productName, discardTarget.variantLabel),
              })
        }
        onClose={() => setDiscardTarget(null)}
        testID="warehouse-near-expiry-discard-sheet"
      >
        {discardTarget === null ? null : (
          <View style={styles.sheetBody}>
            <Text style={styles.sheetCaption}>
              {fillCopy(t.nearExpiry.discard.caption, {
                code: discardTarget.batchNo,
                shelf: discardTarget.shelfLabel ?? t.nearExpiry.discard.noShelf,
                regime: t.nearExpiry.regime[regimeOf(discardTarget)],
                date: daysLabelOf(discardTarget.daysLeft),
              })}
            </Text>
            <Text style={styles.sheetReason}>{t.nearExpiry.discard.reasonFixed}</Text>

            {/* ± SAYACI, metin alanı DEĞİL (tasarım): depocu partinin tamamını imha ediyor ve
                azaltıyorsa bir iki adet azaltıyor. Üst sınır partinin kendisi (`max`): olmayan
                malı düşürmek fiziksel gerçeğin ihlalidir. Ortadaki rakam TUŞ TAKIMI adımını açar
                (kullanıcı kararı 02.09): bu sayaç zaten bir çekmecenin içinde ve çekmece çekmece
                açamaz (`bottom-sheet` künyesi, 21.121) — tuş takımı aynı çekmecenin adımı olur. */}
            {discardStep === 'keypad' ? (
              <>
                <OperationsKeypadPanel
                  value={String(discardQty)}
                  unit={t.common.keypad.unit}
                  allowDecimals={false}
                  max={discardTarget.qty}
                  hint={t.nearExpiry.discard.qtyHeading}
                  deleteLabel={t.common.keypad.delete}
                  onChange={(text) => setDiscardQty(text.length === 0 ? 0 : Number.parseInt(text, 10))}
                  testID="warehouse-near-expiry-discard-keypad"
                />
                <PrimaryButton
                  label={t.common.keypad.back}
                  tone="ink"
                  elevation="flat"
                  onPress={() => setDiscardStep('form')}
                  testID="warehouse-near-expiry-discard-keypad-back"
                />
              </>
            ) : (
              <OperationsStepperGroup
                value={discardQty}
                onChange={setDiscardQty}
                min={0}
                max={discardTarget.qty}
                label={t.nearExpiry.discard.qtyHeading}
                tone="error"
                onPressValue={() => setDiscardStep('keypad')}
                valueHint={t.common.keypadHint}
                testID="warehouse-near-expiry-discard-qty"
              />
            )}
            <Text style={styles.sheetContext}>
              {fillCopy(t.nearExpiry.discard.context, {
                left: String(discardTarget.qty),
                stock: String(discardTarget.productStockQty),
              })}
            </Text>

            <PrimaryButton
              label={fillCopy(t.nearExpiry.discard.confirm, { n: String(discardQty) })}
              tone="error"
              elevation="flat"
              disabled={nearExpiry.discarding || discardQty <= 0}
              onPress={() => {
                nearExpiry.discard(discardTarget.stockId, discardQty);
                setDiscardTarget(null);
              }}
              testID="warehouse-near-expiry-discard-confirm"
            />
            <Text style={styles.sheetFootnote}>{t.nearExpiry.discard.footnote}</Text>
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

/**
 * Ömür çubuğunun rengi — aciliyetten türer, karardan DEĞİL.
 *
 * İkisi ayrı şeydir: "karar" sistemin türettiği eylem (teklif · imha), "aciliyet" ise partinin
 * kaç günü kaldığıdır. Çubuk zamanı çiziyor, o yüzden zamanın rengini taşıyor; kararın rengi zaten
 * rozettedir ve ikisi aynı olsaydı satırda iki kez aynı şey söylenirdi.
 */
/**
 * Kalan günün CÜMLESİ — sayı kapıdan gelir, cümle burada kurulur (hook künyesi).
 *
 * ÜÇ HÂL ve üçü de ayrı şey söyler: geçmiş parti "geçti" der ve sayısı POZİTİF yazılır (depocu
 * "kaç gün geçmiş" diye sorar, eksi işaretini okumaz); bugün son günü olan partide sayı hiç
 * yazılmaz, çünkü "0 gün" bir süre değil bir sınırdır.
 */
function daysLabelOf(daysLeft: number): string {
  if (daysLeft < 0) return fillCopy(t.nearExpiry.daysPast, { n: String(Math.abs(daysLeft)) });
  if (daysLeft === 0) return t.nearExpiry.daysToday;
  return fillCopy(t.nearExpiry.daysLeft, { n: String(daysLeft) });
}

/**
 * Partinin tarih rejimi — sözlük anahtarı.
 *
 * Raf ömrü BİLİNMİYORSA rejim de anlamsızdır (`ÖMÜR YOK`): eşik uygulanamıyor demektir, ürünün
 * DLC mi DDM mi olduğu o partide bir sonuç doğurmuyor.
 */
function regimeOf(batch: NearExpiryBatchContract): 'DLC' | 'DDM' | 'none' {
  return batch.remainingPercent === null ? 'none' : batch.dateType;
}

/**
 * Satırın SONUÇ cümlesi — tarih geçmemişse kalan gün, geçmişse rejimin sonucu.
 *
 * "geçti" tek başına bir şey söylemiyordu: DLC geçmiş mal satılamaz, DDM geçmiş mal satılabilir ve
 * ikisi aynı ekranda yan yana duruyor (tasarım 31.08).
 */
function outcomeOf(batch: NearExpiryBatchContract): string {
  if (batch.daysLeft >= 0) return fillCopy(t.nearExpiry.outcome.left, { n: String(batch.daysLeft) });
  return batch.dateType === 'DLC' ? t.nearExpiry.outcome.expiredBlocked : t.nearExpiry.outcome.expiredSellable;
}

/** Sonucun rengi: satılamaz KIRMIZI, satılabilir ZEYTİN, henüz geçmemiş sessiz. */
function outcomeToneOf(batch: NearExpiryBatchContract): { color: string } {
  if (batch.daysLeft >= 0) return { color: operationsTheme.colors.muted };
  return { color: batch.dateType === 'DLC' ? operationsTheme.colors.error : operationsTheme.colors['olive-dark'] };
}


/**
 * Satırın yükleme yer tutucusu (px) — kartın KENDİ yüksekliği: künye iki satır + rejim şeridi +
 * dolgular. Ömür çubuğu kalktığı için ölçü de düştü (31.08).
 */
const ROW_SKELETON_HEIGHT = 96;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space['8xl'],
    /* KARTLAR ARASI BOŞLUK (kullanıcı bulgusu 31.08): satır v3'te KART oldu ama liste hâlâ eski
       düzenin aralıksız kabıydı — kartlar bitişik çiziliyor, ayrı kutular olduğu okunmuyordu.
       Kart bir yüzeydir; yüzeyi yüzeyden ayıran şey aradaki boşluktur. */
    gap: operationsTheme.space.lg,
  },
  /* Satır artık iki katman: künye+karar üstte, ömür çubuğu altta (v3:836). Yön DİKEY oldu —
     çubuk künyenin yanına sıkışsaydı ne çubuk okunurdu ne ad. */
  row: {
    gap: operationsTheme.space.md,
    padding: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.card,
    backgroundColor: operationsTheme.colors.panel,
  },
  // Teklifi açık ve teklife girebilir partiler SAKİN krem kalır — kararları zaten rozette yazılı.
  row_offer_open: {},
  row_can_offer: {},
  /* İMHALIK KIRMIZI ZEMİNLİ: listedeki tek "şimdi bir şey yap" satırı odur ve göz onu kartın
     rengiyle bulur, rozeti okumadan. */
  row_must_discard: {
    borderColor: operationsTheme.colors['error-line'],
    backgroundColor: operationsTheme.colors['error-bg'],
  },
  /* KARARI OLMAYAN KESİKLİ VE SESSİZ: eşik uygulanamadığı için burada bir iş YOK; dolu bir kart
     onu ötekilerle aynı ağırlıkta gösterirdi. */
  row_none: {
    borderStyle: 'dashed',
    // Zemin SAYFANIN kendi kremi: kart "yok gibi" görünsün diye — şeffaf yazmak yerine sayfanın
    // rengini vermek, panelin altındaki gölge/kenar hesabını da doğru bırakır.
    backgroundColor: operationsTheme.colors.cream,
  },
  /* İMHA EDİLMİŞ SATIR SÖNER: iş bitti, listede duruyor çünkü depocu ne yaptığını görmeli — ama
     artık eyleme çağırmıyor. */
  row_done: {
    backgroundColor: operationsTheme.colors.cream,
    borderColor: operationsTheme.colors['neutral-bg'],
  },
  /** Üç hâlin ortak kabı — liste dolgusuyla aynı hizada dursun diye (hub emsali). */
  block: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.lg,
  },
  /* REJİM KURALI — listenin üstündeki tek cümle; kart değil, bilgi şeridi. */
  rule: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
    borderRadius: operationsTheme.radius.control,
    padding: operationsTheme.space.xl,
    gap: operationsTheme.space['2xs'],
  },
  ruleTitle: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors['tab-inactive'],
  },
  ruleBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  /* REJİM SATIRI: etiket + açıklaması solda, sonuç sağda. */
  regimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
  },
  regimeTag: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.micro,
    letterSpacing: 1,
    borderRadius: operationsTheme.radius.badge,
    paddingHorizontal: operationsTheme.space.md,
    paddingVertical: operationsTheme.space['2xs'],
    overflow: 'hidden',
  },
  /* DLC uyarı tonunda (satılamaz sonucu doğurabilir), DDM sakin zeytin, ölçülemeyen nötr. */
  regime_DLC: {
    backgroundColor: operationsTheme.colors['error-bg'],
    color: operationsTheme.colors.error,
  },
  regime_DDM: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    color: operationsTheme.colors['olive-dark'],
  },
  regime_none: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
    color: operationsTheme.colors.muted,
  },
  regimeNote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors['tab-inactive'],
  },
  outcome: {
    flex: 1,
    textAlign: 'right',
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['body-sm'],
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
  },
  /** Ömür ölçülemediğinde çubuk YOK — eşiğin neden uygulanmadığı yazılır (CLAUDE §1). */
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
  },
  urgency_expired: { color: operationsTheme.colors.error },
  urgency_soon: { color: operationsTheme.colors.terracotta },
  urgency_calm: { color: operationsTheme.colors.muted },
  decision: {
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
  decision_offer_open: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    color: operationsTheme.colors['olive-dark'],
  },
  decision_can_offer: {
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    color: operationsTheme.colors.terracotta,
  },
  decision_must_discard: {
    backgroundColor: operationsTheme.colors['error-bg'],
    color: operationsTheme.colors.error,
  },
  /* "İndirimli satılır" — DDM'si geçmiş ama satılabilir mal. Zeytin ve SESSİZ: bir haber, bir iş
     değil. */
  decision_sellable: {
    backgroundColor: 'transparent',
    color: operationsTheme.colors['olive-dark'],
  },
  decision_done: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
    color: operationsTheme.colors.muted,
  },
  /** "Karar yok" nötr durur — bilinmeyen bir ömür, kötü bir haber değildir (CLAUDE §1). */
  decision_none: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
    color: operationsTheme.colors.muted,
  },
  /* İMHA DÜĞMESİ: tasarımın tek dolu kırmızı yüzeyi — geri alınamayan kaydın imzası. */
  discardCta: {
    height: operationsTheme.size.controlLg,
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardCtaLabel: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors['on-image'],
  },
  discardRef: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  discardError: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.error,
    paddingBottom: operationsTheme.space.xl,
  },
  sheetBody: { gap: operationsTheme.space.lg },
  sheetCaption: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  sheetReason: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors['tab-inactive'],
  },
  sheetHeading: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.micro,
    letterSpacing: 1,
    color: operationsTheme.colors['tab-inactive'],
  },
  sheetContext: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  sheetFootnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors['tab-inactive'],
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingVertical: operationsTheme.space.xl,
  },
  toAdjustment: {
    alignItems: 'center',
    paddingVertical: operationsTheme.space.xl,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
  },
  toAdjustmentLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
});
