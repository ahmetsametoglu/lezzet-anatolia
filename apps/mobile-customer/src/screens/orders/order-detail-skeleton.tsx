import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Skeleton } from '@/components/ui/skeleton';

/*
  Sipariş detayının ilk yük iskeleti: paneller kendi kap stilleriyle kurulur ki yükseklik veri gelince değişmesin. Yalnız her siparişte
  olan bölümler çizilir (zaman çizgisi, kalemler, tutar özeti, tekrar sipariş, destek); harita ve kargo takibi gibi opsiyoneller çizilmez.
*/

/** Motorun dört durağı: alındı → hazırlandı → yolda → teslim edildi (sayı sabit, tahmin değil). */
const STEP_SLOTS = [0, 1, 2, 3];
/** Kaç kalem geleceği bilinmiyor; fazlası kaybolur, azı eklenir. */
const LINE_SLOTS = [0, 1, 2];
/** Özetin koşulsuz satırları: ara toplam · teslimat ücreti · teslimat · ödeme. */
const SUMMARY_SLOTS = [0, 1, 2, 3];

interface OrderDetailSkeletonProps {
  testID?: string;
}

export function OrderDetailSkeleton({ testID }: OrderDetailSkeletonProps) {
  const { theme } = useUnistyles();

  const line = (fontSize: number, ratio: number = theme.text['h1--line-height']): number => fontSize * ratio;

  return (
    <View
      style={styles.content}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      {/* ── Zaman çizgisi: kum panel, dört durak, aralarında bağlantı çizgisi ── */}
      <View style={styles.timeline}>
        {STEP_SLOTS.map((slot) => (
          <View key={slot} style={styles.step}>
            <View style={styles.stepRail}>
              <Skeleton width={theme.size.stepButton} height={theme.size.stepButton} tone="deep" />
              {/* Son durağın altında çizgi yok: çizgi İKİ durağı bağlar (panelin kendi kuralı). */}
              {slot < STEP_SLOTS.length - 1 ? <View style={styles.stepLine} /> : null}
            </View>
            {/* Yalnız ad çubuğu: saat yalnız kaydı olan adımda yazılır, saat de çizilse veri gelince satır kısalır ve aşağısı kayardı. */}
            <View style={styles.stepText}>
              <Skeleton width="46%" height={line(theme.text.control)} tone="deep" />
            </View>
          </View>
        ))}
      </View>

      {/* ── Kalemler: üstbaşlık + satırlar (küçük resim · ad/künye · tutar) ─── */}
      <View style={styles.items}>
        <Skeleton width="32%" height={line(theme.text.eyebrow)} />
        {LINE_SLOTS.map((slot) => (
          <View key={slot} style={styles.itemRow}>
            <Skeleton width={theme.size.avatarMd} height={theme.size.avatarMd} radius="badge" />
            <View style={styles.itemText}>
              <Skeleton width="72%" height={line(theme.text.note)} />
              <Skeleton width="44%" height={line(theme.text.micro)} />
            </View>
            <Skeleton width="18%" height={line(theme.text.note)} />
          </View>
        ))}
      </View>

      {/* ── Tutar özeti: kum panel, satırlar + kesikli çizgiden sonra toplam ── */}
      <View style={styles.summary}>
        {SUMMARY_SLOTS.map((slot) => (
          <View key={slot} style={styles.summaryRow}>
            <Skeleton width="38%" height={line(theme.text.note)} tone="deep" />
            <Skeleton width="24%" height={line(theme.text.note)} tone="deep" />
          </View>
        ))}
        <View style={styles.totalRow}>
          <Skeleton width="26%" height={line(theme.text['body-sm'])} tone="deep" />
          {/* Toplam rozeti: dikey dolgu + ekranın en büyük sayısı. */}
          <Skeleton
            width="34%"
            height={theme.space.sm * 2 + line(theme.text['screen-title'])}
            radius="badge"
            tone="deep"
          />
        </View>
      </View>

      {/* ── Tekrar sipariş: tam genişlik blok düğme ─────────────────────────── */}
      <View style={styles.reorderSlot}>
        <Skeleton width="100%" height={theme.size.controlLg} radius="control" tone="deep" />
      </View>

      {/* ── Destek eylemi: ortalanmış tek metin bağlantısı ──────────────────── */}
      <View style={styles.actionRow}>
        <Skeleton width="42%" height={line(theme.text.control)} />
      </View>
    </View>
  );
}

/*
  STİLLER — sayfanın ve iki panelin kendi kap stilleri (dolgu · ara · zemin · köşe · çerçeve).
  Kaplar taklit edilmeden yalnız blok yüksekliklerini eşitlemek yetmezdi: bölümler arası boşluk da
  yerleşimin parçası ve veri gelince oradan zıplardı.
*/
const styles = StyleSheet.create((theme) => ({
  /** Sayfanın kaydırma kabı; alt dolgu skeleton'da gereksiz (kaydırılacak içerik yok). */
  content: {
    padding: theme.space['4xl'],
    gap: theme.space['3xl'],
  },

  /** Zaman çizgisi paneli (`order-timeline.panel`). */
  timeline: {
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
    padding: theme.space['3xl'],
    paddingBottom: theme.space.xs,
  },
  step: { flexDirection: 'row', gap: theme.space.xl },
  stepRail: { alignItems: 'center' },
  /* Bağlantı çizgisi GERÇEK çizilir — sabit yapı, veriye bağlı değil. Rengi "henüz değil"
     durağınki (`sand-400`): geçilmiş rengi (zeytin) basmak, yaşanmamış bir yolu yaşanmış gibi
     göstermek olurdu — panelin kendi kuralının skeleton'daki karşılığı. */
  stepLine: {
    flex: 1,
    width: theme.border.ring,
    minHeight: theme.space['3xl'],
    marginVertical: theme.space['2xs'],
    borderRadius: theme.border.ring / 2,
    backgroundColor: theme.colors['sand-400'],
  },
  stepText: {
    flex: 1,
    gap: theme.space['2xs'],
    paddingBottom: theme.space['2xl'],
  },

  items: { gap: theme.space.md },
  /** Gerçek düğmenin sert gölgesi için ayırdığı pay (`PressableSurface`); iskelet aynı yeri tutar. */
  reorderSlot: { paddingRight: theme.shadowRoom, paddingBottom: theme.shadowRoom },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
    paddingVertical: theme.space.lg,
    borderBottomWidth: theme.border.base,
    borderBottomColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
  },
  itemText: { flex: 1, gap: theme.space['2xs'] },

  /** Tutar özeti paneli (`customer-kit/summary-panel.panel`). */
  summary: {
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.control,
    padding: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
    gap: theme.space.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.space.lg,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
    paddingTop: theme.space.lg,
  },

  actionRow: { alignItems: 'center' },
}));
