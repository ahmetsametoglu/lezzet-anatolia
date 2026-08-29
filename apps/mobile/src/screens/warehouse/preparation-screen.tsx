import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { PAYMENT_METHOD_LABELS, type BoxLabelContract, type PreparationLineContract, type PreparationOrderContract } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsQtyField } from '@/components/operations/qty-field';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PrintProbe } from '@/components/print/print-probe';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { TextAction } from '@/components/ui/text-action';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import { usePreparation, type DispatchState, type PrintState } from './use-preparation.hook';
import { batchLabel, boxSizeLine, parseQty, productLabel, qtyToText } from './warehouse-format';
import { useWarehouseStatus } from './warehouse-status';

/*
  D1 · TOPLAMA (v2:314-350).

  ── TASARIMDA OLMAYAN BİR ADIM EKLENDİ: KUYRUK ──────────────────────────────
  v2'nin ekranı TEK siparişi çiziyor ("LZA-26-3M8C · Restaurant Bosphore · B2B") çünkü şablonun
  demo verisinde tek sipariş var — ama hub'ın kendi satırı "3 sipariş bekliyor" diyor. Üç siparişin
  hangisinin toplandığı bir tercih değil, KOLİNİN kimliğidir; ekranın onu uydurması yanlış koli
  demektir. Bu yüzden kuyruk BİR sipariş taşıyorsa doğrudan toplama açılır (tasarımın hâli), iki ve
  üzeri taşıyorsa önce seçim sorulur. Seçim ekranı tasarımın satır düzenini kullanır, yeni bir dil
  icat etmez.

  ── ADEDİN ANLAMI ───────────────────────────────────────────────────────────
  Alan "bu kayıtla kaç adet yazıyorum"u sorar (kümülatif değil) ve tavanı motorun ayırdığı parti
  toplamıdır. İkisinin de gerekçesi hook künyesinde, tek yerde — RPC'nin yazımı ABSOLÜT ve okuma
  eski parti dağılımını taşımıyor.

  ── ÇEVRİMDIŞI: KİLİT VAR, KUYRUK YOK (v2:290) ──────────────────────────────
  Bağlantı yokken onay düğmesi kapalıdır ve sebebini söyler. Yerel bir kuyruğa yazmak, depocuya
  "yazıldı" dedirtip rafla sistemi ayırırdı (21.13 hattı: çevrimdışı kuyruk bir ALTYAPI işidir,
  ekran hilesi değil).
*/

const t = warehouseCopy;

