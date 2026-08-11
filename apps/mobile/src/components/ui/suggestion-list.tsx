import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from './pressable-surface';

/*
  ÖNERİ LİSTESİ — bir metin alanının ALTINDA açılan, dokunulunca alanı dolduran kısa liste.
  İlk tüketici: adres çekmecesinin sokak alanı (BAN adres araması).

  ── TASARIMDA YOK, BİLEREK KİTTEN KURULDU (sapma — `design/KARARLAR.md`) ────
  v3 şablonunun adres çekmecesinde (`shAddr`) öneri listesi ÇİZİLMEMİŞ; şablon dört düz alan
  gösteriyor. Yeni bir görsel dil ÜRETİLMEDİ: kutu, kitin girdi çerçevesiyle aynı ailedendir
  (kart zemini + `sand-400` çerçeve + kontrol yarıçapı), satırlar kitin basılabilir yüzeyini
  (`PressableSurface`) `tint` geri bildirimiyle kullanır — açılır listede küçültme/kaydırma
  titrek durur, zemin değişimi hizayı bozmaz (aynı gerekçe başlık çubuğu düğmesinde de var).
  Ham renk/ölçü YAZILMADI; hepsi tema token'ından.

  ── KÜNYE SATIRI ────────────────────────────────────────────────────────────
  `footnote` isteğe bağlı DEĞİL bir süs: veri lisansı (Etalab 2.0) kaynak gösterimini şart
  koşuyor ve bunu ÇİZEN yüzeydir. Liste görünüyorsa künye de görünür — ikisi tek komponentte
  durduğu için biri ötekisiz çizilemez. **Künye kaydırma alanının DIŞINDA durur:** içeride olsaydı
  liste kaydırıldığında ekrandan çıkardı ve lisansın şartı ihlal edilirdi.

  ── BOY TAVANI (kullanıcı bulgusu 11.08, cihazda ölçüldü) ───────────────────
  Liste sınırsız uzayamaz. Adres servisi beş öneri dönüyor ve her satır iki satırlık; hepsi birden
  çizilince liste ekranın **%36'sını** yiyordu, alttan açılan çekmece taşıyordu ve müşterinin
  YAZDIĞI alan ekranın dışına, durum çubuğunun altına kaçıyordu (iOS'ta tamamen kayboluyordu).
  Tavan `VISIBLE_ROWS` ile duruyor; gerisi listenin kendi içinde kayar.

  Satır yüksekliği ELLE YAZILMAZ, token'lardan hesaplanır — yazı boyutu ayarı `body-sm`i
  ölçeklediğinde tavan da onunla ölçeklenir. Bunun bedeli olarak başlık/alt başlığa AÇIK satır
  yüksekliği verildi: örtük satır yüksekliği yazı tipine göre değişir ve hesabı tahmine çevirirdi.
*/

/**
 * Kaydırmadan görünen satır sayısı. Yarım satır BİLEREK: tam 3 olsaydı dördüncü satır tamamen
 * gizlenirdi ve listede devamı olduğu hiçbir yerden anlaşılmazdı — yarım satır "aşağısı var"ın
 * kendisidir.
 */
const VISIBLE_ROWS = 3.5;

interface SuggestionItem {
  /** Liste anahtarı — çağıranın alan adı; seçim bu kimlikle geri bildirilir. */
  id: string;
  /** Satırın okunan hâli. */
  title: string;
  /** İkincil satır (ör. posta kodu + şehir); yoksa tek satır çizilir. */
  subtitle?: string;
}

interface SuggestionListProps {
  items: SuggestionItem[];
  onSelect: (id: string) => void;
  /** Kaynak künyesi — veri lisansı gerektiriyorsa ZORUNLU olarak verilir. */
  footnote?: string;
  /** Ekran okuyucu adı — liste bir alanın altında belirir, bağlamı kendisi söylemeli. */
  accessibilityLabel: string;
  testID?: string;
}

export function SuggestionList({ items, onSelect, footnote, accessibilityLabel, testID }: SuggestionListProps) {
  if (items.length === 0) return null;

  return (
    <View style={styles.box} accessibilityLabel={accessibilityLabel} testID={testID}>
      {/* `keyboardShouldPersistTaps`: liste KLAVYE AÇIKKEN beliriyor — varsayılan davranışta ilk
          dokunuş yalnız klavyeyi kapatır, öneri seçilmezdi (`(21.33)`'ün kapattığı tuzağın aynısı).
          `nestedScrollEnabled`: Android'de çekmecenin kendi kaydırıcısının içinde çalışabilsin. */}
      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        testID={testID === undefined ? undefined : `${testID}-scroll`}
      >
        {items.map((item, index) => (
          <PressableSurface
            key={item.id}
            onPress={() => onSelect(item.id)}
            feedback="tint"
            style={[styles.row, index === 0 ? undefined : styles.divider]}
            accessibilityLabel={item.subtitle === undefined ? item.title : `${item.title}, ${item.subtitle}`}
            testID={testID === undefined ? undefined : `${testID}-${index}`}
          >
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            {item.subtitle === undefined ? null : (
              <Text style={styles.subtitle} numberOfLines={1}>
                {item.subtitle}
              </Text>
            )}
          </PressableSurface>
        ))}
      </ScrollView>
      {footnote === undefined ? null : <Text style={styles.footnote}>{footnote}</Text>}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  box: {
    backgroundColor: theme.colors.card,
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-400'],
    borderRadius: theme.radius.control,
    // Köşe yarıçapı satırın basılı zeminini kırpsın diye: taşan zemin köşede dikdörtgen görünürdü.
    overflow: 'hidden',
  },
  /* Tavan = satır yüksekliği × görünen satır sayısı. Satır yüksekliği aşağıdaki `row` ile BİREBİR
     aynı token'lardan kuruluyor (dikey dolgu ×2 + iki metin satırı + aralarındaki boşluk); ikisi
     ayrı yazıldığı için değişen biri ötekini bozar — dolguya ya da metin durağına dokunan buraya
     da bakmalı. Bölücü çizgiler (saç teli) hesaba katılmadı: yarım satırlık payın içinde erir. */
  scroll: {
    maxHeight:
      (theme.space.xl * 2 + theme.space['2xs'] + theme.text['body-sm'] * theme.text['h1-sm--line-height'] * 2) *
      VISIBLE_ROWS,
  },
  row: {
    gap: theme.space['2xs'],
    paddingHorizontal: theme.space['3xl'],
    paddingVertical: theme.space.xl,
  },
  divider: {
    borderTopWidth: theme.border.hairline,
    borderTopColor: theme.colors['sand-200'],
  },
  title: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    // Açık satır yüksekliği — üstteki `scroll` tavanının hesabı buna dayanıyor (künyeye bak).
    lineHeight: theme.text['body-sm'] * theme.text['h1-sm--line-height'],
    color: theme.colors.ink,
  },
  subtitle: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['h1-sm--line-height'],
    color: theme.colors.muted,
  },
  /* Kaydırma alanının ALTINA sabitlenmiş künye. Kendi ayıracı var: liste kaydırıldığında bir öneri
     satırı künyeye dayanıyor ve künye üçüncü bir öneri gibi okunuyordu (kullanıcı bulgusu 11.08). */
  footnote: {
    borderTopWidth: theme.border.hairline,
    borderTopColor: theme.colors['sand-200'],
    paddingHorizontal: theme.space['3xl'],
    paddingTop: theme.space.lg,
    paddingBottom: theme.space.lg,
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    color: theme.colors.muted,
  },
}));
