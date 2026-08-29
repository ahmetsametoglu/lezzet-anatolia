import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { BoxPrinterContract, PrinterPurpose } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fetchPrinters } from '@/lib/api/warehouse';
import { choosePrinter, readPrinterChoice, type PrinterChoice } from '@/lib/print/printer-choice';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import { trackWarehouse } from './warehouse-status';

/*
  BU CİHAZ · YAZICILAR (07.12 · kullanıcı kararı 29.08).

  ── EKRAN NEYİ SORUYOR ──────────────────────────────────────────────────────
  *"Sunucu: bu depoda hangi yazıcılar var. Cihaz: hangisini kullanıyor — listeden seçer, elle IP
  yazmaz."* Envanter sunucuda; bu ekran yalnız ikinci yarıyı, yani BU TELEFONUN seçimini yazıyor
  ve seçim cihazın yerel deposunda kalıyor — sunucuya hiç gitmiyor.

  ── İKİ İŞ AYRI SORULUYOR ───────────────────────────────────────────────────
  Ayrım fiziksel (tasarım §4.6): kutu etiketi 4×6 kalıp kesim, kargo etiketi A6 yatay. Tek bir
  "yazıcı seç" sorusu, iki kâğıdı aynı makineye yollardı ve yanlış boy basım anında reddedilirdi.

  ── TEK YAZICI VARSA SORU YOK ───────────────────────────────────────────────
  O iş için depoda tek yazıcı varsa satır "kendiliğinden kullanılıyor" diye işaretli çıkıyor:
  seçenek yoksa seçim de yoktur. Ekran onu yine GÖSTERİYOR — hangi makineye basıldığını bilmek,
  seçmek kadar önemli.
*/

const t = warehouseCopy;
const PURPOSES: PrinterPurpose[] = ['box', 'shipping'];

export function PrinterSetupScreen() {
  const router = useRouter();
  const [printers, setPrinters] = useState<BoxPrinterContract[] | null>(null);
  const [choice, setChoice] = useState<PrinterChoice>({});
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const [liste, secim] = await Promise.all([trackWarehouse(fetchPrinters()), readPrinterChoice()]);
    setChoice(secim);
    if (liste.error !== null) {
      setFailed(true);
      setPrinters([]);
      return;
    }
    setPrinters(liste.data.printers);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pick = useCallback(async (purpose: PrinterPurpose, id: string) => {
    await choosePrinter(purpose, id);
    setChoice(await readPrinterChoice());
  }, []);

  const header = (
    <OperationsStackHeader
      title={t.printers.title}
      subtitle={t.printers.subtitle}
      onBack={() => router.back()}
      backLabel={t.common.back}
      testID="warehouse-printers-header"
    />
  );

  if (printers === null) {
    return (
      <View style={styles.screen} testID="warehouse-printers">
        {header}
        <View style={styles.centered}>
          <LoadingState accessibilityLabel={t.printers.loading} label={t.printers.loading} testID="warehouse-printers-loading" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="warehouse-printers">
      {header}
      <ScrollView contentContainerStyle={styles.list} testID="warehouse-printers-list">
        {failed ? (
          <OperationsNoticeBlock
            variant="error"
            title={t.printers.error.title}
            description={t.printers.error.body}
            retry={{ label: t.common.retry, onPress: () => void load() }}
            testID="warehouse-printers-error"
          />
        ) : null}

        {PURPOSES.map((purpose) => {
          const uygun = printers.filter((p) => p.purpose === purpose);
          const tek = uygun.length === 1;
          return (
            <View key={purpose} style={styles.group} testID={`warehouse-printers-${purpose}`}>
              <Text style={styles.groupTitle}>{t.printers.purpose[purpose]}</Text>
              {uygun.length === 0 ? (
                <Text style={styles.empty}>{t.printers.none}</Text>
              ) : (
                uygun.map((row) => {
                  // Tek yazıcıda "seçili" işareti bir seçimi DEĞİL bir olguyu anlatıyor:
                  // başka aday yok, o yüzden basım oradan çıkıyor.
                  const secili = tek || choice[purpose] === row.id;
                  return (
                    <PressableSurface
                      key={row.id}
                      onPress={() => void pick(purpose, row.id)}
                      feedback="scale"
                      selected={secili}
                      style={styles.row}
                      accessibilityLabel={row.name}
                      testID={`warehouse-printers-option-${row.id}`}
                    >
                      <View style={styles.rowBody}>
                        <Text style={styles.rowTitle}>{row.name}</Text>
                        <Text style={styles.rowSub}>
                          {fillCopy(t.printers.detail, { model: row.model, address: row.address, size: row.labelSize })}
                        </Text>
                      </View>
                      <Text style={styles.mark}>{secili ? (tek ? t.printers.only : '✓') : ''}</Text>
                    </PressableSurface>
                  );
                })
              )}
            </View>
          );
        })}

        <Text style={styles.footnote}>{t.printers.footnote}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: operationsTheme.colors.cream },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: {
    paddingHorizontal: operationsTheme.space.xl,
    paddingBottom: operationsTheme.space['4xl'],
    gap: operationsTheme.space.lg,
  },
  group: { gap: operationsTheme.space.sm, marginTop: operationsTheme.space.lg },
  groupTitle: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['card-title-sm--font-weight']],
    fontSize: operationsTheme.text['card-title-sm'],
    color: operationsTheme.colors.ink,
  },
  empty: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.terracotta,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
    padding: operationsTheme.space.md,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
    backgroundColor: operationsTheme.colors.card,
  },
  rowBody: { flex: 1, gap: operationsTheme.space['2xs'] },
  rowTitle: {
    fontFamily: operationsTheme.font.body[600],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  rowSub: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.muted,
  },
  mark: {
    fontFamily: operationsTheme.font.body[600],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.olive,
  },
  footnote: {
    marginTop: operationsTheme.space.lg,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.muted,
  },
});
