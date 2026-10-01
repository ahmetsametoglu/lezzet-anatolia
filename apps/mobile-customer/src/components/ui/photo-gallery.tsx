import type { CatalogImage } from '@lezzet/types';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { FlatList, View, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent, ListRenderItemInfo, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { FrameImage } from '@lezzet/mobile-kit/src/components/ui/frame-image';

/*
  Ürün ve paket detayında kahraman görselin yerine geçen yatay galeri; yerleşimi değiştirmez, ölçü, degrade, düğmeler ve rozetler
  çağıranda kalır. Tek görselde gösterge çizilmez, karo genişliği ilk karede pencereden sonra ölçülen kaptan alınır ki sayfa sınırı
  doğru yere düşsün.
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

/** Karoya giren görsel — adresi olan (adressiz görsel galeriye girmez). */
type ShownPhoto = CatalogImage & { url: string };

interface PhotoGalleryProps {
  /**
   * Katalog görselleri, ilk öğe kapak; adressiz görsel ve tekrarlanan adres burada elenir, çünkü boş karo çizilmez ve aynı fotoğrafın
   * iki karosu kaydırmayı takılmış gösterirdi. Her karo kendi kutusuna oturan CDN türevini alır (`FrameImage`).
   */
  images: readonly CatalogImage[];
  /** Karo etiketi şablonu ("Ürün görseli {n} / {total}") — i18n çağıranda çözülür. */
  photoLabel: string;
  /** Hiç görsel yokken çizilen yer tutucu; ekranın kendi baş-harf karesi buraya geçer. */
  fallback: ReactNode;
  testID?: string;
}

export function PhotoGallery({ images, photoLabel, fallback, testID }: PhotoGalleryProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [layoutWidth, setLayoutWidth] = useState<number | null>(null);
  const [active, setActive] = useState(0);

  const photos = images.filter(
    (image, index): image is ShownPhoto => image.url !== null && images.findIndex((other) => other.url === image.url) === index,
  );
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

  const renderPhoto = ({ item, index }: ListRenderItemInfo<ShownPhoto>) => (
    <FrameImage
      image={item}
      style={[styles.slide, { width }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={fillLabel(photoLabel, index + 1, photos.length)}
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
    return <FrameImage image={single} style={styles.fill} testID={testID} />;
  }

  return (
    <View style={styles.fill} onLayout={measure} testID={testID}>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(image) => image.url}
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
        {photos.map((image, index) => (
          <View key={image.url} style={[styles.dot, index === active ? styles.dotActive : styles.dotIdle]} />
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
  /* Gösterge alt kenarda ortalanır: sol alttaki durum rozeti ile sağ alttan sarkan fiyat rozetinin arasında kalan tek boş yer orası. */
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
