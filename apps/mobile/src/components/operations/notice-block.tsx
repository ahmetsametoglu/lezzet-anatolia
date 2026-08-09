import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { operationsTheme } from '@/theme/unistyles';

/*
  DURUM BLOĞU (boş · hata) — Operasyon Mobil v2'nin EN ÇOK YİNELENEN kutusu: kurye rotası (v2:48,
  54), depo hub (277, 283), yönetim hub (496, 502), bildirimler (789). Yedi kullanım, tek iskelet:
  panel zemin + kum çerçeve + 20 yarıçap + ortalanmış başlık/açıklama.

  İKİ VARYANT, TEK KUTU — fark tasarımın kendi ayrımıdır ve anlamlıdır:
  · `empty` — KESİKLİ çerçeve, Lora başlık (17). "Burada bir şey OLABİLİRDİ, bugün yok."
  · `error` — DÜZ çerçeve, Karla 700 başlık (15). "Bir şey vardı, gösteremedik."
  Kesikli/düz ayrımı boşluğun geçici mi arızalı mı olduğunu söyler; iki ayrı komponent yazmak bu
  tek kararı iki dosyaya bölerdi.

  EYLEM YALNIZ "TEKRAR DENE": v2'nin yedi bloğunda hata varyantının tek eylemi budur, o yüzden
  serbest bir yuva (`ReactNode`) değil dar bir sözleşme (`retry`). Yönetim hub'ının boş durumundaki
  "Gün özeti →" metin eylemi AYRI bir şeydir ve kendi diliminde (21.12) eklenir — bugün olmayan bir
  ihtiyaç için yuva açmak, kullanılmayan bir API bırakmaktır.

  MÜŞTERİ KİTİNDEKİ `EmptyState` ile karışmaz: o, ikon + Lora başlık + CTA yuvası olan SAYFA BOYU
  bir bloktur (vitrin/sepet); bu, listenin içine giren çerçeveli bir kutudur. Aynı ada iki görünüm
  vermemek için ayrı durur.

  Renkler `operationsTheme` sabitinden (`panel`, `neutral-bg`… yalnız o temada var) — gerekçe
  `theme/unistyles.ts` künyesinde, tek yerde.
*/

interface NoticeBlockProps {
  variant: 'empty' | 'error';
  /** Başlık — i18n üstte çözülür. */
  title: string;
  description?: string;
  /** Yalnız hata varyantının eylemi; verilmezse düğme çizilmez. */
  retry?: { label: string; onPress: () => void };
  testID?: string;
}

export function OperationsNoticeBlock({ variant, title, description, retry, testID }: NoticeBlockProps) {
  return (
    <View style={[styles.box, styles[variant]]} testID={testID}>
      <Text style={[styles.title, styles[`${variant}Title`]]} accessibilityRole="header">
        {title}
      </Text>
      {description === undefined ? null : (
        <Text style={styles.description} testID={testID === undefined ? undefined : `${testID}-description`}>
          {description}
        </Text>
      )}
      {retry === undefined ? null : (
        <PressableSurface
          onPress={retry.onPress}
          feedback="scale"
          style={styles.retry}
          accessibilityLabel={retry.label}
          testID={testID === undefined ? undefined : `${testID}-retry`}
        >
          {/* v2 burada 15 dp çiziyor; ölçekte 15 durağı yok ve en yakını `inlineIcon` (17).
              İkinci bir durak açılmadı — 2 dp'lik fark satır içi bir okun optik ağırlığını
              değiştirmiyor (aynı eşik disiplini: `operations-app.ts`). */}
          <Icon name="refresh" size={operationsTheme.size.inlineIcon} color={operationsTheme.colors.ink} />
          <Text style={styles.retryLabel}>{retry.label}</Text>
        </PressableSurface>
      )}
    </View>
  );
}

/* GERİ ÇAĞRISIZ (statik) biçim bilinçli: bu sayfadaki hiçbir değer ETKİN temadan gelmiyor, hepsi
   `operationsTheme` sabitinden — yani yeniden hesaplanacak bir bağımlılık yok. Geri çağrı yazmak,
   olmayan bir tema bağımlılığını varmış gibi göstermek olurdu. */
const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    // v2'nin `#c9c2ae`si — `operations-app.ts` eşiğinde `sand-500`e bağlandı (Δ4/2/6).
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.card,
  },
  empty: {
    borderStyle: 'dashed',
    gap: operationsTheme.space.sm,
    paddingVertical: operationsTheme.space['7xl'],
    paddingHorizontal: operationsTheme.space['6xl'],
  },
  error: {
    gap: operationsTheme.space.md,
    padding: operationsTheme.space['6xl'],
  },
  title: {
    color: operationsTheme.colors.ink,
    textAlign: 'center',
  },
  /** Boş durum başlığı LORA (v2: `600 17px 'Lora'`) — ekran başlığıyla aynı kademe. */
  emptyTitle: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['screen-title--font-weight']],
    fontSize: operationsTheme.text['screen-title'],
  },
  /** Hata başlığı KARLA 700/15 (v2) — gövde kademesinde, çünkü hata bir başlık değil bir bildirim. */
  errorTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
  },
  description: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['field-label'],
    // Satır aralığı oranı da token; v2'nin 1.5'i ile aradaki fark 12,5 px'te 1,25 px'tir.
    lineHeight: operationsTheme.text['field-label'] * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    textAlign: 'center',
  },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
    marginTop: operationsTheme.space.xs,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['7xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.control,
  },
  retryLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
});
