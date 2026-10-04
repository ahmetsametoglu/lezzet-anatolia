import { ActivityIndicator, Image, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { withAlpha } from '@lezzet/mobile-kit/src/theme/parse';

/*
  Talebe eklenen fotoğrafın küçük resmi: yeni talep çekmecesinde büyük, yazışmanın yazma kutusunda küçük. Yüklenmişse köşesinde
  kaldırma düğmesi, yoldaysa üstünde bekleme halkası durur; iki yer aynı parçayı kullanır ki görünüm ayrışmasın.
*/

interface TicketPhotoThumbProps {
  /** Cihazdaki yerel adres. */
  uri: string;
  size: 'lg' | 'sm';
  /** Yüklenmiş fotoğrafın kaldırılması; verilmezse fotoğraf yoldadır. */
  onRemove?: () => void;
  /** Resmin adı ya da yükleniyorsa "yükleniyor" cümlesi. */
  label: string;
  removeLabel: string;
  testID?: string;
  removeTestID?: string;
}

export function TicketPhotoThumb({ uri, size, onRemove, label, removeLabel, testID, removeTestID }: TicketPhotoThumbProps) {
  const { theme } = useUnistyles();
  const box = size === 'lg' ? styles.lg : styles.sm;

  if (onRemove === undefined) {
    return (
      <View style={box} accessible accessibilityLabel={label} accessibilityState={{ busy: true }} testID={testID}>
        <Image source={{ uri }} style={[styles.image, box]} accessibilityIgnoresInvertColors />
        <ActivityIndicator style={styles.spinner} color={theme.colors.olive} />
      </View>
    );
  }

  return (
    <View style={box}>
      <Image source={{ uri }} style={[styles.image, box]} accessibilityLabel={label} accessibilityIgnoresInvertColors testID={testID} />
      {/* Konum dış kapta, çünkü kit `style`ı iç yüzeye verir ve mutlak konum orada resmin altına düşer. */}
      <View style={styles.removeSlot}>
        <PressableSurface
          onPress={onRemove}
          feedback="opacity"
          compact
          style={styles.remove}
          accessibilityLabel={removeLabel}
          testID={removeTestID}
        >
          <Icon name="close" size={theme.size.badgeIcon} color={theme.colors.card} />
        </PressableSurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // Büyük boy talep detayındaki ek fotoğrafla aynı: müşteri gönderdiğini, talepte göreceği boyda görür.
  lg: { width: theme.size.circleSm, height: theme.size.circleSm },
  sm: { width: theme.size.attachThumb, height: theme.size.attachThumb },
  image: {
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors['sand-250'],
  },
  spinner: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  removeSlot: {
    position: 'absolute',
    top: theme.space.xs,
    right: theme.space.xs,
  },
  // Koyu ve yarı saydam, çünkü açık renkli fotoğrafın üstünde beyaz daire kaybolur.
  remove: {
    width: theme.size.thumbRemove,
    height: theme.size.thumbRemove,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(theme.colors.ink, 0.6),
  },
}));
