import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { ResolvedBatchContract } from '@lezzet/types';

import { OperationsSurface } from '@/components/operations/surface';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import type { AdjustmentRecord } from './use-adjustment.hook';

/*
  SONUÇ KARTI — yazımdan SONRA (D4 · D4b · v3:08/09), 02.09.

  ── EKRAN KAPANMIYOR, DEĞİŞİYOR ─────────────────────────────────────────────
  Eski hâlde kayıt bir toast'la duyuruluyordu ve form olduğu gibi kalıyordu: depocu neyi yazdığını,
  numarasının ne olduğunu ve stoğun ne olduğunu ekrandan okuyamıyordu — aynı partiyi ikinci kez
  düşürmesini engelleyen tek şey hafızasıydı. Kart bunu bir TUTANAK hâline getiriyor.

  ── İKİ SAYI ÖLÇÜLDÜ, HESAPLANMADI ──────────────────────────────────────────
  "12 → 9" satırının ikinci yarısı kapıdan geliyor (`after`). `null` ise satır *"yeni değer
  okunamadı"* der ve bir sayı UYDURMAZ: ölçülemeyen değer sıfır değildir (CLAUDE §1) — hatalı bir
  sayıyı kâğıt tutanağa geçirmek, hiç sayı yazmamaktan kötüdür.

  ── İKİ ÇIKIŞ, İKİ AĞIRLIK ──────────────────────────────────────────────────
  "Başka parti say" KOYU (asıl akış: depocu turda, sıradaki partiye geçer), "Depo İşleri'ne dön"
  çerçeveli. Tasarımın kendi hiyerarşisi ve doğru olan bu — turu bitirmek istisnadır.
*/

const t = warehouseCopy;

interface AdjustmentResultCardProps {
  /** Yazımın konusu — kart künyeyi ve ÖNCEKİ iki sayıyı ondan okur. */
  batch: ResolvedBatchContract;
  record: AdjustmentRecord;
  title: string;
  againLabel: string;
  onAgain: () => void;
  onHub: () => void;
  testID: string;
}

export function AdjustmentResultCard({
  batch,
  record,
  title,
  againLabel,
  onAgain,
  onHub,
  testID,
}: AdjustmentResultCardProps) {
  return (
    <View style={styles.block} testID={testID}>
      <OperationsSurface tone="panel" padding="lg">
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subject}>{`${batch.lotNumber ?? t.adjustment.picker.noLot} · ${batch.name}`}</Text>

        <View style={styles.rule} />

        <ChangeRow
          label={t.adjustment.result.batchLabel}
          before={batch.physicalQty}
          after={record.after?.batchQty}
          testID={`${testID}-batch`}
        />
        <ChangeRow
          label={t.adjustment.result.variantLabel}
          before={batch.variantWarehouseQty}
          after={record.after?.variantWarehouseQty}
          testID={`${testID}-variant`}
        />

        <View style={styles.refBox}>
          <Text style={styles.heading}>{t.adjustment.ref.heading}</Text>
          <Text style={styles.ref} testID={`${testID}-ref`}>
            {record.referenceNo}
          </Text>
          <Text style={styles.help}>{t.adjustment.ref.help}</Text>
        </View>
      </OperationsSurface>

      <PressableSurface
        onPress={onAgain}
        feedback="shadow"
        style={[styles.cta, styles.ctaPrimary]}
        accessibilityLabel={againLabel}
        testID={`${testID}-again`}
      >
        <Text style={styles.ctaPrimaryLabel}>{againLabel}</Text>
      </PressableSurface>

      <PressableSurface
        onPress={onHub}
        feedback="scale"
        style={[styles.cta, styles.ctaSecondary]}
        accessibilityLabel={t.adjustment.result.toHub}
        testID={`${testID}-hub`}
      >
        <Text style={styles.ctaSecondaryLabel}>{t.adjustment.result.toHub}</Text>
      </PressableSurface>
    </View>
  );
}

interface ChangeRowProps {
  label: string;
  before: number;
  /** `undefined` = ölçülemedi; satır sayı yerine bunu SÖYLER. */
  after: number | undefined;
  testID: string;
}

function ChangeRow({ label, before, after, testID }: ChangeRowProps) {
  return (
    <View style={styles.changeRow}>
      <Text style={styles.changeLabel}>{label}</Text>
      <Text style={styles.changeValue} testID={testID}>
        {after === undefined
          ? t.adjustment.result.changeUnknown
          : fillCopy(t.adjustment.result.change, { before: String(before), after: String(after) })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: operationsTheme.space.xl,
  },
  title: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  subject: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space['2xs'],
  },
  rule: {
    height: operationsTheme.border.base,
    backgroundColor: operationsTheme.colors['sand-300'],
    marginVertical: operationsTheme.space.lg,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.md,
    paddingVertical: operationsTheme.space.xs,
  },
  changeLabel: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  changeValue: {
    fontFamily: operationsTheme.font.body[600],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  refBox: {
    marginTop: operationsTheme.space.lg,
    backgroundColor: operationsTheme.colors.cream,
    borderRadius: operationsTheme.radius.control,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space.lg,
    gap: operationsTheme.space['2xs'],
  },
  heading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  ref: {
    fontFamily: operationsTheme.font.body[600],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  help: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  cta: {
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
  },
  ctaPrimary: {
    backgroundColor: operationsTheme.colors.ink,
  },
  ctaPrimaryLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors.cream,
  },
  ctaSecondary: {
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
  },
  ctaSecondaryLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors.ink,
  },
});
