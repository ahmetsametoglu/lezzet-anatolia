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
  /**
   * **Kalan yüksekliği doldur ve içeriği dikeyde ortala** — TAM EKRAN boş hâller için.
   *
   * Varsayılan `false` ve bu bilinçli: bu bileşen 20 yerde kullanılıyor ve hepsi tam ekran DEĞİL.
   * Kataloğun "sonuç yok"u bir listenin içinde, hesabın misafir bloğu kaydırılan sayfanın
   * ortasında duruyor — oralarda ortalama ya hiçbir şey yapmaz ya sayfayı bozar. Ortalanacak olan
   * şey bileşen değil SAYFADIR, o yüzden kararı çağıran verir (puan kazanım bloğunun aynı kuralı,
   * künyesi `customer-kit/points-award.tsx`).
   *
   * Kullanıcı gözlemi 15.08 (cihazda): ortalamasız tam-ekran boş hâlde başlık ve düğme üst üçte
   * birde toplanıyor, altında ekran boyu boşluk kalıyor.
   */
  fill?: boolean;
  testID?: string;
}

export function EmptyState({ title, description, icon, action, fill = false, testID }: EmptyStateProps) {
  return (
    <View style={[styles.container, fill ? styles.fill : undefined]} testID={testID}>
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
    paddingVertical: theme.space['9xl'],
    paddingHorizontal: theme.space['8xl'],
  },
  /** `fill` — dolgu ve aralık aynı kalır, yalnız blok kalan yüksekliği alıp ortalar. */
  fill: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text['card-title-sm'],
    color: theme.colors.ink,
    textAlign: 'center',
  },
  description: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    // Gövde satır aralığı: oran da token (`lead--line-height`) — ham çarpan yazılmadı.
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.muted,
    textAlign: 'center',
  },
}));
