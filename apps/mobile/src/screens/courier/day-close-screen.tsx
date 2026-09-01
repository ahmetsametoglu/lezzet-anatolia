import { useRouter } from 'expo-router';
import { Fragment, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsAmountKeypad } from '@/components/operations/amount-keypad';
import { OperationsConfirmSheet } from '@/components/operations/confirm-sheet';
import { OperationsDashedRule } from '@/components/operations/dashed-rule';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsSurface } from '@/components/operations/surface';
import { FormScroll } from '@/components/ui/form-scroll';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { centsToAmountText, money } from '@/lib/operations/money';
import { courierCopy } from './copy';
import { runLabel } from './courier-format';
import { expectedLabel, useDayClose, type CloseMethod } from './use-day-close.hook';

/*
  KURYE · SEFER KAPANIŞI (v2:217-262) — sayaçlar · para sayımı · not · iki adımlı onay.

  Kararların tamamı `use-day-close.hook.ts` künyesinde. Ekranın iki kendi kararı:
  1. **Fark sütunu bozuk girdide "—" yazar** (v2 her hâlde bir tutar yazıyor, çünkü şablonun girdisi
     bozuk olamıyor). Ölçülemeyen fark sıfır değildir — "0,00 €" yazmak, sayılmamış bir kasayı
     "tamı tamına tuttu" diye okuturdu (CLAUDE §1).
  2. **Kapanışın öznesi başlıkta yazılı** (18.08): başlık altına seferin künyesi (rota adı + SF
     kodu) geliyor — kurye iki sefer sürdüyse hangisini kapattığını okumadan onaylamamalı. Sefer
     yoksa form hiç çizilmez; boş bir sayım formu, olmayan bir mutabakatı davet ederdi.
*/

const t = courierCopy;

/*
  İLK YÜK İSKELETİ — sayaç karoları (üçü yan yana, dolgu 12×2 + sayı + etiket), altındaki not
  satırı ve para sayım kartı (üç kasa satırı, satır başına dolgu 10×2 + iki metin satırı).
  Kapanış ekranının açılışı bu üç blok; uyarı/kapanmış kutusu koşullu olduğu için yer tutulmuyor —
  olmayabilecek bir bloğun yerini tutmak, sönünce yukarı zıplamak demektir.
*/
const CLOSE_SKELETON = { counters: 66, note: 18, money: 180 } as const;

interface CounterCardProps {
  value: number;
  label: string;
  tone: 'delivered' | 'pending' | 'returned';
  testID: string;
}

/** Üç sayaç karosu (v2:227-231) — aynı iskelet, üç ton; tek yerde. */
function CounterCard({ value, label, tone, testID }: CounterCardProps) {
  return (
    <View style={[styles.counter, styles[`counter_${tone}`]]} testID={testID}>
      <Text style={[styles.counterValue, styles[`counterText_${tone}`]]}>{value}</Text>
      <Text style={[styles.counterLabel, styles[`counterText_${tone}`]]}>{label}</Text>
    </View>
  );
}

interface CourierDayCloseScreenProps {
  /** Kapatılacak seferin kimliği — adresten gelir; yoksa sunucu sürülen seferi çözer (rota künyesi). */
  runId?: string;
}

