import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';

/*
  SEÇENEK SATIRI — checkout'un üç listesi (adres · teslimat yolu · ödeme yolu) aynı satırı
  kullanıyor (v3:510, 525, 538): başlık + alt satır, seçiliyken kum zemin ve mürekkep çerçeve.

  SEÇİLİ OLMA A11Y'YE DE GİDER (`selected`): renk ve çerçeve farkı ekran okuyucuya ulaşmaz —
  kitin `PressableSurface`ı bu bilgiyi taşıyor, burada yalnız geçiriliyor.

  ENGELLİ SEÇENEK SOLDURULUR ama GİZLENMEZ (şablonun `opacity` kalıbı): "bu ürünler kargoya
  verilemiyor" bilgisini ancak seçeneği görerek anlayabilirsiniz; listeden çıkarmak sebebi de
  görünmez yapardı.
*/

interface OptionRowProps {
  label: string;
  /** Alt satır — açıklama, adres, ücret notu. */
  description?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** Başlığın sağındaki rozet ("varsayılan"). */
  trailing?: ReactNode;
  testID?: string;
}

export function OptionRow({ label, description, selected, onPress, disabled = false, trailing, testID }: OptionRowProps) {
  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      disabled={disabled}
      selected={selected}
      style={[styles.row, selected ? styles.selected : styles.idle, disabled ? styles.disabled : undefined]}
      accessibilityLabel={description === undefined ? label : `${label} · ${description}`}
      testID={testID}
    >
      <View style={styles.head}>
        <Text style={styles.label}>{label}</Text>
        {trailing}
      </View>
      {description === undefined ? null : <Text style={styles.description}>{description}</Text>}
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    gap: theme.space['2xs'],
    // Şablon: `padding:13px 15px` — ikisi de ölçekte ara değer, en yakın duraklara çekildi.
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['3xl'],
    borderRadius: theme.radius.control,
    borderWidth: theme.border.base,
  },
  selected: {
    backgroundColor: theme.colors['sand-150'],
    borderColor: theme.colors.ink,
  },
  idle: {
    backgroundColor: theme.colors['sand-250'],
    borderColor: theme.colors['sand-400'],
  },
  disabled: { opacity: theme.soldOutOpacity },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.md,
  },
  label: {
    flex: 1,
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
    fontWeight: theme.text['button--font-weight'],
    color: theme.colors.ink,
  },
  description: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
}));
