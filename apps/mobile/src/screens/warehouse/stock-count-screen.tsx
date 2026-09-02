import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { toastInfo } from '@/lib/toast/toast-store';
import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsQuantitySheet } from '@/components/operations/quantity-sheet';
import { quantityTotal } from '@/components/operations/quantity-value';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsStepperGroup } from '@/components/operations/stepper-group';
import { OperationsSurface } from '@/components/operations/surface';
import { FormScroll } from '@/components/ui/form-scroll';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { AdjustmentResultCard } from './adjustment-result-card';
import { BatchContextCard } from './batch-context-card';
import { BatchPicker } from './batch-picker';
import { qtySheetCopy, warehouseCopy } from './copy';
import { useAdjustment } from './use-adjustment.hook';
import { useBatchSubject } from './use-batch-subject.hook';
import { useWarehouseStatus } from './warehouse-status';

/*
  D4 · SAYIM (v3:08) — 02.09'da tasarımın B maddesiyle BAŞTAN yazıldı.

  ── ESKİ EKRAN NEYİ YANLIŞ SORUYORDU ────────────────────────────────────────
  v2'nin "Sayım / Düzeltme"si tek bir işaretli adet alanı ve dört sebep çipiydi: depocu FARKI
  hesaplayıp yazıyordu ("sistemde 12 yazıyor, rafta 9 var → −3"). Üç arıza birden:
  · aritmetiği insan yapıyordu ve yanlışı sessizce stoğa geçiyordu,
  · karşılaştıracağı sayı EKRANDA YOKTU (parti adedi hiç gösterilmiyordu),
  · aynı ekran hem sayımı hem imhayı hem kaybı topluyordu — üçü ayrı iş, ayrı kanıt.

  Şimdi soru tek: **rafta kaç adet var.** Farkı sistem buluyor, sebebi ancak fark VARSA soruyor.

  ── HASAR/KAYIP BURADA DEĞİL ────────────────────────────────────────────────
  Onlar D4b'nin (Stok Düşümü) işi ve süresi geçen mal D3'ün. Ayrım keyfî değil: sayımda kimse
  malı çöpe atmıyor, kayıt ile rafı eşitliyor. Aynı ekranda toplanmaları, "sebep" listesini
  operatörün her seferinde ayıklaması demekti.

  ── SEBEP YALNIZ FARK VARSA SORULUR ─────────────────────────────────────────
  Sayım kaydı `count_diff`tir; çipler kaydın SEBEP NOTUNU verir. Fazla yazımda (`direction: 'in'`)
  notu veritabanı zaten zorunlu tutuyor — ekran onu eksikte de istiyor: stok kendiliğinden
  değişmez, niçin değiştiği yazılmayan bir düzeltme altı ay sonra kimsenin açıklayamayacağı bir
  satırdır.
*/

const t = warehouseCopy;

