import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { ClosedTransferContract } from '@lezzet/types';

import { toastInfo } from '@/lib/toast/toast-store';
import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsProductThumb } from '@/components/operations/product-thumb';
import { OperationsQuantityBox } from '@/components/operations/quantity-box';
import { OperationsQuantitySheet } from '@/components/operations/quantity-sheet';
import { quantityTotal } from '@/components/operations/quantity-value';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsSurface } from '@/components/operations/surface';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { FormScroll } from '@/components/ui/form-scroll';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { TextAction } from '@/components/ui/text-action';
import { TextField } from '@/components/ui/text-field';
import { captionOf } from '@/lib/operations/caption';
import { fillCopy } from '@/screens/operations/copy';
import { useOperationsWorkplace } from '@/screens/operations/sections-context';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { qtySheetCopy, warehouseCopy } from './copy';
import { useSubjectBack } from './use-subject-back.hook';
import { useTransfer } from './use-transfer.hook';
import { productLabel, shortDate, shortDayMonth } from './warehouse-format';
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
 * Kapanmış kaydın künyesi — rota iki ucun ADIYLA, tarih yılsız. Bir ucun adı yoksa (kapsam
 * seçilmemiş oturum ya da silinmiş karşı depo) yön kelimesine düşülür: uydurma bir ad yazmaktansa
 * "gelen · 2 kalem" doğru kalır.
 */
function closedMetaOf(row: ClosedTransferContract, workplace: string | null): string {
  const n = String(row.lineCount);
  const date = shortDayMonth(row.closedAt.slice(0, 10)) ?? row.closedAt;
  const ref = row.shortfallReferenceNo ?? '';
  const counterpart = row.counterpartName;
  if (workplace === null || counterpart === null) {
    return fillCopy(row.shortfallReferenceNo === null ? t.transfer.closedMeta : t.transfer.closedShortfallRef, {
      direction: t.transfer.direction[row.direction],
      n,
      date,
      ref,
    });
  }
  const from = row.direction === 'out' ? workplace : counterpart;
  const to = row.direction === 'out' ? counterpart : workplace;
  return fillCopy(row.shortfallReferenceNo === null ? t.transfer.closedRoute : t.transfer.closedRouteShortfall, {
    from,
    to,
    n,
    date,
    ref,
  });
}

/**
 * Kapanmış kaydın SONUCU: "tam kabul" · "−N adet" · "+N adet" · ikisi birden · "geri alındı".
 * Eksik ve fazla ayrı yazılır (21.253) — toplamak "−2 +2 = tam kabul" gibi bir yalan üretirdi.
 */
function closedResultOf(row: ClosedTransferContract): string {
  if (row.shortQty === null) return t.transfer.closedCancelled;
  const parts = [
    ...(row.shortQty > 0 ? [fillCopy(t.transfer.closedShortQty, { n: String(row.shortQty) })] : []),
    ...((row.excessQty ?? 0) > 0 ? [fillCopy(t.transfer.closedExcessQty, { n: String(row.excessQty ?? 0) })] : []),
  ];
  return parts.length === 0 ? t.transfer.closedFull : parts.join(' · ');
}

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

/**
 * Beyan çekmecesinin iki sebebi (04.09) — sözleşmenin `extract`i ile aynı küme. "Tarihi geçti" ve
 * "sayımda bulunamadı" bu kapının cümlesi değil: rampada mal ya eksik geldi ya hasarlı geldi.
 */
