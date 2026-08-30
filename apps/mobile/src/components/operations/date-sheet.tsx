import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { operationsTheme } from '@/theme/unistyles';
import {
  clampDay,
  dayRange,
  fromIsoDate,
  quickPicks,
  toIsoDate,
  yearRange,
  type DateWheelValue,
} from './date-wheel-value';

/*
  TARİH SEÇİCİ (Operasyon Mobil v3 · `00-ortak` — `sheetSkt`) — SKT klavyeyle yazılmaz.

  ── NİÇİN ───────────────────────────────────────────────────────────────────
  Rampada koli tutulurken, eldivenle giriliyor ve klavyeyle yazılan tarih iki yerden bozuluyordu:
  olmayan gün ("31.02") ve belirsiz biçim ("2.6.26" mi 6.2.26 mı). Üç sütunda ikisi de imkânsız —
  gün listesi ayın gerçek uzunluğu kadar, sıra sabit.

  ── HIZLI ÇİPLER: BİRİ VERİ, ÜÇÜ KISAYOL ────────────────────────────────────
  İlk çip ürünün RAF ÖMRÜNDEN türer (bugün üretilmiş varsayımı) ve raf ömrü bilinmiyorsa hiç
  çizilmez; ötekiler (+3 ay · +6 ay · +1 yıl) kısayoldur. Ayrım önemli: uydurma bir "beklenen SKT",
  depocuya doğrulanmış bir tarih gibi görünürdü (CLAUDE §1).

  ── SÜTUNLAR KAYDIRILIR, ÇEVRİLMEZ ──────────────────────────────────────────
  Şablonun `scroll-snap`li tekerleği yerine kaydırılabilir bir sütun: RN'de tekerlek ya yeni bir
  bağımlılık ya da elle yazılmış bir ivme hesabı ister; ikisi de bu ekranın kazandığından pahalı.
  Dokunulan gün seçilir, seçili olan zeytin durur — tekerleğin verdiği bilgi (hangi değerdeyim)
  renkten okunuyor.
*/

interface OperationsDateSheetProps {
  visible: boolean;
  title: string;
  /** Künye satırı — "Fıstıklı Baklava · 450 g · seçili: 30.08.2026". */
  subject: string;
  /** Açılış değeri (ISO); geçersiz ya da boşsa seçici BUGÜNLE açılır. */
  value: string;
  /** Ürünün raf ömrü — ilk hızlı çip bundan türer; `null` ise o çip çizilmez. */
  shelfLifeDays: number | null;
  columnLabels: { day: string; month: string; year: string };
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: (iso: string) => void;
  onClose: () => void;
  testID?: string;
}