export function CourierDayCloseScreen({ runId }: CourierDayCloseScreenProps) {
  const router = useRouter();
  /* Kapanış YAZILINCA ekran kendini kapatır (01.09 · kullanıcı bulgusu): sonuç toast'ta görünür,
     kurye de kapattığı seferi arkasında bırakıp gün ekranına döner. Gün ekranı odağa gelince
     kendini tazeliyor, yani araçta bekleyen öteki sefer oradan görünür. */
  const dayClose = useDayClose(() => router.back(), runId);
  const run = dayClose.draft?.run ?? null;
  /* Hangi kasanın tuş takımı açık — kimlik tutulur, satırın kendisi değil: satırlar her okumada
     yeniden kuruluyor ve nesneyi tutmak kapalı bir paneli bayat veriyle diriltirdi. */
  const [keypadFor, setKeypadFor] = useState<CloseMethod | null>(null);
  const keypadRow = dayClose.rows.find((row) => row.method === keypadFor) ?? null;

  const header = (
    <OperationsStackHeader
      title={t.dayClose.title}
      subtitle={run === null ? undefined : runLabel(run)}
      onBack={() => router.back()}
      backLabel={t.dayClose.back}
      testID="courier-day-close-header"
    />
  );

  if (dayClose.status === 'loading') {
    return (
      <View style={styles.screen} testID="courier-day-close">
        {header}
        {/* İLK YÜK İSKELET, HALKA DEĞİL (ortak karar 30.08) — halka yerleşim tutmaz. */}
        <View style={styles.skeleton}>
          <OperationsSkeletonList
            heights={[CLOSE_SKELETON.counters, CLOSE_SKELETON.note, CLOSE_SKELETON.money]}
            label={t.dayClose.loading}
            testID="courier-day-close-loading"
          />
        </View>
      </View>
    );
  }

  if (dayClose.status === 'error' || dayClose.draft === null) {
    return (
      <View style={styles.screen} testID="courier-day-close">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="error"
            title={t.dayClose.error.title}
            description={t.dayClose.error.body}
            retry={{ label: t.dayClose.error.retry, onPress: dayClose.reload }}
            testID="courier-day-close-error"
          />
        </View>
      </View>
    );
  }

  // SEFER YOK: bu bir arıza değil, sakin bir gerçek — kapanış bir seferin mutabakatıdır ve
  // sürülmemiş bir seferin sayımı da yoktur. Boş bir form çizmek, olmayan bir kaydı davet ederdi.
  if (run === null) {
    return (
      <View style={styles.screen} testID="courier-day-close">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.dayClose.noRun.title}
            description={t.dayClose.noRun.body}
            testID="courier-day-close-no-run"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="courier-day-close">
      {header}

      <FormScroll contentContainerStyle={styles.body} testID="courier-day-close-body">
        {dayClose.closed ? (
          <View style={styles.closedBox} testID="courier-day-close-readonly">
            <Text style={styles.closedText}>{t.dayClose.closed}</Text>
          </View>
        ) : null}
        {dayClose.openWarning === null ? null : (
          <View style={styles.warnBox} testID="courier-day-close-warning">
            {/* NOKTA İMİ (v3:18) — uyarı artık çerçeveyle değil DOLGUYLA ayrışıyor; çerçeveli
                kutu, altındaki sayaç karolarıyla aynı ağırlıkta duruyordu ve uyarı sayaçların
                arasında kayboluyordu. */}
            <View style={styles.warnDot} />
            <Text style={styles.warnBoxText}>{dayClose.openWarning}</Text>
          </View>
        )}

        <View style={styles.counters}>
          <CounterCard
            value={dayClose.deliveredCount}
            label={t.dayClose.counters.delivered}
            tone="delivered"
            testID="courier-count-delivered"
          />
          <CounterCard
            value={dayClose.pendingCount}
            label={t.dayClose.counters.pending}
            tone="pending"
            testID="courier-count-pending"
          />
          <CounterCard
            value={dayClose.returnedCount}
            label={t.dayClose.counters.returned}
            tone="returned"
            testID="courier-count-returned"
          />
        </View>
        <Text style={styles.hintText}>{t.dayClose.countersNote}</Text>

        <View style={styles.moneyBlock}>
          <Text style={styles.sectionHeading}>{t.dayClose.moneyHeading}</Text>
          {/* ÜÇ SATIR TEK KARTTA (v3:18): sayım bir bütündür — kart, üç kasa satırını "bir mutabakat"
              olarak çerçeveliyor. Ayraç SON satırda çizilmez; kartın kendi kenarı zaten orada. */}
          <OperationsSurface padding="none" style={styles.moneyCard}>
            {/* AYRAÇ KİTTEN (`OperationsDashedRule`, 30.08): RN'in kendi `dashed`i cihazda 1:10
                çıkıyor (ölçüldü — 2–3 px çizgi, 22–33 px boşluk) ve hat kesikli değil NOKTALI
                görünüyor. Kit onu svg + `strokeDasharray` ile tasarımın oranında çiziyor.
                Ayraç SATIRIN İÇİNDE değil ARASINDA: son satırdan sonra çizilmez, kartın kendi
                kenarı zaten 4 px altında duruyor ve ikisi "çift çizgi" gibi okunurdu. */}
            {dayClose.rows.map((row, index) => (
              <Fragment key={row.method}>
                {index === 0 ? null : <OperationsDashedRule color={operationsTheme.colors['sand-300']} />}
              <View style={styles.moneyRow} testID={`courier-money-${row.method}`}>
                <View style={styles.moneyLabels}>
                  <Text style={styles.moneyName}>{row.label}</Text>
                  <Text style={styles.moneyExpected}>{expectedLabel(row.expectedCents)}</Text>
                </View>
                {/* TUTAR TUŞ TAKIMIYLA YAZILIR (v3 · `00-ortak`, tasarımda `kpOpen.nakit/kart/cek`):
                    alan bir GİRDİ değil, tuş takımını açan bir düğmedir. Cihaz klavyesi açılmaz —
                    rampada telefon eldivenle tutuluyor ve sistem klavyesi ekranın yarısını kaplayıp
                    "beklenen"i görüş alanından çıkarıyordu. */}
                <PressableSurface
                  onPress={() => setKeypadFor(row.method)}
                  disabled={dayClose.closed}
                  feedback="scale"
                  style={[styles.moneyInput, dayClose.closed ? styles.moneyInputLocked : undefined]}
                  accessibilityLabel={fillCopy(t.dayClose.countLabel, { method: row.label })}
                  testID={`courier-money-input-${row.method}`}
                >
                  <Text style={dayClose.closed ? styles.moneyValueLocked : styles.moneyValue}>
                    {row.countedText}
                  </Text>
                </PressableSurface>
                <Text
                  style={[
                    styles.difference,
                    row.differenceCents === null
                      ? styles.differenceUnknown
                      : row.differenceCents === 0
                        ? styles.differenceZero
                        : row.differenceCents < 0
                          ? styles.differenceShort
                          : styles.differenceOver,
                  ]}
                  testID={`courier-money-diff-${row.method}`}
                >
                  {row.differenceLabel}
                </Text>
              </View>
              </Fragment>
            ))}
          </OperationsSurface>
          <Text style={styles.hintText}>{t.dayClose.differenceNote}</Text>
        </View>

        <View style={styles.noteBlock}>
          <Text style={styles.sectionHeading}>{t.dayClose.noteHeading}</Text>
          <TextInput
            value={dayClose.note}
            onChangeText={dayClose.setNote}
            editable={!dayClose.closed}
            placeholder={t.dayClose.notePlaceholder}
            placeholderTextColor={operationsTheme.colors.muted}
            accessibilityLabel={t.dayClose.noteLabel}
            style={[styles.noteInput, dayClose.closed ? styles.moneyInputLocked : undefined]}
            testID="courier-day-close-note"
          />
        </View>
      </FormScroll>

      {keypadRow === null ? null : (
        <OperationsAmountKeypad
          visible
          title={fillCopy(t.dayClose.keypad.title, { method: keypadRow.label })}
          value={keypadRow.countedText}
          expected={centsToAmountText(keypadRow.expectedCents)}
          expectedLabel={fillCopy(t.dayClose.keypad.expected, { amount: money(keypadRow.expectedCents) })}
          // Birim artık PROP (30.08) — gerekçe `amount-keypad.tsx` künyesinde.
          unit="€"
          confirmLabel={t.dayClose.keypad.confirm}
          hint={t.dayClose.keypad.hint}
          footnote={t.dayClose.keypad.footnote}
          deleteLabel={t.dayClose.keypad.delete}
          onConfirm={(text) => {
            dayClose.setCounted(keypadRow.method, text);
            setKeypadFor(null);
          }}
          onClose={() => setKeypadFor(null)}
          testID="courier-money-keypad"
        />
      )}

      <View style={styles.footer}>
        {/*
          ONAY ARTIK ÇEKMECEDE (kullanıcı bulgusu 31.08 · ortak komponent).

          Burada sayfaya gömülü bir uyarı kutusu ve altında iki elden çizilmiş düğme vardı.
          Kullanıcı ölçtü: *"bu onay çekme JS mesajı gibi"* — ve haklıydı. Sayfaya gömülü bir onay
          bir KARAR anı gibi değil bir uyarı satırı gibi okunuyor; üstelik aynı desen teslim
          ekranında ayrıca kurulmuştu (iki kopya, tek karar).

          `OperationsConfirmSheet` v3'ün kendi "kayıt (2/2)" çekmecesi: ekranın geri kalanı kararır,
          karar tek başına kalır. Tonu `olive` — kapanış geri alınamaz ama YIKICI değil.
        */}
        <PressableSurface
          onPress={dayClose.askConfirm}
          disabled={dayClose.closed}
          feedback="scale"
          style={[styles.cta, dayClose.closed ? styles.ctaClosed : styles.ctaOpen]}
          accessibilityLabel={dayClose.closed ? t.dayClose.ctaClosed : t.dayClose.cta}
          testID="courier-day-close-cta"
        >
          <Text style={styles.ctaLabel}>{dayClose.closed ? t.dayClose.ctaClosed : t.dayClose.cta}</Text>
        </PressableSurface>
      </View>

      <OperationsConfirmSheet
        visible={dayClose.confirming}
        title={t.dayClose.cta}
        message={t.dayClose.confirmBox}
        confirmLabel={t.dayClose.confirm}
        cancelLabel={t.dayClose.cancel}
        onConfirm={dayClose.close}
        onCancel={dayClose.cancelConfirm}
        tone="olive"
        busy={dayClose.sending}
        busyLabel={t.dayClose.sending}
        testID="courier-day-close-sheet"
      />
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
  closedBox: {
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['3xl'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  closedText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['field-label--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.body,
  },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: operationsTheme.space.md,
    paddingVertical: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.control,
    paddingHorizontal: operationsTheme.space['3xl'],
    backgroundColor: operationsTheme.colors['terracotta-bg'],
  },
  warnDot: {
    width: operationsTheme.size.previewMark,
    height: operationsTheme.size.previewMark,
    borderRadius: operationsTheme.radius.pill,
    marginTop: operationsTheme.space.xs,
    backgroundColor: operationsTheme.colors.terracotta,
  },
  warnBoxText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['field-label--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.terracotta,
  },
  counters: { flexDirection: 'row', gap: operationsTheme.space.lg },
  counter: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.control,
  },
  counter_delivered: { backgroundColor: operationsTheme.colors['olive-bg'] },
  counter_pending: { backgroundColor: operationsTheme.colors['neutral-bg'] },
  counter_returned: { backgroundColor: operationsTheme.colors['error-bg'] },
  counterValue: {
    // v2: `800 22px` — Karla'nın 800'ü yüklenmiyor; en yakın gerçek kesit 700 (`fonts.ts`).
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.icon,
  },
  counterLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['badge-sm'],
  },
  counterText_delivered: { color: operationsTheme.colors['olive-dark'] },
  counterText_pending: { color: operationsTheme.colors.muted },
  counterText_returned: { color: operationsTheme.colors.error },
  moneyBlock: { gap: operationsTheme.space.md },
  /* KİTİN `panel` TONU (30.08) — zemin, çerçeve ve yarıçap oradan. Dolgu `none`: dikey dolguyu
     SATIRLAR taşıyor (ayraç kartın kenarına kadar uzansın diye), yatayı kart verir. */
  moneyCard: {
    paddingHorizontal: operationsTheme.space['3xl'],
  },
  sectionHeading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  moneyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space.lg,
  },
  moneyLabels: { flex: 1 },
  moneyName: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  moneyExpected: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  moneyValue: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  moneyValueLocked: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors['disabled-text'],
  },
  moneyInput: {
    width: operationsTheme.size.circleSm,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.lg,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.card,
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.body,
    textAlign: 'right',
    color: operationsTheme.colors.ink,
  },
  moneyInputLocked: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
    borderColor: operationsTheme.colors['disabled-line'],
    color: operationsTheme.colors['disabled-text'],
  },
  difference: {
    width: operationsTheme.size.avatarLg,
    textAlign: 'right',
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.note,
  },
  differenceZero: { color: operationsTheme.colors.muted },
  differenceShort: { color: operationsTheme.colors.error },
  differenceOver: { color: operationsTheme.colors['olive-dark'] },
  differenceUnknown: { color: operationsTheme.colors.muted },
  noteBlock: { gap: operationsTheme.space.sm },
  noteInput: {
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.panel,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  hintText: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  footer: {
    gap: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space.lg,
    paddingBottom: operationsTheme.space['3xl'],
  },
  confirmBox: {
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['3xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.error,
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.panel,
  },
  confirmText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['field-label--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    lineHeight: operationsTheme.text['field-label'] * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.error,
  },
  confirmRow: { flexDirection: 'row', gap: operationsTheme.space.md },
  // `flex` düğme stilinde DEĞİL (23.08 ölçümü — `PressableSurface.grow` künyesi).
  confirmButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
  },
  confirmCancel: { borderColor: operationsTheme.colors['sand-500'] },
  confirmCancelLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  confirmYes: {
    backgroundColor: operationsTheme.colors.error,
    borderColor: operationsTheme.colors.error,
  },
  confirmYesLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.card,
  },
  cta: {
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
  },
  ctaOpen: {
    backgroundColor: operationsTheme.colors.ink,
  },
  ctaClosed: { backgroundColor: operationsTheme.colors['disabled-fill'] },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['on-image'],
  },
});
