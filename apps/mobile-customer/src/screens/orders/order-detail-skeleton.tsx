import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Skeleton } from '@/components/ui/skeleton';

/*
  SİPARİŞ DETAY SKELETON'I — ilk yükte sayfanın yerini tutar. Ürün/tarif/paket detaylarının aynı
  kalıbı: ölçüler sayfanın kendi stillerinden, metin yok, tek ses kökten.

  ÖNCEKİ HÂLİ ekranın içine gömülü dört çubuktu ve DÖRT ÖLÇÜNÜN DÖRDÜ DE HAMDI (`140` · `18` ·
  `62` · `62`) — hiçbiri sayfadan alınmamıştı. Sayfanın hiçbir bölümü de tanınmıyordu: 140'lık
  blok neyi temsil ettiği belli olmayan bir dikdörtgendi, zaman çizgisi ve tutar özeti yoktu.

  KAP STİLLERİ KOPYALANMADI, YAPI KURULDU: zaman çizgisi ve tutar özeti kendi komponentlerinde
  yaşayan panellerdir (`order-timeline` · `customer-kit/summary-panel`). Skeleton onların
  yüksekliğini HESAPLAMAYA çalışmaz — aynı yapıyı aynı stillerle kurar (zemin · köşe · dolgu ·
  satır dolgusu) ve içine gri blok koyar; yükseklik böylece kendiliğinden aynı çıkar. Bir formüle
  çevrilseydi panel her değiştiğinde formül sessizce yanlışa düşerdi.

  BAŞLIK ÇUBUĞU BURADA DEĞİL, EKRANDA: sayfa `AppBar`ı yüklenirken de GERÇEK basıyor (geri yolu
  ekran boşken de açık — ekranın kendi kuralı). Skeleton onun altından başlar.

  NEYİ ÇİZERİZ — ölçüt "bu bölüm olmadan sayfa VAR OLABİLİR Mİ":
  · ÇİZİLİR — zaman çizgisi (dört durak, motorun sabit sayısı) · kalemler (üstbaşlık + satırlar) ·
    tutar özeti · destek eylemi. Kalemi olmayan sipariş yoktur; özet ve destek bağı koşulsuz.
  · ÇİZİLMEZ — canlı takip haritası (yalnız kurye yoldayken), eksik karşılama notu, kargo takip
    bağı, durum etiketi (dördü de opsiyonel).

  İKİ YERDE "EN AZ MAKUL" SEÇİLDİ:
  · Zaman çizgisi durağında yalnız AD çubuğu var, saat çubuğu yok — saat yalnız kaydı olan adımda
    yazılıyor (`at: null` olanda boş kalır). Saat de çizseydik veri gelince satır KISALIR ve
    aşağıdaki her şey yukarı kayardı; adla yetinince yalnız aşağı doğru açılır.
  · Kalem sayısı 3 — kaç kalem geleceği bilinmiyor, fazlası kaybolur azı eklenir.
*/

/** Motorun dört durağı: alındı → hazırlandı → yolda → teslim edildi (sayı sabit, tahmin değil). */
const STEP_SLOTS = [0, 1, 2, 3];
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
