import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { operationsTheme } from '@/theme/unistyles';

/*
  DURUM BLOĞU (boş · hata) — Operasyon Mobil v2'nin EN ÇOK YİNELENEN kutusu: kurye rotası (v2:48,
  54), depo hub (277, 283), yönetim hub (496, 502), bildirimler (789). Yedi kullanım, tek iskelet:
  panel zemin + kum çerçeve + 20 yarıçap + ortalanmış başlık/açıklama.

  İKİ VARYANT, TEK KUTU — fark tasarımın kendi ayrımıdır ve anlamlıdır:
  · `empty` — KESİKLİ kum çerçeve, panel zemin, Lora 18 başlık. "Burada bir şey OLABİLİRDİ, bugün yok."
  · `error` — DÜZ KIRMIZI çerçeve, Lora 18 KIRMIZI başlık ve kırmızı gövde. "Bir şey vardı, gösteremedik."
  Kesikli/düz ayrımı boşluğun geçici mi arızalı mı olduğunu söyler; iki ayrı komponent yazmak bu
  tek kararı iki dosyaya bölerdi.

  ── v3 ÖLÇÜMÜ (30.08): HATA ARTIK KIRMIZI KONUŞUYOR ────────────────────────
  v2'de iki varyant yalnız ÇERÇEVE BİÇİMİYLE ayrılıyordu (kesikli/düz) ve hatanın başlığı Karla
  700/15'ti — kutu "sessizce" hata diyordu. v3 üç ekranda birden (toplama kuyruğu · mal kabul ·
  transfer) aynı yeni kalıbı çiziyor:
      kutu   `#fdf6f4` zemin + `1.5px solid #e0b9b2` + `border-radius:20px` + `padding:22px 20px`
      başlık `600 18px 'Lora'` · `#a44a3f`
      gövde  `400 12px/1.55 'Karla'` · `#a44a3f`  ← gri değil, KIRMIZI
      eylem  kutunun DIŞINDA, tam genişlikte koyu düğme: `52px` · `radius 16` · `#2f353a`/`#f5f1e6`
  Zemin `panel`de bırakıldı (ölçülen #fdf6f4 ona Δ2/4/0, ekranda ayırt edilemez — token künyesi);
  kutuyu hata yapan şey KENARI ve metnidir, o yüzden yeni durak yalnız `error-line` oldu.
  Boş varyantı da v3'e çekildi: çerçeve `sand-500` → `sand-300` (ölçüm #ddd6c4), başlık 17 → 18
  (`card-title-sm`), gövde 12,5 → 12 (`helper`), iç aralık 6 → 8.

  EYLEM YALNIZ "TEKRAR DENE": yedi bloğun hepsinde hata varyantının tek eylemi budur, o yüzden
  serbest bir yuva (`ReactNode`) değil dar bir sözleşme (`retry`). Yönetim hub'ının boş durumundaki
  "Gün özeti →" metin eylemi AYRI bir şeydir ve kendi diliminde (21.12) eklenir — bugün olmayan bir
  ihtiyaç için yuva açmak, kullanılmayan bir API bırakmaktır.
  DÜĞME KUTUNUN DIŞINA ÇIKTI ama `retry` SÖZLEŞMESİ DEĞİŞMEDİ: çağıran yine aynı prop'u verir,
  yerleşimi komponent bilir. `testID` kutunun üstünde kaldı — dışarıdaki sarmalayıcı adsızdır,
  yoksa bloğu testID ile yoklayan çağıranlar sessizce sarmalayıcıyı ölçmeye başlardı.

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
  const box = (
    <View style={[styles.box, styles[variant]]} testID={testID}>
      <Text style={[styles.title, styles[`${variant}Title`]]} accessibilityRole="header">
        {title}
      </Text>
      {description === undefined ? null : (
        <Text
          style={[styles.description, styles[`${variant}Description`]]}
          testID={testID === undefined ? undefined : `${testID}-description`}
        >
          {description}
        </Text>
      )}
    </View>
  );

  if (retry === undefined) return box;

  return (
    <View style={styles.stack}>
      {box}
      <PressableSurface
        onPress={retry.onPress}
        feedback="scale"
        style={styles.retry}
        accessibilityLabel={retry.label}
        testID={testID === undefined ? undefined : `${testID}-retry`}
      >
        {/* Şablonun düğmesi ikonsuz — koyu zeminde yalnız etiket var. v2'deki satır içi yenile
            ikonu düştü: kutunun dışına çıkan tam genişlikte bir CTA, işaretle değil ağırlığıyla
            "buraya bas" der. */}
        <Text style={styles.retryLabel}>{retry.label}</Text>
      </PressableSurface>
    </View>
  );
}

/* GERİ ÇAĞRISIZ (statik) biçim bilinçli: bu sayfadaki hiçbir değer ETKİN temadan gelmiyor, hepsi
   `operationsTheme` sabitinden — yani yeniden hesaplanacak bir bağımlılık yok. Geri çağrı yazmak,
   olmayan bir tema bağımlılığını varmış gibi göstermek olurdu. */
const styles = StyleSheet.create({
  /** Kutu + dışarıdaki CTA tek sütun; aradaki nefes şablonun `gap:12px`i. */
  stack: {
    gap: operationsTheme.space.xl,
  },
  box: {
    alignItems: 'center',
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderRadius: operationsTheme.radius.card,
  },
  empty: {
    borderStyle: 'dashed',
    // v3 ölçümü `#ddd6c4` — eşikte `sand-300`e bağlandı (Δ5/2/7). v2'nin `#c9c2ae`si (`sand-500`)
    // bir kademe koyuydu ve kesikli çerçeveyi bir "kutu" gibi gösteriyordu.
    borderColor: operationsTheme.colors['sand-300'],
    gap: operationsTheme.space.md,
    paddingVertical: operationsTheme.space['7xl'],
    paddingHorizontal: operationsTheme.space['6xl'],
  },
  /** v3: kırmızı kenar; zemin `panel`de kalır (ölçülen #fdf6f4 ona Δ2/4/0 — künye üstte). */
  error: {
    borderColor: operationsTheme.colors['error-line'],
    gap: operationsTheme.space.md,
    paddingVertical: operationsTheme.space['6xl'],
    paddingHorizontal: operationsTheme.space['5xl'],
  },
  /** İki varyantın da başlığı LORA 18 (v3) — ayrım biçimde değil RENKTE. */
  title: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['card-title-sm--font-weight']],
    fontSize: operationsTheme.text['card-title-sm'],
    textAlign: 'center',
  },
  emptyTitle: {
    color: operationsTheme.colors.ink,
  },
  errorTitle: {
    color: operationsTheme.colors.error,
  },
  description: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    // Satır aralığı oranı da token; şablonun 1,55'i ile aradaki fark 12 px'te yarım pikseldir.
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    textAlign: 'center',
  },
  emptyDescription: {
    color: operationsTheme.colors.muted,
  },
  /** Hatanın gövdesi de KIRMIZI (v3): kutu tek sesle konuşur, gri bir açıklama onu yumuşatırdı. */
  errorDescription: {
    color: operationsTheme.colors.error,
  },
  /** Tam genişlikte koyu CTA — kutunun dışında, şablonun `52px / radius 16 / ink` düğmesi. */
  retry: {
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.control,
  },
  retryLabel: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors['on-image'],
  },
});