export function PreparationScreen() {
  const router = useRouter();
  const picking = usePreparation();
  const { offline } = useWarehouseStatus();

  const order = picking.order;
  const header = (
    <OperationsStackHeader
      title={t.picking.title}
      subtitle={order === null ? undefined : captionOf(order)}
      onBack={() => (order !== null && picking.orders.length > 1 ? picking.select(null) : router.back())}
      backLabel={t.common.back}
      testID="warehouse-picking-header"
    />
  );

  if (picking.status === 'loading') {
    return (
      <View style={styles.screen} testID="warehouse-picking">
        {header}
        <View style={styles.centered}>
          <LoadingState accessibilityLabel={t.picking.loading} label={t.picking.loading} testID="warehouse-picking-loading" />
        </View>
      </View>
    );
  }

  if (picking.status === 'error') {
    return (
      <View style={styles.screen} testID="warehouse-picking">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="error"
            title={t.picking.error.title}
            description={t.picking.error.body}
            retry={{ label: t.common.retry, onPress: picking.reload }}
            testID="warehouse-picking-error"
          />
        </View>
      </View>
    );
  }

  if (picking.orders.length === 0) {
    return (
      <View style={styles.screen} testID="warehouse-picking">
        {header}
        <ScrollView contentContainerStyle={styles.list}>
          {/* ⚠ SEVK KARTI BU DALDA DA ÇİZİLİR — ve burası onun EN OLASI yeri.
              Son kutu kapanınca sipariş `ready`ye geçip kuyruktan düşüyor; kuyrukta tek sipariş
              varsa liste BOŞALIYOR ve ekran bu dala giriyor. Kart yalnız kuyruk/sipariş
              dallarında olsaydı, depocu tam kutuyu mühürlediği anda etiketi alma yolunu
              kaybederdi (testle yakalandı 29.08). Etiket kartının aynı gerekçesi. */}
          {picking.label === null ? null : <LabelCard label={picking.label} printState={picking.printState} onReprint={picking.reprintLabel} onClose={picking.dismissLabel} />}
          <DispatchCard state={picking.dispatch} onStart={picking.startDispatch} onClose={picking.dismissDispatch} />
          <View style={styles.block}>
            <OperationsNoticeBlock
              variant="empty"
              title={t.picking.empty.title}
              description={t.picking.empty.body}
              testID="warehouse-picking-empty"
            />
          </View>
        </ScrollView>

        <DispatchSheet picking={picking} />
      </View>
    );
  }

  if (order === null) {
    return (
      <View style={styles.screen} testID="warehouse-picking">
        {header}
        <ScrollView contentContainerStyle={styles.list} testID="warehouse-picking-queue">
          {/* Son kapanan kutunun etiketi (23.7): sipariş hazır olup kuyruktan düşse de kart
              burada kalır — depocu "ne bastıracağını" kapanış anında okur. */}
          {picking.label === null ? null : <LabelCard label={picking.label} printState={picking.printState} onReprint={picking.reprintLabel} onClose={picking.dismissLabel} />}
          <DispatchCard state={picking.dispatch} onStart={picking.startDispatch} onClose={picking.dismissDispatch} />

          {/* HAZIRLIK KÂĞIDININ QR'I (10.1) — masada basılan kâğıt buradan telefona bağlanıyor.
              Düğme listenin ÜSTÜNDE: kâğıdı eline almış depocu listeye hiç bakmadan okutur;
              altta olsaydı önce göz taraması yaptırırdı ve kâğıdın kazandırdığı adım geri
              alınırdı. Liste yine duruyor — kâğıtsız çalışan da elle seçebilir. */}
          <PressableSurface
            onPress={() => picking.setQueueScanOpen(true)}
            feedback="scale"
            style={styles.queueScanButton}
            accessibilityLabel={t.picking.queueScan.cta}
            testID="warehouse-picking-queue-scan"
          >
            <Text style={styles.queueScanLabel}>{t.picking.queueScan.cta}</Text>
          </PressableSurface>

          <Text style={styles.heading}>{t.picking.queueHeading}</Text>
          {picking.orders.map((row) => (
            <PressableSurface
              key={row.orderId}
              onPress={() => picking.select(row.orderId)}
              feedback="scale"
              style={styles.queueRow}
              accessibilityLabel={captionOf(row)}
              testID={`warehouse-picking-order-${row.orderId}`}
            >
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{captionOf(row)}</Text>
                <Text style={styles.rowSub}>
                  {fillCopy(t.picking.queueLines, {
                    picked: String(row.pickedLineCount),
                    total: String(row.lineCount),
                  })}
                  {row.pickedLineCount > 0 && row.pickedLineCount < row.lineCount ? ` · ${t.picking.queueHalf}` : ''}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </PressableSurface>
          ))}
        </ScrollView>

        {/* Okutucu kuyruk dalında da çizilir — `ScanSheet` bir Modal ve listenin içinde değil.
            Kutu okutmasından AYRI bayrak: iki farklı soru, iki farklı cevap yolu. */}
        <DispatchSheet picking={picking} />

        <ScanSheet
          open={picking.queueScanOpen}
          title={t.picking.queueScan.title}
          hint={t.picking.queueScan.hint}
          onClose={() => picking.setQueueScanOpen(false)}
          onScan={picking.scanQueueOrder}
          // Simülasyon çipleri KUYRUĞUN kendi referansları: havuzdaki ürün barkodları burada
          // hiçbir siparişi açmaz ve çip "tanınmayan" gibi görünürdü (23.8'in aynı kararı).
          devCodes={picking.orders.flatMap((row) => (row.referenceNo ? [{ label: row.referenceNo, code: row.referenceNo }] : []))}
          testID="warehouse-picking-queue-scan-sheet"
        />
      </View>
    );
  }

  const cta = picking.boxMode
    ? boxCtaOf(picking.openBox !== null, picking.boxes.length, picking.anyQty, picking.anyShort, picking.sending, offline)
    : ctaOf(picking.resolved, picking.anyShort, picking.sending, offline);
  /*
    KUTU AÇMA İKİ ADIMLI OLABİLİR (07.12): kargo kulvarında önce TİP sorulur, sonra kutu açılır.
    Rota siparişinde ve tipsiz depoda soru hiç doğmaz — CTA doğrudan kutuyu açar (23.6 akışı).
  */
  const onOpenBox = () => (picking.askBoxType ? picking.setBoxTypeOpen(true) : picking.openNewBox(null));
  const onCta = picking.boxMode ? (picking.openBox === null ? onOpenBox : picking.sealCurrentBox) : picking.submit;

  return (
    <View style={styles.screen} testID="warehouse-picking">
      {header}

      <ScrollView contentContainerStyle={styles.list} testID="warehouse-picking-lines">
        {/* Son kapanan kutunun etiketi (23.7) — ara kutu kapanışında burada görünür. */}
        {picking.label === null ? null : <LabelCard label={picking.label} printState={picking.printState} onReprint={picking.reprintLabel} onClose={picking.dismissLabel} />}
          <DispatchCard state={picking.dispatch} onStart={picking.startDispatch} onClose={picking.dismissDispatch} />
        {/* KOLİYE YAZILACAK AD (23.3, mobil şeridin işareti) — yalnız alıcı hesabın sahibinden
            FARKLIYSA çizilir (web `parcelName` kuralı birebir): ikisi aynıyken satır, hiçbir şey
            söylemeyen bir tekrar olurdu. Adres/telefon yine YOK (tasarım §6). */}
        {parcelName(order) === null ? null : (
          <Text style={styles.parcelName} testID="warehouse-picking-parcel">
            {fillCopy(t.picking.parcelName, { name: parcelName(order)! })}
          </Text>
        )}
        {/* KUTU ŞERİDİ (23.6): kapalı kutular salt-okunur özet, açık kutu başlık çipi + tarama.
            Kutusuz başlanmış işte (boxMode false) şerit hiç çizilmez — eski akış aynen. */}
        {picking.boxMode && picking.boxes.length > 0 ? (
          <View style={styles.boxStrip} testID="warehouse-picking-boxes">
            {picking.boxes
              .filter((box) => box.sealedAt !== null)
              .map((box) => (
                <Text key={box.boxId} style={styles.boxSealed} testID={`warehouse-picking-box-${box.boxNo}`}>
                  {fillCopy(t.picking.box.sealedRow, {
                    n: String(box.boxNo),
                    qty: String(box.items.reduce((sum, item) => sum + item.qty, 0)),
                  })}
                </Text>
              ))}
            {picking.openBox === null ? null : (
              <Text style={styles.boxCurrent} testID="warehouse-picking-box-open">
                {/* Tip SEÇİLDİYSE adı da yazılır: kutu açıldıktan sonra seçimi düzeltmenin yolu
                    yok, dolayısıyla depocu yanlış kartona doldurmaya başlamadan görmeli. Adı
                    listeden çözüyoruz — sözleşme yalnız kimlik taşıyor (künyesi orada). */}
                {((name) =>
                  name === null
                    ? fillCopy(t.picking.box.current, { n: String(picking.openBox!.boxNo) })
                    : fillCopy(t.picking.box.currentTyped, { n: String(picking.openBox!.boxNo), name }))(
                  picking.shippingBoxes.find((box) => box.id === picking.openBox?.shippingBoxId)?.name ?? null,
                )}
              </Text>
            )}
          </View>
        ) : null}

        {/* KUTU TİPİ TANIMSIZ (07.12) — geçici bir cümle değil, sürekli görünen bir uyarı:
            ölçüsüz kapanan kutu etiket satın alınırken ön koşula takılır ve o an kartonu geri
            açmak gerekir. Akış DURDURULMUYOR (tipsiz kutu meşru bir hâl), yalnız söyleniyor. */}
        {picking.boxTypeMissing ? (
          <Text style={[styles.notice, styles.notice_warn]} testID="warehouse-picking-box-type-missing">
            {t.picking.box.typeEmpty}
          </Text>
        ) : null}
        {/* Çevrimdışıyken okutma düğmesi ÇİZİLMEZ (kabul ekranı deseni): kod çözümü sunucuda,
            kuyruğu yok — basılamayan düğme yerine yokluk, kilidin kendisini anlatır. */}
        {picking.boxMode && picking.openBox !== null && !offline ? (
          <PressableSurface
            onPress={() => picking.setScanOpen(true)}
            feedback="scale"
            style={styles.scanButton}
            accessibilityLabel={t.picking.box.scanCta}
            testID="warehouse-picking-scan"
          >
            <Text style={styles.scanButtonLabel}>{t.picking.box.scanCta}</Text>
          </PressableSurface>
        ) : null}

        {order.lines.map((line) => (
          <LineRow
            key={line.itemId}
            line={line}
            boxMode={picking.boxMode}
            qty={picking.lineState(line.itemId).qty}
            shortReported={picking.lineState(line.itemId).shortReported}
            capacity={picking.capacityOf(line)}
            onQty={(value) => picking.setQty(line.itemId, value, picking.capacityOf(line))}
            onComplete={() =>
              picking.setQty(line.itemId, Math.min(line.orderedQty, picking.capacityOf(line)), picking.capacityOf(line))
            }
            onShort={() => picking.reportShort(line.itemId)}
          />
        ))}
        <Text style={styles.footnote}>{picking.boxMode ? t.picking.box.footnote : t.picking.footnote}</Text>
      </ScrollView>

      <ScanSheet
        open={picking.scanOpen}
        title={t.picking.box.scanTitle}
        hint={t.picking.box.scanHint}
        onClose={() => picking.setScanOpen(false)}
        onScan={picking.handleScan}
        testID="warehouse-picking-scan-sheet"
      />

      {/*
        KARGO KUTUSU TİPİ (07.12) — kutu AÇILMADAN önceki tek soru.

        ── ÇEKMECE, ÇÜNKÜ CEVAP TEK BİR DOKUNUŞ ────────────────────────────────
        Satırlar kuyruğun sipariş satırlarıyla AYNI iskelette (`queueRow` + ad/alt satır +
        chevron): aynı ekranda "listeden birini seç" sorusu ikinci kez soruluyor ve ikinci bir
        görsel dil kurmak, aynı hareketi iki farklı şeye benzetmek olurdu.

        ── SEÇİM ÇİPİ KULLANILMADI ─────────────────────────────────────────────
        Komponent haritası `OperationsChoiceChip` öneriyordu; çipin taşıdığı bilgi SEÇİLİLİKTİR
        ve burada seçililik hiç yaşamıyor — dokunuş kutuyu doğrudan açıyor, `selected` daima
        yanlış kalırdı. Ayrıca ölçü satırı (40×30×25 · dara) tek satırlık bir çipe sığmıyor ve
        depocunun elindeki kartonu tanıması tam ona bağlı.

        ── ATLAMA KAPISI DURUYOR ───────────────────────────────────────────────
        Tipsiz kutu meşru bir hâl (sözleşme künyesi): listede olmayan bir karton kullanılıyor
        olabilir. Kapatmak, depocuyu yanlış bir tip seçmeye zorlardı — yanlış ölçü, ölçüsüzlükten
        beterdir çünkü kendini söylemez.
      */}
      <DispatchSheet picking={picking} />

      <BottomSheet
        visible={picking.boxTypeOpen}
        title={t.picking.box.typeTitle}
        onClose={() => picking.setBoxTypeOpen(false)}
        testID="warehouse-picking-box-type-sheet"
      >
        <Text style={styles.boxTypeHint}>{t.picking.box.typeHint}</Text>
        {picking.shippingBoxes.map((box) => (
          <PressableSurface
            key={box.id}
            onPress={() => picking.openNewBox(box.id)}
            feedback="scale"
            style={styles.queueRow}
            accessibilityLabel={box.name}
            testID={`warehouse-picking-box-type-${box.id}`}
          >
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{box.name}</Text>
              <Text style={styles.rowSub}>{boxSizeLine(box, t.picking.box)}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </PressableSurface>
        ))}
        <TextAction
          label={t.picking.box.typeSkip}
          onPress={() => picking.openNewBox(null)}
          testID="warehouse-picking-box-type-skip"
        />
      </BottomSheet>

      {/* YAPIŞKAN CTA — liste altından akar, gradyan onu kesmeden bitirir (kurye emsali). */}
      <LinearGradient {...operationsTheme.gradient.stickyFade} style={styles.sticky}>
        {picking.notice === null ? null : (
          <Text
            style={[styles.notice, styles[`notice_${picking.notice.tone}`]]}
            accessibilityRole="alert"
            testID="warehouse-picking-notice"
          >
            {picking.notice.text}
          </Text>
        )}
        <PressableSurface
          onPress={onCta}
          disabled={!cta.enabled}
          feedback="shadow"
          style={[styles.cta, cta.enabled ? styles.ctaReady : styles.ctaIdle]}
          accessibilityLabel={cta.label}
          testID="warehouse-picking-cta"
        >
          <Text style={[styles.ctaLabel, cta.enabled ? styles.ctaLabelReady : styles.ctaLabelIdle]}>{cta.label}</Text>
        </PressableSurface>
      </LinearGradient>
    </View>
  );
}