export function StockCountScreen() {
  const router = useRouter();
  const subject = useBatchSubject();
  const adjustment = useAdjustment();
  const { offline } = useWarehouseStatus();

  /** Rafta sayılan adet — `null` = HİÇ SAYILMADI (sıfır değil; ayrım kaydın kendisi). */
  const [counted, setCounted] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const batch = subject.subject;

  /*
    KONU DEĞİŞİNCE SAYIM SIFIRLANIR. Başka partiye geçen depocunun ekranında önceki partinin
    sayısı kalsaydı, tek dokunuşla YANLIŞ partiye yazılırdı — bu ekranın en pahalı hatası.
  */
  useEffect(() => {
    setCounted(null);
    setNote(null);
  }, [batch?.stockId]);

  useEffect(() => {
    if (adjustment.notice !== null) toastInfo(adjustment.notice.text);
  }, [adjustment.notice]);

  const header = (
    <OperationsStackHeader
      title={t.adjustment.count.title}
      subtitle={batch === null ? t.adjustment.count.noSubject : t.adjustment.count.subtitle}
      onBack={() => {
        // KONUYU BIRAKMAK DA BİR GERİ ADIMDIR: parti seçiliyken geri, ekranı terk etmez —
        // seçiciye döner. D1'in kuyruk kuralıyla aynı (21.220): bir adım geri, bir ekran değil.
        if (batch !== null) {
          subject.clear();
          return;
        }
        router.back();
      }}
      backLabel={t.common.back}
      testID="warehouse-stock-count-header"
    />
  );

  if (batch === null) {
    return (
      <View style={styles.screen} testID="warehouse-stock-count">
        {header}
        <FormScroll contentContainerStyle={styles.list} testID="warehouse-stock-count-picker-body">
          <BatchPicker
            title={t.adjustment.count.emptyTitle}
            body={t.adjustment.count.emptyBody}
            subject={subject}
            testID="warehouse-stock-count-picker"
          />
        </FormScroll>
      </View>
    );
  }

  if (adjustment.record !== null) {
    return (
      <View style={styles.screen} testID="warehouse-stock-count">
        {header}
        <FormScroll contentContainerStyle={styles.list} testID="warehouse-stock-count-result-body">
          <AdjustmentResultCard
            batch={batch}
            record={adjustment.record}
            title={t.adjustment.count.resultTitle}
            againLabel={t.adjustment.count.again}
            onAgain={() => {
              adjustment.reset();
              subject.clear();
            }}
            onHub={() => router.back()}
            testID="warehouse-stock-count-result"
          />
        </FormScroll>
      </View>
    );
  }

  const diff = counted === null ? null : counted - batch.physicalQty;
  const needsNote = diff !== null && diff !== 0;
  const cta = ctaOf({ offline, sending: adjustment.sending, diff, note });

  return (
    <View style={styles.screen} testID="warehouse-stock-count">
      {header}

      <FormScroll contentContainerStyle={styles.list} testID="warehouse-stock-count-body">
        <BatchContextCard batch={batch} onChange={subject.clear} testID="warehouse-stock-count-context" />

        <View style={styles.section}>
          <Text style={styles.heading}>{t.adjustment.count.qtyHeading}</Text>
          <OperationsSurface tone="panel" padding="lg">
            {/*
              KİTİN TEK ADET DESENİ, BÜYÜK BOYDA (kullanıcı kararı 02.09): `− 27 +`, ortadaki
              rakam basılınca ADET ÇEKMECESİ. Eskiden burada büyük bir rakam ve yanında iki AYRI
              ± düğmesi vardı — başka hiçbir ekranda olmayan bir şekil; kullanıcı "yerleri değişen
              artı eksi"yi sorun olarak söyledi ve o şekil söküldü.

              Klavye değil ÇEKMECE açılıyor ve fark pratik: depocu rafta 27 paketi rakam rakam
              yazmaz, *"iki koli, üç tek"* der — çarpmayı ekran yapar. ± ise "bir tane daha buldum"
              anının aracı; ikisi aynı sayıyı besliyor. Taban SIFIR — eksiye inen bir "sayılan
              adet" yoktur. Boş hâl (`null`) sıfır DEĞİL: "—" henüz rafa bakılmadığını söyler.
            */}
            <OperationsStepperGroup
              value={counted}
              onChange={setCounted}
              label={t.adjustment.count.qtyField}
              size="lg"
              emptyLabel={t.adjustment.count.qtyEmpty}
              onPressValue={() => setSheetOpen(true)}
              valueHint={t.common.qtyHint}
              testID="warehouse-stock-count-qty"
            />
          </OperationsSurface>

          {/*
            ÇEKMECE TOPLAMI YUKARI VERİR, DÖKÜMÜ DEĞİL (bilinçli).

            Sayımın kaydı bir SAYIDIR; "2 koli + 3 tek" o sayıya varmanın yoludur ve kayıtta
            karşılığı yok. Bu yüzden çekmece her açılışta toplamı TEK olarak gösteriyor: döküm
            saklansaydı ekranda duran sayı ile kayda giden sayı iki ayrı yerde yaşardı.

            `caseSizes` BOŞ: parti sözleşmesi koli boyu taşımıyor. Çekmece o hâlde kendi "başka
            koli boyu" adımını açıyor — depocu elindeki koliye bakıp çarpanı seçiyor ve bu YALNIZ
            bu sayımda geçerli (kopya metni bunu söylüyor; mal kabulün aksine ürün kartına
            yazılmıyor).
          */}
          <OperationsQuantitySheet
            visible={sheetOpen}
            title={t.adjustment.count.qtySheet.title}
            value={{ cases: [], loose: counted ?? 0 }}
            /* Koli boyları ÜRÜN KARTINDAN (02.09): rafta koli de durur; sözleşme çarpanı artık taşıyor. */
            caseSizes={batch.caseSizes}
            onChange={(next) => setCounted(quantityTotal(next))}
            copy={qtySheetCopy({
              ...t.adjustment.count.qtySheet,
              subject: fillCopy(t.adjustment.count.qtySheet.subject, {
                name: batch.name,
                code: batch.lotNumber ?? t.adjustment.picker.noLot,
              }),
            })}
            onClose={() => setSheetOpen(false)}
            testID="warehouse-stock-count-qty-sheet"
          />

          {/* FARKI SİSTEM SÖYLER, CÜMLEYLE: "−3" bir sayı, "3 adet EKSİK" bir bulgudur. */}
          {diff === null ? null : (
            <View style={[styles.diff, diff === 0 ? styles.diffSame : styles.diffChanged]}>
              <Text style={[styles.diffText, diff === 0 ? styles.diffTextSame : styles.diffTextChanged]}>
                {diff === 0
                  ? t.adjustment.count.same
                  : fillCopy(diff < 0 ? t.adjustment.count.less : t.adjustment.count.more, {
                      system: String(batch.physicalQty),
                      counted: String(counted),
                      diff: String(Math.abs(diff)),
                    })}
              </Text>
            </View>
          )}
        </View>

        {needsNote ? (
          <View style={styles.noteBox} testID="warehouse-stock-count-note-block">
            <Text style={styles.noteTitle}>{t.adjustment.count.noteTitle}</Text>
            <Text style={styles.hint}>{t.adjustment.count.noteBody}</Text>
            <View style={styles.chipRow}>
              {t.adjustment.count.notes.map((option) => (
                <OperationsChoiceChip
                  key={option}
                  label={option}
                  selected={note === option}
                  onPress={() => setNote(option)}
                  testID={`warehouse-stock-count-note-${option}`}
                />
              ))}
            </View>
          </View>
        ) : null}

        <Text style={styles.hint}>{t.adjustment.count.footnote}</Text>
      </FormScroll>

      <LinearGradient {...operationsTheme.gradient.stickyFade} style={styles.sticky}>
        {/* ÇEVRİMDIŞI SEBEBİ YAZILIR, DÜĞME KALIR: eksik olan sebepti — depocu neden
            kaydedemediğini bilmeden bekliyordu. */}
        {!offline ? null : (
          <View style={styles.locked} testID="warehouse-stock-count-locked">
            <Text style={styles.lockedTitle}>{t.adjustment.count.locked.title}</Text>
            <Text style={styles.lockedBody}>{t.adjustment.count.locked.body}</Text>
          </View>
        )}
        <PressableSurface
          onPress={() => {
            if (diff === null || diff === 0) return;
            adjustment.submit({ stockId: batch.stockId, qty: diff, reason: 'count_diff', note });
          }}
          disabled={!cta.enabled}
          feedback="shadow"
          style={[styles.cta, cta.enabled ? styles.ctaReady : styles.ctaIdle]}
          accessibilityLabel={cta.label}
          testID="warehouse-stock-count-cta"
        >
          <Text style={styles.ctaLabel}>{cta.label}</Text>
        </PressableSurface>
      </LinearGradient>
    </View>
  );
}