const DECLARATION_REASONS = ['transfer_shortfall', 'damaged'] as const;

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
  /* DETAYDAN GERİ = LİSTE, iki geri tuşunda da (kullanıcı bulgusu 04.09: "geri geldiğimde depo
     ekranına gidiyorum"): sol üstteki ok ve cihazın kendi geri tuşu aynı adımı atar — sayım ve
     düşüm ekranlarının kalıbı (`use-subject-back`). Çekmece açıksa önce o kapanır (kit). */
  const leaveDetail = useCallback(() => transferState.select(null), [transferState.select]);
  useSubjectBack(transferState.transfer !== null, leaveDetail);

  const transfer = transferState.transfer;
  const header = (
    <OperationsStackHeader
      title={t.transfer.title}
      /* KÜNYE: REFERANS + "KAYNAK → ALAN" (v3:11 · 04.09).
         Şablonun cümlesi "Paris Depo → Strasbourg Merkez"; sağ yarı bu deponun adı (rampada duran
         kişinin doğrulaması gereken şey: "bu sevkiyatı benim depom mu alıyor"), sol yarı kaynak
         depo. Sol yarı 30.08'de sözleşmede yoktu ve ekran yalnız sağı yazıyordu — cihazda
         "TRF-KEHL-26-0002 · yolda · Strasbourg — ana depo" diye okundu, yani "Strasbourg'dan geldi"
         (ölçüldü 03.09). Şimdi ad geliyor; gelmezse (depo silinmiş) eski künye: uydurma yok. */
      subtitle={
        transfer !== null && transfer.fromWarehouseName !== null && workplace !== null
          ? fillCopy(t.transfer.captionRoute, {
              ref: transfer.referenceNo,
              from: transfer.fromWarehouseName,
              to: workplace,
            })
          : captionOf(transfer === null ? undefined : fillCopy(t.transfer.caption, { ref: transfer.referenceNo }), workplace)
      }
      onBack={() =>
        // Detaydan geri DAİMA listeye (04.09): tek gelen varken hub'a dönmek, YOLDA ve SON
        // KAPANANLAR'ı görülmez kılıyordu. Hub'a yalnız listeden çıkılır.
        transfer !== null ? leaveDetail() : router.back()
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
                {/* TASARIMIN KARTI (v3 transfer listesi; kullanıcı bulgusu 04.09 — "orijinal tasarımla
                    çok fark var"): solda kartın türünü söyleyen zeytin OK KARESİ, sağda "GELDİ" rozeti;
                    chevron ve "N kalem · tarih" satırı tasarımda yok — kalemler zaten altında
                    sıralı, tarih kapananların işi. "GELDİ" bir durum değil bir cümle: sevkiyat bu
                    depoya sevk edildi ve rampada sayılmayı bekliyor (arkasında ayrı bir "vardı"
                    olayı yok — bilinen tek olay gönderenin sevki). */}
                <View style={[styles.cardTile, styles.cardTileOlive]}>
                  <Icon name="arrow-right" size={operationsTheme.size.cardTileIcon} color={operationsTheme.colors['olive-dark']} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{row.referenceNo}</Text>
                  {/* "Kehl → Strasbourg" (04.09): kart hangi depodan geldiğini söyler — referansın
                      içindeki depo kodu bunu bilene söylüyordu, bilmeyene değil. */}
                  {row.fromWarehouseName === null || workplace === null ? null : (
                    <Text style={styles.rowSub} testID={`warehouse-transfer-route-${row.transferId}`}>
                      {fillCopy(t.transfer.queueRoute, { from: row.fromWarehouseName, to: workplace })}
                    </Text>
                  )}
                </View>
                {/* Rozet bir OLGU (kullanıcı kararı 04.09): tasarımın "GELDİ"si arkasında varış olayı
                    olmayan bir etiketti; "YOLDA" transferin durumudur, doğrulanır. */}
                <Text style={styles.arrivedPill} testID={`warehouse-transfer-status-${row.transferId}`}>
                  {t.transfer.queueInTransit}
                </Text>
              </View>

              {/*
                KALEM ÖNİZLEMESİ (v3:1106) — kart artık ne geldiğini de söylüyor. Depocu rampaya
                inmeden "bu transferde ne var" sorusunu cevaplayabilmeli; referans + kalem SAYISI
                o soruyu cevaplamıyordu.

                İLK ÜÇ: şablonun sayısı. Kart bir liste değil, "içeride ne var" cümlesi — dördüncü
                satır kartı listeye çevirir ve kuyruğun kendisi ekrandan taşardı. Kalan varsa
                söyleniyor: kırpmayı sessizce yapmak, eksik bir kabule hazırlanmak olurdu.
              */}
              <View style={styles.queueLines}>
                {row.lines.slice(0, PREVIEW_LINES).map((line) => (
                  <View key={line.lineId} style={styles.previewRow}>
                    <Text style={styles.previewName} numberOfLines={1}>
                      {productLabel(line.productName, line.variantLabel)}
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
                <View key={row.transferId} style={styles.queueRow} testID={`warehouse-transfer-outbound-${row.transferId}`}>
                  {/* TASARIMIN YOLDA KARTI (v3 transfer listesi, 04.09): kiremit ARAÇ KARESİ solda,
                      "Strasbourg → Kehl · N kalem" ortada, sağda iki satır — durum üstte, tahmini
                      varış altta. Kart gelen kartla aynı zeminde (aynı kalıbın iki türü), rozet
                      zemini yok: durum düz metin, yalnız rengi konuşur. */}
                  <View style={styles.closedRow}>
                    <View style={[styles.cardTile, styles.cardTileTerracotta]}>
                      <Icon name="courier" size={operationsTheme.size.cardTileIcon} color={operationsTheme.colors.terracotta} />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{row.referenceNo}</Text>
                      <Text style={styles.rowSub}>
                        {row.toWarehouseName === null || workplace === null
                          ? fillCopy(t.transfer.outboundMeta, { n: String(row.lineCount) })
                          : fillCopy(t.transfer.outboundRoute, {
                              from: workplace,
                              to: row.toWarehouseName,
                              n: String(row.lineCount),
                            })}
                      </Text>
                    </View>
                    <View style={styles.outboundRight}>
                      {/* YALNIZ OLGU (kullanıcı kararı 04.09): "tahmini varış" bir ayardan türeyen
                          varsayımdı, "N gün gecikti" doğrulanamayan bir iddia — ikisi de kalktı.
                          Kalan iki şey bilinen iki şey: transferin durumu ve çıktığı gün. Yaş tonu
                          sözleşmede duruyor (web okuyor), ekran onu artık yazmıyor. */}
                      <Text style={styles.ageText} testID={`warehouse-transfer-outbound-status-${row.transferId}`}>
                        {t.transfer.outboundStatus}
                      </Text>
                      <Text style={styles.outboundEta}>
                        {fillCopy(t.transfer.outboundDispatched, {
                          date: shortDayMonth(row.dispatchedAt.slice(0, 10)) ?? row.dispatchedAt,
                        })}
                      </Text>
                    </View>
                  </View>
                </View>
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
                        {/* ROTA ADLA (v3 transfer listesi, kullanıcı bulgusu 04.09): "Strasbourg Merkez →
                            Kehl — sınır deposu · 2 kalem · 03.09" — yön kelimesi ("gelen/giden",
                            "araca/araçtan") yerine iki ucun adı; araç yüklemesi de aracın adıyla
                            okunur, ayrı sözlük gerekmez. Eksik belgesi varsa künyenin sonunda. */}
                        {closedMetaOf(row, workplace)}
                      </Text>
                    </View>
                    {/* SONUÇ SAĞDA ve ÜÇ AYRI CÜMLE: "tam kabul" · "−N adet" · "geri alındı".
                        Eksik ADET olarak yazılır (04.09): "2 eksik" satır sayısıydı, kayıp beş
                        birimdi (cihazda ölçüldü 03.09). Geri alınmışta eksik SAYISI YOKTUR
                        (`shortQty: null`) ve "0 eksik" yazmak, hiç sayılmamış bir sevkiyatı sorunsuz
                        kabul gibi okuturdu (CLAUDE §1). */}
                    <Text
                      style={[
                        styles.closedResult,
                        // Üç hâl, üç ton — ve iptal "iyi" DEĞİL nötr: geri alınmış bir sevkiyatı
                        // tam kabulle aynı renge boyamak, olmayan bir başarıyı boyamaktır. Fazla da
                        // bir farktır (21.253): eksikle aynı kiremit.
                        row.shortQty === null
                          ? styles.closedNeutral
                          : row.shortQty === 0 && (row.excessQty ?? 0) === 0
                            ? styles.closedOk
                            : styles.closedShort,
                      ]}
                      testID={`warehouse-transfer-closed-result-${row.transferId}`}
                    >
                      {closedResultOf(row)}
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

  /* CTA EKSİĞİ TAŞIR (04.09): eksik varsa düğme kiremit tona döner ve "5 eksik beyanıyla" der —
     kaydetmeden önce son cümle. Eksik yoksa bugünkü zeytin düğme, tek dokunuş. */
  const { shortfall, excess } = transferState;
  // Fark cümlesi (21.253): eksik, fazla ya da ikisi — düğme hangisi varsa onu söyler.
  const diffLabel =
    shortfall !== null && excess !== null
      ? fillCopy(t.transfer.ctaBoth, { short: String(shortfall.qty), excess: String(excess.qty) })
      : shortfall !== null
        ? fillCopy(t.transfer.ctaShort, { n: String(shortfall.qty) })
        : excess !== null
          ? fillCopy(t.transfer.ctaExcess, { n: String(excess.qty) })
          : null;
  const cta = offline
    ? { label: t.common.offlineCta, enabled: false, short: false }
    : transferState.sending
      ? { label: t.transfer.cta.sending, enabled: false, short: false }
      : diffLabel !== null
        ? { label: diffLabel, enabled: true, short: true }
        : transferState.counted
          ? { label: t.transfer.cta.ready, enabled: true, short: false }
          : { label: t.transfer.cta.pending, enabled: false, short: false };
  // Fark satırları (eksik + fazla) ve sonuç cümlesinin parçaları — panel ve çekmece aynı metni okur.
  const diffLines = [...(shortfall?.lines ?? []), ...(excess?.lines ?? [])];
  const effectParts = [
    ...(shortfall === null ? [] : [fillCopy(t.transfer.shortfall.effectShort, { n: String(shortfall.qty) })]),
    ...(excess === null ? [] : [fillCopy(t.transfer.shortfall.effectExcess, { n: String(excess.qty) })]),
  ].join(', ');

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
          const name = productLabel(line.productName, line.variantLabel);
          // LOT VE SKT künyede (04.09): aynı üründen iki parti aynı sevkiyatta gelebilir, ad ikisini
          // ayırmaz — rampadaki koli satırla lotundan eşlenir.
          const lotText =
            line.lotNumber === null
              ? fillCopy(t.transfer.lineNoLot, { date: shortDate(line.expiryDate) ?? line.expiryDate })
              : fillCopy(t.transfer.lineLot, { lot: line.lotNumber, date: shortDate(line.expiryDate) ?? line.expiryDate });
          return (
            /* SATIR MAL KABULÜN KARTI (kullanıcı kararı 04.09, 21.254): kart, solda ürün karesi,
               sağda ADET KUTUSU — depo bölümünün adet satırı tek kalıp. Sayaç satırdan çıktı; adet,
               kutuya dokununca açılan çekmeceden (cetvel, tuş takımı, ± içeride). Sayılmamış satır
               SOLUK (v3:05): depocu "nerede kaldım"ı kaydırmadan görür. */
            <View
              key={line.lineId}
              style={[styles.lineRow, counted === null && !missing ? styles.lineRowIdle : null]}
              testID={`warehouse-transfer-line-${line.lineId}`}
            >
              <View style={styles.lineHead}>
                <OperationsProductThumb
                  name={name}
                  photoUri={line.imageUrl}
                  size="md"
                  testID={`warehouse-transfer-thumb-${line.lineId}`}
                />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{name}</Text>
                  {/* Künye TEK SATIR (D2'nin "beklenen 30 · GZT-1013" kalıbı): sevk edilen · lot · SKT.
                      Kapı "sayılmadı" dediyse sevk edilenin yerini o alır — cevaptan gelir, tahmin değil. */}
                  <Text
                    style={[styles.rowSub, missing ? styles.rowSubMissing : undefined]}
                    testID={`warehouse-transfer-line-lot-${line.lineId}`}
                  >
                    {`${missing ? t.transfer.missing : fillCopy(t.transfer.dispatched, { qty: String(line.dispatchedQty) })} · ${lotText}`}
                  </Text>
                </View>
                {/* KESİKLİ KUTU = DAVET: içinde sevk edilen adet, altyazısı D2 ile aynı kelime
                    ("BEKLENEN" — rampada sevk edilen beklenendir; "SEVK EDİLEN" kutuya sığmıyordu,
                    ölçüldü 04.09). Tek dokunuş "sevk edildiği kadar geldi" BEYANIdır (D2'nin
                    "beklenen" düğmesiyle aynı kural: otomatik dolmaz). Dolu kutu çekmeceyi açar;
                    sevk edilenden farklı rakam kiremit. TAVAN YOK (21.253). */}
                <OperationsQuantityBox
                  value={counted}
                  placeholderValue={line.dispatchedQty}
                  caption={counted === null ? t.transfer.qtyDispatchedCaption : t.transfer.qtyCaption}
                  dashed={counted === null}
                  tone={counted === null ? 'muted' : counted === line.dispatchedQty ? 'ink' : 'diff'}
                  onPress={() =>
                    counted === null ? transferState.setCount(line.lineId, line.dispatchedQty) : setQtyLineId(line.lineId)
                  }
                  accessibilityLabel={
                    counted === null
                      ? fillCopy(t.transfer.countDispatchedLabel, { name, qty: String(line.dispatchedQty) })
                      : fillCopy(t.transfer.qtyLabel, { name })
                  }
                  accessibilityHint={counted === null ? undefined : t.common.qtyHint}
                  testID={`warehouse-transfer-qty-${line.lineId}`}
                />
              </View>

              {/* "0 · HİÇ GELMEDİ" KISAYOLU KALKTI (kullanıcı kararı 04.09): v3:1189'un çipi, klavyeli
                  girişin zahmetine karşı yazılmıştı; adet çekmecesinde sıfır cetvelin ilk hücresi
                  olduğundan (02.09) artık aynı işi ikinci kez söyleyen bir düğmeydi. Boş ≠ 0 kuralı
                  yerinde: boş satır kabulü bloklar, sıfır çekmeceden girilir. */}
              {/* SATIRIN KENDİ EKSİĞİ (04.09): sayılan adet sevk edilenden azsa satır bunu hemen
                  söyler — depocu özeti beklemeden hangi satırın kayıp yazacağını görür. */}
              {counted === null || counted >= line.dispatchedQty ? null : (
                <Text style={styles.lineShort} testID={`warehouse-transfer-line-short-${line.lineId}`}>
                  {counted === 0
                    ? fillCopy(t.transfer.lineZero, { n: String(line.dispatchedQty) })
                    : fillCopy(t.transfer.lineShort, { n: String(line.dispatchedQty - counted) })}
                </Text>
              )}
              {/* SATIRIN FAZLASI (21.253): sevk edilenden çok sayıldıysa satır bunu da hemen söyler —
                  engel yok, uyarı var; fazla beyan çekmecesinden yazılır. */}
              {counted === null || counted <= line.dispatchedQty ? null : (
                <Text style={styles.lineShort} testID={`warehouse-transfer-line-excess-${line.lineId}`}>
                  {fillCopy(t.transfer.lineExcess, { n: String(counted - line.dispatchedQty) })}
                </Text>
              )}
            </View>
          );
        })}

        {/*
          EKSİK ÖZETİ (kullanıcı kararı 04.09) — bütün satırlar sayılınca ve en az biri eksikse.
          Sonuç kaydetmeden ÖNCE okunur (D4b'nin "akıbetin bedeli seçimden önce" ilkesi): eskiden
          kabul "1 parti açıldı" diyor, beş birim eksik hiçbir yerde geçmiyordu (cihazda ölçüldü
          03.09). Eksik yoksa panel hiç çizilmez — "0 eksik" bir beyan değildir.
        */}
        {shortfall === null && excess === null ? null : (
          <View style={styles.shortBox} testID="warehouse-transfer-shortfall">
            <Text style={styles.shortHeading}>{t.transfer.shortfall.heading}</Text>
            {diffLines.map((line) => (
              <View key={line.lineId} style={styles.shortLine}>
                <Text style={styles.shortName} numberOfLines={1}>
                  {line.name}
                </Text>
                <Text style={styles.shortQty}>
                  {fillCopy(t.transfer.shortfall.line, {
                    sent: String(line.dispatchedQty),
                    received: String(line.receivedQty),
                  })}
                </Text>
              </View>
            ))}
            {shortfall === null ? null : (
              <Text style={styles.shortTotal} testID="warehouse-transfer-shortfall-total">
                {fillCopy(t.transfer.shortfall.total, { n: String(shortfall.qty) })}
              </Text>
            )}
            {/* FAZLA (21.253): eksiğin aynası, aynı panelde — bir satır eksik öteki fazla gelebilir. */}
            {excess === null ? null : (
              <Text style={styles.shortTotal} testID="warehouse-transfer-excess-total">
                {fillCopy(t.transfer.shortfall.totalExcess, { n: String(excess.qty) })}
              </Text>
            )}
            <Text style={styles.shortEffect}>
              {fillCopy(t.transfer.shortfall.effect, { parts: effectParts, ref: transfer.referenceNo })}
            </Text>
          </View>
        )}

        <Text style={styles.footnote}>{t.transfer.footnote}</Text>
      </FormScroll>

      {/*
        BEYAN ÇEKMECESİ (kullanıcı kararı 04.09) — yalnız eksik varken, CTA'nın ikinci dokunuşu.
        Adet çekmecesinin deseni: kitin `BottomSheet`i, sağda metin eylemi, koyu sayaç kartı
        (yerinde satışın kartı). Sebep iki çip, not isteğe bağlı; sonuç cümlesi düğmeden önce.
        Yanlışlıkla "0 · hiç gelmedi"ye basılmış bir satırı kayıp olarak yazmadan son bir bakış.
      */}
      <BottomSheet
        visible={transferState.declarationOpen}
        title={t.transfer.declare.title}
        titleAction={
          <TextAction
            label={t.transfer.declare.cancel}
            onPress={transferState.cancelDeclaration}
            testID="warehouse-transfer-declare-cancel"
          />
        }
        onClose={transferState.cancelDeclaration}
        testID="warehouse-transfer-declare"
      >
        {shortfall === null && excess === null ? null : (
          <View style={styles.declareBody}>
            <Text style={styles.declareSub}>
              {fillCopy(t.transfer.declare.subtitle, { ref: transfer.referenceNo, n: String(diffLines.length) })}
            </Text>
            <View style={styles.declareCard}>
              {/* Koyu sayaç kartında iki büyük rakam olabilir (21.253): eksik ve fazla ayrı satır,
                  ayrı belge — toplamak ikisini birbirine karıştırırdı. */}
              {shortfall === null ? null : (
                <View style={styles.declareBigRow}>
                  <Text style={styles.declareBig} testID="warehouse-transfer-declare-qty">
                    {shortfall.qty}
                  </Text>
                  <Text style={styles.declareUnit}>{t.transfer.declare.unit}</Text>
                </View>
              )}
              {excess === null ? null : (
                <View style={styles.declareBigRow}>
                  <Text style={styles.declareBig} testID="warehouse-transfer-declare-excess-qty">
                    {excess.qty}
                  </Text>
                  <Text style={styles.declareUnit}>{t.transfer.declare.unitExcess}</Text>
                </View>
              )}
              {diffLines.map((line) => (
                <View key={line.lineId} style={styles.declareLine}>
                  <Text style={styles.declareLineName} numberOfLines={1}>
                    {line.name}
                  </Text>
                  <Text style={styles.declareLineQty}>
                    {fillCopy(t.transfer.declare.line, {
                      sent: String(line.dispatchedQty),
                      received: String(line.receivedQty),
                    })}
                  </Text>
                </View>
              ))}
            </View>
            {/* Sebep yalnız EKSİĞİN sorusudur: fazlanın sebebi olmaz, sayımın kendisi kayıttır. */}
            {shortfall === null ? null : (
              <>
                <Text style={styles.heading}>{t.transfer.declare.reasonHeading}</Text>
                <View style={styles.declareChips}>
                  {DECLARATION_REASONS.map((reason) => (
                    <OperationsChoiceChip
                      key={reason}
                      label={t.transfer.declare.reasons[reason]}
                      selected={transferState.declaration.reason === reason}
                      onPress={() => transferState.setDeclarationReason(reason)}
                      testID={`warehouse-transfer-declare-reason-${reason}`}
                    />
                  ))}
                </View>
              </>
            )}
            <TextField
              value={transferState.declaration.note}
              onChangeText={transferState.setDeclarationNote}
              placeholder={t.transfer.declare.notePlaceholder}
              accessibilityLabel={t.transfer.declare.noteLabel}
              density="compact"
              testID="warehouse-transfer-declare-note"
            />
            <Text style={styles.declareEffect}>
              {fillCopy(t.transfer.declare.effect, { ref: transfer.referenceNo, parts: effectParts })}
            </Text>
            <PressableSurface
              onPress={transferState.confirmDeclaration}
              disabled={transferState.sending}
              feedback="shadow"
              style={[styles.cta, styles.ctaReady]}
              accessibilityLabel={t.transfer.declare.cta}
              testID="warehouse-transfer-declare-cta"
            >
              <Text style={styles.ctaLabel}>{t.transfer.declare.cta}</Text>
            </PressableSurface>
          </View>
        )}
      </BottomSheet>

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
              subject: fillCopy(t.transfer.qtySheet.subject, {
                name: productLabel(qtyLine.productName, qtyLine.variantLabel),
                qty: String(qtyLine.dispatchedQty),
              }),
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
          style={[styles.cta, cta.enabled ? (cta.short ? styles.ctaShort : styles.ctaReady) : styles.ctaIdle]}
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
  /** Kalem satırları — kartın gövdesinde DÜZ dururlar (v3 transfer listesi, 04.09): gömülü kum
      blok tasarımda yok; kart zaten kutudur, kutunun içinde ikinci kutu satırları yabancılaştırıyordu. */
  queueLines: {
    gap: operationsTheme.space.sm,
  },
  /** Kartın türünü söyleyen ikon karesi (v3: 36×36, yarıçap `badge`) — gelen zeytin, yoldaki kiremit. */
  cardTile: {
    width: operationsTheme.size.cardTile,
    height: operationsTheme.size.cardTile,
    borderRadius: operationsTheme.radius.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTileOlive: { backgroundColor: operationsTheme.colors['olive-bg'] },
  cardTileTerracotta: { backgroundColor: operationsTheme.colors['terracotta-bg'] },
  /** "GELDİ" rozeti (v3): zeytin zemin, koyu zeytin eyebrow harf — kartın sağ üst köşesi. */
  arrivedPill: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors['olive-dark'],
    backgroundColor: operationsTheme.colors['olive-bg'],
    borderRadius: operationsTheme.radius.badge,
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.md,
    overflow: 'hidden',
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
  /** "kabule başla →" kartın SAĞ altında (v3: `align-self:flex-end`) — eylem okla birlikte sağa akar. */
  queueOpen: {
    alignSelf: 'flex-end',
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
  /** Yoldaki kartın sağ sütunu (v3): durum üstte, tahmini varış altta, ikisi sağa yaslı. */
  outboundRight: {
    alignItems: 'flex-end',
    gap: operationsTheme.space['2xs'],
  },
  /** Yoldaki durum — düz metin, kiremit (v3: `#b05c2e`): süren bir iş, bitmiş değil. */
  ageText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.terracotta,
  },
  outboundEta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  /** Satırın kendi eksiği — kiremit, çünkü kaydetmeden önce okunması gereken bir sonuç. */
  lineShort: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.terracotta,
  },
  /** EKSİK ÖZETİ paneli — kiremit zemin: bir uyarı değil, kaydedilecek bir beyanın önizlemesi. */
  shortBox: {
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    borderRadius: operationsTheme.radius.control,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space.xl,
    gap: operationsTheme.space.sm,
  },
  shortHeading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.terracotta,
  },
  shortLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
  },
  shortName: {
    flex: 1,
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.body,
  },
  shortQty: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.terracotta,
  },
  shortTotal: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.ink,
    paddingTop: operationsTheme.space.sm,
  },
  shortEffect: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.body,
  },
  /** Beyan çekmecesinin gövdesi — adet çekmecesinin ritmi. */
  declareBody: { gap: operationsTheme.space.xl },
  declareSub: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  /** Koyu sayaç kartı — yerinde satışın kartıyla aynı dil: büyük rakam krem, satırlar altında. */
  declareCard: {
    backgroundColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.control,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    gap: operationsTheme.space.md,
  },
  declareBigRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: operationsTheme.space.md,
  },
  declareBig: {
    fontFamily: operationsTheme.font.display[600],
    fontSize: operationsTheme.text['screen-title'],
    color: operationsTheme.colors['on-image'],
  },
  declareUnit: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors['on-image'],
  },
  declareLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
  },
  declareLineName: {
    flex: 1,
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['on-image'],
  },
  declareLineQty: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['on-image'],
  },
  declareChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: operationsTheme.space.md,
  },
  declareEffect: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  queueFootnote: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space.lg,
  },
  /* SATIR BİR KART (21.254, D2'nin `lineRow`u birebir): kesik çizgiyle ayrılmış düz satırlar tek
     bir metin bloğu gibi okunuyordu; kart her kalemi kendi işi yapıyor. Sayılmamış satır soluk. */
  lineRow: {
    gap: operationsTheme.space.sm,
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.card,
    backgroundColor: operationsTheme.colors.panel,
  },
  lineRowIdle: { opacity: 0.7 },
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
  /** Eksikli kabulün düğmesi KİREMİT: yazılacak şey bir kayıp, rengi onu söyler. */
  ctaShort: { backgroundColor: operationsTheme.colors.terracotta },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors.card,
  },
});
