import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Linking, Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { navigationLink } from '@lezzet/domain-core';

import { OperationsAmountKeypad } from '@/components/operations/amount-keypad';
import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsHeadBleed } from '@/components/operations/head-bleed';
import { OperationsDashedRule } from '@/components/operations/dashed-rule';
import { OperationsIconButton } from '@/components/operations/icon-button';
import { OperationsConfirmSheet } from '@/components/operations/confirm-sheet';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsScreenChrome } from '@/components/operations/screen-scroll';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStepperGroup } from '@/components/operations/stepper-group';
import { OperationsSurface } from '@/components/operations/surface';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { BottomSheet } from '@lezzet/mobile-kit/src/components/ui/bottom-sheet';
import { FormScroll } from '@lezzet/mobile-kit/src/components/ui/form-scroll';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { courierCopy } from './copy';
import { centsToAmountText } from '@/lib/operations/money';
import { money } from './courier-format';
import { useDelivery } from './use-delivery.hook';

/*
  Kurye teslimat ekranı yalnız çizer, mantığı `use-delivery.hook.ts`tedir; "Fotoğraf" kanıtı çizili ama kapalıdır (kamera modülü kurulu değil), imza yolu tam çalışır.
  Telefon ya da WhatsApp verisi yoksa o düğmeler çizilmez, çünkü işe yaramayan düğme yanlış bir şey söyler.
  BEKLEYEN(21.13): kanıt fotoğrafı — kamera modülü + aynı yükleme kapısı
*/

const t = courierCopy;