/** Sipariş künyesi (v2:319) — referans · müşteri · kanal. Tutar ve adres YOK (sözleşme de vermiyor). */
function captionOf(order: PreparationOrderContract): string {
  return [order.referenceNo ?? t.picking.noReference, order.customerName, t.common.channel[order.channel]].join(' · ');
}

/**
 * Koliye yazılacak ad — alıcı hesabın sahibinden BAŞKAYSA (web `parcelName` kuralı birebir:
 * boşluk ve büyük/küçük harf duyarsız karşılaştırma; "ayşe yılmaz " ile "Ayşe Yılmaz" aynı kişi).
 */
function parcelName(order: PreparationOrderContract): string | null {
  const recipient = order.recipientName?.trim();
  if (!recipient) return null;
  return recipient.toLocaleLowerCase('tr') === order.customerName.trim().toLocaleLowerCase('tr') ? null : recipient;
}

/**
 * Kutu modunun CTA'sı (23.6): açık kutu yoksa "kutu aç" (ilk kutu tek dokunuş — tasarım brief'i),
 * varsa "kutuyu kapat" — boş kutu kapanmadığı için içerik girilene dek kilitli. Eksik bildirilmiş
 * satır varsa kapanış beyanla gider (cümle onu söyler).
 */
function boxCtaOf(
  hasOpenBox: boolean,
  boxCount: number,
  anyQty: boolean,
  anyShort: boolean,
  sending: boolean,
  offline: boolean,
): { label: string; enabled: boolean } {
  if (offline) return { label: t.common.offlineCta, enabled: false };
  if (sending) return { label: hasOpenBox ? t.picking.cta.sending : t.picking.box.opening, enabled: false };
  if (!hasOpenBox) {
    return {
      label: boxCount === 0 ? t.picking.box.open : fillCopy(t.picking.box.openNext, { n: String(boxCount + 1) }),
      enabled: true,
    };
  }
  if (!anyQty) return { label: t.picking.box.sealPending, enabled: false };
  return { label: anyShort ? t.picking.box.sealShort : t.picking.box.seal, enabled: true };
}

