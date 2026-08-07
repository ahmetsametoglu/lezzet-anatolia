import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/*
  BİLGİ KUTUSU — v3'te ~10 kullanım: "yalnız bölge içi teslim", "asgari sepet tutarı", "ödeme
  alınamadı", "✓ sonuç". Dört ton:
  · `olive`      — olumlu / yolunda (zeytin bant)
  · `terracotta` — fırsat ve uyarı (asgari tutar, adet limiti)
  · `error`      — hata; uygulamanın KENDİ ailesi (`error` + `error-bg`), terracotta'ya
                   katılmadı çünkü terracotta "fırsat" demek ve aynı ailede iki zıt anlam
                   rozetin bilgi değerini sıfırlar (customer-app.ts kararı)
  · `warm`       — nötr sıcak panel (`sand-150`), çerçevesiz

  HATA tonu ekran okuyucuya `alert` rolüyle gider: hata görsel bir renk değil, duyurulması
  gereken bir olaydır.
*/

type NoteTone = 'olive' | 'terracotta' | 'error' | 'warm';

interface NoteProps {
  /** Kutu metni — i18n üstte çözülür. */
  description: string;
  tone?: NoteTone;
  /** İsteğe bağlı kalın ilk satır. */
  title?: string;
  testID?: string;
}

export function Note({ description, tone = 'olive', title, testID }: NoteProps) {
  return (
    <View
      style={[styles.box, styles[tone]]}
      testID={testID}
      // Kutu TEK a11y öğesidir: başlık ve açıklama bir arada okunur, iki ayrı duraklama olmaz.
      accessible
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
    >
      {title === undefined ? null : <Text style={[styles.title, styles[`${tone}Text`]]}>{title}</Text>}
      <Text style={[styles.description, styles[`${tone}Text`]]}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  box: {
    gap: theme.space.xs,
    padding: theme.space['2xl'],
    borderRadius: theme.radius.control,
    borderWidth: theme.border.hairline,
  },
  olive: {
    backgroundColor: theme.colors['olive-bg'],
    borderColor: theme.colors['olive-line'],
  },
  oliveText: { color: theme.colors['olive-dark'] },
  terracotta: {
    backgroundColor: theme.colors['terracotta-bg'],
    borderColor: theme.colors['terracotta-line'],
  },
  terracottaText: { color: theme.colors.terracotta },
  error: {
    backgroundColor: theme.colors['error-bg'],
    // Hata ailesinin kendi kenarlık katmanı YOK (bilinçli): çerçeve tabandaki terracotta
    // çizgisiyle çiziliyor — customer-app.ts'in açık hükmü.
    borderColor: theme.colors['terracotta-line'],
  },
  errorText: { color: theme.colors.error },
  warm: {
    backgroundColor: theme.colors['sand-150'],
    borderColor: 'transparent',
  },
  warmText: { color: theme.colors.ink },
  title: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    fontWeight: theme.text['button--font-weight'],
  },
  description: {
    // Ağırlıksız gövde — RN'in varsayılanı da 400; aile o ağırlıkla indekslenir.
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    // Gövde satır aralığı: oran da token (`lead--line-height`) — ham çarpan yazılmadı.
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
  },
}));
