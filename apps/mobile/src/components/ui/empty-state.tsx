import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/*
  BOŞ DURUM — 6 ekranda (sepet, siparişler, talepler, bildirimler, arama sonucu, hesap-misafir).
  İskelet her yerde aynı: ikon → Lora başlık → açıklama → eylem.

  MİSAFİR VARYANTI AYRI BİR GÖRSEL VARYANT DEĞİLDİR: tasarımda misafir bloğu ile boş sepet
  bloğu birebir aynı yerleşimi kullanıyor, yalnız ikon/metin/CTA değişiyor — yani fark
  İÇERİKTİR ve prop'tan gelir. Ayrı bir `guest` bayrağı açmak, aynı görünüme iki ad vermek
  olurdu (envanterdeki "misafir varyantı" notu bu şekilde karşılanıyor).
*/

interface EmptyStateProps {
  /** Başlık — i18n üstte çözülür. */
  title: string;
  description?: string;
  /** İkon yuvası (SVG/ikon komponenti) — çağıran verir. */
  icon?: ReactNode;
  /** Eylem yuvası — genellikle bir `PrimaryButton`. */
  action?: ReactNode;
  testID?: string;
}

export function EmptyState({ title, description, icon, action, testID }: EmptyStateProps) {
  return (
    <View style={styles.container} testID={testID}>
      {icon}
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {description === undefined ? null : <Text style={styles.description}>{description}</Text>}
      {action}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    alignItems: 'center',
    gap: theme.space.xl,
    paddingVertical: theme.space['8xl'],
    paddingHorizontal: theme.space['7xl'],
  },
  title: {
    fontFamily: theme.font.display,
    fontSize: theme.text['card-title-sm'],
    fontWeight: theme.text['card-title-sm--font-weight'],
    color: theme.colors.ink,
    textAlign: 'center',
  },
  description: {
    fontFamily: theme.font.body,
    fontSize: theme.text.note,
    // Gövde satır aralığı: oran da token (`lead--line-height`) — ham çarpan yazılmadı.
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.muted,
    textAlign: 'center',
  },
}));
