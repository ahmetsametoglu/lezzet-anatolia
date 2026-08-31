import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Linking, Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsAmountKeypad } from '@/components/operations/amount-keypad';
import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsDashedRule } from '@/components/operations/dashed-rule';
import { OperationsIconButton } from '@/components/operations/icon-button';
import { OperationsConfirmSheet } from '@/components/operations/confirm-sheet';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStepperGroup } from '@/components/operations/stepper-group';
import { OperationsSurface } from '@/components/operations/surface';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { FormScroll } from '@/components/ui/form-scroll';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { courierCopy } from './copy';
import { centsToAmountText } from '@/lib/operations/money';
import { money } from './courier-format';
import { useDelivery } from './use-delivery.hook';

/*
  KURYE · TESLİMAT (v2:96-215) — kapıdaki tek ekran: künye · iletişim · kanıt · mal · tahsilat ·
  sonuç. Kararların ve sözleşme boşluklarının tamamı `use-delivery.hook.ts` künyesinde; burada
  yalnız çizim var.

  ── TASARIMDAN BİLİNÇLİ SAPMALAR ────────────────────────────────────────────
  1. **"Fotoğraf" kanıtı ve sonuç fotoğrafı DEVRE DIŞI, ama ÇİZİLİ** (v2:122, 206). Kamera/galeri
     için yerel bir modül gerekiyor (`expo-image-picker` ya da `expo-camera`) ve ikisi de kurulu
     değil — yeni bağımlılık dev-client'ın yeniden derlenmesini ister ve bu dilimin işi değil.
     Düğme SİLİNMEDİ çünkü tasarımın kararı iki kanıt yolu olması; kapalı ve sebebi yazılı duruyor
     (CLAUDE §3: "dış-modül bekleyende UI tam, arka uç stub"). İmza yolu TAM çalışıyor, yani
     B2B'nin kanıt kapısı bugün de geçilebiliyor.
     BEKLEYEN(21.13): kanıt fotoğrafı — kamera modülü + aynı yükleme kapısı.
  2. **Başarıdan sonra SIRADAKİ DURAĞA otomatik geçilmiyor** (v2:882). Şablon bunu YEREL durumla
     yapıyor (liste bellekte); gerçek akışta bir sonraki durak ancak liste tazelendikten sonra
     bilinir ve o tazeleme K1'de zaten var. Ekran bunun yerine sonucu GÖSTERİP kalıyor — kurye
     "yazıldı mı?" sorusunun cevabını okuyor, sonra listeye dönüyor. Yazma sonrası kaybolan bir
     ekran, `stale`/`deduped` gibi cevapları da beraberinde götürürdü.
  3. **"Ara" ve "WhatsApp" düğmeleri veri yoksa ÇİZİLMEZ.** Tasarım "Ara"yı her zaman çiziyor ama
     sözleşme telefonu `null` bırakabiliyor; işe yaramayacak bir düğme, tasarımın söylemediği bir
     şey söyler ("arayabilirsin"). WhatsApp'ta kural zaten sözleşmenin kendisinde yazılı.
*/

const t = courierCopy;

/**
 * **ADIM BAŞLIĞI** (v3:17 · 30.08) — koyu daire içinde numara, yanında bölümün adı.
 *
 * Numara METNE GÖMÜLÜYDÜ (`"1 · KANIT — B2B'DE ZORUNLU"`) ve tasarım onu ayrı bir öğe olarak
 * çiziyor: 22 dp koyu daire + krem rakam. Fark süs değil — daire adımı SAYILABİLİR kılıyor,
 * kurye "kaçıncı adımdayım" sorusunu satırı okumadan cevaplıyor. Dört bölüm de aynı anatomiyi
 * paylaşıyor; ayrı ayrı yazsaydık biri bir gün ötekinden ayrılırdı (CLAUDE §1).
 */
function StepHeading({
  n,
  label,
  action,
  testID,
}: {
  n: number;
  label: string;
  /**
   * Başlık satırının SAĞ yuvası — bölümün tamamına ait bir eylem (`BottomSheet.titleAction`ın
   * aynı kalıbı, 30.08). Mal adımında "reddedilen kalem ekle" buraya taşındı: gövdede tam
   * genişlikte bir düğme olarak dururken, olmayan bir işi ekranın en görünür öğesi yapıyordu —
   * oysa normal teslimde reddedilen kalem YOKTUR ve bölümün söylemesi gereken tek şey budur.
   */
  action?: ReactNode;
  testID?: string;
}) {
  return (
    /* `testID` SATIRA veriliyor, metne değil: numara artık ayrı bir öğe ve adımın kaçıncı olduğu
       ancak ikisi birlikte okunduğunda ölçülebilir. */
    <View style={styles.stepHead} testID={testID}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>{String(n)}</Text>
      </View>
      <Text style={styles.sectionHeading}>{label}</Text>
      {action === undefined ? null : <View style={styles.stepAction}>{action}</View>}
    </View>
  );
}

/*
  İLK YÜK İSKELETİ — kapıdaki ekranın üç açılış bloğu: adres künyesi (iki satır), iletişim şeridi
  (üç düğme, dolgu 12×2 + ikon) ve ilk adım bölümü (başlık + kutu satırları, satır başına 30).
  Alt bölümler (kanıt · mal · tahsilat) yer tutucuya girmiyor: ekran zaten kaydırılıyor ve
  görünmeyen bir bloğun yerini tutmak, zıplamayı önlemez — yalnız iskeleti uzatır.
*/
const DELIVERY_SKELETON = { address: 46, contacts: 44, section: 110 } as const;