/** CTA'nın üç hâli (v2'nin `dTopCta`sı) + çevrimdışı kilidi. */
function ctaOf(
  resolved: boolean,
  anyShort: boolean,
  sending: boolean,
  offline: boolean,
): { label: string; enabled: boolean } {
  if (offline) return { label: t.common.offlineCta, enabled: false };
  if (sending) return { label: t.picking.cta.sending, enabled: false };
  if (!resolved) return { label: t.picking.cta.pending, enabled: false };
  return { label: anyShort ? t.picking.cta.reported : t.picking.cta.ready, enabled: true };
}

/**
 * ETİKET KARTI (23.7) — 4×6 etiketin içeriği sunucudan (`boxLabelPayload`); basım kutu
 * kapanışında kendiliğinden koşar (karar §1.6) ve seyri bu kartta okunur. Yazıcı tanımsızsa ya da
 * modül derlemede yoksa (`printState: off`) kart önizleme olarak kalır — Depolar ekranına işaret
 * eder. **Tutar yok ve olamaz** — sözleşme taşımıyor (karar §1.5).
 */
function LabelCard({
  label,
  printState,
  onReprint,
  onClose,
}: {
  label: BoxLabelContract;
  printState: PrintState;
  onReprint: () => void;
  onClose: () => void;
}) {
  const route =
    label.deliveryType === 'shipping'
      ? fillCopy(t.picking.box.labelShipping, { date: label.deliveryDate ?? t.picking.box.labelNoDate })
      : fillCopy(t.picking.box.labelRoute, {
          route: label.routeName ?? '—',
          date: label.deliveryDate ?? t.picking.box.labelNoDate,
        });
  return (
    <View style={styles.labelCard} testID="warehouse-picking-label">
      <View style={styles.labelHead}>
        <Text style={styles.labelTitle}>
          {fillCopy(t.picking.box.labelTitle, { n: String(label.boxNo), m: String(label.boxCount) })}
        </Text>
        <TextAction label={t.picking.box.labelClose} onPress={onClose} testID="warehouse-picking-label-close" />
      </View>
      <Text style={styles.labelLine}>
        {fillCopy(t.picking.box.labelOrder, { ref: label.referenceNo ?? t.picking.noReference, name: label.parcelName })}
      </Text>
      <Text style={styles.labelLine}>{route}</Text>
      {label.paymentMethod === null ? null : (
        <Text style={styles.labelLine}>
          {fillCopy(t.picking.box.labelPayment, { method: PAYMENT_METHOD_LABELS[label.paymentMethod] })}
        </Text>
      )}
      {label.items.map((item, index) => (
        <Text key={index} style={styles.labelItem}>
          {fillCopy(t.picking.box.labelItem, { qty: String(item.qty), name: item.name })}
        </Text>
      ))}
      <Text style={styles.labelQr}>{fillCopy(t.picking.box.labelQr, { code: label.code })}</Text>
      {/* Basımın seyri — hata cümlesi AYNEN (SDK reddi teşhis verisidir); `off` = önizleme hâli. */}
      {printState.phase === 'off' ? (
        <Text style={styles.labelPending}>{t.picking.box.labelPending}</Text>
      ) : (
        <View style={styles.labelPrintRow} testID="warehouse-picking-label-print">
          <Text style={styles.labelPending}>
            {printState.phase === 'printing'
              ? t.picking.box.labelPrinting
              : printState.phase === 'printed'
                ? fillCopy(t.picking.box.labelPrinted, { model: printState.model })
                : fillCopy(t.picking.box.labelPrintFailed, { error: printState.message })}
          </Text>
          {printState.phase === 'printing' ? null : (
            <TextAction label={t.picking.box.labelReprint} onPress={onReprint} testID="warehouse-picking-label-reprint" />
          )}
        </View>
      )}
      {/* İğne deneyi paneli (23.5) — yalnız __DEV__ + yazıcı modülü varken çizilir. */}
      <PrintProbe />
    </View>
  );
}

