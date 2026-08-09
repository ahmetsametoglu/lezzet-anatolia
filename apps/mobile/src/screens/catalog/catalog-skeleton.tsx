import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Skeleton } from '@/components/ui/skeleton';

/*
  KATALOG İSKELETİ — ilk yükte ızgaranın YERİNİ TUTAR.

  ŞABLONLA KARE VE BOŞLUK BİREBİR (Token Kararlari #22): iskelet kartı da kare (`aspect-ratio:1` ·
  yarıçap 20), ızgara boşlukları gerçek listeyle aynı (satır 20 · sütun 14). Ad ve fiyat için ayrı
  çubuk YOK, çünkü ikisi de kartın İÇİNDE.

  ── ŞABLONDAN İKİ BİLİNÇLİ SAPMA (kullanıcı bulgusu 09.08) ──────────────────
  Şikâyet aynen: *"katalog sayfasına gittiğimizde sayfanın yarısında skeleton var, altta
  'yükleniyor' yazıyor."* İkisi de ölçülüp burada karşılandı:

  1. **"Yükleniyor…" HALKASI KALKTI.** Şablon (`catSkel`) dört karenin altına dönen halka + metin
     koyuyor; ekranda bu, aynı şeyi İKİ KEZ söylemek oluyordu — nabız zaten "bekleniyor" diyor.
     Vitrin iskeleti bu turda aynı kurala geçti (`home-skeleton`); iki ekranın bekleme dili
     ayrışmasın diye katalog da geçti. Kayıp yok: metin YALNIZ görsel gürültüydü, ekran okuyucuya
     giden ses (`progressbar` + `busy` + etiket) kökte duruyor ve tek.
  2. **IZGARA EKRANI DOLDURUR.** Şablon dört kart çiziyor ve telefonda bu ekranın ancak yarısını
     kaplıyordu: alt yarı boş kalıp veri gelince birden doluyordu — iskeletin tek işi gelecek
     yerleşimin ölçüsünü tutmaksa, tutmadığı bir yarı bırakması onun kendi tanımına aykırı. Satır
     sayısı UYDURULMADI, ekrandan TÜRETİLDİ: kare kenarı ızgaranın kendi hesabından, satır sayısı
     da ekran yüksekliğinden. Taşan son satırı kap kırpıyor (`overflow: hidden`), yani liste
     geldiğinde ekran ZIPLAMAZ.

  YENİLEMEDE (aşağı çekme) BU EKRAN HİÇ ÇİZİLMEZ: hook yenilemede `loading`e düşmez, ızgara
  yerinde kalır (`use-catalog` künyesi). Burası yalnız İLK yükün hâli; kuyruk (sonraki sayfa)
  yükünün göstergesi listenin ALTINDADIR ve ikisi asla birlikte görünmez.
*/

interface CatalogSkeletonProps {
  /** "Yükleniyor…" — artık YALNIZ ekran okuyucunun duyduğu ad (ekranda metin yok, bkz. künye). */
  loadingLabel: string;
  testID?: string;
}

export function CatalogSkeleton({ loadingLabel, testID }: CatalogSkeletonProps) {
  const { theme, rt } = useUnistyles();

  /* Kare kartın kenarı SÜTUNDAN gelir; `Skeleton` sayısal ölçü ister (yerini tuttuğu şeyin
     ölçüsünü ekran bilir, kit bilmez). Hesap ızgaranın kendi ölçüleriyle: ekran genişliği eksi
     iki yan boşluk, eksi sütun arası, bölü iki. */
  const cardSize = (rt.screen.width - theme.space['6xl'] * 2 - theme.space['2xl']) / 2;

  /* Kaç satır: ekran yüksekliği bölü satır adımı (kart + satır arası), yukarı yuvarlanır. Başlık
     ve sekme çubuğunun payı DÜŞÜLMEZ — düşmek için ikisinin yüksekliğini burada ikinci kez
     hesaplamak gerekirdi (ölçülmemiş bir sayı) ve fazladan gelen satırın bedeli yok: kap onu
     kırpıyor. Eksik satır bırakmak ise tam olarak giderilen kusurdu. */
  const rowCount = Math.ceil(rt.screen.height / (cardSize + theme.space['5xl']));
  const rows = Array.from({ length: rowCount }, (_, index) => index);

  return (
    <View
      style={styles.grid}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={loadingLabel}
      accessibilityState={{ busy: true }}
    >
      {rows.map((row) => (
        <View key={row} style={styles.row}>
          <Skeleton width={cardSize} height={cardSize} radius="card" />
          <Skeleton width={cardSize} height={cardSize} radius="card" />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  grid: {
    // Şablon: `padding:20px 22px 10px` + `gap:20px 14px` — hepsi ölçekte tam karşılığıyla var
    // (20'lik durak Token Kararlari #22 ile açıldı).
    flex: 1,
    paddingTop: theme.space['5xl'],
    paddingHorizontal: theme.space['6xl'],
    gap: theme.space['5xl'],
    // Ekranı dolduran son satır tam sığmayabilir; taşan kısım kırpılır (bkz. künye).
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    gap: theme.space['2xl'],
  },
}));
