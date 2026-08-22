import { useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { findNetworkPrinters, printNeedleTest, type PrinterChannel } from '@/lib/print/brother';
import { hasPrinterNativeModule } from '@/lib/print/printer-availability';
import { operationsTheme } from '@/theme/unistyles';

/*
  İĞNE DENEYİ PANELİ (23.5) — GELİŞTİRME ARACI, ürün ekranı değil: `__DEV__` + native modül
  varlığı olmadan hiç çizilmez (release'te bundler dev dalını atar). Evi etiket kartı (basımın
  gerçek anı — karar §1.6: basım kutu kapanışında), ama bastığı şey etiketin kendisi DEĞİL,
  paketlenmiş test desenidir: deneyin sorusu "SDK RN 0.86/New Arch altında bağlanıyor mu",
  "etiket güzel mi" değil. Gerçek basım 23.7'de aynı dikişe bağlanır.

  Sonuç cümleleri YUTULMAZ: SDK'nın reddi deneyin verisidir ve modül dosyasına yazılacak şey
  tam olarak o cümledir.
*/

const MESSAGES = {
  title: 'İĞNE DENEYİ · Brother (23.5)',
  search: 'Ağda yazıcı ara',
  searching: 'Aranıyor… (~4 sn)',
  none: 'Ağda Brother yazıcı bulunamadı — yazıcılar açık ve aynı ağda mı?',
  print: (model: string) => `${model} — test desenini bas`,
  printing: 'Basılıyor…',
  printed: (model: string, size: string) =>
    `✓ SDK "bastı" dedi (${model} · ${size}) — kâğıt çıktıyı gözle doğrulayın.`,
  failed: (message: string) => `✗ Basım reddi: ${message}`,
} as const;

export function PrintProbe() {
  // Koşul render başında ve SABİT (derleme + native varlığı) — hook'lu gövde ayrı bileşende
  // (`CameraArea` deseni: koşullu hook yasağı "hook'lu dal ayrı bileşen" ile aşılır).
  if (!__DEV__ || !hasPrinterNativeModule()) return null;
  return <ProbeBody />;
}

function ProbeBody() {
  const [searching, setSearching] = useState(false);
  const [printers, setPrinters] = useState<PrinterChannel[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const search = () => {
    setSearching(true);
    setResult(null);
    void findNetworkPrinters()
      .then((found) => setPrinters(found))
      .catch((error: unknown) => setResult(MESSAGES.failed(error instanceof Error ? error.message : String(error))))
      .finally(() => setSearching(false));
  };

  const print = (printer: PrinterChannel) => {
    setBusy(printer.address);
    setResult(null);
    void printNeedleTest(printer)
      .then((size) => setResult(MESSAGES.printed(printer.modelName, size)))
      .catch((error: unknown) => setResult(MESSAGES.failed(error instanceof Error ? error.message : String(error))))
      .finally(() => setBusy(null));
  };

  return (
    <View style={styles.box} testID="print-probe">
      <Text style={styles.title}>{MESSAGES.title}</Text>

      <PressableSurface
        onPress={search}
        disabled={searching}
        feedback="scale"
        compact
        style={styles.button}
        accessibilityLabel={MESSAGES.search}
        testID="print-probe-search"
      >
        <Text style={styles.buttonLabel}>{searching ? MESSAGES.searching : MESSAGES.search}</Text>
      </PressableSurface>

      {printers === null ? null : printers.length === 0 ? (
        <Text style={styles.line}>{MESSAGES.none}</Text>
      ) : (
        printers.map((printer) => (
          <PressableSurface
            key={printer.address}
            onPress={() => print(printer)}
            disabled={busy !== null}
            feedback="scale"
            compact
            style={styles.button}
            accessibilityLabel={MESSAGES.print(printer.modelName)}
            testID={`print-probe-${printer.address}`}
          >
            <Text style={styles.buttonLabel}>
              {busy === printer.address ? MESSAGES.printing : MESSAGES.print(printer.modelName)}
            </Text>
            <Text style={styles.address}>{printer.address}</Text>
          </PressableSurface>
        ))
      )}

      {result === null ? null : (
        <Text style={styles.line} accessibilityRole="alert" testID="print-probe-result">
          {result}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: operationsTheme.space.md,
    padding: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderColor: operationsTheme.colors['sand-600'],
    gap: operationsTheme.space.md,
  },
  title: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  button: {
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
  },
  buttonLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['olive-dark'],
  },
  address: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  line: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.ink,
  },
});