interface LineRowProps {
  line: PreparationLineContract;
  /** Kutu modunda alt cümle değişir: önceki kayıt "yerine geçmez", önceki KUTULARDADIR. */
  boxMode: boolean;
  qty: number;
  shortReported: boolean;
  capacity: number;
  onQty: (qty: number | null) => void;
  onComplete: () => void;
  onShort: () => void;
}

function LineRow({ line, boxMode, qty, shortReported, capacity, onQty, onComplete, onShort }: LineRowProps) {
  const name = productLabel(line.productName, line.variantLabel);
  const first = line.suggestion[0];
  const wanted =
    first === undefined
      ? fillCopy(t.picking.line.wantedNoBatch, { qty: String(line.orderedQty) })
      : fillCopy(t.picking.line.wanted, {
          qty: String(line.orderedQty),
          batch: batchLabel(null, first.expiryDate),
        });
  const complete = qty >= Math.min(line.orderedQty, capacity) && capacity > 0;

  return (
    <View style={styles.lineRow} testID={`warehouse-picking-line-${line.itemId}`}>
      <View style={styles.lineHead}>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{name}</Text>
          <Text style={styles.rowSub}>{wanted}</Text>
        </View>
        <OperationsQtyField
          value={qtyToText(qty)}
          onChangeText={(text) => onQty(parseQty(text))}
          accessibilityLabel={fillCopy(t.picking.line.qtyLabel, { name })}
          tone={complete ? 'done' : 'neutral'}
          size="sm"
          testID={`warehouse-picking-qty-${line.itemId}`}
        />
        <PressableSurface
          onPress={onComplete}
          feedback="scale"
          compact
          style={[styles.completeChip, complete ? styles.completeChipOn : styles.completeChipOff]}
          accessibilityLabel={t.picking.line.complete}
          testID={`warehouse-picking-all-${line.itemId}`}
        >
          <Text style={[styles.completeLabel, complete ? styles.completeLabelOn : styles.completeLabelOff]}>
            {t.picking.line.complete}
          </Text>
        </PressableSurface>
      </View>

      {line.pinnedStockId === null ? null : (
        <Text style={styles.pinned} testID={`warehouse-picking-pinned-${line.itemId}`}>
          {t.picking.line.pinned}
        </Text>
      )}

      {line.shortfallQty === 0 ? null : (
        <Text style={styles.shortHint}>{fillCopy(t.picking.line.shortfallHint, { qty: String(line.shortfallQty) })}</Text>
      )}

      {line.pickedQty === 0 ? null : (
        /* Yarım işin iki dili: kutu modunda önceki kayıt önceki KUTULARDA durur (birleşimi sunucu
           kurar, üstüne yazılmaz); kutusuz akışta yeni kayıt öncekinin YERİNE geçer (hook künyesi)
           — sessizce üstüne yazmak depocunun bilmediği bir kaybı doğururdu. */
        <Text style={styles.shortHint} testID={`warehouse-picking-previous-${line.itemId}`}>
          {fillCopy(boxMode ? t.picking.box.prevBoxes : t.picking.line.previous, { qty: String(line.pickedQty) })}
        </Text>
      )}

      {shortReported ? (
        <Text style={styles.shortReported}>{t.picking.line.shortReported}</Text>
      ) : complete ? null : (
        <TextAction
          label={t.picking.line.shortLink}
          onPress={onShort}
          testID={`warehouse-picking-short-${line.itemId}`}
        />
      )}
    </View>
  );
}