export function CourierDeliveryScreen({ orderId }: { orderId: string }) {
  const router = useRouter();
  const delivery = useDelivery(orderId);
  const stop = delivery.stop;
  /* HOOK ERKEN DÖNÜŞLERİN ÜSTÜNDE: aşağıda "yükleniyor" ve "bulunamadı" dalları var ve durum
     onların altında kurulsaydı hook sırası render'dan render'a değişirdi (React bunu "Rendered
     more hooks than during the previous render" diye kesiyor — 30.08'de yaşandı). */
  const [keypadOpen, setKeypadOpen] = useState(false);
  /** Reddedilen kalem çekmecesi — istisna girilirken açılır, ekranı sürekli doldurmaz. */
  const [refuseOpen, setRefuseOpen] = useState(false);

  /*
    İŞ BİTİNCE LİSTEYE DÖNÜLÜR (kullanıcı kararı 30.08) — ekran "sonuç ekranı"na dönüp KALMIYOR.
    Sonuç toast olarak listenin üstünde görünüyor ve liste odakta tazeleniyor, yani kurye durağın
    yeni hâlini kendi satırında da okuyor. Eski davranış her teslimden sonra kuryeye fazladan iki
    dokunuş yaptırıyordu ve en sık yaptığı iş buydu.
  */
  useEffect(() => {
    if (delivery.finished) router.back();
  }, [delivery.finished, router]);

  if (delivery.status === 'loading') {
    return (
      <View style={styles.screen} testID="courier-delivery">
        <OperationsStackHeader title={t.delivery.loading} onBack={() => router.back()} backLabel={t.delivery.back} />
        {/* İLK YÜK İSKELET, HALKA DEĞİL (ortak karar 30.08) — halka yerleşim tutmaz. */}
        <View style={styles.skeleton}>
          <OperationsSkeletonList
            heights={[DELIVERY_SKELETON.address, DELIVERY_SKELETON.contacts, DELIVERY_SKELETON.section]}
            label={t.delivery.loading}
            testID="courier-delivery-loading"
          />
        </View>
      </View>
    );
  }

  if (delivery.status === 'missing' || stop === null) {
    return (
      <View style={styles.screen} testID="courier-delivery">
        <OperationsStackHeader
          title={t.delivery.notFound.title}
          onBack={() => router.back()}
          backLabel={t.delivery.back}
        />
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="error"
            title={t.delivery.notFound.title}
            description={t.delivery.notFound.body}
            retry={{ label: t.delivery.notFound.retry, onPress: delivery.reload }}
            testID="courier-delivery-missing"
          />
        </View>
      </View>
    );
  }

  /* KAPIYI AÇAN KİŞİ, hesabın sahibi DEĞİL (21.08). Değişken adı zaten `receiver`dı ama hesabın
     adını okuyordu; adresin alıcısı varsa o yazılır — hediye/iş/aile adresinde kurye yanlış adı
     soruyordu. İmza satırı ve imza ipucu da bu adı kullanıyor: kapıda imzalayan kişi odur. */
  const receiver = stop.recipient ?? stop.customerName;

  /* ADIM NUMARASI KUTUYA GÖRE KAYAR (v3, 30.08). Kutulu durakta kutular 1. adımdır ve kanıt/mal/
     tahsilat 2/3/4'e kayar; kutusuz durakta eski 1/2/3 aynen kalır. Numara metne gömülü DEĞİL
     (`delivery.step` kalıbı) — gömülü olduğu sürece bu kayma yazılamıyordu. */
  const boxesLeft = delivery.boxes.length - delivery.scannedBoxCount;
  /*
    KUTU KAPISI SONRAKİ ADIMLARI DA KİLİTLER (v3:17 · düzeltme 30.08).
    Tasarımın cümlesi açıktı: *"Kutular okutulmadan kanıt ve tahsilat adımları açılmaz."* 30.08'de
    kodu ölçüp kilidin yalnız TESLİM DÜĞMESİNDE olduğunu görmüş ve **cümleyi koda uydurmuştum** —
    tersi doğruydu. Sıra bir tercih değil: kutular kapıda müşteriye verilmeden imza almak, teslim
    edilmemiş malın kanıtını toplamaktır; tahsilat da öyle.
    Kutusuz durakta bu kilit YOKTUR (`boxesLeft` sıfır kalır) — eski akış aynen sürer.
  */
  const stepsLocked = boxesLeft > 0;
  /** Kapıda geri verilen kalemler — mal bölümünün özetini ve çekmecenin başlığını besler. */
  const refusedLines = delivery.lines.filter((line) => delivery.refusedQtyOf(line) > 0);
  /** Kapıdan geri verilen TOPLAM adet — çekmecenin canlı kartındaki sayı. */
  const refusedCount = delivery.lines.reduce((sum, line) => sum + delivery.refusedQtyOf(line), 0);
  const stepNo = (n: number): number => (delivery.boxes.length === 0 ? n : n + 1);

  return (
    <View style={styles.screen} testID="courier-delivery">
      <OperationsStackHeader
        title={fillCopy(t.delivery.title, { n: String(delivery.order), total: String(delivery.total) })}
        subtitle={fillCopy(t.delivery.subtitle, {
          ref: stop.referenceNo ?? '—',
          n: String(stop.attempts + 1),
        })}
        onBack={() => router.back()}
        backLabel={t.delivery.back}
        testID="courier-delivery-header"
      />

      <FormScroll contentContainerStyle={styles.body} testID="courier-delivery-body">
        <View style={styles.addressBlock}>
          <View style={styles.addressRow}>
            <Text style={styles.address}>{stop.address ?? t.day.stop.noAddress}</Text>
            {/* ROZET HER KANALDA (kullanıcı bulgusu 30.08 · tasarımda başlığın sabit öğesi):
                eskiden yalnız B2B'de çiziliyordu ve B2C durakta başlığın sağı boş kalıyordu.
                Kanal kapıda ne beklendiğini söyler (fatura, teslim alan kişi, tahsilat âdeti) —
                "yok" demek "B2C" demek değil, kuryeye hiçbir şey söylememektir. */}
            <Text style={styles.channelTag} testID={`courier-delivery-${stop.channel}`}>
              {t.channel[stop.channel]}
            </Text>
          </View>
          <Text style={styles.addressDetail}>{`${receiver} · ${t.channel[stop.channel]}`}</Text>
        </View>

        <View style={styles.contactRow}>
          {stop.address === null ? (
            <View style={[styles.contact, styles.contactDisabled]}>
              <Text style={styles.contactMuted}>{t.delivery.noNavigate}</Text>
            </View>
          ) : (
            <PressableSurface
              onPress={() =>
                void Linking.openURL(
                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address ?? '')}`,
                )
              }
              feedback="scale"
              /* ESNEME `grow`DAN, STİLDEN DEĞİL (kit künyesi · kullanıcı bulgusu 30.08):
                 `styles.contact` içindeki `flex: 1` DIŞ Pressable'a hiç ulaşmıyordu — stil İÇ
                 yüzeye gidiyor ve dış kutu içeriğine büzülüyor. Ölçüldü (uiautomator): satır
                 322 dp yerine 178 dp kalıyordu, Navigasyon 206 yerine 76 dp. */
              grow
              style={[styles.contact, styles.contactPrimary]}
              accessibilityLabel={t.delivery.navigate}
              testID="courier-delivery-navigate"
            >
              <Icon name="navigate" size={operationsTheme.size.headerIcon} color={operationsTheme.colors.card} />
              <Text style={styles.contactPrimaryLabel}>{t.delivery.navigate}</Text>
            </PressableSurface>
          )}
          {/*
            ARA VE WHATSAPP YALNIZ İKON (v3:17 · 30.08) — tasarımda ikisi 56×52 kare, metinsiz;
            yalnız Navigasyon etiketli ve satırın kalanını kaplıyor. Üçü de etiketliyken satır üç
            eşit parçaya bölünüyordu ve asıl eylem (navigasyon) kaybolmuştu.

            Metin GİTMEDİ, `accessibilityLabel`a taşındı: ekran okuyucu kullanan kurye düğmenin
            adını duymaya devam ediyor — kaybolan yalnız görsel tekrar.
          */}
          {stop.phone === null ? null : (
            <PressableSurface
              onPress={() => void Linking.openURL(`tel:${stop.phone ?? ''}`)}
              feedback="scale"
              style={[styles.contactIcon, styles.contactOutline]}
              accessibilityLabel={t.delivery.call}
              testID="courier-delivery-call"
            >
              <Icon name="phone" size={operationsTheme.size.headerIcon} color={operationsTheme.colors.ink} />
            </PressableSurface>
          )}
          {/* Numara yoksa bağlantı `null` gelir ve düğme HİÇ çizilmez — sözleşmenin kendi kuralı. */}
          {stop.whatsAppLink === null ? null : (
            <PressableSurface
              onPress={() => void Linking.openURL(stop.whatsAppLink ?? '')}
              feedback="scale"
              style={[styles.contactIcon, styles.contactOutline]}
              accessibilityLabel={t.delivery.whatsApp}
              testID="courier-delivery-whatsapp"
            >
              <Icon
                name="whatsapp"
                size={operationsTheme.size.headerIcon}
                color={operationsTheme.colors['brand-whatsapp']}
              />
            </PressableSurface>
          )}
        </View>

        {/*
          ── KUTULAR (23.8 · v3:1478) — kutulu durakta teslimin ÖN koşulu ──────────────

          NUMARA KOŞULLU (v3, 30.08): kutulu durakta akış DÖRT adımdır (kutular · kanıt · mal ·
          tahsilat), kutusuzda ÜÇ. Numaralar metne gömülüydü ve kutular numarasızdı — "1 · KANIT"in
          önünde zorunlu ama numarasız bir kapı duruyordu ve kurye onu adımdan saymıyordu. Sayı
          artık gerçeği söylüyor; kutusuz durakta eski numaralar aynen kalıyor.
        */}
        {/*
          KUTUSUZ DURAK ARTIK SESSİZ GEÇİLMEZ (kullanıcı kararı 30.08). Bölüm eskiden hiç
          çizilmiyordu ve kurye kapıda hiçbir şey okutmadan teslim yazabiliyordu. Kutu zorunlu
          olduğuna göre kutusuz bir durak bir ARIZADIR: ekran onu normal göstermez, adı konur ve
          kurye ne yapacağını bilir (CLAUDE §1 — ölçülemeyen değer sıfır değildir; olmayan kutu da
          "kutu yok" demektir, "kutu gerekmiyor" değil).
        */}
        {delivery.boxes.length === 0 ? (
          <View style={styles.section}>
            <StepHeading n={1} label={t.delivery.boxes.heading0} testID="courier-boxes-heading" />
            <OperationsNoticeBlock
              variant="error"
              title={t.delivery.boxes.missing.title}
              description={t.delivery.boxes.missing.body}
              testID="courier-boxes-missing"
            />
          </View>
        ) : (
          <View style={[styles.section, boxesLeft === 0 ? styles.sectionDone : styles.sectionPending]}>
            <StepHeading
              n={1}
              label={fillCopy(t.delivery.boxes.heading, {
                scanned: String(delivery.scannedBoxCount),
                total: String(delivery.boxes.length),
              })}
              testID="courier-boxes-heading"
            />
            {/*
              KUTU SATIRI KODU YAZAR, SIRA NUMARASINI DEĞİL (v3:17 · 30.08).

              "Kutu 1" kuryenin elindeki kartonla eşleşmiyor: kartonun üstünde `KT-26-7741` yazıyor.
              Sıra numarası bizim iç sayacımız, kod ise **fiziksel nesnenin kimliği** — kurye yığından
              doğru kutuyu seçerken ona bakıyor. Numara kare rozette duruyor (tasarım), kod gövdede.

              Sağdaki durum da tasarımın: **araçta mı** (`loadedAt`) — okutulmuş kutuda "verildi"ye
              döner. Yükleme ekranındaki bilgiyi kapıda tekrar sormak yerine burada gösteriyor:
              araca binmemiş bir kutu kapıda hiç bulunamaz ve kurye onu boşuna arar.
            */}
            <View style={styles.boxRows}>
              {delivery.boxes.map((box) => {
                const scanned = delivery.isBoxScanned(box.code);
                return (
                  <View key={box.code} style={styles.boxRow} testID={`courier-box-${box.boxNo}`}>
                    <View style={[styles.boxNo, scanned ? styles.boxNoDone : null]}>
                      <Text style={[styles.boxNoText, scanned ? styles.boxNoTextDone : null]}>
                        {scanned ? '✓' : String(box.boxNo)}
                      </Text>
                    </View>
                    <Text style={[styles.boxCode, scanned ? styles.boxCodeDone : null]}>
                      {fillCopy(t.delivery.boxes.rowCode, { code: box.code })}
                    </Text>
                    <Text style={styles.boxState}>
                      {scanned
                        ? t.delivery.boxes.rowDone
                        : box.loadedAt === null
                          ? t.delivery.boxes.rowNotLoaded
                          : t.delivery.boxes.rowLoaded}
                    </Text>
                  </View>
                );
              })}
            </View>
            {delivery.finished || boxesLeft === 0 ? null : (
              /* OKUTMA DÜĞMESİ KİTTEN, ZEYTİN DOLGULU (v3:17 · 30.08). Çerçeveli çiziliyordu ve
                 tasarım onu dolgulu gösteriyor — kutu okutma bu adımın TEK eylemi. İkon da
                 emoji değil çizgi ikon: metne gömülü `📷` kitin `icon` prop'una taşındı
                 (`load-screen`in aynı kararı, aynı gerekçe). Kalan sayısı DÜĞMEDE (v3:1487):
                 kurye kaç kutu kaldığını başlıktaki sayaçtan geri hesaplamasın. */
              <PrimaryButton
                label={fillCopy(t.delivery.boxes.scanCta, { n: String(boxesLeft) })}
                onPress={() => delivery.setBoxScanOpen(true)}
                icon="scan"
                /* IŞIMA YOK ve bu ölçüldü: v3'ün ışımalı okutma düğmesi ARACA YÜKLEME ekranında
                   (`16:box-shadow 0 4px 14px`); kapıdaki bu düğme düz zeytin (`17:durakOkut`).
                   İkisi aynı işi yapıyor gibi görünse de biri rampada tek eylem, biri adımın
                   içinde bir kapı. */
                elevation="flat"
                testID="courier-box-scan"
              />
            )}

            {/* TEK CÜMLE (kullanıcı bulgusu 30.08): "hepsi verildi" bir izin, "eksik" bir uyarı ve
                bedelini söylüyor. Altında ikinci bir cümle daha duruyordu ("Kutu QR'ları
                okutulmadan teslim kapanmaz") ve aynı şeyi ikinci kez söylüyordu; tasarımda da tek
                cümle var. */}
            <Text style={boxesLeft === 0 ? styles.boxComplete : styles.boxNote}>
              {boxesLeft === 0 ? t.delivery.boxes.complete : t.delivery.boxes.pending}
            </Text>
          </View>
        )}

        {/*
          ── KANIT ADIMI KALKTI (kullanıcı kararı 30.08) ──────────────────────────────────────
          Ekrana parmakla çizilen imza, imzalayanın KİMLİĞİNİ kanıtlamıyor — nitelikli elektronik
          imza değil ve kim çizdiği bilinmiyor. Kutulu akış zorunlu olunca yerine ondan güçlü bir
          kayıt geçti: kutu okutması (`box_scan`) — kod benzersiz, kutu fiziksel bir nesne, okutma
          o kapıda ve o saniyede oldu. Uyuşmazlıkta konuşan zaten demettir (geçiş damgası + kurye
          kimliği + kutu kodları + para hareketi), tek bir çizim değil.

          Ayar duruyor (`delivery_proof_required`) ama fabrika değeri iki kanalda da kapalı; kapsam
          gerekirse yine açılabilir. Yerine gelecek yol BACKLOG'da: kapıda WhatsApp OTP — müşteriye
          altı haneli kod gider, kurye kodu girer; o kod kimliği gerçekten doğrular.
        */}

        {/* ── MAL ───────────────────────────────────────────────────────── */}
        <View style={[styles.section, stepsLocked ? styles.sectionLocked : null]} pointerEvents={stepsLocked ? 'none' : 'auto'}>
          {/* Sayı ÇİZİLEN listeden gelir, `itemCount`tan değil: başlık dokunulabilir satırları
              tarif ediyor, ikisi ayrışırsa başlık ekranda olmayan bir kalemi vaat ederdi. */}
          <StepHeading
            n={stepNo(1)}
            label={fillCopy(t.delivery.goods.heading, { n: String(delivery.lines.length) })}
            action={
              <OperationsIconButton
                icon="plus"
                onPress={() => setRefuseOpen(true)}
                accessibilityLabel={t.delivery.goods.addRefused}
                testID="courier-goods-refuse-open"
              />
            }
          />
          {/*
            ── TESLİM VARSAYILAN, RED İSTİSNA (kullanıcı kararı 30.08) ─────────────────────────
            Bölüm eskiden kalemleri TEK TEK işaretletiyordu ve teslim kapısı bunu şart koşuyordu:
            hiçbir şey reddedilmeyen normal bir teslimde bile kurye kalem sayısı kadar dokunuş
            yapıyordu — elinde kutuyla, kapının önünde. Kutu okutması zorunlu olunca o soru zaten
            cevaplanmış oluyor: kutu mühürlenirken içeriği sabitlendi, kapıda okutuldu, verildi.

            Şimdi bölüm bir ÖZET: "hepsi teslim edildi" ya da geri verilen kalemlerin listesi.
            İstisna çekmeceden giriliyor — ekranı sürekli doldurmuyor, yalnız gerektiğinde açılıyor.
          */}
          {refusedLines.length === 0 ? (
            /* BOŞ HÂL BİR CÜMLE, DÜĞME DEĞİL (kullanıcı isteği 30.08): reddedilen kalem yoksa
               bölümün söyleyeceği tek şey bu — eylem başlıktaki artıya taşındı. */
            <Text style={styles.goodsSummary} testID="courier-goods-summary">
              {t.delivery.goods.allDelivered}
            </Text>
          ) : (
            <View style={styles.refusedList} testID="courier-goods-refused">
              {refusedLines.map((line, index) => (
                /* ANAHTAR KALEMİN KİMLİĞİ: ekranda görünen satır, uca `adjustments` olarak giden
                   satırın kendisidir — sıra numarası olsaydı liste tazelendiğinde kayabilirdi. */
                <Fragment key={line.orderItemId}>
                  {index === 0 ? null : <OperationsDashedRule color={operationsTheme.colors['sand-300']} />}
                  <View style={styles.refusedRow}>
                    <Text style={styles.refusedName}>{line.name}</Text>
                    <Text style={styles.refusedQty}>
                      {fillCopy(t.delivery.goods.refusedOf, {
                        n: String(delivery.refusedQtyOf(line)),
                        total: String(line.qty),
                      })}
                    </Text>
                  </View>
                </Fragment>
              ))}
            </View>
          )}
          {delivery.partialReturn ? (
            <Text style={styles.warnText} testID="courier-partial-note">
              {t.delivery.goods.partialNote}
            </Text>
          ) : null}
        </View>

        {/* ── TAHSİLAT ──────────────────────────────────────────────────── */}
        {delivery.dueCents === null ? (
          <View style={styles.settled} testID="courier-settled">
            <Text style={styles.settledLabel}>{t.delivery.collection.settled}</Text>
            <Text style={styles.settledNote}>{t.delivery.collection.settledNote}</Text>
          </View>
        ) : (
          <View
            style={[styles.collection, stepsLocked ? styles.sectionLocked : null]}
            pointerEvents={stepsLocked ? 'none' : 'auto'}
            testID="courier-collection"
          >
            {/* Tahsilat başlığı da aynı anatomide ama TERRACOTTA dairede (tasarım: `#b05c2e`) —
                para adımı kendi rengini taşıyor, kartın çerçevesiyle aynı aileden. */}
            <View style={styles.stepHead}>
              <View style={[styles.stepBadge, styles.stepBadgeMoney]}>
                <Text style={styles.stepBadgeText}>{String(stepNo(2))}</Text>
              </View>
              <Text style={styles.collectionHeading}>
                {fillCopy(t.delivery.collection.heading, { amount: money(delivery.dueCents) })}
              </Text>
            </View>
            <View style={styles.amountRow}>
              {/*
                TUTAR TEK SATIR, TUŞ TAKIMI ROZETİYLE (v3:17 `kpOpen.tahsilat` · 30.08).

                Alan bir girdi değil, tuş takımını açan düğmedir: kapıda telefon eldivenle
                tutuluyor ve sistem klavyesi ekranın yarısını kaplayıp motorun tutarını görüş
                alanından çıkarıyordu.

                ── ARTI/EKSİ SÖKÜLDÜ (kullanıcı kararı 30.08) ────────────────────────────────
                İki stepper düğmesi tasarımda YOK ve gerekçesi künyede *"yuvarlak tutarlarda tek
                dokunuş"* diye yazılıydı — ama kapıda tahsil edilen tutar MOTORUN hesabıdır,
                kuryenin oynatacağı bir sayı değil. Adım adım artırma, tutarı "pazarlık edilebilir"
                gibi gösteriyordu; eksik ödeme zaten tuş takımından yazılıyor ve ekranda "Kısmi"
                diye işaretleniyor. Rozet tasarımın kendi öğesi: alanın dokunulabilir olduğunu
                söyleyen tek işaret.
              */}
              <PressableSurface
                onPress={() => setKeypadOpen(true)}
                feedback="scale"
                grow
                style={styles.amountInput}
                accessibilityLabel={t.delivery.collection.amountLabel}
                testID="courier-collection-amount"
              >
                <Text style={styles.amountValue}>{delivery.amountText} €</Text>
                <Text style={styles.keypadBadge}>{t.delivery.collection.keypadBadge}</Text>
              </PressableSurface>
            </View>
            {delivery.partialPayment ? (
              <Text style={styles.partialBadge} testID="courier-collection-partial">
                {t.delivery.collection.partial}
              </Text>
            ) : null}
            <View style={styles.methodRow}>
              {(['cash', 'card', 'cheque'] as const).map((option) => (
                <OperationsChoiceChip
                  key={option}
                  label={t.method[option]}
                  selected={delivery.method === option}
                  onPress={() => delivery.setMethod(option)}
                  fill
                  testID={`courier-method-${option}`}
                />
              ))}
            </View>
            {delivery.cashLimitWarning ? (
              <Text style={styles.warnText} testID="courier-cash-warning">
                {t.delivery.collection.cashWarning}
              </Text>
            ) : null}
            <Text style={styles.hintText}>{t.delivery.collection.note}</Text>
            {delivery.collectionBlocked ? (
              <Text style={styles.errorText} accessibilityRole="alert" testID="courier-collection-blocked">
                {t.delivery.collection.blocked}
              </Text>
            ) : null}
          </View>
        )}
      </FormScroll>

      {delivery.dueCents === null ? null : (
        <OperationsAmountKeypad
          visible={keypadOpen}
          title={t.delivery.collection.keypad.title}
          value={delivery.amountText}
          expected={centsToAmountText(delivery.dueCents)}
          expectedLabel={fillCopy(t.delivery.collection.keypad.expected, { amount: money(delivery.dueCents) })}
          // Birim artık PROP (30.08): tuş takımı mal kabulün ADET kutusunda da kullanılıyor ve
          // `€` gömülü kalamazdı. Ondalık burada açık — para kuruş taşır.
          unit="€"
          confirmLabel={t.delivery.collection.keypad.confirm}
          hint={t.delivery.collection.keypad.hint}
          footnote={t.delivery.collection.keypad.footnote}
          deleteLabel={t.delivery.collection.keypad.delete}
          onConfirm={(text) => {
            delivery.setAmountText(text);
            setKeypadOpen(false);
          }}
          onClose={() => setKeypadOpen(false)}
          testID="courier-collection-keypad"
        />
      )}

      <ScanSheet
        open={delivery.boxScanOpen}
        title={t.delivery.boxes.scanTitle}
        hint={t.delivery.boxes.scanHint}
        onClose={() => delivery.setBoxScanOpen(false)}
        onScan={delivery.handleBoxScan}
        // Kutu QR'ı üretilmiş kayıttır — simülasyon çipi ancak durağın gerçek kodlarından kurulur.
        devCodes={delivery.boxes.map((box) => ({ label: fillCopy(t.delivery.boxes.row, { n: String(box.boxNo) }), code: box.code }))}
        testID="courier-box-scan-sheet"
      />

      {/* ── SONUÇ ALANI ───────────────────────────────────────────────────── */}
      <View style={styles.footer}>
        {delivery.notice === null ? null : (
          <Text
            style={[styles.notice, delivery.notice.tone === 'ok' ? styles.noticeOk : styles.noticeError]}
            accessibilityRole="alert"
            testID="courier-delivery-notice"
          >
            {delivery.notice.text}
          </Text>
        )}

        {delivery.outcome === null ? (
          <>
            <PressableSurface
              onPress={delivery.deliver}
              disabled={!delivery.gateOpen}
              feedback="scale"
              style={[styles.primary, delivery.gateOpen ? styles.primaryReady : styles.primaryBlocked]}
              accessibilityLabel={delivery.ctaLabel}
              testID="courier-delivery-cta"
            >
              <Text style={styles.primaryLabel}>{delivery.ctaLabel}</Text>
            </PressableSurface>
            {delivery.gateNote === null ? null : (
              <Text style={styles.gateNote} testID="courier-delivery-gate">
                {delivery.gateNote}
              </Text>
            )}
            {/* İKİ SONUÇ DÜĞMESİ DE KİTTEN (v3:17 · 30.08): ikisi de İKİNCİL — "Ulaşılamadı"
                nötr kum, "Kabul etmedi" kırmızı. Elden çiziliyorlardı ve ölçüleri kitin
                kademesine uymuyordu (dolgudan türeyen yükseklik). */}
            <View style={styles.outcomeRow}>
              {/* YOLA ÇIKMAMIŞ DURAKTA İKİSİ DE PASİF (ölçüldü 31.08 · cihazda). Kutuları
                  binmemiş bir durakta "Ulaşılamadı" basılıyor, uç `same_status` diyordu —
                  `unreachable`ın hedefi `ready` ve sipariş zaten oradaydı. Kurye ise hiçbir şey
                  olmadığını görüyordu: bildirim açık çekmecenin ALTINDA çiziliyordu. Kapıya hiç
                  gitmediğin bir durağa "ulaşılamadı" yazılmaz; sebebi zaten üstteki satırda. */}
              <SecondaryButton
                label={t.delivery.cta.unreachable}
                onPress={() => delivery.openOutcome('unreachable')}
                disabled={!delivery.outcomeOpen}
                elevation="flat"
                grow
                testID="courier-outcome-unreachable"
              />
              <SecondaryButton
                label={t.delivery.cta.refused}
                onPress={() => delivery.openOutcome('refused')}
                disabled={!delivery.outcomeOpen}
                tone="error"
                elevation="flat"
                grow
                testID="courier-outcome-refused"
              />
            </View>
          </>
        ) : null}
      </View>

      {/*
        ── REDDEDİLEN KALEM ÇEKMECESİ (kullanıcı kararı 30.08) ────────────────────────────────
        Kapıda geri verilen mal buradan giriliyor: kutulardaki ürünler listelenir, kurye hangi
        üründen KAÇ ADET geri verildiğini seçer. Ekran akışında sürekli duran bir liste yerine
        yalnız istisna varken açılan bir katman — normal teslimde kurye buraya hiç girmez.

        ADET ÇEKMECEDE, SATIRDA DEĞİL: kalem listesi ekranda kalsaydı her durakta okunması gereken
        bir tablo olurdu; oysa kuryenin kapıda cevapladığı soru tek ve nadirdir — "bir şey geri
        verdi mi".
      */}
      <BottomSheet
        visible={refuseOpen}
        title={t.delivery.goods.refuseTitle}
        onClose={() => setRefuseOpen(false)}
        testID="courier-refuse-sheet"
      >
        {/*
          ── MAL KABUL ÇEKMECESİNİN KALIBI (kullanıcı kararı 31.08) ──────────────────────────
          Desen `OperationsQuantitySheet`ten alındı ve orada gerekçesiyle yazılı: künye satırı →
          CANLI koyu kart → bölüm başlığı + ipucu → kartlı satırlar + bağlı sayaç → "Tamam"
          (onay değil KAPATMA; değer her dokunuşta yukarı gitti).

          İlk hâl düz satırlar ve AYRI ± düğmeleriydi; ikisi de projenin deseni değil:
          · Satır KART olur (`OperationsSurface tone="card"`) — dokunulabilir olmasa bile kart,
            listeyi bir döküme çevirmeden okunur kılıyor (mal kabulün aday listesiyle aynı karar).
          · Sayaç BAĞLIDIR (`OperationsStepperGroup`): tek çerçeve, üç hücre. `StepperButton`
            ayrı duran bir düğmedir ve v3'te ikisi ayrı kalıp (kitin kendi künyesi).
          · Ton ANLAMDIR: geri verilen mal `error` — sayı sıfırdan büyükse kutu kırmızıya döner.
        */}
        <Text style={styles.refuseSubject}>
          {fillCopy(t.delivery.goods.refuseSubject, { n: String(delivery.lines.length) })}
        </Text>

        {/* CANLI KART: kaç adet geri verildi ve tahsilat ne oldu. Kurye kapıda bu iki sayıyı
            birlikte görmeli — biri malın, öteki paranın karşılığı ve ikisi aynı dokunuştan doğuyor. */}
        <View style={styles.refuseTotal}>
          <Text style={styles.refuseTotalValue}>
            {fillCopy(t.delivery.goods.refuseTotal, { n: String(refusedCount) })}
          </Text>
          <Text style={styles.refuseTotalNote}>
            {delivery.dueCents === null
              ? t.delivery.goods.refuseNoDue
              : fillCopy(t.delivery.goods.refuseDue, { amount: money(delivery.dueCents) })}
          </Text>
        </View>

        <Text style={styles.hintText}>{t.delivery.goods.refuseHint}</Text>

        {delivery.lines.map((line) => {
          const refused = delivery.refusedQtyOf(line);
          return (
            <OperationsSurface
              key={line.orderItemId}
              tone="card"
              padding="md"
              testID={`courier-refuse-${line.orderItemId}`}
            >
              <View style={styles.refuseRow}>
                <View style={styles.refuseNameBox}>
                  <Text style={styles.refuseName}>{line.name}</Text>
                  <Text style={styles.refuseOrdered}>
                    {fillCopy(t.delivery.goods.ordered, { n: String(line.qty) })}
                  </Text>
                </View>
                <OperationsStepperGroup
                  value={refused}
                  onChange={(next) => delivery.setRefusedQty(line, next)}
                  label={fillCopy(t.delivery.goods.refusedLabel, { name: line.name })}
                  tone={refused > 0 ? 'error' : 'neutral'}
                  testID={`courier-refuse-step-${line.orderItemId}`}
                />
              </View>
            </OperationsSurface>
          );
        })}

        {/* "Tamam" bir ONAY DEĞİL, kapatma: her ± zaten satıra ve tahsilata yazıldı (kalıbın kuralı). */}
        <PrimaryButton
          label={t.delivery.goods.refuseDone}
          onPress={() => setRefuseOpen(false)}
          tone="ink"
          elevation="flat"
          testID="courier-refuse-done"
        />
      </BottomSheet>

      {/*
        ── SONUÇ ÇEKMECESİ (00-ortak:477 · 30.08) ──────────────────────────────────────────────
        Tasarımda bu bir ALT ÇEKMECEDİR: karartma katmanı, 26 dp üst yarıçap, tutamak, alttan
        kayan panel. Kodda sayfaya GÖMÜLÜ bir kart olarak çiziliyordu ve fark yalnız görsel
        değildi — gömülü panel sayfanın akışına giriyor, kurye onu görmek için kaydırmak zorunda
        kalıyordu; çekmece ise ekranı kaplar ve "şu an tek işin bu" der.

        Kit ZATEN VARDI (`BottomSheet`) ve aynı klasörün kardeş ekranları onu kullanıyordu; bu
        ekran kite hiç sormamıştı (kullanıcı bulgusu 30.08).
      */}
      <OperationsConfirmSheet
        visible={delivery.outcome !== null && !delivery.finished}
        title={
          delivery.outcome === 'refused' ? t.delivery.outcome.refusedTitle : t.delivery.outcome.unreachableTitle
        }
        /* Dipnot SONUCA GÖRE: ulaşılamayanda fotoğrafın bağlı olmadığı, reddedilende kolilerin
           iade akışına düştüğü yazılı — iki çekmece, iki ayrı cümle. Bedel BAŞLIĞIN ALTINDA,
           düğmelerden önce: okunmadan basılmasın. */
        message={
          delivery.outcome === 'refused' ? t.delivery.outcome.refusedHint : t.delivery.outcome.photoUnavailable
        }
        confirmLabel={t.delivery.outcome.confirm}
        cancelLabel={t.delivery.outcome.cancel}
        onConfirm={delivery.confirmOutcome}
        onCancel={delivery.cancelOutcome}
        busy={delivery.sending}
        busyLabel={t.delivery.cta.sending}
        testID="courier-outcome-sheet"
      >
        {/* İnceleme kararı (doc 21, 21.8): ÇİP + SERBEST METİN birlikte — model serbest metin
            taşıyor, çipler yalnız hızlı doldurucudur; sebep listesi bir KISIT değildir. */}
        <View style={styles.chipWrap}>
          {(delivery.outcome === 'refused'
            ? t.delivery.outcome.refusedChips
            : t.delivery.outcome.unreachableChips
          ).map((chip) => (
            <OperationsChoiceChip
              key={chip}
              label={chip}
              /* ÇİP NÖTR, KIRMIZI DEĞİL (tasarım `00-ortak:484`): seçilmemiş çip beyaz zeminli ve
                 koyu metinli bir ÖNERİDİR. Kırmızı ton onları uyarı gibi gösteriyordu — oysa
                 uyarı olan çekmecenin başlığı, çipler yalnız hızlı doldurucu. */
              selected={delivery.outcomeNote === chip}
              onPress={() => delivery.setOutcomeNote(chip)}
              testID={`courier-outcome-chip-${chip}`}
            />
          ))}
        </View>
        <TextInput
          value={delivery.outcomeNote}
          onChangeText={delivery.setOutcomeNote}
          placeholder={t.delivery.outcome.notePlaceholder}
          placeholderTextColor={operationsTheme.colors.muted}
          accessibilityLabel={t.delivery.outcome.noteLabel}
          style={styles.noteInput}
          testID="courier-outcome-note"
        />
        {delivery.noteError === null ? null : (
          <Text style={styles.errorText} accessibilityRole="alert" testID="courier-outcome-note-error">
            {delivery.noteError}
          </Text>
        )}
      </OperationsConfirmSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  /** Yer tutucu gerçek blokların başlayacağı yerde başlar — ortalanmaz; dolgu `body` ile aynı. */
  skeleton: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.lg,
  },
  block: { paddingHorizontal: operationsTheme.space['6xl'] },
  body: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space['6xl'],
    gap: operationsTheme.space['2xl'],
  },
  addressBlock: { gap: operationsTheme.space['2xs'] },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.lg },
  /*
    ADRES GÖVDE FONTUYLA, BAŞLIK FONTUYLA DEĞİL (kullanıcı bulgusu 30.08 · tasarım ölçüldü).

    `font:700 15px/1.4 'Karla'` — yani Karla/700/15, Lora değil. Kod başlık ailesini kullanıyordu
    (`font.display` + `h2-sm`) ve adres ekranda bir SAYFA BAŞLIĞI gibi duruyordu: Durak künyesinden
    (Lora 20) sonra ikinci bir Lora bloğu geliyor ve ikisi birbiriyle yarışıyordu. Adres bir
    başlık değil, kapıda okunacak bir VERİ — tasarım onu gövde fontunda ve bir tık kalın yazıyor.
  */
  address: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    lineHeight: operationsTheme.text.body * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.ink,
  },
  channelTag: {
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.badge,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.ink,
  },
  addressDetail: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.body,
  },
  contactRow: { flexDirection: 'row', gap: operationsTheme.space.md },
  /* NAVİGASYON YATAY, SABİT BOYLU (v3:17 `height:52`): ikon ve etiket yan yana — dikey dizilim
     düğmeyi iki satırlık bir karoya çeviriyordu ve yanındaki ikon kareleriyle hizası bozuluyordu.
     Yükseklik dolgudan değil kademeden (`controlLg` = 52, tasarımın kendi değeri). */
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: operationsTheme.space.md,
    height: operationsTheme.size.controlLg,
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
  },
  /** Metinsiz ikon düğmesi — tasarımda 56×52 kare (`17:navSheet` satırı). */
  contactIcon: {
    width: operationsTheme.size.contactIcon,
    alignItems: 'center',
    justifyContent: 'center',
    height: operationsTheme.size.controlLg,
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
  },
  contactPrimary: {
    backgroundColor: operationsTheme.colors.olive,
    borderColor: operationsTheme.colors.olive,
  },
  contactOutline: { borderColor: operationsTheme.colors['sand-500'] },
  contactDisabled: {
    borderStyle: 'dashed',
    borderColor: operationsTheme.colors['disabled-line'],
  },
  contactLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.ink,
  },
  contactPrimaryLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.card,
  },
  contactMuted: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
    textAlign: 'center',
  },
  /*
    ADIM BÖLÜMÜ KART (v3:17 · 30.08) — tasarımda her adım kendi kartında: krem panel, kum çerçeve,
    20 dp yarıçap, `15/16` dolgu. Bizde düz bloklardı ve adımlar birbirine akıyordu; tahsilat
    bölümü zaten kartlıydı (kendi rengiyle) ve yanındaki iki bölüm ondan farklı bir dilde
    duruyordu. Kart, her adımı "burada şu iş var" diye çerçeveliyor.
  */
  section: {
    gap: operationsTheme.space.lg,
    padding: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    backgroundColor: operationsTheme.colors.panel,
  },
  /*
    KUTU ADIMI KENDİ TONUNU TAŞIR (v3 `c.kutuAdim` · 30.08) — kart nötr DEĞİL:
    · eksik  → uyarı ailesi (`warning-bg` + `warning-line`, tasarımın değerleriyle BİREBİR)
    · tamam  → zeytin ailesi: "bu adım bitti" işareti
    Nötr kartla çizilirken kutuların okutulup okutulmadığı ancak başlıktaki sayaç okunarak
    anlaşılıyordu; renk o soruyu ekrana bakar bakmaz cevaplıyor.
  */
  sectionPending: {
    backgroundColor: operationsTheme.colors['warning-bg'],
    borderColor: operationsTheme.colors['warning-line'],
  },
  sectionDone: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    borderColor: operationsTheme.colors['olive-line'],
  },
  /** Adım başlığı satırı — rozet + ad, dikey ortada (tasarım `gap:9`); sağ uçta eylem yuvası. */
  stepHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
  },
  /** Eylem SAĞA yaslanır: ad ile arasındaki boşluk bölümün genişliği kadar esner. */
  stepAction: { marginLeft: 'auto' },
  /** Numara rozeti: 22 dp koyu daire, krem rakam (tasarımın kendi ölçüsü). */
  stepBadge: {
    width: operationsTheme.size.stepBadge,
    height: operationsTheme.size.stepBadge,
    borderRadius: operationsTheme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: operationsTheme.colors.ink,
  },
  /** Para adımının rozeti terracotta — kartın çerçevesiyle aynı aileden. */
  stepBadgeMoney: { backgroundColor: operationsTheme.colors.terracotta },
  stepBadgeText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['on-image'],
  },
  sectionHeading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  /*
    KUTULAR ALT ALTA, YAN YANA DEĞİL (v3:17 · 30.08). Rozet gibi sarmalanıyordu ve kutu kodu
    (`KT-26-7741`) rozete sığmaz; tasarım her kutuyu kendi satırında, üç sütunlu çiziyor:
    kare numara · kod · durum. Kurye yığından kutu seçerken satır satır okuyor.
  */
  boxRows: { gap: operationsTheme.space.sm },
  boxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  /** Kare numara rozeti — tasarımda daire DEĞİL (daireler durak listesinin işareti). */
  boxNo: {
    width: operationsTheme.size.dotButton,
    height: operationsTheme.size.dotButton,
    borderRadius: operationsTheme.radius.badge,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxNoDone: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    borderColor: operationsTheme.colors['olive-bg'],
  },
  boxNoText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  boxNoTextDone: { color: operationsTheme.colors['olive-dark'] },
  /** Kutunun KODU — kartonun üstünde yazan şey; kurye eşleştirmeyi buradan yapıyor. */
  boxCode: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  boxCodeDone: { color: operationsTheme.colors['olive-dark'] },
  /** Sağdaki durum — "araçta" / "araçta değil" / "verildi"; sessiz, çünkü bir etiket. */
  boxState: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  /* Tamamlanma cümlesi TON DEĞİŞTİRİR: "eksik" nötr bir dipnot, "hepsi verildi" bir izin —
     kurye kapıdan ayrılabileceğini renkten de okur. */
  boxComplete: {
    fontFamily: operationsTheme.font.body[600],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors['olive-dark'],
  },
  /** Bölüm ipucu — başlığın altında, küçük ve sessiz: talimat, başlık değil. */
  sectionHint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
    marginTop: -operationsTheme.space.xs,
  },
  /* Kilitli bölüm SOLUKTUR (yarı saydam), gizli değil — bkz. kanıt bölümünün künyesi. */
  sectionLocked: { opacity: 0.4 },
  boxNote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  proofButtons: { flexDirection: 'row', gap: operationsTheme.space.md },
  // `flex` BURADA DEĞİL (23.08 ölçümü — `PressableSurface.grow` künyesi): esneyen düğme flex'i
  // grow prop'undan alır; düz `View` kalan tek kullanım (`Fotoğraf`) `proofGrow` ile esner.
  /*
    KANIT DÜĞMELERİ ELDEN, AMA SABİT BOYLU (tasarım `height:50`).

    Kite geçirilmediler ve gerekçesi ikincisinde: "Fotoğraf" düğmesi KESİKLİ çerçeveli ve pasif —
    "bu yol bu sürümde bağlı değil" diyen bilinçli bir işaret. `SecondaryButton`ın `disabled` hâli
    düz çerçeve çiziyor, kesikli değil; kite kesikli bir kenar eklemek tek kullanım için kitin
    sözlüğünü büyütmek olurdu. İkisi yan yana ve eşit yükseklikte durmak zorunda, o yüzden ikisi de
    burada. Yükseklik dolgudan DEĞİL kademeden: punto değişince hizaları bozulmasın.
  */
  proofButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: operationsTheme.space.md,
    height: operationsTheme.size.controlMd,
    borderWidth: operationsTheme.border.base,
    borderRadius: operationsTheme.radius.control,
  },
  proofButtonLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  proofButtonDisabledLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors['disabled-text'],
  },
  proofTaken: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.lg },
  proofTakenLabel: {
    paddingVertical: operationsTheme.space.sm,
    paddingHorizontal: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors['olive-bg'],
    color: operationsTheme.colors['olive-dark'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['field-label--font-weight']],
    fontSize: operationsTheme.text['field-label'],
  },
  retake: { paddingVertical: operationsTheme.space.xs },
  retakeLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.olive,
  },
  /** "Hepsi teslim edildi" — mal bölümünün sessiz hâli; istisna yoksa okunacak tek satır. */
  goodsSummary: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.muted,
  },
  /** Geri verilen kalemlerin listesi — yalnız istisna varken çizilir. */
  refusedList: { gap: operationsTheme.space.md },
  refusedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
  },
  refusedName: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  refusedQty: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.error,
  },
  /** Çekmecenin künye satırı — üzerinde çalışılan şeyi söyler (adet çekmecesinin `subject`i). */
  refuseSubject: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  /*
    CANLI KOYU KART — adet çekmecesinin toplam kartıyla aynı rol: sayı büyük ve koyu zeminde,
    altında o sayının NE DEMEK olduğu. Burada iki gerçek birlikte duruyor çünkü aynı dokunuştan
    doğuyorlar: kaç adet geri verildi ve kapıda ne kadar tahsil edilecek.
  */
  refuseTotal: {
    gap: operationsTheme.space['2xs'],
    padding: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.card,
    backgroundColor: operationsTheme.colors.ink,
  },
  refuseTotalValue: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['h2-sm--font-weight']],
    fontSize: operationsTheme.text['h2-sm'],
    color: operationsTheme.colors['on-image'],
  },
  refuseTotalNote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors['on-ink-muted'],
  },
  /** Çekmecedeki kalem satırı — ad + sipariş adedi solda, bağlı sayaç sağda. */
  refuseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  refuseNameBox: { flex: 1, gap: operationsTheme.space['2xs'] },
  refuseName: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  refuseOrdered: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  refuseCount: {
    minWidth: operationsTheme.size.stepBadge * 2,
    textAlign: 'center',
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  lineRow: {
    gap: operationsTheme.space.sm,
    paddingVertical: operationsTheme.space.xl,
  },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.xl },
  mark: {
    width: operationsTheme.size.markBox,
    height: operationsTheme.size.markBox,
    borderRadius: operationsTheme.radius.tight,
    borderWidth: operationsTheme.border.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markIdle: {
    backgroundColor: operationsTheme.colors.panel,
    borderColor: operationsTheme.colors.ink,
  },
  markOk: {
    backgroundColor: operationsTheme.colors.olive,
    borderColor: operationsTheme.colors.olive,
  },
  markRefused: {
    backgroundColor: operationsTheme.colors['error-bg'],
    borderColor: operationsTheme.colors.error,
  },
  markGlyph: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
  },
  markGlyphOk: { color: operationsTheme.colors.card },
  markGlyphRefused: { color: operationsTheme.colors.error },
  lineName: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  lineNameRefused: { color: operationsTheme.colors.error },
  returnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
    // v2:156 — iade satırı işaret kutusunun altına hizalanır (26 kutu + 12 aralık = 38).
    marginLeft: operationsTheme.size.markBox + operationsTheme.space.xl,
  },
  returnLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.error,
  },
  returnCount: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.error,
  },
  settled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    padding: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.card,
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  settledLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors['olive-dark'],
  },
  settledNote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.body,
  },
  collection: {
    gap: operationsTheme.space.md,
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.terracotta,
    borderRadius: operationsTheme.radius.card,
    backgroundColor: operationsTheme.colors.panel,
  },
  collectionHeading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.terracotta,
  },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.md },
  /* Tutar satırı: tasarımda `height:56`, dolgu `0 15px`, tutar solda, rozet sağda. Yükseklik
     dolgudan türemiyor — sayı büyük (22px) ve dolguyla hesaplanan yükseklik punto değişince
     kayardı. */
  amountInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 0,
    height: operationsTheme.size.controlAmount,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.card,
  },
  /** "tuş takımı" rozeti — alanın dokunulabilir olduğunu söyleyen tek işaret (tasarımın öğesi). */
  keypadBadge: {
    paddingVertical: operationsTheme.space.sm,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.cream,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  amountValue: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors.ink,
  },
  currency: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.step,
    color: operationsTheme.colors.muted,
  },
  partialBadge: {
    alignSelf: 'flex-start',
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    color: operationsTheme.colors.terracotta,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
  methodRow: { flexDirection: 'row', gap: operationsTheme.space.md },
  hintText: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  warnText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.terracotta,
  },
  errorText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.error,
  },
  footer: {
    gap: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space.lg,
    paddingBottom: operationsTheme.space['3xl'],
  },
  notice: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    padding: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.control,
  },
  noticeOk: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    color: operationsTheme.colors['olive-dark'],
  },
  noticeError: {
    backgroundColor: operationsTheme.colors['error-bg'],
    color: operationsTheme.colors.error,
  },
  primary: {
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
  },
  primaryReady: {
    backgroundColor: operationsTheme.colors.olive,
  },
  primaryBlocked: { backgroundColor: operationsTheme.colors['disabled-fill'] },
  primaryLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors.card,
    textAlign: 'center',
  },
  gateNote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    textAlign: 'center',
  },
  proofGrow: { flex: 1 },
  outcomeRow: { flexDirection: 'row', gap: operationsTheme.space.md },
  outcomeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
  },
  outcomeNeutral: { borderColor: operationsTheme.colors['sand-500'] },
  outcomeNeutralLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['field-label--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.ink,
  },
  outcomeDanger: { borderColor: operationsTheme.colors.error },
  outcomeDangerLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['field-label--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.error,
  },
  outcomeConfirm: {
    backgroundColor: operationsTheme.colors.error,
    borderColor: operationsTheme.colors.error,
  },
  outcomeConfirmLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.card,
  },
  /* KİTİN `panel` TONU (30.08): zemin + `sand-300` + kart yarıçapı + 14/16 dolgu birebir kitin
     tarifiydi ve burada elden yazılıydı. Kalan yalnız satır arası aralık. */
  outcomePanel: {
    gap: operationsTheme.space.lg,
  },
  outcomeTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.error,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: operationsTheme.space.sm },
  /* Not girdisi SABİT BOYLU (tasarım `height:48` — `controlSm` 46'nın üstündeki kademe yok,
     ikisi arasında en yakını `controlMd` 50). Dolgudan türeyen yükseklik punto ya da satır
     aralığı değişince kayıyordu ve çekmecedeki düğmelerle hizası bozuluyordu. */
  noteInput: {
    height: operationsTheme.size.controlMd,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.card,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
});
