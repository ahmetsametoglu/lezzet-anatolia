import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { PAYMENT_METHOD_LABELS, type BoxLabelContract, type PreparationLineContract, type PreparationOrderContract } from '@lezzet/types';

import { OperationsIconButton } from '@/components/operations/icon-button';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsConfirmSheet } from '@/components/operations/confirm-sheet';
import { OperationsProductRow } from '@/components/operations/product-row';
import { OperationsProgressBar } from '@/components/operations/progress-bar';
import { OperationsQtyField } from '@/components/operations/qty-field';
import { OperationsScanFab } from '@/components/operations/scan-fab';
import { OperationsScanQtySheet } from '@/components/operations/scan-qty-sheet';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PrintProbe } from '@/components/print/print-probe';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { TextAction } from '@/components/ui/text-action';
import { toastInfo } from '@/lib/toast/toast-store';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import { usePreparation, type DispatchState, type PreparationScope, type PrintState } from './use-preparation.hook';
import { batchLabel, boxSizeLine, orderPickingQueue, parseQty, productLabel, qtyToText } from './warehouse-format';
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

/**
 * İlk yükün yer tutucu satır yüksekliği (dp) — kuyruk satırının gerçek boyu.
 * `skeleton-list.tsx` künyesinde v3'ten ölçülen değer ("kuyruk satırı 74"); yer tutucu yerini
 * tuttuğu şeyin boyunda olmazsa veri gelince sayfa yine zıplar.
 */
const QUEUE_SKELETON_HEIGHT = 74;

