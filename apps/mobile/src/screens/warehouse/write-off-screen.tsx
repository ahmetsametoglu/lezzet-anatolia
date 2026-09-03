import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { StockWriteOffReason } from '@lezzet/types';

import { toastInfo } from '@/lib/toast/toast-store';
import { OperationsAmountKeypad } from '@/components/operations/amount-keypad';
import { OperationsQtyReasonRow } from '@/components/operations/qty-reason-row';
import { OperationsScanFab } from '@/components/operations/scan-fab';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsSurface } from '@/components/operations/surface';
import { FormScroll } from '@/components/ui/form-scroll';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { AdjustmentResultCard } from './adjustment-result-card';
import { BatchContextCard } from './batch-context-card';
import { BatchPicker } from './batch-picker';
import { warehouseCopy } from './copy';
import { useAdjustment } from './use-adjustment.hook';
import { useBatchScan } from './use-batch-scan.hook';
import { useBatchSubject } from './use-batch-subject.hook';
import { useSubjectBack } from './use-subject-back.hook';
import { useWarehouseStatus } from './warehouse-status';

/*
  D4b · STOK DÜŞÜMÜ (v3:09) — 02.09'da AÇILDI (tasarımın C maddesi, `BEKLEYEN(21.192)`).

  ── NEDEN AYRI EKRAN ────────────────────────────────────────────────────────
  Depoda stoğun eksilmesinin üç ayrı sebebi var ve üçü ayrı ekranın işi:
  · **süresi geçti** → D3 · Yakın-SKT turu. Sebebi SİSTEM bilir, sorulmaz (21.191).
  · **kayıt yanlıştı** → D4 · Sayım. Mal duruyor; değişen kayıt.
  · **mal eksildi** → BURASI. Mal gerçekten gitti: hasar gördü, soğuk zincir kırıldı, bulunamadı.

  Üçü tek ekranda toplandığında (v2'nin hâli) depocu her seferinde listeyi ayıklıyor ve sebep
  seçimi bir düşünme işine dönüşüyordu. Ekranı ayırmak, sebebi ZATEN seçilmiş hâle getiriyor.

  ── SÜRESİ GEÇEN MAL BURAYA GİRMEZ ──────────────────────────────────────────
  `expired` bu ekranın çip listesinde YOK ve bu bilinçli: onun kararı motorundur ve eylemi D3'ün
  kendi satırındadır. Burada elle seçilebilseydi, sistemin zaten bildiği bir şeyi operatöre
  yeniden sordurmuş olurduk — üstelik yanlış seçebileceği bir yerde.

  ── ADET POZİTİF YAZILIR, EKRANDA EKSİYLE OKUNUR ────────────────────────────
  Alan "kaç adet düşüyor" diye soruyor (pozitif); ekran onu `−N` diye gösteriyor ve kapıya eksi
  işaretiyle gidiyor (`use-adjustment` künyesi: ekran işareti → yön alanı). Operatöre "eksi yaz"
  dedirtmek, sayımın ve düşümün dilini birbirine karıştırırdı.
*/

const t = warehouseCopy;

/**
 * Depocuya AÇIK iki sebep — `expired` dışarıda (yukarıdaki künye). Liste elle yazılmış görünüyor
 * ama tip onu koruyor: `StockWriteOffReason`dan yeni bir sebep doğarsa sözlük anahtarı eksik
 * kalır ve derleme kırılır.
 */
const REASONS: readonly Exclude<StockWriteOffReason, 'expired'>[] = ['damaged', 'lost'];

