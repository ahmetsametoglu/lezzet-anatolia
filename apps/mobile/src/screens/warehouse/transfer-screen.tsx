import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { toastInfo } from '@/lib/toast/toast-store';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsQuantitySheet } from '@/components/operations/quantity-sheet';
import { quantityTotal } from '@/components/operations/quantity-value';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsStepperGroup } from '@/components/operations/stepper-group';
import { OperationsSurface } from '@/components/operations/surface';
import { FormScroll } from '@/components/ui/form-scroll';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { TextAction } from '@/components/ui/text-action';
import { captionOf } from '@/lib/operations/caption';
import { fillCopy } from '@/screens/operations/copy';
import { useOperationsWorkplace } from '@/screens/operations/sections-context';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { qtySheetCopy, warehouseCopy } from './copy';
import { useTransfer } from './use-transfer.hook';
import { shortDate } from './warehouse-format';
import { useWarehouseStatus } from './warehouse-status';

/*
  D5 · TRANSFER — RAMPADA SAYIM (v2:458-480).

  Ekranın tek kuralı satır adedinin ÜÇ hâlidir: boş (sayılmadı) · 0 (geldi ama kayıp) · N. Boş satır
  kabulü BLOKLAR ve bu bir ekran nezaketi değil, kapının da kuralı — gerekçe hook künyesinde.

  ── TASARIMDA OLMAYAN ADIM: TRANSFER SEÇİMİ ─────────────────────────────────
  D1 ile aynı gerekçe: v2 tek transferi çiziyor, gerçekte aynı anda birden çok sevkiyat yolda
  olabilir ve hangisinin sayıldığı bir tercih değil, KAYDIN kimliğidir. Tek transfer varsa doğrudan
  sayım açılır (tasarımın hâli).

  ── ÇEVRİMDIŞI KİLİDİ (v2:290) ──────────────────────────────────────────────
  Bağlantı yokken kabul kapalıdır. Rampada sayılmış ama yazılamamış bir transfer, iki depoda birden
  görünmeyen mal demektir; yerel kuyruk o riski gizler, çözmez.
*/

const t = warehouseCopy;

/**
 * İlk yükün yer tutucu panel yüksekliği (dp) — `skeleton-list.tsx` künyesinde bu ekran için
 * ölçülen değer ("transfer paneli 140"). İki kutu: gelen ve giden transfer blokları.
 */
const PANEL_SKELETON_HEIGHT = 140;

/**
 * Kartta gösterilen kalem sayısı (v3:1106'nın üç satırı). Kart bir LİSTE DEĞİL, "içeride ne var"
 * cümlesidir — dördüncü satır kartı listeye çevirir ve kuyruğun kendisi ekrandan taşar. Kırpılan
 * kalem sayısı ayrıca yazılır: sessiz kırpma, eksik bir kabule hazırlanmak olurdu.
 */
const PREVIEW_LINES = 3;

