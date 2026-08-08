import type { TicketStatus } from '@lezzet/types';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/*
  TALEP DURUM ROZETİ — talep listesinde ve talep detayının başlığında (v3:918, 931).

  DURUM KÜMESİ ŞEMADAN (`TicketStatus`), ekrandan değil: üç hâl `@lezzet/types`ta kapalı bir küme
  olarak duruyor ve METİN sayfanın `messages.json`'undan gelir. Bir durak eklendiğinde bu dosya
  DERLEMEDE kırılır — `satisfies Record<TicketStatus, …>` onu zorluyor.

  SÖZLÜK MÜŞTERİ DİLİNDE, resmî değil: `TicketStatusEnum` künyesi "open/in_progress" adlarının İÇ
  dil olduğunu, müşterinin "Aldık, sıradayız / İlgileniyoruz / Çözüldü" görmesi gerektiğini söyler
  ve web müşteri yüzeyi bugün öyle yazıyor — aynı müşteri iki yüzeyde AYNI cümleyi görür (08.08).

  ZEMİN/YAZI ÇİFTLERİ tasarımın kendi tablosundan (v3:1961 `stC`) token karşılıklarıyla:
  · açık      → terracotta ailesi (süreç işliyor, dikkat bizde)
  · işlemde   → terracotta ailesi (şablon ikisine de aynı çifti veriyor)
  · çözüldü   → zeytin ailesi (olumlu, kapandı)

  ── DUPLİKASYON KAYDI: kitteki `OrderStatusTag`in İKİZİ ────────────────────
  Görsel dil aynı (yumuşak zemin + koyu yazı + 2° dönüş); ayrışan tek şey durum kümesi. Doğrusu
  `customer-kit`teki rozeti "durum → ton" eşlemesini ÇAĞIRANDAN alan tek bir komponente terfi
  ettirmektir — ama `screens/customer-kit` bu görevin yazma alanı DIŞINDA (görev kısıtı), o yüzden
  ikizi burada duruyor ve ihtiyaç rapora yazıldı. Terfi günü bu dosya silinir, iki ekran ortak
  rozete geçer.
*/

type StatusTone = 'terracotta' | 'olive';

const STATUS_TONES = {
  open: 'terracotta',
  in_progress: 'terracotta',
  resolved: 'olive',
} as const satisfies Record<TicketStatus, StatusTone>;

interface TicketStatusTagProps {
  status: TicketStatus;
  /** Durumun okunur adı — sayfanın `messages.json`'undan (üç dil). */
  label: string;
  testID?: string;
}

export function TicketStatusTag({ status, label, testID }: TicketStatusTagProps) {
  const tone = STATUS_TONES[status];

  return (
    // Dönüş dış sarmalayıcıda (kitteki `Tag` ile aynı gerekçe).
    <View style={styles.tilt} testID={testID}>
      <View style={[styles.badge, styles[tone]]}>
        <Text style={[styles.label, styles[`${tone}Label`]]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  tilt: { transform: [{ rotate: '2deg' }] },
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.xl,
    borderRadius: theme.radius.badge,
  },
  label: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    // Şablon 11,5 yazıyor — ölçekte tam karşılığı `micro`.
    fontSize: theme.text.micro,
    fontWeight: theme.text['button--font-weight'],
  },
  terracotta: { backgroundColor: theme.colors['terracotta-bg'] },
  terracottaLabel: { color: theme.colors.terracotta },
  olive: { backgroundColor: theme.colors['olive-bg'] },
  oliveLabel: { color: theme.colors['olive-dark'] },
}));
