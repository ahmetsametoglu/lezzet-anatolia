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
   * **Kalan yüksekliği doldur ve içeriği dikeyde ortala.**
   *
   * ── VARSAYILAN `true` VE BU ÖLÇÜMLE DEĞİŞTİ (16.08) ───────────────────────
   * İlk hâlinde varsayılan `false`tu ve gerekçesi *"bileşen 20 yerde kullanılıyor, hepsi tam ekran
   * değil"*di. O bir TAHMİNDİ; sayıldı: **37 kullanımın 32'si tam ekran.** Yani istisna olan şey
   * ortalama değil, ortalamAMA — varsayılan yanlış taraftaydı ve doğru tarafa geçmesi 32 çağrı
   * yerine bayrak eklemekten hem kısa hem güvenli (unutulan bayrak artık doğru davranışa düşer,
   * yanlışa değil).
   *
   * `false` GEÇİLECEK yerler, ve hepsinin ortak özelliği aynı: EmptyState orada sayfanın gövdesi
   * değil, bir kabın İÇİNDEKİ bir parça — liste boş hâli (`ListEmptyComponent`), kaydırma kabının
   * içindeki bölüm, kesikli kutu. Oralarda `flex: 1` ya hiçbir şey yapmaz ya kabı bozar.
   *
   * Kullanıcı kararı 15–16.08 (üç ekranda birden ölçüldü): ortalamasız tam-ekran boş hâlde içerik
   * üst üçte birde toplanıyor, altında ekran boyu boşluk kalıyor. Tasarım da ortalamıyordu
   * (`padding:60px`) — bu yüzden değişen şey uygulama değil TASARIM.
   */
  fill?: boolean;
  testID?: string;
}

export function EmptyState({ title, description, icon, action, fill = true, testID }: EmptyStateProps) {
  const content = (
    <>
      {icon}
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {description === undefined ? null : <Text style={styles.description}>{description}</Text>}
      {action}
    </>
  );

  if (!fill) return <View style={styles.container} testID={testID}>{content}</View>;

  /*
    ── ORTALAMA DEĞİL, %40 (kullanıcı bulgusu 16.08) ─────────────────────────
    İlk hâli `justifyContent: 'center'`ti ve HESABI doğruydu: blok, başlığın altında kalan alanın
    tam ortasına oturuyordu. Ama GÖZ o alana bakmıyor, SAYFAYA bakıyor — ölçüldü (puan geçmişi,
    900×2000 ölçeğinde): blok merkezi 1170, sayfa merkezi 1000. Kullanıcının cümlesi:
    *"içerik alttaki bölüme ortalanmış olmasına rağmen sayfanın ortasının aşağısına denk geliyor
    ve kötü bir görüntü oluşturuyor."*

    İki sapma aynı yöne biniyordu: (a) başlığın yüksekliği bloğu yarısı kadar aşağı itiyor,
    (b) optik merkez zaten geometrik merkezin biraz ÜSTÜNDEDİR — insan gözü tam ortadaki bir öğeyi
    "aşağı kaymış" görür (tipografide asırlık kural; başlık sayfalarının hepsi bu yüzden üst yarıya
    yerleşir).

    Çare sabit bir kaydırma DEĞİL — başlık boyu ekrandan ekrana değişiyor (sayfa başlığı ~200 dp,
    sıkışık satır ~60 dp) ve sabit bir sayı birinde düzeltip ötekini bozardı. Bunun yerine blok,
    kalan boşluğu **4:6** paylaştıran iki esnek payın arasına konuyor: üstte %40, altta %60. Oran
    kendini ayarlar — başlık uzadıkça kalan alan kısalır, blok yine aynı optik yerde durur.

    Ölçülen sonuç: sayfa başlığında merkez 1170 → ~1020, sıkışık başlıkta ~954. İkisi de sayfa
    merkezinin (1000) hemen çevresinde, hafif yukarıda.
  */
  return (
    <View style={styles.fill} testID={testID}>
      <View style={styles.spacerTop} />
      <View style={styles.container}>{content}</View>
      <View style={styles.spacerBottom} />
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
  /** `fill` — kalan yüksekliği alır; içindeki üç parça (pay · blok · pay) yerleşimi kurar. */
  fill: {
    flex: 1,
  },
  /* 4:6 — bloğun ÜSTÜNDE kalan boşluğun %40'ı, altında %60'ı. Künye bileşenin gövdesinde:
     hem başlık payını hem optik merkezi tek oranla karşılıyor ve başlık boyuna göre kendini
     ayarlıyor. Sayılar ölçü durağı DEĞİL (boşluk değil, ORAN) — o yüzden `theme.space`ten gelmez. */
  spacerTop: {
    flex: 4,
  },
  spacerBottom: {
    flex: 6,
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
