import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/*
  Bilgi kutusu; `error` kendi ailesindedir, çünkü terracotta "fırsat" der ve aynı ailede iki zıt anlam rozetin bilgi değerini
  sıfırlar, `warm-accent` ise zemini vurgular ama yazıyı nötr bırakır, çünkü bölge dışı cümlesi uyarı değil adresin gerçeğidir.
  Yuvalar kutunun içindedir ve metnin a11y kapsamı dışında kalır: dışarı taşan eylemler kartları ekranın yarısına iter, sarmalayıcı
  düğmeyi yutarsa da ekran okuyucu eylemi göremez.
*/

type NoteTone = 'olive' | 'terracotta' | 'error' | 'warm' | 'warm-accent';

interface NoteProps {
  /** Kutu metni — i18n üstte çözülür. */
  description: string;
  tone?: NoteTone;
  /** İsteğe bağlı kalın ilk satır. */
  title?: string;
  /** Eylem yuvası: kutunun İÇİNDE, metnin altında çizilir (düğme / bağlantı satırı). */
  action?: ReactNode;
  /** Üst yuva: kutunun içinde, başlığın üstünde, çünkü cümlenin ön koşulu ("hangi yer için konuşuyoruz") başlıktan önce gelir. */
  header?: ReactNode;
  testID?: string;
}

export function Note({ description, tone = 'olive', title, action, header, testID }: NoteProps) {
  return (
    <View style={[styles.box, styles[tone]]} testID={testID}>
      {header === undefined ? null : <View style={styles.header}>{header}</View>}
      {/* METİN TEK a11y öğesidir: başlık ve açıklama bir arada okunur, iki ayrı duraklama olmaz.
          Sarmalayıcı eylemi KAPSAMAZ (künye) — kapsasaydı düğme odaklanamazdı. */}
      <View style={styles.text} accessible accessibilityRole={tone === 'error' ? 'alert' : undefined}>
        {title === undefined ? null : <Text style={[styles.title, styles[`${tone}Text`]]}>{title}</Text>}
        <Text style={[styles.description, styles[`${tone}Text`]]}>{description}</Text>
      </View>
      {action === undefined ? null : <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  box: {
    // Metin bloğu ile eylem yuvası arasındaki nefes; yuvasız kutuda etkisi yok.
    gap: theme.space.xl,
    padding: theme.space['2xl'],
    borderRadius: theme.radius.control,
    borderWidth: theme.border.hairline,
  },
  /** Başlık ile açıklama arasındaki aralık. */
  text: {
    gap: theme.space.xs,
  },
  /** Eylem yuvası metinle aynı hizada başlar; genişliği içeriğin kendi kararı. */
  action: {
    alignItems: 'flex-start',
    gap: theme.space.lg,
  },
  /** Üst yuva da metinle aynı hizadan başlar — kutunun içindeki her şey tek sütundan okunur. */
  header: {
    alignItems: 'flex-start',
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
  'warm-accent': {
    backgroundColor: theme.colors['terracotta-bg'],
    borderColor: theme.colors['terracotta-line'],
  },
  'warm-accentText': { color: theme.colors.ink },
  title: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
  },
  description: {
    // Ağırlıksız gövde — RN'in varsayılanı da 400; aile o ağırlıkla indekslenir.
    fontFamily: theme.font.body[400],
    /* `helper` (12) değil `body-sm` (14): müşterinin karar için okuduğu metin 14'ün altına inmez ve bu kutu uyarı ile hata taşır. */
    fontSize: theme.text['body-sm'],
    // Gövde satır aralığı: oran da token (`lead--line-height`) — ham çarpan yazılmadı.
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
  },
}));