/** Adım başlığı: koyu daire içinde numara, yanında bölümün adı; daire adımı sayılabilir kılar ve dört bölüm aynı anatomiyi paylaşır. */
function StepHeading({
  n,
  label,
  action,
  testID,
}: {
  n: number;
  label: string;
  /**
   * Başlık satırının sağ yuvası, bölümün tamamına ait eylem için; normal teslimde reddedilen kalem yoktur, eylem gövdede tam genişlikte durmamalı.
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

/* İlk yük iskeleti ekranın üç açılış bloğunu tutar (adres, iletişim, ilk adım); alt bölümler girmez, çünkü görünmeyen bloğun yerini tutmak zıplamayı önlemez. */
const DELIVERY_SKELETON = { address: 46, contacts: 44, section: 110 } as const;

export function CourierDeliveryScreen({ orderId }: { orderId: string }) {
  const router = useRouter();
  const delivery = useDelivery(orderId);
  const stop = delivery.stop;
  /* Hook erken dönüşlerin üstündedir, çünkü "yükleniyor" ve "bulunamadı" dallarının altında kurulsaydı hook sırası render'dan render'a değişirdi. */
  const [keypadOpen, setKeypadOpen] = useState(false);
  /* Navigasyon açılamadı mı (11.8) — reddi YUTMAK, kuryeye çalışmayan bir düğme bırakmaktı. */
  const [navFailed, setNavFailed] = useState(false);
  /** Reddedilen kalem çekmecesi — istisna girilirken açılır, ekranı sürekli doldurmaz. */
  const [refuseOpen, setRefuseOpen] = useState(false);

  /* İş bitince listeye dönülür: sonuç toast'ta görünür ve liste odakta tazelenir; sonuç ekranında kalmak en sık işte kuryeye fazladan iki dokunuş yaptırıyordu. */
  useEffect(() => {
    if (delivery.finished) router.back();
  }, [delivery.finished, router]);

  if (delivery.status === 'loading') {
    return (
      <View style={styles.screen} testID="courier-delivery">
        <OperationsStackHeader title={t.delivery.loading} onBack={() => router.back()} backLabel={t.delivery.back} />
        {/* İlk yükte iskelet, halka değil: halka yerleşimi tutmaz. */}
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

  /* Kapıyı açan kişi, hesabın sahibi değil: adresin alıcısı varsa o yazılır; imza satırı da bu adı kullanır, çünkü kapıda imzalayan odur. */
  const receiver = stop.recipient ?? stop.customerName;

  /* Adım numarası kutuya göre kayar: kutulu durakta kutular 1. adımdır ve kanıt, mal, tahsilat 2, 3, 4 olur. */
  const boxesLeft = delivery.boxes.length - delivery.scannedBoxCount;
  /*
    Kutu kapısı sonraki adımları da kilitler: kutular müşteriye verilmeden imza almak teslim edilmemiş malın kanıtını toplamaktır, tahsilat da öyle.
    Kutusuz durakta bu kilit yoktur (`boxesLeft` sıfır kalır).
  */
  const stepsLocked = boxesLeft > 0;
  /** Kapıda geri verilen kalemler — mal bölümünün özetini ve çekmecenin başlığını besler. */
  const refusedLines = delivery.lines.filter((line) => delivery.refusedQtyOf(line) > 0);
  /** Kapıdan geri verilen TOPLAM adet — çekmecenin canlı kartındaki sayı. */
  const refusedCount = delivery.lines.reduce((sum, line) => sum + delivery.refusedQtyOf(line), 0);
  const stepNo = (n: number): number => (delivery.boxes.length === 0 ? n : n + 1);

  return (
    <View style={styles.screen} testID="courier-delivery">
      {/* Kabuk davranışları tek kapıdan; başlık kaydırıcının içinde, çünkü dışarıda kalsaydı mikro başlık inince altında asılı kalırdı. */}
      <OperationsScreenChrome
        title={fillCopy(t.delivery.title, { n: String(delivery.order), total: String(delivery.total) })}
        caption={operationsCopy.sections.courier.tab}
      >
        {(bind) => (
      <FormScroll {...bind} contentContainerStyle={styles.body} testID="courier-delivery-body">
      <OperationsHeadBleed pad="6xl">
      <OperationsStackHeader
        title={fillCopy(t.delivery.title, { n: String(delivery.order), total: String(delivery.total) })}
        subtitle={fillCopy(t.delivery.subtitle, {
          ref: stop.referenceNo ?? '—',
          n: String(stop.attempts + 1),
        })}
        onBack={() => router.back()}
        backLabel={t.delivery.back}
        /* KANAL ROZETİ BAŞLIK SATIRINDA (v3:20 — "Durak 1/1" ile aynı hizada, sağa yaslı).
           Adresin yanına çizilmişti ve orada adresin bir niteliği gibi okunuyordu; oysa kanal
           DURAĞIN kimliği ve kurye ona kapıya varmadan önce bakıyor. */
        right={
          <Text style={styles.channelTag} testID={`courier-delivery-${stop.channel}`}>
            {t.channel[stop.channel]}
          </Text>
        }
        testID="courier-delivery-header"
      />
      </OperationsHeadBleed>

        {/* Kanal rozeti her kanalda çizilir: kanal kapıda ne beklendiğini söyler, yokluğu "B2C" demek değil hiçbir şey söylememektir. */}
        <View style={styles.addressBlock}>
          <Text style={styles.address}>{stop.address ?? t.day.stop.noAddress}</Text>
          <Text style={styles.addressDetail}>{`${receiver} · ${t.channel[stop.channel]}`}</Text>
          {/*
            Kapı doğrulaması sessiz yazılır (rozet ve uyarı rengi yok), çünkü amaç kuryeyi korkutmak değil hazırlıklı göndermek; `elsewhere` tutarsızlığın bilindiğini ve kasıtlı olduğunu söyler.
            `confirmed` ve `unknown` hiçbir şey yazmaz: her durakta görünen boş satır kuryeyi gerçek uyarıyı da okumamaya alıştırırdı.
          */}
          {stop.doorCheck === 'unverified' || stop.doorCheck === 'elsewhere' ? (
            <Text style={styles.doorCheck} testID={`courier-delivery-door-${stop.doorCheck}`}>
              {t.delivery.doorCheck[stop.doorCheck]}
            </Text>
          ) : null}
        </View>

        <View style={styles.contactRow}>
          {stop.address === null ? (
            <View style={[styles.contact, styles.contactDisabled]}>
              <Text style={styles.contactMuted}>{t.delivery.noNavigate}</Text>
            </View>
          ) : (
            <PressableSurface
              /* Hedef `navigationLink`ten gelir (`maps/dir`, doğrudan rota kurar); `openURL` başarısız olursa ret yutulmaz, çünkü sessizce hiçbir şey yapmayan düğme sahada en kötüsüdür. */
              onPress={() => {
                const url = navigationLink({ address: stop.address });
                if (!url) return;
                setNavFailed(false);
                void Linking.openURL(url).catch(() => setNavFailed(true));
              }}
              feedback="scale"
              /* Esneme `grow`dan gelir, stilden değil: `styles.contact` içindeki `flex: 1` dış Pressable'a ulaşmaz ve dış kutu içeriğine büzülür. */
              grow
              style={[styles.contact, styles.contactPrimary]}
              accessibilityLabel={t.delivery.navigate}
              testID="courier-delivery-navigate"
            >
              <Icon name="navigate" size={operationsTheme.size.headerIcon} color={operationsTheme.colors.card} />
              <Text style={styles.contactPrimaryLabel}>{t.delivery.navigate}</Text>
            </PressableSurface>
          )}
          {/* Ara ve WhatsApp yalnız ikondur ki satırı asıl eylem (navigasyon) kaplasın; metin `accessibilityLabel`a taşındı, ekran okuyucu adı duymaya devam eder. */}
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
        {/* Navigasyon açılamadıysa SEBEBİ yazılır (11.8): `openURL` reddini yutmak, kuryenin elinde
            sessizce hiçbir şey yapmayan bir düğme bırakmaktı. */}
        {navFailed ? (
          <Text style={styles.errorText} accessibilityRole="alert" testID="courier-navigate-failed">
            {t.delivery.navigateFailed}
          </Text>
        ) : null}

        {/*
          Kutular kutulu durakta teslimin ön koşuludur ve adım numarası kutuya göre kayar (kutulu dört, kutusuz üç adım).
          Kutusuz durak sessiz geçilmez: kutu zorunlu olduğuna göre bu bir arızadır, ekran onu adıyla söyler.
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
              Kutu satırı sıra numarasını değil kodu yazar, çünkü kartonun üstünde kod yazar ve kurye yığından doğru kutuyu ona bakarak seçer.
              Sağdaki durum kutunun araçta olup olmadığıdır: araca binmemiş kutu kapıda bulunamaz.
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
              /* Okutma düğmesi kitten ve zeytin dolgulu, çünkü kutu okutma bu adımın tek eylemidir; kalan sayısı düğmededir ki kurye sayaçtan geri hesaplamasın. */
              <PrimaryButton
                label={fillCopy(t.delivery.boxes.scanCta, { n: String(boxesLeft) })}
                onPress={() => delivery.setBoxScanOpen(true)}
                icon="scan"
                /* Işıma yok: ışımalı düğme araca yükleme ekranının tek eylemidir, kapıdaki bu düğme adımın içinde bir kapıdır. */
                elevation="flat"
                testID="courier-box-scan"
              />
            )}

            {/* Tek cümle: "hepsi verildi" bir izin, "eksik" bir uyarı ve bedeli; ikinci cümle aynı şeyi tekrarlıyordu. */}
            <Text style={boxesLeft === 0 ? styles.boxComplete : styles.boxNote}>
              {boxesLeft === 0 ? t.delivery.boxes.complete : t.delivery.boxes.pending}
            </Text>
          </View>
        )}

        {/*
          Kanıt adımı yok: parmakla çizilen imza kimliği kanıtlamaz, kutu okutması (`box_scan`) ondan güçlü bir kayıttır.
          Ayar (`delivery_proof_required`) durur ama fabrika değeri iki kanalda da kapalıdır.
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
          {/* Mal bölümü bir özettir ("hepsi teslim edildi" ya da geri verilenler): teslim varsayılandır, red istisnadır ve çekmeceden girilir. */}
          {refusedLines.length === 0 ? (
            /* Boş hâl bir cümledir, düğme değil: reddedilen kalem yoksa bölümün söyleyeceği tek şey budur; eylem başlıktaki artıdadır. */
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
                Tutar bir girdi değil tuş takımını açan düğmedir, çünkü sistem klavyesi motorun tutarını görüş alanından çıkarıyordu.
                Artı/eksi yoktur: kapıda tahsil edilen tutar motorun hesabıdır ve pazarlık edilebilir görünmemeli; eksik ödeme tuş takımından yazılır.
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
        )}
      </OperationsScreenChrome>

      {delivery.dueCents === null ? null : (
        <OperationsAmountKeypad
          visible={keypadOpen}
          title={t.delivery.collection.keypad.title}
          value={delivery.amountText}
          expected={centsToAmountText(delivery.dueCents)}
          expectedLabel={fillCopy(t.delivery.collection.keypad.expected, { amount: money(delivery.dueCents) })}
          // Birim prop'tur, çünkü tuş takımı mal kabulün adet kutusunda da kullanılır; ondalık açık, para kuruş taşır.
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
        {/* Sonuç toast'ta, çünkü sayfanın altındaki satıra kurye kutu okuturken bakmıyordu ve reddin sebebi görülmüyordu. */}

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
            {/* İki sonuç düğmesi de kitten ve ikincildir: "Ulaşılamadı" nötr, "Kabul etmedi" kırmızı. */}
            <View style={styles.outcomeRow}>
              {/* Yola çıkmamış durakta ikisi de pasiftir: kapıya hiç gidilmemiş durağa "ulaşılamadı" yazılmaz, sebebi üstteki satırdadır. */}
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

      {/* Reddedilen kalem çekmecesi: yalnız istisna varken açılır ve kurye hangi üründen kaç adet geri verildiğini seçer; normal teslimde buraya hiç girilmez. */}
      <BottomSheet
        visible={refuseOpen}
        title={t.delivery.goods.refuseTitle}
        onClose={() => setRefuseOpen(false)}
        testID="courier-refuse-sheet"
      >
        {/* Mal kabul çekmecesinin kalıbı: kartlı satırlar ve bağlı sayaç, "Tamam" onay değil kapatmadır; geri verilen mal `error` tonundadır. */}
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

      {/* Sonuç çekmecesi (`BottomSheet`): gömülü kart sayfanın akışına girip kaydırma istiyordu, çekmece ekranı kaplar ve "şu an tek işin bu" der. */}
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
  /* Adres gövde fontuyla yazılır, başlık fontuyla değil: bir başlık değil kapıda okunacak bir veridir ve durak künyesiyle yarışmamalı. */
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
  /* Adres künyesinin bir tık ALTINDA: aynı punto, `muted` ton. Alıcı satırıyla yarışmıyor ama
     adresle birlikte okunuyor — kapı doğrulaması adresin bir niteliğidir, ayrı bir uyarı değil. */
  doorCheck: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    lineHeight: operationsTheme.text.note * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
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
  /* Adım bölümü kart: her adım kendi kartında durur ki adımlar birbirine akmasın. */
  section: {
    gap: operationsTheme.space.lg,
    padding: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    backgroundColor: operationsTheme.colors.panel,
  },
  /* Kutu adımı kendi tonunu taşır: eksikte uyarı, tamamda zeytin; renk kutuların okutulup okutulmadığını ekrana bakar bakmaz söyler. */
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
  /* Kutular alt alta durur, çünkü kod rozete sığmaz ve kurye yığından kutu seçerken satır satır okur. */
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
  // `flex` burada değil: esneyen düğme flex'i `grow` prop'undan alır; düz `View` (Fotoğraf) `proofGrow` ile esner.
  /* Kanıt düğmeleri elden ve sabit boyludur: "Fotoğraf" kesikli çerçeveyle bu yolun bağlı olmadığını söyler, kitin pasif hâli bunu çizmez. */
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
  /* Kitin `panel` tonu; burada yalnız satır arası aralık kalır. */
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