export function PreparationScreen() {
  /** Kapanış onayı açık mı — yalnız eksik kalan kalem varken doğar. */
  const [sealAsk, setSealAsk] = useState(false);
  /** Menüsü açık olan KAPALI kutunun kimliği — `null` = menü kapalı. */
  const [boxMenu, setBoxMenu] = useState<string | null>(null);
  const router = useRouter();
  const picking = usePreparation();

  /*
    BİLDİRİM KANALI TOAST (kullanıcı kararı 31.08) — ekrana yapıştırılan bant KALKTI.

    Uygulamanın zaten tek bir bildirim dili var (`ToastHost`, kökte) ve kurye ekranları onu
    kullanıyordu; toplama ekranı kendi bandını çizerek aynı işi ikinci bir görsel dille yapıyordu.
    Kullanıcının cümlesi: *"biz zaten mesajları bu şekilde göstermiyoruz ki, bizim toast mesajımız
    var."* Başarılı okutmanın cümlesi ise büsbütün kalktı — okutulan şey listeye ZATEN ekleniyor
    ve adet çekmecesi ürünün adıyla açılıyor; üstüne bir de "bulundu" demek aynı haberi üç kez
    vermekti.

    `toastInfo` SESSİZ olan ve bu bilinçli: titreşimi `useNotice` tonuna göre zaten yazma anında
    veriyor (künyesi orada). `toastSuccess`/`toastError` seçilseydi her bildirim iki kez titrerdi.
  */
  useEffect(() => {
    if (picking.notice !== null) toastInfo(picking.notice.text);
  }, [picking.notice]);
  const { offline } = useWarehouseStatus();

  const order = picking.order;
  const done = picking.scope === 'done';
  /*
    ETİKET ÇEKMECESİ HER DALDA ÇİZİLİR (kullanıcı bulgusu 01.09) — dalların İÇİNDE değil.

    ── NİÇİN ÇEKMECE ───────────────────────────────────────────────────────
    Kart bir tur listenin başındaydı; içeriği aşağı itiyor ve basım DÜŞTÜĞÜNDE ("etiket görseli
    alınamadı") ekranın en kritik cümlesi bir kaydırma boyu uzağa düşebiliyordu. Basım sonucu bir
    HABERDİR ve cevabı bekler.

    ── NİÇİN DALLARIN DIŞINDA ──────────────────────────────────────────────
    Ekranın beş dalı var (yükleniyor · hata · boş · kuyruk · sipariş) ve çekmece yalnız sonuncuda
    çiziliyordu. Kutu kapanınca sipariş `ready`ye geçip kuyruktan düşüyor; dal değişiyor ve
    **yeni açılmış çekmece o anda ekrandan siliniyordu**. Kapsamın tamamlananlara geçmesi bunu
    çözüyor (hook künyesi) ama tek başına yetmez: liste boş dönerse ya da okuma düşerse dal yine
    değişir ve etiket yine kaybolurdu. Çekmece bir dalın parçası değil, EKRANIN parçası.

    Değişken olarak duruyor, komponent olarak değil: dört dalda da AYNI nesne çiziliyor ve
    ikinci bir bileşen, tek satırlık bir JSX'i sarmalamaktan başka bir şey yapmazdı.
  */
  const labelSheet = (
    <BottomSheet
      visible={picking.label !== null}
      title={
        picking.label === null
          ? ''
          : fillCopy(t.picking.box.labelTitle, {
              n: String(picking.label.boxNo),
              m: String(picking.label.boxCount),
            })
      }
      onClose={picking.dismissLabel}
      testID="warehouse-picking-label-sheet"
    >
      {picking.label === null ? null : (
        <LabelCard label={picking.label} printState={picking.printState} onReprint={picking.reprintLabel} />
      )}
    </BottomSheet>
  );

  const header = (
    <OperationsStackHeader
      title={t.picking.title}
      /* KUYRUKTA künye KUYRUĞUN kendisini anlatır (v3:184 `ov.toplamaAlt`), siparişin değil:
         depocu listeye bakarken "kaç iş var, kaçı yarım" sorusunun cevabını başlıkta okur.
         Sipariş seçilince künye o siparişe döner — hangi işin içinde olduğunu söylemek, o an
         kuyruğun uzunluğundan daha önemlidir. */
      subtitle={order === null ? queueSummary(picking.orders, picking.scope) : captionOf(order)}
      /*
        GERİ ÜÇ AYRI SORUNUN CEVABI (kullanıcı bulgusu 02.09).

        1. İş YENİ BİTTİ mi? → bekleyen kuyruğa dön (`leaveFinished`). Bu dal olmadan geri düğmesi
           depocuyu DEPO KABUĞUNA atıyordu: kapanışta kapsam tamamlananlara geçiyor ve o listede
           tek kayıt varsa üçüncü dal (`router.back()`) çalışıyordu. Kullanıcının cümlesi:
           *"yukarıdaki geri butonuyla çıktığımızda gittiği sayfa ana sayfa oluyor."*
        2. Kuyrukta başka iş var mı? → seçimi bırak, listeye dön.
        3. Yoksa ekrandan çık.
      */
      onBack={() => {
        if (picking.leaveFinished()) return;
        if (order !== null && picking.orders.length > 1) picking.select(null);
        else router.back();
      }}
      backLabel={t.common.back}
      /*
        KAPSAM GEÇİŞİ BAŞLIKTA (kullanıcı isteği 01.09) — "Bekleyenler ayrı, tamamlananlar ayrı".

        Yer başlıktır çünkü değiştirdiği şey EKRANIN KAPSAMI: liste içindeki bir sekme, "listede
        süzüyorum" der; başlıktaki düğme "başka bir listeye bakıyorum" der ve doğru olan ikincisi.
        Yuva ZATEN VAR (`right`, 31.08) — ikinci bir başlık düzeni kurulmadı.

        SEÇİLİ SİPARİŞ VARKEN ÇİZİLMEZ: o an ekranın konusu kuyruk değil, elindeki iştir; kapsamı
        oradan değiştirmek, açık bir siparişi bir dokunuşla kapatmak olurdu.
      */
      right={
        order === null ? (
          <OperationsIconButton
            icon={done ? 'packages' : 'check'}
            onPress={() => picking.setScope(done ? 'pending' : 'done')}
            accessibilityLabel={done ? t.picking.scope.toPending : t.picking.scope.toDone}
            testID="warehouse-picking-scope"
          />
        ) : undefined
      }
      testID="warehouse-picking-header"
    />
  );

  if (picking.status === 'loading') {
    return (
      <View style={styles.screen} testID="warehouse-picking">
        {header}
        {/* İLK YÜK SKELETON (kullanıcı kararı 30.08): halka yerleşim tutmaz, söndüğü an sayfa
            zıplar. Kutular kuyruk satırlarının yerini tutuyor — 74, `skeleton-list.tsx`
            künyesinde toplama kuyruğu için ölçülen değer. */}
        <View style={styles.loading}>
          <OperationsSkeletonList
            heights={[QUEUE_SKELETON_HEIGHT, QUEUE_SKELETON_HEIGHT, QUEUE_SKELETON_HEIGHT]}
            label={t.picking.loading}
            testID="warehouse-picking-loading"
          />
        </View>
        {labelSheet}
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
        {labelSheet}
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
          <DispatchCard state={picking.dispatch} onStart={picking.startDispatch} onClose={picking.dismissDispatch} />
          <View style={styles.block}>
            <OperationsNoticeBlock
              variant="empty"
              title={done ? t.picking.scope.doneEmpty.title : t.picking.empty.title}
              description={done ? t.picking.scope.doneEmpty.body : t.picking.empty.body}
              testID="warehouse-picking-empty"
            />
          </View>
        </ScrollView>

        <DispatchSheet picking={picking} />
        {labelSheet}
      </View>
    );
  }

  if (order === null) {
    return (
      <View style={styles.screen} testID="warehouse-picking">
        {header}
        <ScrollView contentContainerStyle={styles.queueList} testID="warehouse-picking-queue">
          {/* Son kapanan kutunun etiketi (23.7): sipariş hazır olup kuyruktan düşse de kart
              burada kalır — depocu "ne bastıracağını" kapanış anında okur. */}
          <DispatchCard state={picking.dispatch} onStart={picking.startDispatch} onClose={picking.dismissDispatch} />

          {/* OKUTMA ÇEVRİMDIŞI KAPANIR (v3:210-221) — düğme yerine SEBEBİ çizilir. Kâğıdı okutup
              "açılmadı" ile karşılaşmak, sebebi olmayan bir arıza gibi görünürdü; kilidin kendisi
              bir cevaptır. Liste yine duruyor: okumak serbest, YAZMAK kapalı.
              (Düğmenin kendisi artık akışta değil FAB'da — künyesi aşağıda.) */}
          {offline && !done ? (
            <View style={styles.queueLocked} testID="warehouse-picking-queue-locked">
              <Text style={styles.queueLockedTitle}>{t.picking.queueLocked.title}</Text>
              <Text style={styles.queueLockedBody}>{t.picking.queueLocked.body}</Text>
            </View>
          ) : null}

          <View style={styles.queueHeadingRow}>
            <Text style={styles.heading}>{done ? t.picking.scope.doneHeading : t.picking.queueHeading}</Text>
            <Text style={styles.queueHeadingHint}>
              {done ? t.picking.scope.doneHeadingHint : t.picking.queueHeadingHint}
            </Text>
          </View>

          <View style={styles.queueCards}>
          {orderPickingQueue(picking.orders).map((row) => {
            const state = queueStateOf(row);
            return (
              <PressableSurface
                key={row.orderId}
                onPress={() => picking.select(row.orderId)}
                feedback="scale"
                style={styles.queueRow}
                accessibilityLabel={`${captionOf(row)} — ${state.label}`}
                testID={`warehouse-picking-order-${row.orderId}`}
              >
                {/* Sol işaret: satırın durumunu ekrana bakmadan, göz taramasıyla verir. */}
                <View style={[styles.queueMark, { backgroundColor: state.tone }]} />

                <View style={styles.rowBody}>
                  <View style={styles.queueRefRow}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {row.referenceNo ?? t.picking.noReference}
                    </Text>
                    {/* KARGO rozeti YALNIZ taşıyıcı kulvarında: o siparişte kutu TİPİ sorulacak
                        (07.12) ve depocu bunu listeyi açmadan bilmeli. */}
                    {row.deliveryType === 'shipping' ? (
                      <View style={styles.queueTag} testID={`warehouse-picking-order-${row.orderId}-shipping`}>
                        <Text style={styles.queueTagText}>{t.picking.queueShippingTag}</Text>
                      </View>
                    ) : null}
                  </View>

                  <Text style={styles.rowSub} numberOfLines={1}>
                    {queueMetaOf(row)}
                  </Text>

                  <View style={styles.queueProgressRow}>
                    <OperationsProgressBar
                      value={state.ratio}
                      tone={state.tone}
                      testID={`warehouse-picking-order-${row.orderId}-progress`}
                    />
                    <Text style={[styles.queueState, { color: state.tone }]}>{state.label}</Text>
                  </View>
                </View>

                <Text style={styles.chevron}>›</Text>
              </PressableSurface>
            );
          })}
          </View>

          <Text style={styles.queueFootnote}>{done ? t.picking.scope.doneFootnote : t.picking.queueFootnote}</Text>
        </ScrollView>

        {/*
          HAZIRLIK KÂĞIDININ QR'I ARTIK FAB (kullanıcı isteği 01.09) — akıştaki düğme değil.

          Gerekçe ekranın ÖTEKİ yarısıyla aynı (`scan-fab.tsx` künyesi): okutma her ekranda aynı
          yerde, elin gittiği noktada durmalı. Kâğıt okutması listenin ÜSTÜNDE duruyordu ve on
          siparişlik bir kuyrukta aşağı inen depocu için kaybolan bir düğmeydi; sipariş açıldıktan
          sonraki okutma zaten FAB'daydı, yani aynı hareket ekranın iki hâlinde iki ayrı yerde
          aranıyordu.

          Ton `action` (mürekkep): bu daire kâğıdı okutup İŞE BAŞLATIR — ürün okutmanın zeytini
          değil. Çevrimdışında gizlenmiyor SÖNÜYOR; sebebi listenin üstündeki kilit bloğu yazıyor.
          Tamamlananlarda hiç çizilmiyor: orada açılacak bir iş yok.
        */}
        {done ? null : (
          <OperationsScanFab
            icon="scan-paper"
            tone="action"
            disabled={offline}
            accessibilityLabel={t.picking.queueScan.cta}
            onPress={() => picking.setQueueScanOpen(true)}
            testID="warehouse-picking-queue-scan"
          />
        )}

        {/* Okutucu kuyruk dalında da çizilir — `ScanSheet` bir Modal ve listenin içinde değil.
            Kutu okutmasından AYRI bayrak: iki farklı soru, iki farklı cevap yolu. */}
        <DispatchSheet picking={picking} />
        {labelSheet}

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

  /*
    TAMAMLANMIŞ SİPARİŞ SALT OKUNUR (kullanıcı isteği 01.09) — ölçüt KAPSAM değil SİPARİŞİN DURUMU.

    `ready` bir sipariş kuyrukta yoktur: kalemleri toplanmış, kutuları mühürlenmiştir. Ekran yine
    de kutu şeridini çizer, çünkü orada yapılacak bir iş kaldı — etiketi yeniden bastırmak ve
    kutuyu geri açmak (uzun basma menüsü). Ama okutma, kutu açma ve eksik beyanı KAPALI: hepsi
    kapanmış bir işe yeni bir iş yazardı.

    Ölçüt siparişin kendi durumu, "hangi listeden geldim" değil: kapsam bir GÖRÜNTÜ, durum ise
    gerçek. İkisi bugün örtüşüyor ama ayrıştıkları gün doğru olan durumdur.
  */
  const readOnly = order.status === 'ready';
  /* Yapışkan çubuk artık yalnız ESKİ akışta çiziliyor (aşağıdaki künye), yani tek hâl kaldı. */
  const cta = ctaOf(picking.resolved, picking.anyShort, picking.sending, offline);
  /*
    KUTU AÇMA İKİ ADIMLI OLABİLİR (07.12): kargo kulvarında önce TİP sorulur, sonra kutu açılır.
    Rota siparişinde ve tipsiz depoda soru hiç doğmaz — FAB doğrudan kutuyu açar (23.6 akışı).
  */
  const onOpenBox = () => (picking.askBoxType ? picking.setBoxTypeOpen(true) : picking.openNewBox(null));
  /*
    KAPANIŞ ÖNCE SORAR (kullanıcı kararı 31.08) — eksik kalan kalem varsa.

    Eksik BEYANI eskiden satırdaki bir bağlantıydı ("eksik bildir") ve iki kusuru vardı: kalem
    adının hemen altında olduğu için yanlışlıkla tıklanıyordu, ve tek başına hiçbir şey
    yapmadığı için ne işe yaradığı okunmuyordu. Doğru an kapanıştır ve soru orada bir KARARDIR:
    "yeni kutu açacağım" ile "rafta yok, bildir" farklı iki cevap ve ikisi de kapanışı yazar —
    farkı yalnız yönetime soru gidip gitmemesi.

    Eksik yoksa soru HİÇ sorulmaz: her kapanışta onay istemek, onayı bir refleks hâline getirir.
  */
  /*
    KAPATMA SORMAZ, EKSİK BİLDİRME SORAR (kullanıcı kararı 31.08).

    Bir tur önce her eksikli kapanış bir onay ekranı açıyordu ve o ekranın "Eksikleri bildir"
    düğmesi, kutu kapatmaya giden NORMAL yolun üstündeydi: depocu ikinci kutuyu açmak için günde
    onlarca kez oradan geçiyor ve yanlışlıkla siparişi eksik ilan etmesi bir dokunuş uzaklıktaydı.
    Kullanıcının cümlesi: *"bu ekran yanlışlıkla eksik bildir kapata müsait."*

    Yeni bölüşüm niyete göre: **Kutuyu kapat** hiçbir şey sormaz (kalan başka kutuya girecek —
    yaygın hâl), **Eksikleri bildirerek kapat** ayrı ve kasıtlı bir eylemdir, onayı da o ister.
    Onay ekranı böylece sık geçilen yoldan çıkıp yalnız geri dönüşü olmayan kararın önüne kondu.
  */
  const onSealRequest = () => picking.sealCurrentBox();
  const onDeclareRequest = () => setSealAsk(true);

  return (
    <View style={styles.screen} testID="warehouse-picking">
      {header}

      <ScrollView contentContainerStyle={styles.list} testID="warehouse-picking-lines">
        {/* Son kapanan kutunun etiketi (23.7) — ara kutu kapanışında burada görünür. */}
          <DispatchCard state={picking.dispatch} onStart={picking.startDispatch} onClose={picking.dismissDispatch} />
        {/* KOLİYE YAZILACAK AD (23.3, mobil şeridin işareti) — yalnız alıcı hesabın sahibinden
            FARKLIYSA çizilir (web `parcelName` kuralı birebir): ikisi aynıyken satır, hiçbir şey
            söylemeyen bir tekrar olurdu. Adres/telefon yine YOK (tasarım §6). */}
        {/* KOLİ ADI + AÇIK KUTU ÇİPİ AYNI SATIRDA (v3:03) — ikisi de "şu an ne üstünde
            çalışıyorum"un yarısı: hangi koli ve kaçıncı kutu. Çip AYRICA kutu kartında da var ve
            tekrar değil: kart kaydırılıp gözden çıkabilir, bu satır künyenin yanında sabit kalır. */}
        {parcelName(order) === null && picking.openBox === null ? null : (
          <View style={styles.parcelRow}>
            {parcelName(order) === null ? null : (
              <Text style={styles.parcelName} testID="warehouse-picking-parcel">
                {fillCopy(t.picking.parcelName, { name: parcelName(order)! })}
              </Text>
            )}
            {/* AÇIK KUTU ÇİPİ BURADAN KALKTI (kullanıcı bulgusu 31.08). Tasarımda vardı ve gerekçesi
                "kart kaydırılıp gözden çıkabilir, künye sabit kalır" idi — ama cihazda ikisi AYNI
                ekranda, bir santim arayla duruyor ve "KUTU 1 · AÇIK" iki kez okunuyor. */}
          </View>
        )}
        {/* KUTU ŞERİDİ (23.6): kapalı kutular salt-okunur özet, açık kutu başlık çipi + tarama.
            Kutusuz başlanmış işte (boxMode false) şerit hiç çizilmez — eski akış aynen. */}
        {picking.boxMode && picking.boxes.length > 0 ? (
          <View style={styles.boxStrip} testID="warehouse-picking-boxes">
            {/* KAPANAN KUTULAR — SALT OKUNUR (v3:349). v2'de tek satırlık bir özetti ("Kutu 1
                kapalı · 8 ürün"); v3 kutunun İÇİNDEKİNİ ve QR'ını da yazıyor. İkisi de sözleşmede
                zaten var (`items` · `code`) ve ikisi de bir soruya cevap: "yanlış kutuyu mu
                kapattım" ve "bu karton hangi etiketle gidecek". Kapalı kutu geri açılamaz, yani
                bu blok bir kayıttır — düzeltilecek bir şey değil, doğrulanacak bir şey. */}
            {picking.boxes.some((box) => box.sealedAt !== null) ? (
              <Text style={styles.boxSealedTitle}>{t.picking.box.sealedTitle}</Text>
            ) : null}
            {picking.boxes
              .filter((box) => box.sealedAt !== null)
              .map((box) => (
                <PressableSurface
                  key={box.boxId}
                  /* Kısa dokunuş BİR ŞEY YAPMAZ ve bu bilinçli: kart bir kayıt, bir düğme değil.
                     Uzun basma o kaydın menüsünü açar — kullanıcı isteği 01.09: *"kutunun üzerine
                     uzun basılı tuttuğumuz zaman o kutuyla alakalı bir menü çekmece açılsın."* */
                  onPress={() => {}}
                  onLongPress={() => setBoxMenu(box.boxId)}
                  feedback="opacity"
                  style={styles.boxSealedCard}
                  accessibilityLabel={fillCopy(t.picking.box.sealedBox, { n: String(box.boxNo) })}
                  accessibilityHint={t.picking.box.boxMenu.hint}
                  testID={`warehouse-picking-box-${box.boxNo}`}
                >
                  {/* BAŞLIK TEK SATIR (v3:03 · ölçüldü 31.08): ✓ + "Kutu N" solda, künye SAĞA
                      yaslı. Kapanan kutu bir KAYITTIR; üç kademeye yayılan bir başlık onu
                      okunacak bir belgeye çevirir. Onay imi kutunun kapandığını söyleyen tek
                      görsel işaret — metin "kapalı" demiyor artık. */}
                  <View style={styles.boxSealedHead}>
                    <Icon name="check" size={operationsTheme.text.tag} color={operationsTheme.colors.olive} bold />
                    <Text style={styles.boxSealed}>{fillCopy(t.picking.box.sealedBox, { n: String(box.boxNo) })}</Text>
                    <Text style={styles.boxSealedQr} numberOfLines={1}>
                      {`${box.code} · ${fillCopy(t.picking.box.contentCaptionShort, {
                        n: String(box.items.reduce((sum, item) => sum + item.qty, 0)),
                      })}`}
                    </Text>
                  </View>
                  {/* İçerik kalem ADIYLA yazılıyor: adet tek başına "8 ürün" der ve depocu neyin
                      kapandığını bilmez. Ad siparişin kalemlerinden çözülüyor — sözleşme kutuda
                      yalnız kimlik taşıyor, adı iki kaynaktan taşımak biri ötekiyle çelişirdi. */}
                  {box.items.map((item) => {
                    const line = order.lines.find((candidate) => candidate.itemId === item.orderItemId);
                    if (line === undefined) return null;
                    return (
                      <OperationsProductRow
                        key={item.orderItemId}
                        name={line.productName}
                        variantLabel={line.variantLabel}
                        photoUri={line.imageUrl}
                        style={styles.boxSealedItem}
                        right={<Text style={styles.boxSealedQty}>{item.qty}</Text>}
                      />
                    );
                  })}
                </PressableSurface>
              ))}
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

        {/*
          EKSEN DÖNÜŞÜ (v3 · 31.08) — kutu bir ETİKET değil ÇALIŞMA ALANI.

          Eski akışta liste giriş yoluydu: bütün kalemler artı/eksi sayaçlarıyla ekranda dururdu,
          depocu satırı gözüyle bulup sayardı. Yeni akış kullanıcının anlattığı harekettir: masaya
          gelinir, kutu açılır, ürün OKUTULUR, adet onaylanır — satırı sistem bulur. Liste bu
          yüzden aşağı indi ve bir KONTROL TABLOSUNA döndü ("ne kaldı"), giriş yolu olmaktan çıktı.

          Ayrım `boxMode`da: kutusuz başlanmış iş (web masasından yarım) ESKİ akışla biter —
          kalem düzeyinde kutulu/kutusuz karışımını RPC reddediyor (0048) ve o siparişte kutu hiç
          açılmayacak, dolayısıyla yeni akışın dayandığı zemin de yok.
        */}
        {readOnly ? (
          <Text style={styles.footnote} testID="warehouse-picking-done-hint">
            {picking.boxes.length === 0 ? t.picking.scope.doneNoBoxes : t.picking.scope.doneOrderHint}
          </Text>
        ) : picking.boxMode ? (
          <>
            {picking.openBox === null ? (
              <View style={styles.boxEmpty} testID="warehouse-picking-box-empty">
                <Text style={styles.boxEmptyTitle}>{t.picking.box.emptyTitle}</Text>
                <Text style={styles.boxEmptyBody}>{t.picking.box.emptyBody}</Text>
              </View>
            ) : (
              <OpenBoxCard picking={picking} offline={offline} onSeal={onSealRequest} />
            )}
            <PendingList picking={picking} offline={offline} />
            <Text style={styles.footnote}>{t.picking.box.footnote}</Text>
            {/* Çubuk mutlak konumlu ve listenin son satırını örterdi; pay onun yüksekliğince. */}
            {picking.shortLines.length > 0 && picking.boxedQty > 0 ? <View style={styles.declareBarSpacer} /> : null}

          </>
        ) : (
          <>
            {order.lines.map((line, index) => (
              <LineRow
                key={line.itemId}
                line={line}
                index={index}
                boxMode={false}
                offline={offline}
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
            <Text style={styles.footnote}>{t.picking.footnote}</Text>
          </>
        )}
      </ScrollView>

      {/*
        OKUTMA HER ZAMAN ELİN ALTINDA (kullanıcı kararı 31.08) — kaydırmayla kaybolmaz.

        İki işlevli: kutu yoksa onu AÇAR (mürekkep), varsa OKUTUR (zeytin). Elin gittiği yer sabit
        kalıyor, değişen tek şey oradaki eylem. Çevrimdışıyken gizlenmiyor SÖNÜYOR — "burada
        okutma yok" ile "şimdi olmaz" ayrı cümleler ve depocuya doğru olan ikincisi.
      */}
      {picking.boxMode && !readOnly ? (
        <OperationsScanFab
          icon={picking.openBox === null ? 'packages' : 'scan'}
          tone={picking.openBox === null ? 'action' : 'scan'}
          accessibilityLabel={picking.openBox === null ? t.picking.box.fabOpen : t.picking.box.fabScan}
          disabled={offline || picking.sending}
          onPress={picking.openBox === null ? onOpenBox : () => picking.setScanOpen(true)}
          /* Eksik bildirme çubuğu varken daire onun ÜSTÜNE çıkar — yoksa çubuğun cümlesini
             örtüyor (kullanıcı bulgusu 31.08). Yükseklik çubuğun payıyla aynı sabitten. */
          lift={picking.shortLines.length > 0 && picking.boxedQty > 0 ? operationsTheme.space['9xl'] : 0}
          testID="warehouse-picking-fab"
        />
      ) : null}

      {/*
        EKSİK BİLDİRİMİ EKRANIN DİBİNE YAPIŞIK (kullanıcı kararı 31.08).

        ── SİPARİŞİN, KUTUNUN DEĞİL ────────────────────────────────────────────
        Bir tur kutu kartının içindeydi ve yanlış yerdi: beyan edilen şey "bu kutuya sığmadı"
        değil, *"bu siparişten şu kadarı rafta yok"*. Kutunun içinde durduğu sürece her yeni
        kutuda bir kez daha karşına çıkıyordu.

        ── AKIŞIN İÇİNDE DEĞİL, ÇUBUKTA ────────────────────────────────────────
        İçeriğin peşine takılan bir bölüm listenin uzunluğuna göre bazen görünüyor bazen
        kayboluyordu; oysa bu karar sipariş açık olduğu SÜRECE alınabilir olmalı. Çubuk bu yüzden
        listeden bağımsız ve en altta — FAB'ın altında kalıyor, okutma hâlâ elin gittiği yerde.

        ── KIRMIZI VE DOLU ─────────────────────────────────────────────────────
        Ton `error`: geri dönüşü olmayan tek karar bu ve rengi öyle demeli. Basmak tek başına bir
        şey YAPMIYOR — onay çekmecesi açılıyor; kırmızı burada "dikkat et" diyor, "oldu" demiyor.
      */}
      {picking.boxMode && !readOnly && picking.shortLines.length > 0 && picking.boxedQty > 0 ? (
        <View style={styles.declareBar}>
          <Text style={styles.declareBarBody}>
            {fillCopy(t.picking.box.declare.body, { n: String(picking.shortLines.length) })}
          </Text>
          <PrimaryButton
            label={t.picking.box.sealShort}
            tone="error"
            disabled={offline || picking.sending}
            onPress={onDeclareRequest}
            testID="warehouse-picking-declare-short"
          />
        </View>
      ) : null}

      {/*
        KAPALI KUTUNUN MENÜSÜ (kullanıcı isteği 01.09) — uzun basmayla açılır.

        Kapanan kutu bir KAYITTIR ve kısa dokunuş bir şey yapmaz; ama kayıt DÜZELTİLEBİLİR olmalı:
        etiket yırtılır, yanlış kartona yapışır, kutuya yanlış ürün girer. Yazılımın "artık olmaz"
        demesi depocuyu kaydın DIŞINDA çalışmaya iter — o gün kayıt gerçeği anlatmayı bırakır.

        Çekmece, çünkü cevap tek dokunuş: iki eylem ve bir vazgeçme. Menü ekranın kendi diline
        yaslanıyor (`BottomSheet` + satırlar), ikinci bir bağlam-menü dili kurulmuyor.
      */}
      <BottomSheet
        visible={boxMenu !== null}
        title={fillCopy(t.picking.box.boxMenu.title, {
          n: String(picking.boxes.find((box) => box.boxId === boxMenu)?.boxNo ?? '—'),
        })}
        onClose={() => setBoxMenu(null)}
        testID="warehouse-picking-box-menu"
      >
        <PressableSurface
          onPress={() => {
            const target = boxMenu;
            setBoxMenu(null);
            if (target !== null) picking.reprintBoxLabel(target);
          }}
          feedback="opacity"
          style={styles.boxMenuRow}
          accessibilityLabel={t.picking.box.boxMenu.reprint}
          testID="warehouse-picking-box-menu-reprint"
        >
          <Icon name="printer" size={operationsTheme.text.body} color={operationsTheme.colors.ink} />
          <Text style={styles.boxMenuLabel}>{t.picking.box.boxMenu.reprint}</Text>
        </PressableSurface>

        <PressableSurface
          onPress={() => {
            const target = boxMenu;
            setBoxMenu(null);
            if (target !== null) picking.reopenBox(target);
          }}
          disabled={offline || picking.sending}
          feedback="opacity"
          style={styles.boxMenuRow}
          accessibilityLabel={t.picking.box.boxMenu.reopen}
          testID="warehouse-picking-box-menu-reopen"
        >
          <Icon name="packages" size={operationsTheme.text.body} color={operationsTheme.colors.terracotta} />
          <View style={styles.boxMenuText}>
            <Text style={[styles.boxMenuLabel, styles.boxMenuLabel_warn]}>{t.picking.box.boxMenu.reopen}</Text>
            {/* Bedeli ÖNCEDEN yazılır: geri açma kaydı oynatır ve her kutuda mümkün değil. */}
            <Text style={styles.boxMenuHint}>{t.picking.box.boxMenu.reopenHint}</Text>
          </View>
        </PressableSurface>
      </BottomSheet>


      <ScanSheet
        open={picking.scanOpen}
        title={t.picking.box.scanTitle}
        hint={t.picking.box.scanHint}
        onClose={() => picking.setScanOpen(false)}
        onScan={picking.handleScan}
        /*
          SİMÜLASYON ÇİPLERİ BU SİPARİŞİN ÜRÜNLERİ (kullanıcı isteği 31.08).

          Varsayılan havuz (`DEV_SCAN_POOL`) ROLE göre kurulu — "Paket", "Koli ×24", "Yabancı
          ürün" — ve hangi ürüne bağlandığı seed'in kararı. Toplama ekranında bu işe yaramıyordu:
          depocu bu SİPARİŞİN kalemlerini okutmak istiyor, rastgele bir paketi değil.

          Çipler kalemin GERÇEK paket barkodunu taşıyor, yani kısa devre yok: çipe basmak
          `/codes/resolve`ün aynı yolundan geçiyor ve "bu siparişte yok" dalı da dahil bütün
          cevaplar aynen doğuyor. Barkodu girilmemiş kalem çip üretmez — uydurma bir kod,
          simülasyonu yalancı yapardı.
        */
        devCodes={order.lines.flatMap((line) =>
          line.barcode === null
            ? []
            : [{ label: productLabel(line.productName, line.variantLabel), code: line.barcode }],
        )}
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
      {labelSheet}

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

      {/*
        YAPIŞKAN ÇUBUK — artık YALNIZ eski akışın CTA'sını taşıyor (kullanıcı kararı 31.08:
        *"iki tane kutu kapata gerek yok, alttaki olmasa daha iyi"*). Kutu akışında kapatma düğmesi
        kutunun KENDİ kartında duruyor; aynı eylemi iki yerden sunmak, hangisinin "asıl" olduğunu
        belirsiz bırakırdı.

        Sonuç cümlesi buradan da KALKTI (kullanıcı kararı 31.08): bildirim kanalı uygulamanın
        kendi toast'ı, ekranın içine yapıştırılan bir bant değil — künyesi aşağıda, köprüde.
      */}
      {picking.boxMode ? null : (
        <LinearGradient {...operationsTheme.gradient.stickyFade} style={styles.sticky}>
          <PressableSurface
            onPress={picking.submit}
            disabled={!cta.enabled}
            feedback="shadow"
            style={[styles.cta, cta.enabled ? styles.ctaReady : styles.ctaIdle]}
            accessibilityLabel={cta.label}
            testID="warehouse-picking-cta"
          >
            <Text style={[styles.ctaLabel, cta.enabled ? styles.ctaLabelReady : styles.ctaLabelIdle]}>{cta.label}</Text>
          </PressableSurface>
        </LinearGradient>
      )}

      {/*
        KAPANIŞ ONAYI — eksik kalan kalem varken. İki cevap da kutuyu kapatır; farkı YÖNETİME
        soru gidip gitmemesi (`declareShort`). "Vazgeç" yerine "Yeni kutu açacağım" yazıyor
        çünkü depocunun oradaki gerçek seçeneği bu — vazgeçmek kapanışı iptal etmek değil,
        kalanı başka kutuya koymaktır.
      */}
      <OperationsConfirmSheet
        visible={sealAsk}
        title={fillCopy(t.picking.box.shortConfirm.title, { n: String(picking.shortLines.length) })}
        message={t.picking.box.shortConfirm.message}
        confirmLabel={t.picking.box.shortConfirm.declare}
        cancelLabel={t.picking.box.shortConfirm.keep}
        /* İPTAL ARTIK HİÇBİR ŞEY YAPMIYOR (31.08): çekmece "kutuyu kapat"ın önünde dururken iptal
           "beyansız kapat" demekti; şimdi kendi düğmesiyle açılıyor ve iptalin karşılığı yalnız
           vazgeçmek. Kapatmayı iptal düğmesine bindirmek, iki eylemi tek dokunuşta gizlerdi. */
        tone="error"
        busy={picking.sending}
        busyLabel={t.picking.box.shortConfirm.busy}
        onConfirm={() => {
          setSealAsk(false);
          picking.declareShort();
        }}
        onCancel={() => setSealAsk(false)}
        testID="warehouse-picking-seal-confirm"
      >
        {/* Eksik kalemler TEK TEK yazılır: "3 kalem eksik" hangi kalemler olduğunu söylemez ve
            depocu son kez rafa dönüp bakabilmeli. */}
        {picking.shortLines.map(({ line, missingQty }) => (
          <Text key={line.itemId} style={styles.sealShortLine}>
            {fillCopy(t.picking.box.shortConfirm.line, {
              name: productLabel(line.productName, line.variantLabel),
              qty: String(missingQty),
            })}
          </Text>
        ))}
      </OperationsConfirmSheet>

      {/* ADET ÇEKMECESİ — okutmanın ikinci yarısı; kalanla dolu gelir, depocu onaylar. */}
      {picking.qtyTarget === null ? null : (
        <OperationsScanQtySheet
          visible
          name={picking.qtyTarget.productName}
          variantLabel={picking.qtyTarget.variantLabel}
          caption={qtySheetCaption(picking.qtyTarget)}
          stats={[
            { value: String(picking.qtyTarget.orderedQty), label: t.picking.qtySheet.wanted },
            {
              value: String(remainingOf(picking.qtyTarget, picking.lineState(picking.qtyTarget.itemId).qty)),
              label: t.picking.qtySheet.left,
              tone: 'warn',
            },
          ]}
          value={picking.qtyValue}
          onChange={picking.setQtyValue}
          qtyCaption={t.picking.qtySheet.qtyCaption}
          /* SERT DUVAR motorun ayırdığı parti toplamıdır: rafta olmayan mal okutmayla da
             "konmuş" yazılamaz. Bugün bu tavan istenen adede EŞİT (öneri kalan için üretiliyor),
             yani "istenenden fazla" hâli ulaşılamaz — tasarımın kırmızı "fazla" satırı bu yüzden
             çizilmiyor (ölçüldü 31.08, `suggestFefoPicks(requestedQty…)`). */
          max={picking.capacityOf(picking.qtyTarget)}
          confirmLabel={t.picking.qtySheet.confirm}
          confirmDisabled={picking.qtyValue <= 0}
          onConfirm={picking.confirmQty}
          footnote={t.picking.qtySheet.footnote}
          onClose={picking.closeQtySheet}
          testID="warehouse-picking-qty-sheet"
        />
      )}
    </View>
  );
}

/**
 * Kuyruğun kendi künyesi (v3:184) — kaç iş var, kaçı yarım kalmış.
 *
 * Tamamlananlarda "yarım" diye bir hâl yok (hepsi mühürlenmiş) ve sayı bir İŞ YÜKÜ değil bir
 * pencere boyudur — künye bu yüzden ayrı cümle kurar. Aynı cümleyi kullanmak, depocuya "on işin
 * bekliyor" dedirtirdi.
 */
function queueSummary(orders: readonly PreparationOrderContract[], scope: PreparationScope): string {
  if (scope === 'done') {
    return orders.length === 0
      ? t.picking.scope.doneSummary.none
      : fillCopy(t.picking.scope.doneSummary.some, { n: String(orders.length) });
  }
  const half = orders.filter((row) => row.pickedLineCount > 0 && row.pickedLineCount < row.lineCount).length;
  return half > 0
    ? fillCopy(t.picking.queueSummary.someWithHalf, { n: String(orders.length), half: String(half) })
    : fillCopy(t.picking.queueSummary.some, { n: String(orders.length) });
}

/**
 * Kuyruk satırının DURUMU (v3:256-320) — ilerleme çubuğunun rengi, dolgusu ve yanındaki cümle.
 *
 * ŞABLON KENDİ İÇİNDE TUTARSIZ ve bu bilinçli bir seçim gerektirdi: beş örnek satırın sol
 * işaret rengi tek bir kurala uymuyor (dördüncü satır hiç başlanmamışken terracotta, beşincisi
 * tamamlanmışken gri). Statik bir maket olduğu için işaretler elle boyanmış. Çoğunluğun ifade
 * ettiği kural alındı ve İŞARET İLE METİN AYNI kuralı izliyor:
 *   · yarım (0 < toplanan < toplam) → terracotta: bitirilmeyi bekleyen iş
 *   · tamam (toplanan = toplam)     → zeytin: kapanmaya hazır
 *   · hiç başlanmamış               → gri: sırada
 * "Improvise etme" kuralının sınırı burası: tasarım tek bir şey söylemediğinde, söylediklerinin
 * ÇOĞUNLUĞU alınır ve seçim yazılır.
 */
function queueStateOf(order: PreparationOrderContract): { label: string; tone: string; ratio: number } {
  const filled = { picked: String(order.pickedLineCount), total: String(order.lineCount) };
  const ratio = order.lineCount === 0 ? 0 : order.pickedLineCount / order.lineCount;

  if (order.pickedLineCount > 0 && order.pickedLineCount < order.lineCount) {
    return { label: fillCopy(t.picking.queueState.half, filled), tone: operationsTheme.colors.terracotta, ratio };
  }
  if (order.pickedLineCount > 0 && order.pickedLineCount === order.lineCount) {
    return { label: fillCopy(t.picking.queueState.ready, filled), tone: operationsTheme.colors.olive, ratio };
  }
  return { label: fillCopy(t.picking.queueState.open, filled), tone: operationsTheme.colors.muted, ratio };
}

/** Satırın ikinci satırı — müşteri · kanal (+ kulvar). Kulvar YALNIZ adrese giden siparişte yazılır. */
function queueMetaOf(order: PreparationOrderContract): string {
  const parts = [order.customerName, t.common.channel[order.channel]];
  if (order.deliveryType === 'route') parts.push(t.picking.queueDelivery.route);
  if (order.deliveryType === 'shipping') parts.push(t.picking.queueDelivery.shipping);
  return parts.join(' · ');
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
 * **AÇIK KUTU KARTI** (v3:03 · 31.08) — kutunun İÇİ, artık görünür.
 *
 * Eskiden açık kutu tek satırlık bir çipti (`KUTU 2 · AÇIK`) ve içine ne konduğu hiçbir yerde
 * yazmıyordu; konan adet kalemin kendi sayacında duruyordu, yani "bu kutuda ne var" sorusunun
 * cevabı ekranda YOKTU. Kutu kapanınca içerik kesinleştiği için bu, geri alınamayan bir kararın
 * körlemesine verilmesi demekti.
 *
 * Kapatma düğmesi de burada: kartın konusu kutu, eylemi de kutunun kendi eylemi.
 */
function OpenBoxCard({
  picking,
  offline,
  onSeal,
}: {
  picking: ReturnType<typeof usePreparation>;
  offline: boolean;
  /** Kutuyu OLDUĞU GİBİ kapatır — soru yok; kalan başka kutuya girecek demektir. */
  onSeal: () => void;
}) {
  const box = picking.openBox;
  if (box === null) return null;

  const seal = sealCtaOf(picking.anyQty, picking.sending, offline);
  const boxedQty = picking.boxItems.reduce((sum, line) => sum + picking.lineState(line.itemId).qty, 0);
  /* Tip SEÇİLDİYSE adı da yazılır: kutu açıldıktan sonra seçimi düzeltmenin yolu yok, dolayısıyla
     depocu yanlış kartona doldurmaya başlamadan görmeli. Adı listeden çözüyoruz — sözleşme yalnız
     kimlik taşıyor (künyesi orada). */
  const typeName = picking.shippingBoxes.find((row) => row.id === box.shippingBoxId)?.name ?? null;

  return (
    <View style={styles.openBox} testID="warehouse-picking-box-open">
      <View style={styles.openBoxHead}>
        <View style={styles.openBoxHeadText}>
          <Text style={styles.openBoxTitle}>
            {typeName === null
              ? fillCopy(t.picking.box.current, { n: String(box.boxNo) })
              : fillCopy(t.picking.box.currentTyped, { n: String(box.boxNo), name: typeName })}
          </Text>
          <Text style={styles.openBoxCaption}>{fillCopy(t.picking.box.contentCaption, { n: String(boxedQty) })}</Text>
        </View>
        <PressableSurface
          onPress={onSeal}
          disabled={!seal.enabled}
          feedback="scale-small"
          compact
          style={[styles.sealButton, seal.enabled ? styles.sealButton_ready : styles.sealButton_idle]}
          accessibilityLabel={seal.label}
          testID="warehouse-picking-seal"
        >
          <Text style={[styles.sealLabel, seal.enabled ? styles.sealLabel_ready : styles.sealLabel_idle]}>
            {seal.label}
          </Text>
        </PressableSurface>
      </View>

      {picking.boxItems.length === 0 ? (
        <Text style={styles.openBoxEmpty}>{t.picking.box.contentEmpty}</Text>
      ) : (
        picking.boxItems.map((line) => {
          const inBox = picking.lineState(line.itemId).qty;
          const total = line.pickedQty + inBox;
          return (
            <OperationsProductRow
              key={line.itemId}
              name={line.productName}
              variantLabel={line.variantLabel}
              photoUri={line.imageUrl}
              tone="olive"
              style={styles.openBoxRow}
              /* "bu kutuda N" YALNIZ önceki kutular varken yazılır: tek kutulu siparişte sağdaki
                 `N/M` zaten aynı sayıyı söylüyor ve satır kendini tekrar ederdi. */
              meta={
                total === inBox ? undefined : (
                  <Text style={styles.openBoxMeta}>{fillCopy(t.picking.box.inThisBox, { n: String(inBox) })}</Text>
                )
              }
              right={
                <View style={styles.openBoxRight}>
                  <Text style={styles.openBoxCount}>
                    {fillCopy(t.picking.box.itemTotal, { boxed: String(total), ordered: String(line.orderedQty) })}
                  </Text>
                  <OperationsIconButton
                    icon="close"
                    tone="plain"
                    onPress={() => picking.removeFromBox(line.itemId)}
                    accessibilityLabel={fillCopy(t.picking.box.removeItem, {
                      name: productLabel(line.productName, line.variantLabel),
                    })}
                    testID={`warehouse-picking-box-remove-${line.itemId}`}
                  />
                </View>
              }
            />
          );
        })
      )}

    </View>
  );
}

/**
 * **KONTROL LİSTESİ** (v3:03 · 31.08) — "kâğıtta ne kaldı".
 *
 * Liste artık GİRİŞ YOLU DEĞİL: tamamı kutulanan kalem düşer, kalan satır ne kadar kaldığını
 * söyler ve dokunulunca elle düzeltme çekmecesini açar. Sayaç kalem değil ADET sayıyor —
 * "3/4 kalem" son kalemin 12 adet olduğunu saklardı.
 */
function PendingList({ picking, offline }: { picking: ReturnType<typeof usePreparation>; offline: boolean }) {
  const counter = fillCopy(t.picking.pending.counter, {
    boxed: String(picking.boxedQty),
    ordered: String(picking.orderedQty),
  });

  if (picking.pendingLines.length === 0) {
    return (
      <View style={styles.pendingDone} testID="warehouse-picking-pending-done">
        <Text style={styles.pendingDoneTitle}>{t.picking.pending.doneTitle}</Text>
        <Text style={styles.pendingDoneBody}>{t.picking.pending.doneBody}</Text>
      </View>
    );
  }

  return (
    <View style={styles.pending} testID="warehouse-picking-pending">
      <View style={styles.pendingHead}>
        <Text style={styles.pendingHeading}>{t.picking.pending.heading}</Text>
        <Text style={styles.pendingCounter}>{counter}</Text>
      </View>

      {picking.pendingLines.map((line) => {
        const boxed = line.pickedQty + picking.lineState(line.itemId).qty;
        const remaining = remainingOf(line, picking.lineState(line.itemId).qty);
        const inOpenBox = picking.lineState(line.itemId).qty > 0;
        return (
          <OperationsProductRow
            key={line.itemId}
            name={line.productName}
            variantLabel={line.variantLabel}
            photoUri={line.imageUrl}
            size="md"
            style={[styles.pendingRow, boxed > 0 ? styles.pendingRow_started : null]}
            /*
              SATIR YALNIZ AÇIK KUTU VARKEN DOKUNULABİLİR (kullanıcı bulgusu 31.08).

              Kutu yokken çekmece açılıyor ve adet giriliyordu — konacak yeri olmayan bir adet.
              Kaydın gideceği kutu yoksa girilen sayı hiçbir şeye bağlanmıyor; depocu "koydum"
              sanıyor, kapatacak kutu bulamıyor. Yüzen düğme o hâlde zaten "Kutu aç" diyor: sıra
              önce onda.

              Çevrimdışıyken de dokunulamaz — adet yazmak bir YAZMADIR ve depo kartlarında yazma
              kuyruğa alınmaz ("mal rafta, sistem başka söylüyor" olamaz).
            */
            onPress={offline || picking.openBox === null ? undefined : () => picking.openQtyFor(line.itemId)}
            accessibilityLabel={fillCopy(t.picking.pending.openLine, {
              name: productLabel(line.productName, line.variantLabel),
            })}
            /*
              SATIRDA "EKSİK BİLDİR" YOK (kullanıcı kararı 31.08).

              Bağlantı satırın içindeydi ve iki sorunu vardı: **çok kolay tıklanıyordu** (kalem
              adının hemen altında, kaydırırken bile) ve **ne işe yaradığı okunmuyordu** — hiçbir
              şeyi değiştirmeyen, yalnız kapanışın cümlesini oynatan bir bağlantı.

              Doğru an KAPANIŞTIR: eksik zaten konan adetten TÜRÜYOR (istenen − kutulanan), yani
              depocunun ayrıca işaretlemesine gerek yok. Kutu kapanırken sistem eksikleri sayıp
              "bunları bildireyim mi" diye soruyor; beyan o onayla veriliyor.
            */
            meta={
              <>
                {shelfTagOf(line)}
                {/*
                  "KUTULARA GİREN N" YALNIZ AÇIK KUTUDA GÖRÜNMEYEN KALEMDE (kullanıcı bulgusu 31.08).

                  Kalem açık kutudaysa o blok zaten "2/4" diyor — *"siparişin dördünden ikisi
                  bende"*. Aynı sayıyı bir de burada tekrar etmek, ekrandaki "2"lerin sayısını
                  artırmaktan başka bir şey yapmıyordu. Cümle yalnız KAPALI kutudan gelen adette
                  anlamlı: onu söyleyen başka bir satır yok.
                */}
                {boxed > 0 && !inOpenBox ? (
                  <Text style={styles.pendingBoxed}>{fillCopy(t.picking.pending.boxedSoFar, { n: String(boxed) })}</Text>
                ) : null}
              </>
            }
            right={
              /*
                SAĞ BLOK KESİR GİBİ OKUNUYORDU (kullanıcı bulgusu 31.08): büyük "2"nin altında
                "/ 4 kalan" yazıyordu ve ekranda "2/4 kalan" diye birleşiyordu — anlamsız.
                Bölü işareti kalktı: büyük rakamın YANINDA ne olduğu ("kalan"), altında da neyin
                içinden olduğu ("4 istenen") yazıyor.
              */
              <View style={styles.pendingRight}>
                <View style={styles.pendingRemainingRow}>
                  <Text style={styles.pendingRemaining}>{remaining}</Text>
                  <Text style={styles.pendingRemainingLabel}>{t.picking.pending.remainingLabel}</Text>
                </View>
                <Text style={styles.pendingOrdered}>
                  {fillCopy(t.picking.pending.ordered, { ordered: String(line.orderedQty) })}
                </Text>
              </View>
            }
            testID={`warehouse-picking-pending-${line.itemId}`}
          />
        );
      })}
    </View>
  );
}

/**
 * **ROZET ÖNERİNİN KENDİSİNİ TAŞIR** (kullanıcı kararı 31.08) — rafın adını.
 *
 * Eskiden rozette "MOTOR ÖNERİSİ" yazıyordu ve altında rafın adı küçücük bir satırdaydı.
 * Kullanıcının cümlesi: *"rozet çok büyük, onun önerisi ise çok küçük"* — yani ekranda en çok
 * yer kaplayan şey BİLGİ TAŞIMIYORDU ("bu bir öneri"), taşıyan şey ise okunmuyordu (raf).
 * "Motor" kelimesi de gitti: depocuya sistemin iç adını söylemenin bir karşılığı yok.
 *
 * Rozetin TONU artık tek soruyu yanıtlıyor: bu raf bir öneri mi, zorunluluk mu.
 * · zeytin  → öneri; depocu başka partiden alabilir (kaydı bugün düzeltemiyor — `BEKLEYEN(21.193)`)
 * · koyu ⚓  → çıpalı parti; indirimli teklife söz verilen stok başka partiyle karşılanamaz (DOMAIN §4)
 */
function shelfTagOf(line: PreparationLineContract) {
  const shelf = line.suggestion[0]?.areaName ?? undefined;
  if (line.pinnedStockId !== null) {
    return (
      <Text style={[styles.pendingFlag, styles.pendingFlag_pinned]}>
        {fillCopy(t.picking.line.shelfTagPinned, { shelf: shelf ?? t.picking.line.shelfTagUnknown })}
      </Text>
    );
  }
  /* Önerisiz kalemde rozet YİNE çizilir ama sönük: "raf yazılmamış" bir bilgidir, yokluğu değil —
     rozeti hiç çizmemek, depocuya rafın nerede olduğunu aramak için hiçbir işaret bırakmazdı. */
  if (shelf === undefined) {
    return <Text style={[styles.pendingFlag, styles.pendingFlag_unknown]}>{t.picking.line.shelfTagUnknown}</Text>;
  }
  return (
    <Text style={[styles.pendingFlag, styles.pendingFlag_engine]}>{fillCopy(t.picking.line.shelfTag, { shelf })}</Text>
  );
}

/** Kalemin BU KUTUYA daha kaç adet girebileceği — çekmecenin varsayılanı. */
function remainingOf(line: PreparationLineContract, inBox: number): number {
  return Math.max(0, line.orderedQty - line.pickedQty - inBox);
}

/** Çekmecenin künyesi: raf ve parti — depocunun rafta arayacağı iki şey. */
function qtySheetCaption(line: PreparationLineContract): string {
  const shelf = line.suggestion[0]?.areaName ?? t.picking.pending.noShelf;
  const batch = line.suggestion[0];
  return batch === undefined
    ? fillCopy(t.picking.qtySheet.captionNoBatch, { shelf })
    : fillCopy(t.picking.qtySheet.caption, {
        shelf,
        batch: fillCopy(t.picking.line.batch, { code: batch.stockId.slice(0, 8), date: batch.expiryDate }),
      });
}

/**
 * Kutu kapatma düğmesinin hâlleri — `boxCtaOf`un kutu-açma dalı FAB'a taşındı.
 *
 * ETİKET ARTIK EKSİĞE GÖRE DEĞİŞMİYOR (31.08): düğme her hâlde "Kutuyu kapat" der ve hiçbir şey
 * sormaz. Eksik bildirmek ayrı bir eylem oldu (kartın altındaki metin düğmesi) — aynı düğmenin
 * bazen bir şey, bazen başka bir şey yapması tam da yanlışlıkla eksik bildirmeyi kolaylaştırıyordu.
 */
function sealCtaOf(anyQty: boolean, sending: boolean, offline: boolean): { label: string; enabled: boolean } {
  if (offline) return { label: t.picking.box.sealOffline, enabled: false };
  if (sending) return { label: t.picking.cta.sending, enabled: false };
  return { label: t.picking.box.sealShortcut, enabled: anyQty };
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
}: {
  label: BoxLabelContract;
  printState: PrintState;
  onReprint: () => void;
}) {
  const route =
    label.deliveryType === 'shipping'
      ? fillCopy(t.picking.box.labelShipping, { date: label.deliveryDate ?? t.picking.box.labelNoDate })
      : fillCopy(t.picking.box.labelRoute, {
          route: label.routeName ?? '—',
          date: label.deliveryDate ?? t.picking.box.labelNoDate,
        });
  return (
    /* BAŞLIK VE KAPATMA ARTIK ÇEKMECENİN: kart onun içinde yaşıyor ve ikisini de o veriyor —
       aynı başlığı iki kez çizmek, çekmecenin kendi başlık satırını yok saymak olurdu. */
    <View style={styles.labelCard} testID="warehouse-picking-label">
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
  /** Kalemin kuyruktaki sırası (0 tabanlı) — adım satırındaki numara bundan türer. */
  index: number;
  /** Kutu modunda alt cümle değişir: önceki kayıt "yerine geçmez", önceki KUTULARDADIR. */
  boxMode: boolean;
  /** Bağlantı yoksa sayaç yerine konan adet yazılır — yazma kapalı, okuma açık. */
  offline: boolean;
  qty: number;
  shortReported: boolean;
  capacity: number;
  onQty: (qty: number | null) => void;
  onComplete: () => void;
  onShort: () => void;
}

function LineRow({ line, index, boxMode, offline, qty, shortReported, capacity, onQty, onComplete, onShort }: LineRowProps) {
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

  /*
    ADIM SATIRI (v3:376) — "1 · DERİN DONDURUCU 2". Sıra numarası depocunun yürüyeceği YOLDUR;
    raf adı motorun önerdiği partinin durduğu yer (`suggestion[].areaName`). Alan sözleşmede
    ZATEN VARDI ve hiçbir ekranda çizilmiyordu (ölçüldü 30.08) — depocu rafı listede değil,
    kafasında arıyordu.

    Raf BİLİNMİYORSA yalnız numara yazılır: uydurma bir raf adı, depocuyu olmayan bir dolabın
    önüne gönderir. `null` = bilinmiyor, boş dize değil (CLAUDE §1).
  */
  const area = first?.areaName ?? null;
  const step =
    area === null
      ? fillCopy(t.picking.line.stepNoArea, { n: String(index + 1) })
      : fillCopy(t.picking.line.step, { n: String(index + 1), area });

  return (
    <View style={styles.lineRow} testID={`warehouse-picking-line-${line.itemId}`}>
      <Text style={styles.lineStep} testID={`warehouse-picking-step-${line.itemId}`}>
        {step}
      </Text>

      <View style={styles.lineHead}>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{name}</Text>
          <Text style={styles.rowSub}>{wanted}</Text>
          {/* ESKİ AKIŞTA ROZET YOK (31.08): bu satır rafı zaten `step`te ("1 · A-1"), partiyi de
              `wanted`ta yazıyor — üstüne "bu bir öneri" diyen üçüncü bir rozet, aynı şeyi üçüncü
              kez söylemekti. Kutu akışında rozet KALDI ama içeriği değişti: artık rafın kendisi
              (`shelfTagOf` künyesi). */}
        </View>

        {/* ÇEVRİMDIŞI: SAYIM KAPALI (v3:404) — alan soluklaştırılmaz, YERİNE konan adet yazılır.
            Basılamayan bir sayaç "bozuk" görünür; konan adedi söyleyen bir satır "kilitli" der. */}
        {offline ? (
          <Text style={styles.lockedQty} testID={`warehouse-picking-locked-${line.itemId}`}>
            {fillCopy(t.picking.line.lockedQty, { qty: String(qty) })}
          </Text>
        ) : (
          <>
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
          </>
        )}
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
          {/* LİSTE DARALTILDIYSA SÖYLENİR (Faz 2 · kullanıcı kararı 29.08). Ücretsiz kargoda
              koli eve gider ve nokta seçenekleri sunucuda eleniyor; bayrak olmasa depocu
              daraltılmış listeye TAM liste diye bakardı — ve seçenekler azaldığında sebebi
              taşıyıcıda arardı. */}
          {state.homeOnly ? <Text style={styles.dispatchNotice}>{d.homeOnly}</Text> : null}
          {/* Boş liste bir HÂL, hata değil: çok kutulu gönderide multicollo süzgeci her şeyi
              elemiş olabilir ve çare elle taşıyıcı girişidir (yedek şerit, 10.9).

              Boşluğun SEBEBİ ayrı yazılıyor: "eve teslim" süzgeci açıkken listeyi o boşaltmış
              olabilir ve tek bir "servis çıkmadı" cümlesi depocuyu yanlış yere bakmaya gönderir. */}
          {state.options.length === 0 ? (
            <Text style={styles.dispatchBody}>{state.homeOnly ? d.emptyHomeOnly : d.empty}</Text>
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
  /* Skeleton ORTALANMAZ — yerini tuttuğu liste yukarıdan başlıyor; ortalanmış kutular veri
     gelince yukarı sıçrar ve halkanın kusuru geri gelirdi. */
  loading: {
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space['3xl'],
  },
  block: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space['7xl'],
  },
  /* Ekranın yatay dolgusu 20 (tasarımın her bloğu `margin:… 20px`). 22 yazılıydı ve cihazda
     ölçüldü (31.08): kart kenarı 22 dp'de duruyordu, tasarımda 20. */
  list: {
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['8xl'],
  },
  /*
    KUYRUĞUN KENDİ KABI — kartlar arası boşluk BURADA (tasarım: `padding:0 20px 24px; gap:12px`).

    Ayrı bir durak, çünkü detay kabıyla karışamaz: orada blokların kendi `marginTop`ları var ve
    kaba bir `gap` eklemek onları ikiye katlardı. Ölçüldü (31.08, cihaz): kartlar arasında HİÇ
    boşluk yoktu — komşu kartların kenarlıkları birbirine değiyordu ve liste tek bir gri örgü
    gibi okunuyordu.
  */
  queueList: {
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingBottom: operationsTheme.space['7xl'],
  },
  /* Kartların kabı — boşluk BURADA, kaba değil: kabın `gap`i düğme/başlık/dipnot aralarına da
     düşer ve tasarımın o üç aralığı birbirinden farklı (18 · 8 · 10). */
  queueCards: {
    /* Tasarımın kabı `gap:9px` (satır 88 — ilk okumada 12'lik başka bir kap ile karıştırılmıştı,
       cihazda ölçüp düzeltildi 31.08). Ölçekte 9 durağı yok; `lg` (10) alındı — Δ1, ve yukarı
       yuvarlamak kartların birbirine değme riskini de kapatıyor. */
    gap: operationsTheme.space.lg,
  },
  heading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    // Harf aralığı token'da `em` (yazı boyuna göreli) tutulur; RN mutlak dp ister — çeviri
    // `emToDp` ile, tek yerden (`theme/parse.ts` künyesi).
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  /* v3:258 — satır artık kesikli çizgiyle ayrılan bir SATIR değil, kendi çerçevesi olan bir KART.
     Sebebi içeriğin büyümesi: üç bilgi katmanı (referans · künye · ilerleme) bir çizginin altında
     birbirine karışırdı; kart onları bir arada tutuyor. */
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
    backgroundColor: operationsTheme.colors.panel,
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
  },
  /** Sol durum işareti — satırın hâlini göz taramasıyla verir; rengi `queueStateOf`tan gelir. */
  queueMark: {
    width: operationsTheme.size.previewMark,
    alignSelf: 'stretch',
    borderRadius: operationsTheme.radius.tight,
  },
  queueRefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
  },
  /** KARGO rozeti — taşıyıcı kulvarında kutu TİPİ sorulacağının önceden haberi. */
  queueTag: {
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    borderRadius: operationsTheme.radius.tight,
    paddingVertical: operationsTheme.space['2xs'],
    paddingHorizontal: operationsTheme.space.sm,
  },
  /* Rozet ÜSTBAŞLIK kademesindedir, etiket değil (ölçüldü 31.08): tasarım `800 8.5px / .1em`
     yazıyor — yani `eyebrow-sm`. Buraya `badge` (12,5) + `eyebrow` aralığı (.18em) konmuştu ve
     ikisi birden büyüttüğü için rozet cihazda "K A R G O" diye açılıyordu. */
  queueTagText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text['eyebrow-sm'],
    letterSpacing: emToDp(operationsTheme.text['eyebrow-sm--letter-spacing'], operationsTheme.text['eyebrow-sm']),
    color: operationsTheme.colors.terracotta,
  },
  queueProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
    /* Ek üst dolgu YOK: aralığı artık `rowBody`nin `gap`i veriyor (tasarımda üç katman EŞİT
       aralıklı). İkisi birlikte uygulanınca ilerleme satırı komşularından uzak düşüyordu. */
  },
  queueState: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.meta,
  },
  queueHeadingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: operationsTheme.space['4xl'],
    paddingBottom: operationsTheme.space.md,
  },
  queueHeadingHint: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    // Başlıktan bir kademe AÇIK: ipucu, başlığın kendisiyle aynı ağırlıkta okunmamalı.
    color: operationsTheme.colors['sand-600'],
  },
  queueFootnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space.lg,
  },
  /* Çevrimdışı kilidi okutma DÜĞMESİNİN yerine geçer — düğmeyi soluk bırakıp basılabilir
     göstermek, sebebi olmayan bir arıza gibi görünürdü. */
  queueLocked: {
    backgroundColor: operationsTheme.colors['error-bg'],
    borderRadius: operationsTheme.radius.control,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    gap: operationsTheme.space['2xs'],
  },
  queueLockedTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.error,
  },
  queueLockedBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.error,
  },
  /* Koli adı ve açık kutu çipi tek satırda (v3:03) — çip adın SAĞINDA, satır taşarsa alta sarar. */
  sealShortLine: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.error,
  },
  parcelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: operationsTheme.space.lg,
  },
  openBoxChip: {
    overflow: 'hidden',
    backgroundColor: operationsTheme.colors['olive-bg'],
    color: operationsTheme.colors['olive-dark'],
    borderRadius: operationsTheme.radius.badge,
    paddingVertical: operationsTheme.space.sm,
    paddingHorizontal: operationsTheme.space.lg,
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text['eyebrow-sm'],
    letterSpacing: emToDp(operationsTheme.text['eyebrow-sm--letter-spacing'], operationsTheme.text['eyebrow-sm']),
  },
  /* Kapanan kutunun başlığı: onay imi + "Kutu N" solda, künye SAĞA yaslı (tasarımın tek satırı). */
  boxSealedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.sm,
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
    gap: operationsTheme.space.md,
    paddingTop: operationsTheme.space.xl,
  },
  boxSealedTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  /** Kapalı kutunun kartı — salt-okunur KAYIT; kutu geri açılamaz, çerçevesi de bunu söyler. */
  boxSealedCard: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
    borderRadius: operationsTheme.radius.control,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.xl,
    gap: operationsTheme.space['2xs'],
  },
  boxSealed: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.body,
  },
  /* Kapanan kutunun kalem satırı: üstten ince çizgi (tasarım) — kart içinde ayrı bir kutu
     değil, aynı kaydın kademesi. */
  boxSealedItem: {
    borderTopWidth: operationsTheme.border.hairline,
    borderTopColor: operationsTheme.colors['sand-300'],
    paddingTop: operationsTheme.space.sm,
    marginTop: operationsTheme.space['2xs'],
  },
  boxSealedQty: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  boxSealedQr: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors['sand-600'],
  },
  /* KUTU AÇILMADI — kesikli çerçeve (tasarım): kutu henüz YOK, dolayısıyla kutu gibi görünen
     dolu bir kart yanlış olurdu. Kesik çizgi "burası boş bir yer" demenin görsel hâli. */
  boxEmpty: {
    marginTop: operationsTheme.space['2xl'],
    backgroundColor: operationsTheme.colors.cream,
    borderWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.card,
    paddingVertical: operationsTheme.space['4xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
    gap: operationsTheme.space.xs,
  },
  boxEmptyTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.body,
  },
  boxEmptyBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * 1.5,
    color: operationsTheme.colors['tab-inactive'],
  },

  /* AÇIK KUTU — tonlu kartın OLUMLU ailesi (zemin `success-bg`, kenar zeytin). Kenar `success-line`
     değil `olive` çünkü tasarım burada kalın zeytin çiziyor: bu kart bir DURUM bildirimi değil,
     üstünde çalışılan yüzey — kenarın kendisi "şu an burası açık" diyor. */
  openBox: {
    marginTop: operationsTheme.space['2xl'],
    backgroundColor: operationsTheme.colors['success-bg'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.olive,
    borderRadius: operationsTheme.radius.card,
    overflow: 'hidden',
  },
  openBoxHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
  },
  openBoxHeadText: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  openBoxTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text['eyebrow-sm'],
    letterSpacing: emToDp(operationsTheme.text['eyebrow-sm--letter-spacing'], operationsTheme.text['eyebrow-sm']),
    color: operationsTheme.colors['olive-dark'],
  },
  openBoxCaption: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.body,
  },
  sealButton: {
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.badge,
  },
  sealButton_ready: {
    backgroundColor: operationsTheme.colors.olive,
  },
  sealButton_idle: {
    backgroundColor: operationsTheme.colors['disabled-fill'],
  },
  sealLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
  },
  sealLabel_ready: {
    color: operationsTheme.colors['on-image'],
  },
  sealLabel_idle: {
    color: operationsTheme.colors['on-image'],
  },
  openBoxEmpty: {
    borderTopWidth: operationsTheme.border.hairline,
    borderTopColor: operationsTheme.colors['success-line'],
    paddingVertical: operationsTheme.space['3xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
    textAlign: 'center',
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * 1.5,
    color: operationsTheme.colors.body,
  },
  /* Listeden BAĞIMSIZ çubuk: içerik ne kadar uzarsa uzasın ekranın dibinde durur (künyesi
     çizim tarafında). Örtü `stickyFade` — altındaki liste çubuğun arkasında kesilmez, solar. */
  /*
    ÇUBUK OPAK, YARI SAYDAM DEĞİL (cihazda ölçüldü 31.08).

    Önce `stickyFade` gradyanıyla çizilmişti ve altındaki satırlar çubuğun cümlesinin İÇİNDEN
    okunuyordu: "3 kalemin tamamını bulamadın" yazısı ürün satırının üstüne biniyor, satırın kendi
    sayısı yarı görünür kalıyordu. Yapışkan CTA çubuğunda gradyan çalışıyor çünkü orada altta
    yalnız boşluk kalıyor; burada liste çubuğun dibine kadar geliyor. Zemin bu yüzden düz `cream`
    ve üstünde bir çizgi — nerede bittiği belli olsun.
  */
  boxMenuRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space.xl,
  },
  boxMenuText: { flex: 1, gap: operationsTheme.space.xs },
  boxMenuLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  boxMenuLabel_warn: { color: operationsTheme.colors.terracotta },
  boxMenuHint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    lineHeight: operationsTheme.text.meta * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  declareBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: operationsTheme.space.md,
    paddingTop: operationsTheme.space.xl,
    paddingBottom: operationsTheme.space['3xl'],
    paddingHorizontal: operationsTheme.space['5xl'],
    backgroundColor: operationsTheme.colors.cream,
    borderTopWidth: operationsTheme.border.base,
    borderTopColor: operationsTheme.colors['sand-300'],
  },
  declareBarSpacer: { height: operationsTheme.space['9xl'] },
  declareBarBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    lineHeight: operationsTheme.text.meta * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    textAlign: 'center',
  },
  openBoxRow: {
    borderTopWidth: operationsTheme.border.hairline,
    borderTopColor: operationsTheme.colors['success-line'],
    paddingVertical: operationsTheme.space.sm,
    paddingHorizontal: operationsTheme.space['3xl'],
  },
  openBoxMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['badge-sm'],
    color: operationsTheme.colors.muted,
  },
  openBoxRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xs,
  },
  openBoxCount: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors['olive-dark'],
  },

  /* KONTROL LİSTESİ — "kâğıtta ne kaldı". */
  pending: {
    marginTop: operationsTheme.space['3xl'],
    gap: operationsTheme.space.sm,
  },
  pendingHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: operationsTheme.space.xs,
  },
  pendingHeading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  pendingCounter: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  pendingRow: {
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.xl,
  },
  /* BAŞLANMIŞ kalem uyarı ailesine geçer: yarım iş "bitmiş" ile "hiç başlanmamış" arasında kendi
     hâlidir ve depocunun listede en çok aradığı satır odur (tasarım da onu ayrı boyuyor). */
  pendingRow_started: {
    backgroundColor: operationsTheme.colors['warning-bg'],
    borderColor: operationsTheme.colors['warning-line'],
  },
  pendingShelf: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  /* Kendi satırında duruyor (raf rozete taşındı) — o yüzden artık kalın DEĞİL: kalın terracotta
     bir satır, ekrandaki en dikkat çekici şey oluyordu ve söylediği şey ikincil bir bilgi. */
  pendingBoxed: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.terracotta,
  },
  pendingShort: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['badge-sm'],
    color: operationsTheme.colors.terracotta,
  },
  /* Rozet artık RAFIN ADINI taşıyor, bir etiket değil bir ADRES: `eyebrow-sm` (8,5) okunmuyordu.
     `tag` (11) kademesine çıktı ve harf aralığı normale döndü — geniş aralık kısa etiketleri
     ayırır, çok kelimeli bir raf adını ("DERİN DONDURUCU 2") dağıtır. */
  pendingFlag: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderRadius: operationsTheme.radius.tight,
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.md,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
  pendingFlag_unknown: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
    color: operationsTheme.colors.muted,
  },
  pendingFlag_engine: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    color: operationsTheme.colors['olive-dark'],
  },
  pendingFlag_pinned: {
    backgroundColor: operationsTheme.colors.ink,
    color: operationsTheme.colors['on-image'],
  },
  pendingRight: {
    alignItems: 'flex-end',
  },
  /* Rakam ile "kalan" YAN YANA: alt alta yazıldığında araya giren bölü işaretiyle birlikte
     "2/4 kalan" diye tek bir kesir gibi okunuyordu. */
  pendingRemainingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: operationsTheme.space.xs,
  },
  pendingRemainingLabel: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  pendingRemaining: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['h2-sm--font-weight']],
    fontSize: operationsTheme.text['h2-sm'],
    color: operationsTheme.colors.ink,
  },
  pendingOrdered: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['badge-sm'],
    color: operationsTheme.colors.muted,
  },
  pendingDone: {
    marginTop: operationsTheme.space['3xl'],
    backgroundColor: operationsTheme.colors['success-bg'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['success-line'],
    borderRadius: operationsTheme.radius.control,
    padding: operationsTheme.space['3xl'],
    gap: operationsTheme.space.xs,
  },
  pendingDoneTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors['olive-dark'],
  },
  pendingDoneBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * 1.5,
    color: operationsTheme.colors.body,
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
  /**
   * "Liste daraltıldı" satırı — ipucu gövdesinden AYRI bir yüz: bu bir açıklama değil, listenin
   * eksik olduğunu söyleyen bir uyarı. Muted yazılsaydı depocunun gözü onu atlardı.
   */
  dispatchNotice: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
    marginBottom: operationsTheme.space.md,
  },
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
  /** Adım satırı — sıra numarası + rafın adı; depocunun yürüyeceği yol (v3:376). */
  lineStep: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    textTransform: 'uppercase',
    color: operationsTheme.colors.warehouse,
  },
  /** "MOTOR ÖNERİSİ" — sayının nereden geldiğini söyleyen rozet, cümlenin kuyruğu değil. */
  engineTag: {
    alignSelf: 'flex-start',
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.badge,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.badge),
    color: operationsTheme.colors.olive,
  },
  /** Çevrimdışıyken sayacın YERİNE geçen satır — konan adet okunur, değiştirilemez. */
  lockedQty: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.error,
  },
  lineHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  rowBody: {
    flex: 1,
    /* Satırın üç katmanı arasındaki nefes: tasarım `gap:5px` (kuyruk kartı ve kutu tipi satırı
       aynı iskelet). `2xs` (2) yazılıydı ve kart cihazda tasarımdan ~4 dp kısa çıkıyordu
       (ölçüldü 31.08: 75 dp ↔ 79,5 dp). Ölçekte 5 yok; `sm` (6) — Δ1. */
    gap: operationsTheme.space.sm,
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
  /* Liste İÇİNDEKİ cümle: yapışkan çubuktaki kardeşi ALTINA boşluk bırakıyor (çubuğun düğmesinden
     ayrılmak için), burada ÜSTE gerekiyor — cümle kendinden önceki bloğa yapışmamalı. */
  notice_inline: {
    marginTop: operationsTheme.space['2xl'],
    marginBottom: 0,
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
  /** v2'nin kapalı CTA'sı: gölgesiz, soluk dolgu — basılamaz olduğunu RENGİYLE de söyler. */
  ctaIdle: { backgroundColor: operationsTheme.colors['disabled-fill'] },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
  },
  ctaLabelReady: { color: operationsTheme.colors.card },
  ctaLabelIdle: { color: operationsTheme.colors.card },
});
