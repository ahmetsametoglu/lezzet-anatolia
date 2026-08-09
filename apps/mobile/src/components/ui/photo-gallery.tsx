import { useState } from 'react';
import type { ReactNode } from 'react';
import { FlatList, Image, View, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent, ListRenderItemInfo, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/*
  FOTOĞRAF GALERİSİ — kahraman görselin yerine geçen yatay şerit (ürün detayı · paket detayı).

  NEDEN VAR (kullanıcı isteği 09.08): sözleşme ürün başına birden çok görsel taşıyor
  (`CatalogProductDetail.gallery` — "İlk öğe KAPAKTIR; tek görselli üründe şerit çizilmez") ama
  ekranlar yalnız kapağı çiziyordu; yüklenen ötekiler müşteriye hiç ulaşmıyordu.

  ── TASARIMDAN SAPMA (bilinçli, `design/KARARLAR.md`e yazıldı) ────────────────
  v3 şablonunda galeri YOK: kahraman tek bir `image-slot`. Bu komponent o yuvanın YERİNE geçer,
  YERLEŞİMİ DEĞİŞTİRMEZ — ölçü, köşe, üst degrade, yüzen düğmeler ve rozetler çağıranda kalır ve
  şeridin üstünde çizilmeye devam eder. Şeridin kendisi çağıranın verdiği kutuyu tam doldurur.

  ── KÜTÜPHANE YOK ────────────────────────────────────────────────────────────
  Yatay kaydırma ve sayfa sınırı RN'in kendi `FlatList`inden gelir (`horizontal` + `pagingEnabled`);
  bir karusel paketi kurulmadı. `getItemLayout` sabittir (karo genişliği = kabın genişliği), yani
  liste ölçü hesabı için hiçbir karoyu önceden çizmez.

  ── ÜÇ HÂL ───────────────────────────────────────────────────────────────────
  · hiç görsel yok → çağıranın yer tutucusu (`fallback`) — bugünkü davranış korunur
  · tek görsel     → düz `Image`; şerit de gösterge de ÇİZİLMEZ (sözleşmenin kendi kuralı; tek
                     noktalı bir gösterge zaten hiçbir bilgi taşımaz)
  · çok görsel     → şerit + sayfa noktaları

  ── GENİŞLİK ÖLÇÜLÜR, VARSAYILMAZ ────────────────────────────────────────────
  Sayfa sınırının doğru yere düşmesi karo genişliğinin KABIN genişliğine eşit olmasına bağlı. İlk
  karede ölçüm yoktur; o kare için pencere genişliği kullanılır (iki çağıran da kenardan kenara
  çizer, yani ilk kare zaten doğrudur) ve `onLayout` gelince ölçülen değere geçilir. Ekran döndüğünde
  `onLayout` yeniden koşar — kenar payı olan bir kapta da paging bu yüzden bozulmaz.

  ── ERİŞİLEBİLİRLİK ──────────────────────────────────────────────────────────
  Her karo kendi sırasını söyler ("Ürün görseli 2 / 3"); cümleyi çağıran verir (i18n ekranın
  sözlüğünde). Nokta sırası DEKORATİFtir: sırayı zaten karo söylüyor, noktaları ikinci kez okutmak
  ekran okuyucuda aynı bilgiyi tekrar ederdi.

  ── NOKTA GEOMETRİSİ `step-dots.tsx` İLE AYNI ────────────────────────────────
  Onboarding'in adım noktalarıyla birebir aynı dil (v3 `ob.dots`: etkin 24 · sönük 8 · yükseklik 5 ·
  yarıçap 3). Komponent oradan İTHAL EDİLMEDİ çünkü `screens/onboarding` altında yaşıyor ve `components/ui`
  bir ekranın içine bağımlı olamaz; ayrıca oradaki sıra ekran okuyucuya konuşur, buradaki susar.
  Doğrusu ortak bir `PageDots`a terfidir — o iş onboarding ekranına da dokunduğu için bu görevin
  yazma alanının dışında; terfi ihtiyacı raporlandı.

  RENKLER FOTOĞRAF ÜSTÜ AİLESİNDEN: onboarding noktaları krem sayfada durur (sönük nokta opak kum),
  buradakiler fotoğrafın üstünde. Etkin nokta markanın terracotta'sını korur; sönük nokta tasarımın
  kendi "foto üstü yüzen yüzey" tokenına (`cream-glass-soft`) bağlandı — opak kum, açık bir
  fotoğrafın üstünde kaybolurdu.
*/

/** v3 `ob.dots` birebir: etkin 24 · sönük 8 · yükseklik 5 · yarıçap 3 (yapısal ölçü, yuvarlanmaz). */
const DOT_WIDTH_ACTIVE = 24;
const DOT_WIDTH_IDLE = 8;
const DOT_HEIGHT = 5;
const DOT_RADIUS = 3;

/** `{n}` ve `{total}` yer tutucularını doldurur — şablon çağıranın sözlüğünden gelir. */
function fillLabel(template: string, index: number, total: number): string {
  return template.replace('{n}', String(index)).replace('{total}', String(total));
}

interface PhotoGalleryProps {
  /**
   * Görsel adresleri, gösterim sırasında; İLK öğe kapaktır. Adressiz (`null`) görselleri çağıran
   * ELER — boş karo çizilmez. Tekrarlanan adres burada elenir: aynı fotoğraf iki karo olsaydı
   * kaydırma "takılmış" gibi görünürdü (ve karo anahtarı ikizlenirdi).
   */
  uris: string[];
  /** Karo etiketi şablonu ("Ürün görseli {n} / {total}") — i18n çağıranda çözülür. */
  photoLabel: string;
  /** Hiç görsel yokken çizilen yer tutucu; ekranın kendi baş-harf karesi buraya geçer. */
  fallback: ReactNode;
  testID?: string;
}

export function PhotoGallery({ uris, photoLabel, fallback, testID }: PhotoGalleryProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [layoutWidth, setLayoutWidth] = useState<number | null>(null);
  const [active, setActive] = useState(0);

  const photos = Array.from(new Set(uris));
  const width = layoutWidth ?? windowWidth;

  const measure = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== layoutWidth) setLayoutWidth(next);
  };

  /* Etkin karo İVMENİN BİTTİĞİ yerde okunur: kaydırma sürerken her karede durum güncellemek
     listeyi yeniden çizdirir ve nokta parmağın altında titrer. */
  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    if (index !== active) setActive(index);
  };

  const renderPhoto = ({ item, index }: ListRenderItemInfo<string>) => (
    <Image
      source={{ uri: item }}
      style={[styles.slide, { width }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={fillLabel(photoLabel, index + 1, photos.length)}
      accessibilityIgnoresInvertColors
    />
  );

  if (photos.length === 0) {
    return (
      <View style={styles.fill} testID={testID}>
        {fallback}
      </View>
    );
  }

  const single = photos[0];
  if (photos.length === 1 && single !== undefined) {
    return <Image source={{ uri: single }} style={styles.fill} testID={testID} accessibilityIgnoresInvertColors />;
  }

  return (
    <View style={styles.fill} onLayout={measure} testID={testID}>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(uri) => uri}
        getItemLayout={(_data, index) => ({ length: width, offset: width * index, index })}
        onMomentumScrollEnd={settle}
        renderItem={renderPhoto}
        style={styles.fill}
        testID={testID === undefined ? undefined : `${testID}-strip`}
      />
      <View
        style={styles.dots}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID={testID === undefined ? undefined : `${testID}-dots`}
      >
        {photos.map((uri, index) => (
          <View key={uri} style={[styles.dot, index === active ? styles.dotActive : styles.dotIdle]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  fill: {
    width: '100%',
    height: '100%',
  },
  /* Genişlik ÖLÇÜLEN kap genişliğidir (satır içi verilir); yükseklik kabı doldurur. */
  slide: {
    height: '100%',
  },
  /* Gösterge kahramanın alt kenarında ortalanır — sol alttaki durum rozeti ile sağ alttan sarkan
     fiyat rozetinin arasında kalan tek boş şerit orası (v3 `vProduct` yerleşimi). */
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: theme.space.xl,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.space.sm,
  },
  dot: {
    height: DOT_HEIGHT,
    borderRadius: DOT_RADIUS,
  },
  dotActive: {
    width: DOT_WIDTH_ACTIVE,
    backgroundColor: theme.colors.terracotta,
  },
  dotIdle: {
    width: DOT_WIDTH_IDLE,
    backgroundColor: theme.colors['cream-glass-soft'],
  },
}));
