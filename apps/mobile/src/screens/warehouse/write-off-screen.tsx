import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { StockWriteOffReason } from '@lezzet/types';

import { toastInfo } from '@/lib/toast/toast-store';
import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsQtyField } from '@/components/operations/qty-field';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsStepperButton } from '@/components/operations/stepper-button';
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
import { useBatchSubject } from './use-batch-subject.hook';
import { parseQty, qtyToText } from './warehouse-format';
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

  /** Düşülecek adet — POZİTİF; `null` = hiç yazılmadı. */
  const [qty, setQty] = useState<number | null>(null);
  const [reason, setReason] = useState<Exclude<StockWriteOffReason, 'expired'> | null>(null);

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
        <FormScroll contentContainerStyle={styles.list} testID="warehouse-write-off-picker-body">
          <BatchPicker
            title={t.adjustment.writeOff.emptyTitle}
            body={t.adjustment.writeOff.emptyBody}
            footnote={t.adjustment.writeOff.emptyFootnote}
            subject={subject}
            testID="warehouse-write-off-picker"
          />
        </FormScroll>
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

        <View style={styles.section}>
          <Text style={styles.heading}>{t.adjustment.writeOff.qtyHeading}</Text>
          <OperationsSurface tone="panel" padding="lg">
            <View style={styles.qtyRow}>
              {/* Eksi İŞARETİ (U+2212), tire değil: rakamla aynı genişlikte durur (kit kuralı). */}
              <Text style={styles.qtyMinus}>−</Text>
              <OperationsQtyField
                value={qtyToText(qty)}
                onChangeText={(text) => {
                  const next = parseQty(text);
                  // Tavan GİRİŞTE uygulanıyor: yazdığı sayının sessizce başka bir sayıya dönmesi
                  // yerine partinin tamamında durur ve altındaki bant sebebini söyler.
                  setQty(next === null ? null : Math.min(Math.max(next, 0), batch.physicalQty));
                }}
                accessibilityLabel={t.adjustment.writeOff.qtyField}
                size="lg"
                placeholder="—"
                tone={qty === null || qty === 0 ? 'neutral' : 'down'}
                testID="warehouse-write-off-qty"
              />
              <View style={styles.steppers}>
                <OperationsStepperButton
                  direction="decrease"
                  onPress={() => setQty(Math.max(0, (qty ?? 0) - 1))}
                  disabled={(qty ?? 0) <= 0}
                  accessibilityLabel={t.adjustment.writeOff.qtyField}
                  testID="warehouse-write-off-minus"
                />
                <OperationsStepperButton
                  direction="increase"
                  onPress={() => setQty(Math.min(batch.physicalQty, (qty ?? 0) + 1))}
                  disabled={atLimit}
                  accessibilityLabel={t.adjustment.writeOff.qtyField}
                  testID="warehouse-write-off-plus"
                />
              </View>
            </View>
          </OperationsSurface>

          {atLimit ? (
            <View style={styles.limit} testID="warehouse-write-off-limit">
              <Text style={styles.limitText}>{t.adjustment.writeOff.limit}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>{t.adjustment.writeOff.reasonHeading}</Text>
          <View style={styles.chipRow}>
            {REASONS.map((option) => (
              <OperationsChoiceChip
                key={option}
                label={t.adjustment.writeOff.reason[option]}
                selected={reason === option}
                onPress={() => setReason(option)}
                testID={`warehouse-write-off-reason-${option}`}
              />
            ))}
          </View>
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
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
  },
  /** Eksi İŞARETİ (U+2212) alanın DIŞINDA: yazılan sayı pozitif, okunan değer negatif. */
  qtyMinus: {
    fontFamily: operationsTheme.font.display[600],
    fontSize: operationsTheme.text['card-title'],
    color: operationsTheme.colors.terracotta,
  },
  steppers: {
    flexDirection: 'row',
    gap: operationsTheme.space.md,
    marginLeft: 'auto',
  },
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
