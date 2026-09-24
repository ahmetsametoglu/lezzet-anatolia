import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';

/*
  Checkout listelerinin ortak satırı; seçililik ekran okuyucuya `PressableSurface` ile gider, çünkü renk ve çerçeve farkı ulaşmaz.
  Kapalı seçenek soldurulur ama gizlenmez: listeden çıkarmak kapalı olmanın sebebini de görünmez yapardı.
*/

interface OptionRowProps {
  label: string;
  /** Başlığın yanındaki kısa vurgu ("En uygun fiyat"). */
  badge?: string;
  /** Alt satır — açıklama, adres, ücret notu. */
  description?: string;
  selected: boolean;
  onPress: () => void;
  /** Satırın ikincil eylemi (kayıtlı adresi düzenlemek): kısa dokunuş seçer, uzun basma düzenler ve titreşimi ayrıdır. */
  onLongPress?: () => void;
  /** Köşedeki silik ipucu: uzun basma görünmez bir harekettir, ipucusuz yalnız bilen bulur; ekran okuyucuya da ipucu olarak gider. */
  hint?: string;
  disabled?: boolean;
  /** Alt satır kapalı yolun sebebini mi bildiriyor: sebep hata kırmızısıyla yazılır, çünkü soluk gri cümleyi müşteri fark etmiyor. */
  descriptionTone?: 'muted' | 'danger';
  /** Başlığın sağındaki rozet ("varsayılan"). */
  trailing?: ReactNode;
  testID?: string;
}

export function OptionRow({
  label,
  badge,
  description,
  selected,
  onPress,
  onLongPress,
  hint,
  disabled = false,
  descriptionTone = 'muted',
  trailing,
  testID,
}: OptionRowProps) {
  return (
    <PressableSurface
      onPress={onPress}
      onLongPress={onLongPress}
      feedback="scale"
      disabled={disabled}
      selected={selected}
      style={[styles.row, selected ? styles.selected : styles.idle, disabled ? styles.disabled : undefined]}
      accessibilityLabel={[label, badge, description].filter((part) => part !== undefined).join(' · ')}
      accessibilityHint={hint}
      testID={testID}
    >
      <View style={styles.head}>
        <View style={styles.labelLine}>
          <Text style={styles.label}>{label}</Text>
          {badge === undefined ? null : (
            <View style={styles.badge}>
              <Text style={styles.badgeLabel}>{badge}</Text>
            </View>
          )}
        </View>
        {trailing}
      </View>
      {description === undefined ? null : (
        <Text style={[styles.description, descriptionTone === 'danger' ? styles.dangerDescription : null]}>{description}</Text>
      )}
      {hint === undefined ? null : <Text style={styles.hint}>{hint}</Text>}
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
  labelLine: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  label: {
    flexShrink: 1,
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
    color: theme.colors.ink,
  },
  badge: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors['olive-bg'],
    paddingVertical: theme.space['2xs'],
    paddingHorizontal: theme.space.md,
  },
  badgeLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['badge-sm'],
    color: theme.colors.olive,
  },
  dangerDescription: {
    color: theme.colors.error,
  },
  description: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  /** Silik ipucu — sağ alt köşe, yardımcı kademe; `helper` yalnız gerçek yardımcı rolde. */
  hint: {
    alignSelf: 'flex-end',
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
}));