/**
 * **SERVİS SEÇİM ÇEKMECESİ** (07.12) — üç ekran dalında da çizilmesi gerektiği için komponent.
 *
 * Sipariş `ready`ye geçip kuyruktan düşünce ekran dal değiştiriyor (sipariş → kuyruk → boş) ve
 * çekmece bir Modal: hangi dalda olursa olsun aynı katman açılmalı. Üç yere kopyalamak, bir gün
 * yalnız birinde değişen üç çekmece demekti.
 *
 * **Seçim PARA HARCAR** ve bu yüzden karttan ayrı bir katmanda: "seçenekleri gör" ayrı bir adım,
 * "şununla gönder" ayrı. Liste GERÇEK kolilere göre fiyatlı (sunucu mühürlü kutuları ölçüyor),
 * başlıkta koli sayısı ve ağırlık yazıyor — depocu elindekiyle ekrandakini karşılaştırabilsin.
 */
function DispatchSheet({ picking }: { picking: ReturnType<typeof usePreparation> }) {
  const d = t.picking.dispatch;
  const state = picking.dispatch;

  return (
    <BottomSheet
      visible={state.phase === 'options'}
      title={d.sheetTitle}
      onClose={picking.dismissDispatch}
      testID="warehouse-dispatch-sheet"
    >
      {state.phase === 'options' ? (
        <>
          <Text style={styles.boxTypeHint}>
            {fillCopy(d.sheetHint, {
              n: String(state.parcelCount),
              kg: (state.totalWeightG / 1000).toFixed(1).replace('.', ','),
            })}
          </Text>
          {/* Boş liste bir HÂL, hata değil: çok kutulu gönderide multicollo süzgeci her şeyi
              elemiş olabilir ve çare elle taşıyıcı girişidir (yedek şerit, 10.9). */}
          {state.options.length === 0 ? (
            <Text style={styles.dispatchBody}>{d.empty}</Text>
          ) : (
            state.options.map((option) => (
              <PressableSurface
                key={option.code}
                onPress={() => picking.chooseService(option)}
                feedback="scale"
                style={styles.queueRow}
                accessibilityLabel={option.carrierName}
                testID={`warehouse-dispatch-option-${option.code}`}
              >
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>
                    {fillCopy(d.option, {
                      carrier: option.carrierName,
                      price: `${(option.priceCents / 100).toFixed(2).replace('.', ',')} €`,
                    })}
                  </Text>
                  <Text style={styles.rowSub}>{serviceDetail(option)}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </PressableSurface>
            ))
          )}
        </>
      ) : null}
    </BottomSheet>
  );
}