export function WriteOffScreen() {
  const router = useRouter();
  const subject = useBatchSubject();
  const adjustment = useAdjustment();
  const { offline } = useWarehouseStatus();
  /* OKUTMA EKRANDA (03.09): düğme FAB'a taşındı ve FAB kaydırılan içeriğin dışında durmalı. */
  const scan = useBatchScan(subject.select);

  /** Düşülecek adet — POZİTİF; `null` = hiç yazılmadı. */
  const [qty, setQty] = useState<number | null>(null);
  const [reason, setReason] = useState<Exclude<StockWriteOffReason, 'expired'> | null>(null);
  /** Sayacın ortasındaki rakam TUŞ TAKIMINI açar (kullanıcı kararı 02.09 — künye aşağıda). */
  const [keypadOpen, setKeypadOpen] = useState(false);

  const batch = subject.subject;

  /* Konu değişince form sıfırlanır — sayım ekranıyla aynı gerekçe: kalan bir sayı, tek dokunuşla
     YANLIŞ partiden mal düşürürdü. */
  useEffect(() => {
    setQty(null);
    setReason(null);
  }, [batch?.stockId]);

  useEffect(() => {
    if (adjustment.notice !== null) toastInfo(adjustment.notice.text);
  }, [adjustment.notice]);

  useEffect(() => {
    if (subject.notice !== null) toastInfo(subject.notice.text);
  }, [subject.notice]);

  useEffect(() => {
    if (scan.notice !== null) toastInfo(scan.notice.text);
  }, [scan.notice]);

  /* Partinin yeri KAYITTAN SONRA yazılır — sayım ekranının aynı kararı (kullanıcı 03.09):
     seçmek beyan değildir, düşümü kaydetmek beyandır. */
  useEffect(() => {
    /* Bağımlılıkta yalnız `record` — sayım ekranının aynı gerekçesi. */
    if (adjustment.record !== null && batch !== null) subject.markSeen(batch);
  }, [adjustment.record]);

  /* CİHAZIN GERİ TUŞU da bir adım geri atar (kullanıcı bulgusu 03.09) — sol üstteki okla aynı
     şey; künye `use-subject-back`te. Sonuç kartındayken kapı KAPALI: orada geri, ekranı terk
     etmelidir (iş bitti, konu artık bir tutanak). */
  useSubjectBack(batch !== null && adjustment.record === null, subject.clear);

  const header = (
    <OperationsStackHeader
      title={t.adjustment.writeOff.title}
      subtitle={batch === null ? t.adjustment.writeOff.noSubject : t.adjustment.writeOff.subtitle}
      onBack={() => {
        if (batch !== null) {
          subject.clear();
          return;
        }
        router.back();
      }}
      backLabel={t.common.back}
      testID="warehouse-write-off-header"
    />
  );

  if (batch === null) {
    return (
      <View style={styles.screen} testID="warehouse-write-off">
        {header}
        <FormScroll
          contentContainerStyle={styles.list}
          onEndReached={subject.loadMore}
          testID="warehouse-write-off-picker-body"
        >
          <BatchPicker
            title={t.adjustment.writeOff.emptyTitle}
            body={t.adjustment.writeOff.emptyBody}
            footnote={t.adjustment.writeOff.emptyFootnote}
            subject={subject}
            scan={scan}
            testID="warehouse-write-off-picker"
          />
        </FormScroll>

        {/* OKUTMA FAB'DA (kullanıcı isteği 03.09): kaydırılan içeriğin DIŞINDA, sağ altta sabit —
            liste akarken de erişilir ve ekranın üstünü yemiyor. */}
        <OperationsScanFab
          icon="scan"
          onPress={scan.openScan}
          accessibilityLabel={t.adjustment.scan.cta}
          label={t.adjustment.scan.fab}
          testID="warehouse-write-off-scan"
        />
      </View>
    );
  }

  if (adjustment.record !== null) {
    return (
      <View style={styles.screen} testID="warehouse-write-off">
        {header}
        <FormScroll contentContainerStyle={styles.list} testID="warehouse-write-off-result-body">
          <AdjustmentResultCard
            batch={batch}
            record={adjustment.record}
            title={fillCopy(t.adjustment.writeOff.resultTitle, {
              reason: reason === null ? '' : t.adjustment.writeOff.reason[reason],
            })}
            againLabel={t.adjustment.writeOff.again}
            onAgain={() => {
              adjustment.reset();
              subject.clear();
            }}
            onHub={() => router.back()}
            testID="warehouse-write-off-result"
          />
        </FormScroll>
      </View>
    );
  }

  /* TAVAN PARTİNİN KENDİSİ: kapı da aynı şeyi söylüyor ("partide 3 var, 5 düşülemez") ama o cevabı
     ancak yazımdan SONRA veriyor. Ekranın tavanı, reddedilecek bir işi hiç yaptırmamak için. */
  const atLimit = qty !== null && qty >= batch.physicalQty;
  const cta = ctaOf({ offline, sending: adjustment.sending, qty, reason });

  return (
    <View style={styles.screen} testID="warehouse-write-off">
      {header}

      <FormScroll contentContainerStyle={styles.list} testID="warehouse-write-off-body">
        <BatchContextCard batch={batch} onChange={subject.clear} testID="warehouse-write-off-context" />

        {/*
          ADET SOLDA, SEBEP SAĞDA (kullanıcı kararı 02.09) — mal kabulün hasar kartının kalıbı.

          Tasarım (v3:09) burada büyük bir `−N` ve ayrı bir sebep bloğu çiziyordu; kullanıcı mal
          kabulde oturmuş kalıbı buraya da istedi ve gerekçesi sağlam: iki ekranın sorusu AYNI —
          *bir tavanın içinden ne kadarı, ve niçin*. Kalıbın kendisi de o gün kullanıcının kararı
          (şablonun çip serisi yerine sayaç + sebep alanı).

          Kazanç yalnız tutarlılık değil: cümle KALANI da söylüyor. "6 adetin kaçı düşüyor, kalan
          4 rafta durmaya devam eder" — depocunun kafasındaki soru tam olarak bu ve eski hâlde
          hiçbir yerde yazmıyordu.
        */}
        <View style={styles.section}>
          <Text style={styles.heading}>{t.adjustment.writeOff.qtyHeading}</Text>
          <OperationsSurface tone="panel" padding="lg">
            <Text style={styles.tally}>
              {fillCopy(t.adjustment.writeOff.tally, {
                total: String(batch.physicalQty),
                left: String(batch.physicalQty - (qty ?? 0)),
              })}
            </Text>
            <View style={styles.rowSpace} />
            <OperationsQtyReasonRow
              qty={qty ?? 0}
              onQtyChange={setQty}
              qtyLabel={fillCopy(t.adjustment.writeOff.qtyField, { n: String(qty ?? 0) })}
              max={batch.physicalQty}
              onPressQty={() => setKeypadOpen(true)}
              qtyHint={t.common.keypadHint}
              reason={reason === null ? null : t.adjustment.writeOff.reason[reason]}
              reasons={REASONS.map((option) => t.adjustment.writeOff.reason[option])}
              /* Etiket → SEBEP KODU: bileşen metinle konuşuyor (kit i18n bilmez), kayıt ise kodla.
                 Çeviri burada ve tek yerde — eşleşmeyen bir etiket `null` olur, yani seçim
                 kaldırılmış sayılır; sessizce yanlış sebeple yazmaktansa hiç yazmamak. */
              onReasonChange={(label) =>
                setReason(REASONS.find((option) => t.adjustment.writeOff.reason[option] === label) ?? null)
              }
              reasonPlaceholder={t.adjustment.writeOff.reasonPick}
              sheetTitle={t.adjustment.writeOff.reasonTitle}
              sheetHint={t.adjustment.writeOff.reasonHint}
              testID="warehouse-write-off-row"
            />
          </OperationsSurface>

          {/*
            ORTADAKİ RAKAM TUŞ TAKIMI AÇAR, ADET ÇEKMECESİ DEĞİL (kullanıcı kararı 02.09).

            Kullanıcının ölçütü: *"çekmece açılacaksa bir durumdan ötürü açılıyor demektir ve o
            duruma özgü bir çekmece olması gerekir."* Düşümde öyle bir durum yok — koli sorulmaz
            (parti sözleşmesi çarpan taşımıyor, düşüm çoğu zaman tek tek sayılan bir iki adet),
            cetvel ve koli bölümü burada gürültüydü. Kitin tuş takımı (eldivenli el, sayı tuşların
            ÜSTÜNDE durur) yeter. CANLI kip: her tuş sayaca anında yazılır, kapatmak yeter (onay
            düğmesi yok — kullanıcı 02.09). Tavan tuşta: partiden fazlasını yazacak tuş işlemez,
            dipnot bunu söyler.
          */}
          <OperationsAmountKeypad
            visible={keypadOpen}
            title={t.adjustment.writeOff.keypad.title}
            value={String(qty ?? 0)}
            expected={null}
            unit={t.common.keypad.unit}
            allowDecimals={false}
            max={batch.physicalQty}
            hint={fillCopy(t.adjustment.writeOff.keypad.hint, {
              name: batch.name,
              code: batch.batchNo,
            })}
            footnote={fillCopy(t.adjustment.writeOff.keypad.footnote, { total: String(batch.physicalQty) })}
            deleteLabel={t.common.keypad.delete}
            onChange={(text) => setQty(text.length === 0 ? 0 : Number.parseInt(text, 10))}
            onClose={() => setKeypadOpen(false)}
            testID="warehouse-write-off-keypad"
          />

          {atLimit ? (
            <View style={styles.limit} testID="warehouse-write-off-limit">
              <Text style={styles.limitText}>{t.adjustment.writeOff.limit}</Text>
            </View>
          ) : null}

          {/* ÖNEK SEBEPTEN DOĞAR ama iki sebep de aynı tutanağa yazılır (`write_off` → `IMH`):
              cümle bunu SÖYLÜYOR, çünkü depocu kâğıtta hangi numarayı arayacağını bilmeli. */}
          <Text style={styles.hint}>{fillCopy(t.adjustment.writeOff.reasonNote, { prefix: 'IMH' })}</Text>
        </View>
      </FormScroll>

      <LinearGradient {...operationsTheme.gradient.stickyFade} style={styles.sticky}>
        {!offline ? null : (
          <View style={styles.locked} testID="warehouse-write-off-locked">
            <Text style={styles.lockedTitle}>{t.adjustment.writeOff.locked.title}</Text>
            <Text style={styles.lockedBody}>{t.adjustment.writeOff.locked.body}</Text>
          </View>
        )}
        <PressableSurface
          onPress={() => {
            if (qty === null || qty <= 0 || reason === null) return;
            // EKRAN İŞARETİ: düşüm eksidir — çeviriyi `toRequestLine` yapıyor (hook künyesi).
            adjustment.submit({ stockId: batch.stockId, qty: -qty, reason });
          }}
          disabled={!cta.enabled}
          feedback="shadow"
          style={[styles.cta, cta.enabled ? styles.ctaReady : styles.ctaIdle]}
          accessibilityLabel={cta.label}
          testID="warehouse-write-off-cta"
        >
          <Text style={styles.ctaLabel}>{cta.label}</Text>
        </PressableSurface>
      </LinearGradient>
    </View>
  );
}

