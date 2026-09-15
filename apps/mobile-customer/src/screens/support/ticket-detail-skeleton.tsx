import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Skeleton } from '@/components/ui/skeleton';

/*
  TALEP YAZIŞMASI SKELETON'I — ilk yükte sayfanın yerini tutar.

  ÖNCEKİ HÂLİ üç çubuktu (`16` · `56` · `72`, ikisi `78%` genişlikte) ve sayfanın NE OLDUĞUNU
  söylemiyordu: burası bir SOHBET ekranı — balonlar konuşana göre sağa ya da sola yaslanıyor
  (müşterininki sağda zeytin dolgulu, ekibinki solda çerçeveli) ve altta yapışkan bir yanıt
  kutusu duruyor. Üç ortalanmış dikdörtgen bu düzenin hiçbirini göstermiyordu.

  BAŞLIK ÇUBUĞU BURADA DEĞİL, EKRANDA: `AppBar` her dalda GERÇEK basılıyor (geri yolu açık).

  NEYİ ÇİZERİZ — ölçüt "bu bölüm olmadan sayfa VAR OLABİLİR Mİ":
  · ÇİZİLİR — künye satırı (kapsam + tarih) · mesaj balonları · yapışkan yanıt kutusu. Mesajsız
    talep yoktur (talep zaten bir mesajla açılıyor) ve yanıt kutusu koşulsuz.
  · ÇİZİLMEZ — iade çözüm notu, fotoğraf satırları, "çeviri" işareti, alttaki bilgi cümlesi
    (dördü de opsiyonel).

  BALON YÜKSEKLİĞİ TEK SATIR: mesajların kaç satır olacağı bilinmiyor. Fazla çizmek veri gelince
  balonu KÜÇÜLTÜR (aşağıdaki her şey yukarı kayar), az çizmek yalnız aşağı açar — ikisi eşit
  değil. Balon sayısı da en az makul üçtür: gelen · giden · gelen.

  YÖN SIRAYLA DEĞİŞİR ama gerçek yazışmanın sırası bu değil (kim ne zaman yazdı bilinmiyor).
  Amaç sırayı taklit etmek değil, EKRANIN İKİ YANLI olduğunu göstermek: tek yana yaslanmış üç
  balon, sohbeti tek taraflı bir liste gibi okuturdu.
*/

/** `false` = ekip (solda), `true` = müşteri (sağda). */
const BUBBLE_SLOTS = [false, true, false];

interface TicketDetailSkeletonProps {
  testID?: string;
}

export function TicketDetailSkeleton({ testID }: TicketDetailSkeletonProps) {
  const { theme } = useUnistyles();

  const line = (fontSize: number, ratio: number = theme.text['h1--line-height']): number => fontSize * ratio;

  /* Balon (`ticket-detail-screen.bubble`): dikey dolgu + çerçeve + tek satır metin. */
  const bubbleHeight =
    theme.space.xl * 2 + theme.border.hairline * 2 + line(theme.text.note, theme.text['lead--line-height']);

  return (
    <View style={styles.screen} testID={testID} accessible accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
      <View style={styles.content}>
        {/* Künye: kapsam ("Sipariş LA-…" ya da "Genel") + açılış tarihi. */}
        <Skeleton width="52%" height={line(theme.text.micro)} />

        {BUBBLE_SLOTS.map((mine, index) => (
          <View key={index} style={[styles.bubbleRow, mine ? styles.mineRow : styles.theirsRow]}>
            {/* Genişlik balondan balona değişir; sabit tek bir oran, sohbeti bir tabloya
                çevirirdi. Tavan sayfanın kendi sınırı: satırın %78'i. */}
            <View style={styles.bubbleColumn}>
              <Skeleton width={index === 1 ? '62%' : '78%'} height={bubbleHeight} radius="control" tone={mine ? 'deep' : 'default'} />
            </View>
          </View>
        ))}
      </View>

      {/* ── Yapışkan yanıt kutusu: alan + gönder düğmesi ────────────────────── */}
      <View style={styles.composer}>
        <View style={styles.composerRow}>
          {/* Alan kitin `TextField`i (`controlMd`), düğme dairesi `controlSm` — ikisi de sayfanın
              kendi ölçüleri. */}
          <View style={styles.composerField}>
            {/* `full` = yüksekliğin yarısı; alanın hap köşesinin (`radius.pill`) karşılığı. */}
            <Skeleton width="100%" height={theme.size.controlMd} />
          </View>
          <Skeleton width={theme.size.controlSm} height={theme.size.controlSm} />
        </View>
      </View>
    </View>
  );
}

/*
  STİLLER — sayfanın kendi kap stilleri (dolgu · ara · hizalama · yapışkan kutu). Kaplar taklit
  edilmeden yalnız blok yüksekliklerini eşitlemek yetmezdi.
*/
const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1 },
  content: {
    padding: theme.space['4xl'],
    gap: theme.space.lg,
  },

  bubbleRow: { flexDirection: 'row' },
  mineRow: { justifyContent: 'flex-end' },
  theirsRow: { justifyContent: 'flex-start' },
  /** Sayfanın kendi sınırı: balon satırın %78'inden geniş olmaz. */
  bubbleColumn: { maxWidth: '78%', flex: 1 },

  /* Yanıt kutusu kaydırma alanının DIŞINDA ve ekranın altına yapışık (sayfanın aynı kalıbı).
     Cam/bulanıklık yok: altında kaydırılacak içerik yokken bir şey göstermez. */
  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: theme.space.sm,
    paddingTop: theme.space.lg,
    paddingHorizontal: theme.space['4xl'],
    paddingBottom: rt.insets.bottom + theme.space['2xl'],
    borderTopWidth: theme.border.hairline,
    borderTopColor: theme.colors['sand-200'],
    backgroundColor: theme.colors['sand-50'],
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  composerField: { flex: 1 },
}));