/**
 * **SEVK KARTI** (07.12) — kutu kapandıktan sonraki adım, kendi kartında.
 *
 * ── NEDEN KUYRUK DALINDA DA ÇİZİLİYOR ───────────────────────────────────────
 * Son kutu mühürlenince sipariş `ready`ye geçiyor ve hazırlık kuyruğundan DÜŞÜYOR; ekran kuyruk
 * görünümüne dönüyor. Kart o anda kaybolsaydı depocu kutuyu elinde tutarken etiketi alamazdı.
 * Etiket kartının (23.7) aynı gerekçesi ve aynı deseni.
 *
 * ── SEÇİM ÇEKMECEDE, KARTTA DEĞİL ───────────────────────────────────────────
 * Servis listesi karta gömülseydi kart, ekranın yarısını kaplayan bir tabloya dönerdi ve seçim
 * PARA HARCAYAN bir dokunuş — kaza eseri basılmaya en açık yer, listenin ortasıdır. Çekmece
 * niyeti ayırıyor: "seçenekleri gör" ayrı bir adım, "şununla gönder" ayrı.
 */
interface DispatchCardProps {
  state: DispatchState;
  onStart: () => void;
  onClose: () => void;
}

function DispatchCard({ state, onStart, onClose }: DispatchCardProps) {
  const d = t.picking.dispatch;
  if (state.phase === 'idle') return null;

  return (
    <View style={styles.dispatchCard} testID="warehouse-dispatch">
      <Text style={styles.dispatchTitle}>{d.title}</Text>

      {state.phase === 'offer' ? (
        <>
          <Text style={styles.dispatchBody}>{fillCopy(d.offer, { ref: state.reference })}</Text>
          <PressableSurface
            onPress={onStart}
            feedback="scale"
            style={styles.dispatchCta}
            accessibilityLabel={d.cta}
            testID="warehouse-dispatch-start"
          >
            <Text style={styles.dispatchCtaLabel}>{d.cta}</Text>
          </PressableSurface>
        </>
      ) : null}

      {state.phase === 'loading' ? <Text style={styles.dispatchBody}>{d.loading}</Text> : null}
      {state.phase === 'announcing' ? <Text style={styles.dispatchBody}>{d.announcing}</Text> : null}

      {state.phase === 'blocked' ? (
        <Text style={[styles.dispatchBody, styles.dispatchError]} accessibilityRole="alert" testID="warehouse-dispatch-blocked">
          {fillCopy(d.blocked, { reason: reasonText(state.reason) })}
        </Text>
      ) : null}

      {state.phase === 'done' ? (
        <View style={styles.dispatchDone} testID="warehouse-dispatch-done">
          <Text style={styles.dispatchBody}>{fillCopy(d.done, { n: String(state.trackingNumbers.length) })}</Text>
          {state.trackingNumbers.map((no) => (
            <Text key={no} style={styles.dispatchTracking}>
              {no}
            </Text>
          ))}
          {/* Basım AYRI bir olay: gönderi alındı ve parası ödendi, kâğıt çıkmasa bile geri
              çekilmez (23.7 çizgisi). Üç hâl de söyleniyor — sessiz kalmak "bastı" sanılırdı. */}
          <Text style={[styles.dispatchBody, state.printError === null ? undefined : styles.dispatchError]}>
            {state.printError !== null
              ? fillCopy(d.donePrintFailed, { error: state.printError })
              : state.printed === 0
                ? d.donePrintOff
                : fillCopy(d.donePrinted, { n: String(state.printed) })}
          </Text>
        </View>
      ) : null}

      {state.phase === 'offer' || state.phase === 'blocked' || state.phase === 'done' ? (
        <TextAction label={d.close} onPress={onClose} testID="warehouse-dispatch-close" />
      ) : null}
    </View>
  );
}

/**
 * Servis satırının alt cümlesi — süre + son mil.
 *
 * **Süre `null` YAYGIN bir hâl** (ölçüldü 28.08: bazı taşıyıcılar hiç bildirmiyor) ve o zaman
 * "bilinmiyor" yazılıyor, sıfır ya da boşluk değil: bilinmeyen bir süreyi gizlemek depocuya
 * "hemen gider" dedirtirdi (`CLAUDE §1`).
 */
function serviceDetail(option: { leadTimeHours: number | null; lastMile: string | null }): string {
  const d = t.picking.dispatch;
  const sure = option.leadTimeHours === null ? d.optionNoLead : fillCopy(d.optionLead, { hours: String(option.leadTimeHours) });
  const mil = option.lastMile === 'home_delivery' ? d.optionHome : option.lastMile === null ? null : d.optionPoint;
  return [sure, mil].filter(Boolean).join(' · ');
}