/** Düğme ne eksik olduğunu söyler; sıra önemli — önce bağlantı, sonra yazım, sonra eksik alanlar. */
function ctaOf(input: {
  offline: boolean;
  sending: boolean;
  qty: number | null;
  reason: string | null;
}): { label: string; enabled: boolean } {
  if (input.offline) return { label: t.common.offlineCta, enabled: false };
  if (input.sending) return { label: t.adjustment.writeOff.cta.sending, enabled: false };
  if (input.qty === null || input.qty <= 0) return { label: t.adjustment.writeOff.cta.needsQty, enabled: false };
  if (input.reason === null) return { label: t.adjustment.writeOff.cta.needsReason, enabled: false };
  return { label: t.adjustment.writeOff.cta.ready, enabled: true };
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space['3xl'],
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['8xl'],
    gap: operationsTheme.space['2xl'],
  },
  section: {
    gap: operationsTheme.space.md,
  },
  heading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  /** Kartın soru cümlesi: kaç adet var, kaçı düşüyor, kaçı kalıyor. */
  tally: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.body,
  },
  /** Cümle ile satır arasındaki nefes — kartın kendi `gap`i yok (çocukları serbest). */
  rowSpace: { height: operationsTheme.space.lg },
  limit: {
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['warning-bg'],
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.lg,
  },
  limitText: {
    fontFamily: operationsTheme.font.body[600],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.terracotta,
  },
  hint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  sticky: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.xl,
    paddingBottom: operationsTheme.space['7xl'],
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
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.error,
  },
  cta: {
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
  },
  ctaReady: {
    backgroundColor: operationsTheme.colors.ink,
  },
  ctaIdle: {
    backgroundColor: operationsTheme.colors['sand-500'],
  },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors.cream,
  },
});
