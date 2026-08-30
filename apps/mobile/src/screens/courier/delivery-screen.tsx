import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Linking, Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsAmountKeypad } from '@/components/operations/amount-keypad';
import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsStepperButton } from '@/components/operations/stepper-button';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { FormScroll } from '@/components/ui/form-scroll';
import { Icon } from '@/components/ui/icon';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { courierCopy } from './copy';
import { centsToAmountText } from '@/lib/operations/money';
import { money } from './courier-format';
import { SignaturePad } from './signature-pad';
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

export function CourierDeliveryScreen({ orderId }: { orderId: string }) {
  const router = useRouter();
  const delivery = useDelivery(orderId);
  const stop = delivery.stop;
  /* HOOK ERKEN DÖNÜŞLERİN ÜSTÜNDE: aşağıda "yükleniyor" ve "bulunamadı" dalları var ve durum
     onların altında kurulsaydı hook sırası render'dan render'a değişirdi (React bunu "Rendered
     more hooks than during the previous render" diye kesiyor — 30.08'de yaşandı). */
  const [keypadOpen, setKeypadOpen] = useState(false);

  if (delivery.status === 'loading') {
    return (
      <View style={styles.screen} testID="courier-delivery">
        <OperationsStackHeader title={t.delivery.loading} onBack={() => router.back()} backLabel={t.delivery.back} />
        <View style={styles.centered}>
          <LoadingState accessibilityLabel={t.delivery.loading} label={t.delivery.loading} />
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
            {stop.channel === 'b2b' ? (
              <Text style={styles.channelTag} testID="courier-delivery-b2b">
                {t.channel.b2b}
              </Text>
            ) : null}
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
              feedback="shadow"
              style={[styles.contact, styles.contactPrimary]}
              accessibilityLabel={t.delivery.navigate}
              testID="courier-delivery-navigate"
            >
              <Icon name="navigate" size={operationsTheme.size.headerIcon} color={operationsTheme.colors.card} />
              <Text style={styles.contactPrimaryLabel}>{t.delivery.navigate}</Text>
            </PressableSurface>
          )}
          {stop.phone === null ? null : (
            <PressableSurface
              onPress={() => void Linking.openURL(`tel:${stop.phone ?? ''}`)}
              feedback="scale"
              style={[styles.contact, styles.contactOutline]}
              accessibilityLabel={t.delivery.call}
              testID="courier-delivery-call"
            >
              <Icon name="phone" size={operationsTheme.size.headerIcon} color={operationsTheme.colors.ink} />
              <Text style={styles.contactLabel}>{t.delivery.call}</Text>
            </PressableSurface>
          )}
          {/* Numara yoksa bağlantı `null` gelir ve düğme HİÇ çizilmez — sözleşmenin kendi kuralı. */}
          {stop.whatsAppLink === null ? null : (
            <PressableSurface
              onPress={() => void Linking.openURL(stop.whatsAppLink ?? '')}
              feedback="scale"
              style={[styles.contact, styles.contactOutline]}
              accessibilityLabel={t.delivery.whatsApp}
              testID="courier-delivery-whatsapp"
            >
              <Icon
                name="whatsapp"
                size={operationsTheme.size.headerIcon}
                color={operationsTheme.colors['brand-whatsapp']}
              />
              <Text style={styles.contactLabel}>{t.delivery.whatsApp}</Text>
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
        {delivery.boxes.length === 0 ? null : (
          <View style={styles.section}>
            <Text style={styles.sectionHeading} testID="courier-boxes-heading">
              {fillCopy(t.delivery.step, {
                n: '1',
                label: fillCopy(t.delivery.boxes.heading, {
                  scanned: String(delivery.scannedBoxCount),
                  total: String(delivery.boxes.length),
                }),
              })}
            </Text>
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
              <PressableSurface
                onPress={() => delivery.setBoxScanOpen(true)}
                feedback="scale"
                style={[styles.proofButton, styles.contactOutline]}
                accessibilityLabel={fillCopy(t.delivery.boxes.scanCta, { n: String(boxesLeft) })}
                testID="courier-box-scan"
              >
                {/* Kalan sayısı DÜĞMEDE (v3:1487): kurye kapıda kaç kutu daha vereceğini
                    başlıktaki sayaçtan geri hesaplamak zorunda kalmasın. */}
                <Text style={styles.contactLabel}>{fillCopy(t.delivery.boxes.scanCta, { n: String(boxesLeft) })}</Text>
              </PressableSurface>
            )}

            {/* İKİ HÂL, İKİ CÜMLE (v3:1490) — "hepsi verildi" bir izin, "eksik" bir uyarı ve
                bedelini söylüyor: okutulmayan kutu dönüş dökümüne "araçta kaldı" diye düşer. */}
            <Text style={boxesLeft === 0 ? styles.boxComplete : styles.boxNote}>
              {boxesLeft === 0 ? t.delivery.boxes.complete : t.delivery.boxes.pending}
            </Text>
            <Text style={styles.boxNote}>{t.delivery.boxes.note}</Text>
          </View>
        )}

        {/* ── KANIT ─────────────────────────────────────────────────────── */}
        {/* KİLİTLİ BÖLÜM SOLUKTUR AMA ÇİZİLİR: gizlemek, kuryeye "bu durakta kanıt istenmiyor"
            dedirtirdi. Görünür ama dokunulmaz — sebebi kutu bölümünün cümlesinde yazılı. */}
        <View style={[styles.section, stepsLocked ? styles.sectionLocked : null]} pointerEvents={stepsLocked ? 'none' : 'auto'}>
          <Text style={styles.sectionHeading} testID="courier-proof-heading">
            {fillCopy(t.delivery.step, {
              n: String(stepNo(1)),
              label: fillCopy(t.delivery.proof.heading, {
                scope: delivery.proofRequired ? t.delivery.proof.required : t.delivery.proof.optional,
              }),
            })}
          </Text>

          {delivery.proof !== null ? (
            <View style={styles.proofTaken}>
              <Text style={styles.proofTakenLabel} testID="courier-proof-taken">
                {fillCopy(t.delivery.proof.takenSignature, { name: receiver })}
              </Text>
              <PressableSurface
                onPress={delivery.clearProof}
                feedback="opacity"
                style={styles.retake}
                accessibilityLabel={t.delivery.proof.retake}
                testID="courier-proof-retake"
              >
                <Text style={styles.retakeLabel}>{t.delivery.proof.retake}</Text>
              </PressableSurface>
            </View>
          ) : delivery.signing ? (
            <SignaturePad
              hintName={receiver}
              onConfirm={delivery.confirmSignature}
              onCancel={delivery.cancelSignature}
              busy={delivery.uploading}
              error={delivery.proofError}
              testID="courier-signature"
            />
          ) : (
            <>
              <View style={styles.proofButtons}>
                <PressableSurface
                  onPress={delivery.openSignature}
                  feedback="scale"
                  grow
                  style={[styles.proofButton, styles.contactOutline]}
                  accessibilityLabel={t.delivery.proof.sign}
                  testID="courier-proof-sign"
                >
                  <Icon name="signature" size={operationsTheme.size.inlineIcon} color={operationsTheme.colors.ink} />
                  <Text style={styles.proofButtonLabel}>{t.delivery.proof.sign}</Text>
                </PressableSurface>
                {/* Sapma 1: kamera modülü kurulu değil — düğme çizili ama kapalı, sebebi altında. */}
                <View style={[styles.proofButton, styles.proofGrow, styles.contactDisabled]}>
                  <Icon
                    name="camera"
                    size={operationsTheme.size.inlineIcon}
                    color={operationsTheme.colors['disabled-text']}
                  />
                  <Text style={styles.proofButtonDisabledLabel}>{t.delivery.proof.photo}</Text>
                </View>
              </View>
              <Text style={styles.hintText} testID="courier-proof-photo-unavailable">
                {t.delivery.proof.photoUnavailable}
              </Text>
              {delivery.proofError === null ? null : (
                <Text style={styles.errorText} accessibilityRole="alert">
                  {delivery.proofError}
                </Text>
              )}
            </>
          )}
        </View>

        {/* ── MAL ───────────────────────────────────────────────────────── */}
        <View style={[styles.section, stepsLocked ? styles.sectionLocked : null]} pointerEvents={stepsLocked ? 'none' : 'auto'}>
          {/* Sayı ÇİZİLEN listeden gelir, `itemCount`tan değil: başlık dokunulabilir satırları
              tarif ediyor, ikisi ayrışırsa başlık ekranda olmayan bir kalemi vaat ederdi. */}
          <Text style={styles.sectionHeading}>
            {fillCopy(t.delivery.step, {
              n: String(stepNo(2)),
              label: fillCopy(t.delivery.goods.heading, { n: String(delivery.lines.length) }),
            })}
          </Text>
          {/* İPUCU BAŞLIKTAN AYRI (v3:17): başlık bölümün ADI ("MAL — 1 KALEM"), ipucu bir
              KULLANIM TALİMATI ("dokun · tekrar dokun"). Tek satıra sıkıştırıldığında başlık
              okunmaz uzunluğa çıkıyor ve talimat başlık gibi büyük harfle sessizleşiyordu. */}
          <Text style={styles.sectionHint}>{t.delivery.goods.hint}</Text>
          {delivery.lines.map((line) => {
            const mark = delivery.markOf(line.orderItemId);
            return (
              /* ANAHTAR KALEMİN KİMLİĞİ: ekranda işaretlenen satır, uca `adjustments` olarak giden
                 satırın kendisidir — sıra numarası olsaydı liste tazelendiğinde işaret kayabilirdi. */
              <View key={line.orderItemId} style={styles.lineRow}>
                <PressableSurface
                  onPress={() => delivery.toggleLine(line.orderItemId)}
                  feedback="scale"
                  style={styles.lineHead}
                  accessibilityLabel={`${line.qty} × ${line.name}`}
                  selected={mark === 'delivered'}
                  testID={`courier-line-${line.orderItemId}`}
                >
                  <View
                    style={[
                      styles.mark,
                      mark === 'delivered' ? styles.markOk : mark === 'refused' ? styles.markRefused : styles.markIdle,
                    ]}
                  >
                    <Text
                      style={[
                        styles.markGlyph,
                        mark === 'delivered' ? styles.markGlyphOk : styles.markGlyphRefused,
                      ]}
                    >
                      {mark === 'delivered' ? '✓' : mark === 'refused' ? '✕' : ''}
                    </Text>
                  </View>
                  <Text style={[styles.lineName, mark === 'refused' ? styles.lineNameRefused : undefined]}>
                    {`${line.qty} × ${line.name}`}
                  </Text>
                </PressableSurface>
                {mark === 'refused' && line.qty > 1 ? (
                  <View style={styles.returnRow} testID={`courier-line-return-${line.orderItemId}`}>
                    <Text style={styles.returnLabel}>{t.delivery.goods.returnQty}</Text>
                    <OperationsStepperButton
                      direction="decrease"
                      size="sm"
                      onPress={() => delivery.changeReturnQty(line, -1)}
                      accessibilityLabel={t.delivery.goods.decrease}
                      testID={`courier-line-return-minus-${line.orderItemId}`}
                    />
                    <Text style={styles.returnCount}>{`${delivery.returnQtyOf(line)}/${line.qty}`}</Text>
                    <OperationsStepperButton
                      direction="increase"
                      size="sm"
                      onPress={() => delivery.changeReturnQty(line, 1)}
                      accessibilityLabel={t.delivery.goods.increase}
                      testID={`courier-line-return-plus-${line.orderItemId}`}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
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
            <Text style={styles.collectionHeading}>
              {fillCopy(t.delivery.step, {
                n: String(stepNo(3)),
                label: fillCopy(t.delivery.collection.heading, { amount: money(delivery.dueCents) }),
              })}
            </Text>
            <View style={styles.amountRow}>
              {/* TUTAR TUŞ TAKIMIYLA (v3 · `00-ortak`, tasarımda `kpOpen.tahsilat`): alan bir girdi
                  değil, tuş takımını açan düğmedir. Kapıda telefon eldivenle tutuluyor ve sistem
                  klavyesi ekranın yarısını kaplayıp motorun tutarını görüş alanından çıkarıyordu.
                  Artı/eksi düğmeleri KALIYOR — yuvarlak tutarlarda tek dokunuş, tuş takımından
                  hızlıdır. */}
              <PressableSurface
                onPress={() => setKeypadOpen(true)}
                feedback="scale"
                style={styles.amountInput}
                accessibilityLabel={t.delivery.collection.amountLabel}
                testID="courier-collection-amount"
              >
                <Text style={styles.amountValue}>{delivery.amountText}</Text>
              </PressableSurface>
              <Text style={styles.currency}>€</Text>
              <OperationsStepperButton
                direction="decrease"
                onPress={() => delivery.changeAmount(-delivery.amountStepCents)}
                accessibilityLabel={t.delivery.collection.decrease}
                testID="courier-collection-minus"
              />
              <OperationsStepperButton
                direction="increase"
                onPress={() => delivery.changeAmount(delivery.amountStepCents)}
                accessibilityLabel={t.delivery.collection.increase}
                testID="courier-collection-plus"
              />
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

        {delivery.finished ? (
          <PressableSurface
            onPress={() => router.back()}
            feedback="shadow"
            style={[styles.primary, styles.primaryReady]}
            accessibilityLabel={t.delivery.back}
            testID="courier-delivery-done"
          >
            <Text style={styles.primaryLabel}>{t.delivery.back}</Text>
          </PressableSurface>
        ) : delivery.outcome === null ? (
          <>
            <PressableSurface
              onPress={delivery.deliver}
              disabled={!delivery.gateOpen}
              feedback="shadow"
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
            <View style={styles.outcomeRow}>
              <PressableSurface
                onPress={() => delivery.openOutcome('unreachable')}
                feedback="scale"
                grow
                style={[styles.outcomeButton, styles.outcomeNeutral]}
                accessibilityLabel={t.delivery.cta.unreachable}
                testID="courier-outcome-unreachable"
              >
                <Text style={styles.outcomeNeutralLabel}>{t.delivery.cta.unreachable}</Text>
              </PressableSurface>
              <PressableSurface
                onPress={() => delivery.openOutcome('refused')}
                feedback="scale"
                grow
                style={[styles.outcomeButton, styles.outcomeDanger]}
                accessibilityLabel={t.delivery.cta.refused}
                testID="courier-outcome-refused"
              >
                <Text style={styles.outcomeDangerLabel}>{t.delivery.cta.refused}</Text>
              </PressableSurface>
            </View>
          </>
        ) : (
          <View style={styles.outcomePanel} testID="courier-outcome-panel">
            <Text style={styles.outcomeTitle}>
              {delivery.outcome === 'refused'
                ? t.delivery.outcome.refusedTitle
                : t.delivery.outcome.unreachableTitle}
            </Text>
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
                  tone="error"
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
            <Text style={styles.hintText} testID="courier-outcome-photo-unavailable">
              {t.delivery.outcome.photoUnavailable}
            </Text>
            {delivery.outcome === 'refused' ? (
              <Text style={styles.hintText}>{t.delivery.outcome.refusedHint}</Text>
            ) : null}
            <View style={styles.outcomeRow}>
              <PressableSurface
                onPress={delivery.cancelOutcome}
                feedback="scale"
                grow
                style={[styles.outcomeButton, styles.outcomeNeutral]}
                accessibilityLabel={t.delivery.outcome.cancel}
                testID="courier-outcome-cancel"
              >
                <Text style={styles.outcomeNeutralLabel}>{t.delivery.outcome.cancel}</Text>
              </PressableSurface>
              <PressableSurface
                onPress={delivery.confirmOutcome}
                feedback="shadow"
                grow={1.3}
                style={[styles.outcomeButton, styles.outcomeConfirm]}
                accessibilityLabel={t.delivery.outcome.confirm}
                testID="courier-outcome-confirm"
              >
                <Text style={styles.outcomeConfirmLabel}>
                  {delivery.sending ? t.delivery.cta.sending : t.delivery.outcome.confirm}
                </Text>
              </PressableSurface>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  centered: { flex: 1, justifyContent: 'center' },
  block: { paddingHorizontal: operationsTheme.space['6xl'] },
  body: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space['6xl'],
    gap: operationsTheme.space['2xl'],
  },
  addressBlock: { gap: operationsTheme.space['2xs'] },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.lg },
  address: {
    flex: 1,
    fontFamily: operationsTheme.font.display[operationsTheme.text['h2-sm--font-weight']],
    fontSize: operationsTheme.text['h2-sm'],
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
  contact: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: operationsTheme.space.sm,
    paddingVertical: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
  },
  contactPrimary: {
    flexGrow: 1.4,
    backgroundColor: operationsTheme.colors.olive,
    borderColor: operationsTheme.colors.olive,
    boxShadow: operationsTheme.shadow.hard,
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
  section: { gap: operationsTheme.space.md },
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
  proofButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: operationsTheme.space.md,
    paddingVertical: operationsTheme.space.xl,
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
  lineRow: {
    gap: operationsTheme.space.sm,
    paddingVertical: operationsTheme.space.xl,
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
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
  amountInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space.xl,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.card,
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
    boxShadow: operationsTheme.shadow.hard,
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
    boxShadow: operationsTheme.shadow.hard,
  },
  outcomeConfirmLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.card,
  },
  outcomePanel: {
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    backgroundColor: operationsTheme.colors.panel,
  },
  outcomeTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.error,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: operationsTheme.space.sm },
  noteInput: {
    paddingVertical: operationsTheme.space.xl,
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