/** Ön koşulun ADI → depocunun cümlesi. Tanınmayan anahtar HAM geçer: gizlemek teşhisi siler. */
function reasonText(reason: string): string {
  const sozluk = t.picking.dispatch.reason as Record<string, string | undefined>;
  return sozluk[reason] ?? reason;
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
  heading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    // Harf aralığı token'da `em` (yazı boyuna göreli) tutulur; RN mutlak dp ister — çeviri
    // `emToDp` ile, tek yerden (`theme/parse.ts` künyesi).
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space.sm,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space['3xl'],
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  parcelName: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.ink,
    paddingTop: operationsTheme.space.xl,
  },
  labelCard: {
    marginTop: operationsTheme.space.xl,
    padding: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
    backgroundColor: operationsTheme.colors.card,
    gap: operationsTheme.space.xs,
  },
  labelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors['olive-dark'],
  },
  labelLine: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  labelItem: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.body,
  },
  labelQr: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  labelPending: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  /** Basım seyri satırı — cümle + "yeniden bas" yan yana; cümle uzarsa eylem sağda kalır. */
  labelPrintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.md,
  },
  boxStrip: {
    gap: operationsTheme.space.xs,
    paddingTop: operationsTheme.space.xl,
  },
  /** Kapalı kutu satırı — salt-okunur özet; kutu artık değiştirilemez, rengi de bunu söyler. */
  boxSealed: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  boxCurrent: {
    alignSelf: 'flex-start',
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors['olive-bg'],
    color: operationsTheme.colors['olive-dark'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
  /**
   * Kuyruğun kâğıt okutma düğmesi (10.1) — DOLU zeminli, kutu okutmasının çerçeveli hâlinden
   * ayrı. Gerekçe hiyerarşi: kuyrukta bu birincil eylemdir (kâğıdı eline almış depocunun ilk
   * hareketi), kutu içindeyse okutma akışın ortasında bir adımdır.
   */
  queueScanButton: {
    // `controlLg`: eldivenli parmakla, soğuk depoda basılacak birincil düğme (tasarım §7).
    height: operationsTheme.size.controlLg,
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.olive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueScanLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors.cream,
  },
  /** Sevk kartı — etiket kartının iskeleti, ayrı tonda: bu kart PARA harcayan bir eylem taşıyor. */
  dispatchCard: {
    marginTop: operationsTheme.space.xl,
    padding: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
    backgroundColor: operationsTheme.colors.card,
    gap: operationsTheme.space.sm,
  },
  dispatchTitle: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['card-title-sm--font-weight']],
    fontSize: operationsTheme.text['card-title-sm'],
    color: operationsTheme.colors.ink,
  },
  dispatchBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.muted,
  },
  dispatchError: { color: operationsTheme.colors.terracotta },
  dispatchDone: { gap: operationsTheme.space['2xs'] },
  dispatchTracking: {
    // Tema tek-aralıklı yüz taşımıyor; takip numarası gövde yüzünün KALIN hâliyle yazılıyor —
    // kopyalanacak bir dize olduğu için çevresinden ayrılması yeter.
    fontFamily: operationsTheme.font.body[600],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  dispatchCta: {
    height: operationsTheme.size.controlSm,
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.olive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dispatchCtaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors.cream,
  },
  /** Çekmecenin açıklama satırı — kimlik bloğunun `email` satırıyla aynı ton (staff-menu emsali). */
  boxTypeHint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.muted,
    marginBottom: operationsTheme.space.md,
  },
  scanButton: {
    marginTop: operationsTheme.space.xl,
    height: operationsTheme.size.controlSm,
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButtonLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['olive-dark'],
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
  chevron: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors['sand-600'],
  },
  completeChip: {
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.lg,
    borderWidth: operationsTheme.border.base,
    borderRadius: operationsTheme.radius.badge,
  },
  completeChipOn: {
    backgroundColor: operationsTheme.colors.olive,
    borderColor: operationsTheme.colors.olive,
  },
  completeChipOff: {
    backgroundColor: 'transparent',
    borderColor: operationsTheme.colors['olive-line'],
  },
  completeLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
  completeLabelOn: { color: operationsTheme.colors.card },
  completeLabelOff: { color: operationsTheme.colors['olive-dark'] },
  pinned: {
    alignSelf: 'flex-start',
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    color: operationsTheme.colors.terracotta,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
  shortHint: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.terracotta,
  },
  shortReported: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
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
    boxShadow: operationsTheme.shadow.hard,
  },
  /** v2'nin kapalı CTA'sı: gölgesiz, soluk dolgu — basılamaz olduğunu RENGİYLE de söyler. */
  ctaIdle: { backgroundColor: operationsTheme.colors['disabled-fill'] },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
  },
  ctaLabelReady: { color: operationsTheme.colors.card },
  ctaLabelIdle: { color: operationsTheme.colors.card },
});