export function OperationsDateSheet({
  visible,
  title,
  subject,
  value,
  shelfLifeDays,
  columnLabels,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  testID,
}: OperationsDateSheetProps) {
  const [draft, setDraft] = useState<DateWheelValue>(() => openingValue(value));

  /* Her AÇILIŞTA çağıranın değeri yeniden alınır: kapatılıp yeniden açılan seçici, bir önceki
     satırın tarihini göstermemeli. */
  useEffect(() => {
    if (visible) setDraft(openingValue(value));
  }, [visible, value]);

  const today = new Date();
  const picks = quickPicks(today, shelfLifeDays);
  const years = yearRange(today);
  const days = dayRange(draft);

  const column = (
    label: string,
    values: number[],
    selected: number,
    onPick: (n: number) => void,
    key: string,
  ) => (
    <View style={styles.column}>
      <Text style={styles.columnLabel}>{label}</Text>
      <ScrollView style={styles.columnScroll} contentContainerStyle={styles.columnList}>
        {values.map((n) => (
          <PressableSurface
            key={n}
            onPress={() => onPick(n)}
            feedback="scale"
            style={[styles.cell, n === selected ? styles.cellSelected : null]}
            accessibilityLabel={`${label} ${n}`}
            testID={testID === undefined ? undefined : `${testID}-${key}-${n}`}
          >
            <Text style={n === selected ? styles.cellLabelSelected : styles.cellLabel}>{n}</Text>
          </PressableSurface>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <BottomSheet visible={visible} title={title} onClose={onClose} testID={testID}>
      <Text style={styles.subject}>{subject}</Text>

      {picks.length === 0 ? null : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.picks}>
          {picks.map((pick) => (
            <PressableSurface
              key={pick.label}
              onPress={() => setDraft(pick.value)}
              feedback="scale"
              compact
              style={styles.pick}
              accessibilityLabel={pick.label}
              testID={testID === undefined ? undefined : `${testID}-pick-${pick.label}`}
            >
              <Text style={styles.pickLabel}>{pick.label}</Text>
            </PressableSurface>
          ))}
        </ScrollView>
      )}

      <View style={styles.columns}>
        {column(columnLabels.day, days, draft.day, (day) => setDraft((c) => ({ ...c, day })), 'day')}
        {column(columnLabels.month, MONTHS, draft.month, (month) => setDraft((c) => clampDay({ ...c, month })), 'month')}
        {column(columnLabels.year, years, draft.year, (year) => setDraft((c) => clampDay({ ...c, year })), 'year')}
      </View>

      <View style={styles.actions}>
        <PressableSurface
          onPress={onClose}
          feedback="scale"
          style={styles.cancel}
          accessibilityLabel={cancelLabel}
          testID={testID === undefined ? undefined : `${testID}-cancel`}
        >
          <Text style={styles.cancelLabel}>{cancelLabel}</Text>
        </PressableSurface>
        <PressableSurface
          onPress={() => onConfirm(toIsoDate(draft))}
          feedback="shadow"
          grow
          style={styles.confirm}
          accessibilityLabel={confirmLabel}
          testID={testID === undefined ? undefined : `${testID}-confirm`}
        >
          <Text style={styles.confirmLabel}>{confirmLabel}</Text>
        </PressableSurface>
      </View>
    </BottomSheet>
  );
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/* Geçersiz ya da boş değerde BUGÜN: seçiciyi uydurma bir tarihle açmak, dokunulmadan onaylandığında
   yanlış bir SKT yazardı. Bugün en azından ölçülmüş bir gündür ve gözle yanlışlığı belli olur. */
function openingValue(iso: string): DateWheelValue {
  const parsed = fromIsoDate(iso);
  if (parsed !== null) return parsed;
  const now = new Date();
  return { day: now.getDate(), month: now.getMonth() + 1, year: now.getFullYear() };
}

const styles = StyleSheet.create({
  subject: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  picks: { gap: operationsTheme.space.md, paddingVertical: operationsTheme.space.lg },
  pick: {
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.xl,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  pickLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors['olive-dark'],
  },
  columns: { flexDirection: 'row', gap: operationsTheme.space.lg },
  column: { flex: 1, gap: operationsTheme.space.sm, minWidth: 0 },
  columnLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  // Sütunun boyu SABİT: içerik uzunluğuna göre değişseydi gün sütunu ay sütunundan uzun olur ve
  // seçici her ay değişiminde zıplardı. Ölçü dördüncü hücreyi YARIM bırakır — kaydırmanın tek
  // dürüst işareti (metrics künyesi).
  columnScroll: { height: operationsTheme.size.wheelColumn },
  columnList: { gap: operationsTheme.space.sm },
  cell: {
    height: operationsTheme.size.controlSm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.panel,
  },
  cellSelected: {
    borderColor: operationsTheme.colors.olive,
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  cellLabel: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  cellLabelSelected: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors['olive-dark'],
  },
  actions: {
    flexDirection: 'row',
    gap: operationsTheme.space.md,
    marginTop: operationsTheme.space.xl,
  },
  cancel: {
    width: operationsTheme.size.circleSm,
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
  },
  cancelLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  confirm: {
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.ink,
    boxShadow: operationsTheme.shadow['hard-on-ink'],
  },
  confirmLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['on-image'],
  },
});
