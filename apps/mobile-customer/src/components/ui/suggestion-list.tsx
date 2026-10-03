import type { IconName } from '@lezzet/design-tokens/icons';
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';

/*
  Bir metin alanının altında açılan, dokunulunca alanı dolduran kısa liste; ikon ve rozet çağırandan gelir, liste yalnız dizer.
  Satırlar basılabilir yüzeyi `tint` geri bildirimiyle kullanır, çünkü açılır listede küçülme ve kayma titrek durur.
*/

/**
 * Kaydırmadan görünen satır sayısı; tavan olmasa beş öneri çekmeceyi taşırıp yazılan alanı ekrandan iterdi. Yarım satır bilerek:
 * listenin devamı olduğunu o söyler.
 */
const VISIBLE_ROWS = 3.5;

interface SuggestionItem {
  /** Liste anahtarı — çağıranın alan adı; seçim bu kimlikle geri bildirilir. */
  id: string;
  /** Satırın okunan hâli. */
  title: string;
  /** İkincil satır (ör. posta kodu + şehir); yoksa tek satır çizilir. */
  subtitle?: string;
  /** Satırın sağındaki rozet (ör. teslim şekli) — kararı çağıran verir, liste yalnız yerleştirir. */
  badge?: ReactNode;
}

interface SuggestionListProps {
  items: SuggestionItem[];
  onSelect: (id: string) => void;
  /**
   * Kaynak künyesi — veri lisansı gerektiriyorsa ZORUNLU olarak verilir. Metin ya da öğe: BAN'ın
   * künyesi bir cümle, Google Places'inki bir LOGO (haritasız gösterimde kullanım koşulu).
   */
  footnote?: ReactNode;
  /** Her satırın başındaki ikon (ör. harita iğnesi) — satırlar tek türden olduğu için liste başına bir kez. */
  icon?: IconName;
  /** Ekran okuyucu adı — liste bir alanın altında belirir, bağlamı kendisi söylemeli. */
  accessibilityLabel: string;
  testID?: string;
}

export function SuggestionList({ items, onSelect, footnote, icon, accessibilityLabel, testID }: SuggestionListProps) {
  const { theme } = useUnistyles();
  if (items.length === 0) return null;

  return (
    <View style={styles.box} accessibilityLabel={accessibilityLabel} testID={testID}>
      {/* `keyboardShouldPersistTaps`: liste klavye açıkken belirir ve varsayılan davranışta ilk dokunuş yalnız klavyeyi kapatırdı.
          `nestedScrollEnabled`: Android'de çekmecenin kaydırıcısının içinde de kaysın. */}
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
            {icon === undefined ? null : <Icon name={icon} size={theme.size.inlineIcon} color={theme.colors.muted} />}
            <View style={styles.text}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              {item.subtitle === undefined ? null : (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              )}
            </View>
            {item.badge ?? null}
          </PressableSurface>
        ))}
      </ScrollView>
      {footnote === undefined ? null : (
        <View style={styles.footnote}>
          {typeof footnote === 'string' ? <Text style={styles.footnoteText}>{footnote}</Text> : footnote}
        </View>
      )}
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
  /* Tavan = satır yüksekliği × görünen satır sayısı; satır yüksekliği `row` ile aynı token'lardan kurulur, dolguya ya da metin
     durağına dokunan buraya da bakmalı. Saç teli bölücüler yarım satırlık payın içinde erir. */
  scroll: {
    maxHeight:
      (theme.space.xl * 2 + theme.space['2xs'] + theme.text['body-sm'] * theme.text['h1-sm--line-height'] * 2) *
      VISIBLE_ROWS,
  },
  /* Satır YATAY: ikon · metin sütunu · rozet (tasarım `gap:10px`). İkonu ve rozeti olmayan çağıranda
     metin sütunu satırı doldurur, görünüm eskisiyle aynı kalır. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    paddingHorizontal: theme.space['3xl'],
    paddingVertical: theme.space.xl,
  },
  text: {
    flex: 1,
    gap: theme.space['2xs'],
  },
  divider: {
    borderTopWidth: theme.border.hairline,
    borderTopColor: theme.colors['sand-200'],
  },
  title: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    // Açık satır yüksekliği: örtük olan yazı tipine göre değişir ve `scroll` tavanının hesabını tahmine çevirirdi.
    lineHeight: theme.text['body-sm'] * theme.text['h1-sm--line-height'],
    color: theme.colors.ink,
  },
  subtitle: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['h1-sm--line-height'],
    color: theme.colors.muted,
  },
  /* Künye kaydırma alanının dışında durur, çünkü veri lisansı kaynağın her an görünmesini şart koşar. Kendi ayıracı var ki listeye
     dayanan künye bir öneri satırı gibi okunmasın. */
  footnote: {
    borderTopWidth: theme.border.hairline,
    borderTopColor: theme.colors['sand-200'],
    paddingHorizontal: theme.space['3xl'],
    paddingTop: theme.space.lg,
    paddingBottom: theme.space.lg,
  },
  footnoteText: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    color: theme.colors.muted,
  },
}));
