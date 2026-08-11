import { Text, View } from 'react-native';
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
  durduğu için biri ötekisiz çizilemez.
*/

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
    color: theme.colors.ink,
  },
  subtitle: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    color: theme.colors.muted,
  },
  footnote: {
    paddingHorizontal: theme.space['3xl'],
    paddingBottom: theme.space.lg,
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    color: theme.colors.muted,
  },
}));
