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
  /** Alt satırın altındaki ikinci satır, ör. adresin alıcısı ve telefonu. */
  detail?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** Alt satır kapalı yolun sebebini mi bildiriyor: sebep hata kırmızısıyla yazılır, çünkü soluk gri cümleyi müşteri fark etmiyor. */
  descriptionTone?: 'muted' | 'danger';
  /** Başlığın sağındaki rozet ("varsayılan"). */
  trailing?: ReactNode;
  /** Satırın ikinci eylemi (kayıtlı adresi düzenlemek): seçim yüzeyinin dışında durur ki ekran okuyucu onu ayrı bir düğme olarak bulsun. */
  action?: ReactNode;
  testID?: string;
}

export function OptionRow({
  label,
  badge,
  description,
  detail,
  selected,
  onPress,
  disabled = false,
  descriptionTone = 'muted',
  trailing,
  action,
  testID,
}: OptionRowProps) {
  const tone = [selected ? styles.selected : styles.idle, disabled ? styles.disabled : undefined];
  const surface = (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      disabled={disabled}
      selected={selected}
      grow={action !== undefined}
      style={action === undefined ? [styles.row, styles.frame, ...tone] : styles.row}
      accessibilityLabel={[label, badge, description, detail].filter((part) => part !== undefined).join(' · ')}
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
      {detail === undefined ? null : <Text style={styles.description}>{detail}</Text>}
    </PressableSurface>
  );
  if (action === undefined) return surface;
  // Çerçeve iki düğmeyi birlikte sarar: eylem kartın içinde görünür ama seçim yüzeyinin parçası değildir.
  return (
    <View style={[styles.frame, styles.withAction, ...tone]}>
      {surface}
      <View style={styles.action}>{action}</View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    gap: theme.space['2xs'],
    // Şablon: `padding:13px 15px` — ikisi de ölçekte ara değer, en yakın duraklara çekildi.
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['3xl'],
  },
  frame: {
    borderRadius: theme.radius.control,
    borderWidth: theme.border.base,
  },
  withAction: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  /** Eylem başlık satırının hizasında, sağ dolgu kartınkiyle aynı. */
  action: {
    paddingTop: theme.space.xl,
    paddingRight: theme.space['3xl'],
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
  /** Rozet yazısı koyu zeytin, çünkü açık zeytin kendi zemininde okunma eşiğinin altında kalır. */
  badgeLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['badge-sm'],
    color: theme.colors['olive-dark'],
  },
  dangerDescription: {
    color: theme.colors.error,
  },
  /** Alt satır gövde renginde, çünkü adres okunması gereken bilgidir ve soluk ton kart zemininde eşiğin altında kalır. */
  description: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
}));