export function TransferScreen() {
  const router = useRouter();
  const transferState = useTransfer();
  /** Adet çekmecesi açık olan satır — `null` = kapalı. Sayacın ortasındaki rakamdan açılır. */
  const [qtyLineId, setQtyLineId] = useState<string | null>(null);

  /*
    BİLDİRİM KANALI TOAST (kullanıcı kararı 01.09) — ekrana yapıştırılan satır KALKTI.

    Uygulamanın tek bir bildirim dili var (`ToastHost`, kökte); depo ekranlarının her biri kendi
    satırını çiziyordu, yani aynı iş ekran sayısı kadar görsel dille. `toastInfo` SESSİZ ve bu
    bilinçli: titreşimi `useNotice` tonuna göre zaten yazma anında veriyor — `toastSuccess`/
    `toastError` seçilseydi her bildirim iki kez titrerdi.
  */
  useEffect(() => {
    if (transferState.notice !== null) toastInfo(transferState.notice.text);
  }, [transferState.notice]);

  const { offline } = useWarehouseStatus();
  const workplace = useOperationsWorkplace();

  const transfer = transferState.transfer;
  const header = (
    <OperationsStackHeader
      title={t.transfer.title}
      /* KÜNYE: SEVKİYATIN REFERANSI + KABUL EDEN TESİS (v3:11 · 30.08).
         Şablon satırlarda "Paris Depo → Strasbourg Merkez" yazıyor; SAĞ yarısı bu deponun adıdır
         ve rampada duran kişinin doğrulaması gereken şeydir ("bu sevkiyatı benim depom mu
         alıyor"). SOL yarı — kaynak deponun adı — bu sözleşmede henüz yok (`InboundTransferSchema`
         yalnız `fromWarehouseId` taşıyor) ve uydurulmuyor; okla birlikte yarım bir cümle yazmak,
         olmayan bir bilgiyi varmış gibi göstermekti.
         Kuyruk yine şartlı: tesis adı gelmiyorsa künye yalnız referanstır. */
      subtitle={captionOf(
        transfer === null ? undefined : fillCopy(t.transfer.caption, { ref: transfer.referenceNo }),
        workplace,
      )}
      onBack={() =>
        transfer !== null && transferState.transfers.length > 1 ? transferState.select(null) : router.back()
      }
      backLabel={t.common.back}
      testID="warehouse-transfer-header"
    />
  );

  if (transferState.status === 'loading') {
    return (
      <View style={styles.screen} testID="warehouse-transfer">
        {header}
        {/* İLK YÜK SKELETON (kullanıcı kararı 30.08): halka yerleşim tutmaz, söndüğü an sayfa
            zıplar. Transfer paneli 140 — `skeleton-list.tsx` künyesinde bu ekran için ölçülen
            değer; kutu, yerini tuttuğu panelin boyunda olmalı. */}
        <View style={styles.loading}>
          <OperationsSkeletonList
            heights={[PANEL_SKELETON_HEIGHT, PANEL_SKELETON_HEIGHT]}
            label={t.transfer.loading}
            testID="warehouse-transfer-loading"
          />
        </View>
      </View>
    );
  }

  if (transferState.status === 'error') {
    return (
      <View style={styles.screen} testID="warehouse-transfer">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="error"
            title={t.transfer.error.title}
            description={t.transfer.error.body}
            retry={{ label: t.common.retry, onPress: transferState.reload }}
            testID="warehouse-transfer-error"
          />
        </View>
      </View>
    );
  }

  /*
    BOŞ HÂL ÜÇ BÖLÜMÜN ÜÇÜNE BİRDEN BAKAR (v3:11 · 30.08).

    Eskiden yalnız GELEN kuyruğuna bakıyordu ve şablonun öteki iki bölümü henüz yoktu. Şimdi
    "kabul bekleyen yok" cümlesi, bu depodan çıkmış bir sevkiyat yoldayken ya da bu sabah bir
    kabul kapanmışken YANLIŞ olurdu: ekran boş derken üç satır veri elinde dururdu.
  */
  const bosEkran =
    transferState.transfers.length === 0 && transferState.outbound.length === 0 && transferState.closed.length === 0;
  if (bosEkran) {
    return (
      <View style={styles.screen} testID="warehouse-transfer">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.transfer.empty.title}
            description={t.transfer.empty.body}
            testID="warehouse-transfer-empty"
          />
        </View>
      </View>
    );
  }

  if (transfer === null) {
    return (
      <View style={styles.screen} testID="warehouse-transfer">
        {header}
        <ScrollView contentContainerStyle={styles.list} testID="warehouse-transfer-queue">
          {/* GELEN bölümü boşsa BAŞLIĞI DA ÇİZİLMEZ: altında hiçbir satır olmayan bir "KABUL
              BEKLİYOR" başlığı, bir iş varmış gibi okunur. Aynı kural üç bölümde de geçerli. */}
          {transferState.transfers.length === 0 ? null : (
            <Text style={styles.heading}>{t.transfer.queueHeading}</Text>
          )}
          {transferState.transfers.map((row) => (
            <PressableSurface
              key={row.transferId}
              onPress={() => transferState.select(row.transferId)}
              feedback="scale"
              style={styles.queueRow}
              accessibilityLabel={row.referenceNo}
              testID={`warehouse-transfer-row-${row.transferId}`}
            >
              <View style={styles.queueHead}>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{row.referenceNo}</Text>
                  <Text style={styles.rowSub}>
                    {fillCopy(t.transfer.queueLines, {
                      n: String(row.lines.length),
                      date: shortDate(row.dispatchedAt.slice(0, 10)) ?? row.dispatchedAt,
                    })}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>

              {/*
                KALEM ÖNİZLEMESİ (v3:1106) — kart artık ne geldiğini de söylüyor. Depocu rampaya
                inmeden "bu transferde ne var" sorusunu cevaplayabilmeli; referans + kalem SAYISI
                o soruyu cevaplamıyordu.

                İLK ÜÇ: şablonun sayısı. Kart bir liste değil, "içeride ne var" cümlesi — dördüncü
                satır kartı listeye çevirir ve kuyruğun kendisi ekrandan taşardı. Kalan varsa
                söyleniyor: kırpmayı sessizce yapmak, eksik bir kabule hazırlanmak olurdu.
              */}
              <View style={styles.queuePreview}>
                {row.lines.slice(0, PREVIEW_LINES).map((line) => (
                  <View key={line.lineId} style={styles.previewRow}>
                    <Text style={styles.previewName} numberOfLines={1}>
                      {line.name}
                    </Text>
                    <Text style={styles.previewQty}>{line.dispatchedQty}</Text>
                  </View>
                ))}
                {row.lines.length <= PREVIEW_LINES ? null : (
                  <Text style={styles.previewMore}>
                    {fillCopy(t.transfer.queueMore, { n: String(row.lines.length - PREVIEW_LINES) })}
                  </Text>
                )}
              </View>

              <Text style={styles.queueOpen}>{t.transfer.queueOpen}</Text>
            </PressableSurface>
          ))}

          {/*
            YOLDA — BU DEPODAN ÇIKAN (v3:11'in ikinci bölümü · 30.08).

            EYLEMSİZ ve öyle kalmalı: kabul hedef deponundur, buradan yapılabilecek bir şey yok.
            Bölüm bir hatırlatmadır — "unuttuğum bir sevkiyat yolda mı". Satırlar bu yüzden
            basılabilir değil ve kalem ÖNİZLEMESİ de yok: gelen transferin satırları rampada
            sayılacak şeydir, çıkanınki çoktan sayılmıştır.
          */}
          {transferState.outbound.length === 0 ? null : (
            <View style={styles.section} testID="warehouse-transfer-outbound">
              <Text style={styles.heading}>{t.transfer.outboundHeading}</Text>
              {transferState.outbound.map((row) => (
                /* SATIR KART (v3:1127 · cihazda ölçüldü 02.09): bölüm çizgiyle ayrılmış düz
                   satırlar hâlindeydi, oysa şablonun üç bölümünde de KUTU var. Fark görsel
                   değil yapısal — kutu "bu bir kayıt" der, alt çizgi yalnız "burada bir sınır
                   var" der ve üç bölüm tek uzun listeye eriyordu. */
                <OperationsSurface
                  key={row.transferId}
                  tone="panel"
                  padding="md"
                  testID={`warehouse-transfer-outbound-${row.transferId}`}
                >
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{row.referenceNo}</Text>
                    <Text style={styles.rowSub}>
                      {fillCopy(t.transfer.outboundMeta, {
                        n: String(row.lineCount),
                        // Tahmini varış SUNUCUDAN gelen bir GÜN (sevk günü + ulaşım süresi ayarı) —
                        // ekran kendi hesabını kurmuyor ve saat göstermiyor: elimizde olmayan bir
                        // kesinliği ima etmek, taşıyıcıdan gelmemiş bir sözü söylemek olurdu.
                        date: shortDate(row.etaDate) ?? row.etaDate,
                      })}
                    </Text>
                  </View>
                </OperationsSurface>
              ))}
              <Text style={styles.queueFootnote}>{t.transfer.outboundNote}</Text>
            </View>
          )}

          {/*
            SON KAPANANLAR (v3:11'in üçüncü bölümü · 30.08) — iki yön birden.

            Gönderdiğinin kapanışı da alındığınki kadar depocunun işi: eksik kabul edilen bir
            sevkiyatın GÖNDEREN tarafı da farkı görmeli, yoksa "ben 8 yolladım" ile "bize 7 geldi"
            hiçbir ekranda buluşmaz. Yön SUNUCUDAN geliyor (`direction`) — ekran kendi deposunun
            kimliğini bilmez, kimlik jetonda.

            Sabit sınırlı bir PENCERE, sayfalanan bir liste değil (uç künyesi): geçmişin tamamı
            masaüstündeki Depolar ekranının işi.
          */}
          {transferState.closed.length === 0 ? null : (
            <View style={styles.section} testID="warehouse-transfer-closed">
              <Text style={styles.heading}>{t.transfer.closedHeading}</Text>
              {transferState.closed.map((row) => (
                /* KAPANMIŞ KAYIT `quiet` TONUNDA (v3:1136): günlük iş DEĞİL, bakılıp geçilen bir
                   kayıt. Gelen kuyruğuyla aynı zeminde durursa "burada bir iş var" der. */
                <OperationsSurface
                  key={row.transferId}
                  tone="quiet"
                  padding="md"
                  testID={`warehouse-transfer-closed-${row.transferId}`}
                >
                  <View style={styles.closedRow}>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{row.referenceNo}</Text>
                      <Text style={styles.rowSub}>
                        {fillCopy(t.transfer.closedMeta, {
                          direction: t.transfer.direction[row.direction],
                          n: String(row.lineCount),
                          date: shortDate(row.closedAt.slice(0, 10)) ?? row.closedAt,
                        })}
                      </Text>
                    </View>
                    {/* SONUÇ SAĞDA ve ÜÇ AYRI CÜMLE: "tam kabul" · "N eksik" · "geri alındı".
                        Geri alınmışta eksik SAYISI YOKTUR (`shortLineCount: null`) ve "0 eksik"
                        yazmak, hiç sayılmamış bir sevkiyatı sorunsuz kabul gibi okuturdu
                        (CLAUDE §1). */}
                    <Text
                      style={[
                        styles.closedResult,
                        // Üç hâl, üç ton — ve iptal "iyi" DEĞİL nötr: geri alınmış bir sevkiyatı
                        // tam kabulle aynı renge boyamak, olmayan bir başarıyı boyamaktır.
                        row.shortLineCount === null
                          ? styles.closedNeutral
                          : row.shortLineCount === 0
                            ? styles.closedOk
                            : styles.closedShort,
                      ]}
                    >
                      {row.shortLineCount === null
                        ? t.transfer.closedCancelled
                        : row.shortLineCount === 0
                          ? t.transfer.closedFull
                          : fillCopy(t.transfer.closedShort, { n: String(row.shortLineCount) })}
                    </Text>
                  </View>
                </OperationsSurface>
              ))}
            </View>
          )}

          <Text style={styles.queueFootnote}>{t.transfer.queueFootnote}</Text>
        </ScrollView>
      </View>
    );
  }

  const cta = offline
    ? { label: t.common.offlineCta, enabled: false }
    : transferState.sending
      ? { label: t.transfer.cta.sending, enabled: false }
      : transferState.counted
        ? { label: t.transfer.cta.ready, enabled: true }
        : { label: t.transfer.cta.pending, enabled: false };

  return (
    <View style={styles.screen} testID="warehouse-transfer">
      {header}

      <FormScroll contentContainerStyle={styles.list} testID="warehouse-transfer-lines">
        {/* KURAL SAYIMDAN ÖNCE (v3:1166) — "SKT ve lot yeniden yazılmaz" bilgisi dipnottaydı,
            yani depocu onu SAYDIKTAN sonra okuyordu. Kural sayımı değiştirmiyor ama beklentiyi
            değiştiriyor: SKT alanı aramaya çıkan biri onu bulamayınca ekranı eksik sanır. */}
        <View style={styles.rule} testID="warehouse-transfer-rule">
          <Text style={styles.ruleText}>{t.transfer.rule}</Text>
        </View>

        <Text style={styles.heading}>{t.transfer.heading}</Text>

        {transfer.lines.map((line) => {
          const counted = transferState.countOf(line.lineId);
          const missing = transferState.missingLineIds.includes(line.lineId);
          return (
            <View key={line.lineId} style={styles.lineRow} testID={`warehouse-transfer-line-${line.lineId}`}>
              <View style={styles.lineHead}>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{line.name}</Text>
                  <Text style={[styles.rowSub, missing ? styles.rowSubMissing : undefined]}>
                    {missing
                      ? t.transfer.missing
                      : fillCopy(t.transfer.dispatched, { qty: String(line.dispatchedQty) })}
                  </Text>
                </View>
                {/* KİTİN TEK ADET DESENİ (02.09) — eskiden çerçeveli bir metin alanıydı. Boş
                    hâl `null`: "—" bir DEĞER değil, bir eksikliktir ve sıfırla karışmaması için
                    soluk durur (v2:468). Ortadaki rakam adet çekmecesini açar. */}
                <OperationsStepperGroup
                  value={counted}
                  onChange={(next) => transferState.setCount(line.lineId, next)}
                  label={fillCopy(t.transfer.qtyLabel, { name: line.name })}
                  onPressValue={() => setQtyLineId(line.lineId)}
                  valueHint={t.common.qtyHint}
                  testID={`warehouse-transfer-qty-${line.lineId}`}
                />
              </View>

              {/*
                "0 · HİÇ GELMEDİ" TEK DOKUNUŞLA (v3:1189) — sıfır bu ekranın en anlamlı ve en zor
                girilen değeri. Klavye açıp "0" yazmak, boş bırakmakla aynı hızda değil; oysa
                ikisi taban tabana zıt beyanlar ("koli geldi, mal yok" ↔ "saymadım"). Kısayol
                sıfırı bir tercih hâline getiriyor, bir zahmet olmaktan çıkarıyor.

                Zaten sıfır yazılmışsa düğme çizilmez: aynı şeyi ikinci kez söyleten bir kontrol,
                basıldığında hiçbir şey olmadığı için bozuk görünür.
              */}
              {counted === 0 ? null : (
                <TextAction
                  label={t.transfer.zero}
                  onPress={() => transferState.setCount(line.lineId, 0)}
                  testID={`warehouse-transfer-zero-${line.lineId}`}
                />
              )}
            </View>
          );
        })}

        <Text style={styles.footnote}>{t.transfer.footnote}</Text>
      </FormScroll>

      {/* ADET ÇEKMECESİ — tek örnek, hangi satıra yazacağını `qtyLineId` söyler. Koli boyları
          ürün kartından (sözleşme 02.09'dan beri taşıyor): rampada mal koli koli sayılır. Çekmece
          toplamı yukarı verir; sıfır da meşru bir beyandır (0 = geldi ama mal yok), o yüzden
          kapatınca hiçbir şey silinmez. */}
      {(() => {
        const qtyLine = transfer.lines.find((line) => line.lineId === qtyLineId) ?? null;
        return qtyLine === null ? null : (
          <OperationsQuantitySheet
            visible
            title={t.transfer.qtySheet.title}
            value={{ cases: [], loose: transferState.countOf(qtyLine.lineId) ?? 0 }}
            caseSizes={qtyLine.caseSizes}
            onChange={(next) => transferState.setCount(qtyLine.lineId, quantityTotal(next))}
            copy={qtySheetCopy({
              ...t.transfer.qtySheet,
              subject: fillCopy(t.transfer.qtySheet.subject, { name: qtyLine.name, qty: String(qtyLine.dispatchedQty) }),
            })}
            onClose={() => setQtyLineId(null)}
            testID="warehouse-transfer-qty-sheet"
          />
        );
      })()}

      <LinearGradient {...operationsTheme.gradient.stickyFade} style={styles.sticky}>
        {/* ÇEVRİMDIŞI SEBEBİ (v3:1206) — bu ekranda sebep ötekilerden farklı ve daha ağır: kabul
            İKİ deponun stokunu aynı anda oynatıyor. Kuyruğa alınabilseydi, kaynak depo malı
            düşmüş, hedef depo henüz almamış olurdu — arada mal hiçbir yerde görünmezdi. */}
        {!offline ? null : (
          <View style={styles.locked} testID="warehouse-transfer-locked">
            <Text style={styles.lockedTitle}>{t.transfer.locked.title}</Text>
            <Text style={styles.lockedBody}>{t.transfer.locked.body}</Text>
          </View>
        )}
        <PressableSurface
          onPress={transferState.submit}
          disabled={!cta.enabled}
          feedback="shadow"
          style={[styles.cta, cta.enabled ? styles.ctaReady : styles.ctaIdle]}
          accessibilityLabel={cta.label}
          testID="warehouse-transfer-cta"
        >
          <Text style={styles.ctaLabel}>{cta.label}</Text>
        </PressableSurface>
      </LinearGradient>
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
  /* Skeleton ORTALANMAZ — paneller yukarıdan başlıyor; ortalanmış kutular veri gelince yukarı
     sıçrar ve halkanın kusuru geri gelirdi. */
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
    gap: operationsTheme.space.lg,
  },
  heading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space.sm,
  },
  /* Satır artık KART (v3:1097): kalem önizlemesi bir çizginin altında künyeye karışırdı. */
  queueRow: {
    gap: operationsTheme.space.lg,
    backgroundColor: operationsTheme.colors.panel,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['2xl'],
  },
  queueHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
  },
  /** Kalem önizlemesi — gömülü blok, kartın "içeride ne var" cümlesi. */
  queuePreview: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
    borderRadius: operationsTheme.radius.control,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.xl,
    gap: operationsTheme.space['2xs'],
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
  },
  previewName: {
    flex: 1,
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.body,
  },
  previewQty: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.ink,
  },
  /** Kırpma SESSİZ DEĞİL: kalan kalem sayısı yazılır — eksik bir kabule hazırlanılmasın. */
  previewMore: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space['2xs'],
  },
  queueOpen: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['olive-dark'],
  },
  /** Okuma bölümü (YOLDA · SON KAPANANLAR) — kuyruktan nefesle ayrılır, çerçeveyle değil. */
  section: { gap: operationsTheme.space.sm, marginTop: operationsTheme.space['2xl'] },
  /* Satır BASILABİLİR DEĞİL: iki bölümde de yapılacak bir iş yok. Kuyruk kartının panel zemini ve
     "›" oku burada bilerek yok — dokunulabilir görünen bir satır, dokunup bir şey olmayınca
     arıza gibi okunur. */
  /** Kapanmış kaydın iç düzeni: künye solda, sonuç sağda (v3:1136). */
  closedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
  },
  closedResult: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
  closedOk: { color: operationsTheme.colors['olive-dark'] },
  closedShort: { color: operationsTheme.colors.terracotta },
  closedNeutral: { color: operationsTheme.colors.muted },
  queueFootnote: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space.lg,
  },
  lineRow: {
    gap: operationsTheme.space.sm,
    paddingVertical: operationsTheme.space.xl,
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  lineHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  /** Kuralın bandı — sayımdan ÖNCE okunur, dipnotta değil. */
  rule: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    borderRadius: operationsTheme.radius.control,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.xl,
  },
  ruleText: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors['olive-dark'],
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
  /** Kapının "sayılmadı" dediği satır — cevaptan gelir, ekran tahmin etmez. */
  rowSubMissing: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    color: operationsTheme.colors.error,
  },
  chevron: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors['sand-600'],
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
    // Gölge YOK: v3'te sert gölge sıfır kez geçiyor (ölçüldü — v2'de 3, v3'te 0).
  },
  ctaIdle: { backgroundColor: operationsTheme.colors['disabled-fill'] },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors.card,
  },
});