/**
 * DÜĞME NE EKSİK OLDUĞUNU SÖYLER (v3'ün pasif CTA kuralı): "kaydet" yazıp tepki vermeyen bir
 * düğme, bozuk bir düğmedir. Sıra ÖNEMLİ — önce bağlantı, sonra yazım, sonra eksik alanlar.
 */
function ctaOf(input: {
  offline: boolean;
  sending: boolean;
  diff: number | null;
  note: string | null;
}): { label: string; enabled: boolean } {
  if (input.offline) return { label: t.common.offlineCta, enabled: false };
  if (input.sending) return { label: t.adjustment.count.cta.sending, enabled: false };
  if (input.diff === null) return { label: t.adjustment.count.cta.needsCount, enabled: false };
  if (input.diff === 0) return { label: t.adjustment.count.cta.same, enabled: false };
  if (input.note === null) return { label: t.adjustment.count.cta.needsNote, enabled: false };
  return { label: t.adjustment.count.cta.ready, enabled: true };
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
  diff: {
    borderRadius: operationsTheme.radius.control,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space.lg,
  },
  diffSame: {
    backgroundColor: operationsTheme.colors['success-bg'],
  },
  diffChanged: {
    backgroundColor: operationsTheme.colors['warning-bg'],
  },
  diffText: {
    fontFamily: operationsTheme.font.body[600],
    fontSize: operationsTheme.text.note,
    lineHeight: operationsTheme.text.note * operationsTheme.text['lead--line-height'],
  },
  diffTextSame: {
    color: operationsTheme.colors['olive-dark'],
  },
  diffTextChanged: {
    color: operationsTheme.colors.terracotta,
  },
  noteBox: {
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['terracotta-line'],
    backgroundColor: operationsTheme.colors['warning-bg'],
    padding: operationsTheme.space.xl,
    gap: operationsTheme.space.md,
  },
  noteTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.terracotta,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: operationsTheme.space.md,
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
