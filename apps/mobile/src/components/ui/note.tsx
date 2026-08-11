import type { ReactNode } from 'react';
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

  ── EYLEM YUVASI (10.08, ölçülmüş arıza) ────────────────────────────────────
  Kutunun ALTINA eylem koymak, kutuyu bir cümleye indirip eylemleri sayfaya döküyordu: katalogda
  bölge dışı bandın altında yan yana iki bağlantı ve onların da altında bir form açılıyordu; ürün
  kartları ekranın yarısına iniyordu (kullanıcı bulgusu: "üç metin butonu alt alta, gerçekten kötü
  görünüyor"). Eylem artık kutunun İÇİNDE, açıklamanın altında duruyor.

  YUVA, VARYANT DEĞİL: kutu hangi kontrolün geleceğini bilmez (`ReactNode`) — düğme, bağlantı
  satırı ya da ikisi birden. Ton/kademe kararı yine çağıranın kontrolünde kalır; kutu yalnız
  boşluğu garanti eder. Yuvayı kullanmayan çağıranlar (10 kullanım) hiç değişmedi.

  Yuva a11y kapsamının DIŞINDADIR: kutu tek okuma birimidir (`accessible`) ama içindeki düğme
  kendi başına odaklanabilmeli — sarmalayıcı onu yutarsa ekran okuyucu eylemi hiç göremez.
*/

type NoteTone = 'olive' | 'terracotta' | 'error' | 'warm';

interface NoteProps {
  /** Kutu metni — i18n üstte çözülür. */
  description: string;
  tone?: NoteTone;
  /** İsteğe bağlı kalın ilk satır. */
  title?: string;
  /** Eylem yuvası: kutunun İÇİNDE, metnin altında çizilir (düğme / bağlantı satırı). */
  action?: ReactNode;
  testID?: string;
}

export function Note({ description, tone = 'olive', title, action, testID }: NoteProps) {
  return (
    <View style={[styles.box, styles[tone]]} testID={testID}>
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
  /** Başlık ↔ açıklama aralığı — kutunun eski `gap`i buraya indi, görünüm değişmedi. */
  text: {
    gap: theme.space.xs,
  },
  /** Eylem yuvası metinle aynı hizada başlar; genişliği içeriğin kendi kararı. */
  action: {
    alignItems: 'flex-start',
    gap: theme.space.lg,
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
  },
  description: {
    // Ağırlıksız gövde — RN'in varsayılanı da 400; aile o ağırlıkla indekslenir.
    fontFamily: theme.font.body[400],
    /* `helper` (12) DEĞİL `body-sm` (14) — MB-46'nın kuralı: müşterinin KARAR için okuduğu metin
       14'ün altına inmez; `helper`/`micro` yalnız gerçek yardımcı role kalır (form ipucu, birim,
       sayaç, zaman damgası). Ölçüm: `helper` yazı boyutu "Büyük"te bile 13,8'de kalıyordu. Bu
       kutu uyarı ve hata taşıyor, yani tanım gereği içerik — kural burada en görünür hâliyle. */
    fontSize: theme.text['body-sm'],
    // Gövde satır aralığı: oran da token (`lead--line-height`) — ham çarpan yazılmadı.
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
  },
}));
