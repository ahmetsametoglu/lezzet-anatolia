import { useCallback, useEffect, useState } from 'react';
import { FlatList, Modal, Text, View, useWindowDimensions } from 'react-native';
import type { ListRenderItemInfo, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { Icon } from './icon';
import { PressableSurface } from './pressable-surface';

/*
  TAM EKRAN FOTOĞRAF GÖRÜNTÜLEYİCİ — uygulamanın İÇİNDE (kullanıcı kararı 07.09).

  ── NEDEN VAR ───────────────────────────────────────────────────────────────
  Buraya kadar hem talep ekleri hem sosyal sohbetin fotoğrafları `Linking.openURL` ile SİSTEM
  TARAYICISINDA açılıyordu. İki ekranın künyesi bunu "ayrı bir komponent + testi demek" diye
  gerekçelendirmişti. Kullanıcı kararı bunu kapattı: *"resimlerin üzerine basınca da uygulama
  içerisinde tam ekran olarak bakılabilmeli. Uygulama dışına çıkışlar olmamalı."*

  Gerekçe operasyonel: operatör hasarlı kutuya bakarken uygulamadan çıkıyordu — geri döndüğünde
  yazışmanın neresinde kaldığını yeniden bulmak zorundaydı, üstelik imzalı adres tarayıcının
  geçmişinde kalıyordu.

  ── `photo-gallery.tsx` İLE KARIŞTIRILMASIN ─────────────────────────────────
  O komponent ürün/paket detayının KAHRAMAN yuvasıdır: yerinde durur, `cover` ile kutuyu doldurur,
  alt kenarında sayfa noktaları taşır ve tekrarlanan adresi ELER (aynı fotoğraf iki karo olmasın
  diye). Bu komponentin işi tam tersi: üstte açılır, `contain` ile fotoğrafın TAMAMINI gösterir,
  yakınlaştırılabilir ve tekrarlanan adresi elemez — sohbette aynı fotoğraf iki kez gönderilmiş
  olabilir ve ikisi de ayrı birer mesajdır. Ortak olan yalnız yatay sayfalama deseni (RN'in kendi
  `FlatList`i; karusel paketi yok) ve o desen oradan devralındı.

  ── YAKINLAŞTIRMA BİR SÜS DEĞİL ─────────────────────────────────────────────
  Operatörün bu fotoğrafa bakma SEBEBİ çoğu kez bir ayrıntıdır ("bir köşesi ezilmiş"). 6 inçlik bir
  ekranda yakınlaştırmasız tam ekran, baloncuktaki karodan pek fazlasını vermez. Kıstırma ve
  sürükleme `react-native-gesture-handler` + `reanimated` ile — ikisi de projede zaten var, yeni
  bağımlılık yok.

  YAKINLAŞTIRILMIŞKEN LİSTE KAYMAZ: parmağın sürüklemesi o an fotoğrafı gezdirmek içindir. Aksi
  hâlde büyütülmüş bir fotoğrafta sağa kaydırmak sessizce bir sonraki fotoğrafa atlardı.
*/

/** Yakınlaştırma sınırları — 1 = sığdırılmış hâl; üst sınır ayrıntı için yeter, pikselleşmeden önce durur. */
const MIN_SCALE = 1;
const MAX_SCALE = 4;

interface PhotoViewerLabels {
  /** "{n} / {total}" — sayaç ve ekran okuyucu etiketi aynı cümleden kurulur. */
  counter: string;
  close: string;
}

interface PhotoViewerProps {
  /** Adresler, gönderim sırasında. Boş dizide görüntüleyici hiç doğmaz. */
  uris: readonly string[];
  /** Hangi fotoğrafla açılacağı — dokunulan karonun sırası. */
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
  labels: PhotoViewerLabels;
  testID?: string;
}

/** `{n}` ve `{total}` yer tutucuları — sözlük çağıranda (kit i18n bilmez). */
function fillCounter(template: string, index: number, total: number): string {
  return template.replace('{n}', String(index)).replace('{total}', String(total));
}

/**
 * Tek sayfa — kıstırmayla büyür, büyükken sürüklenir, çift dokunuşla sıfırlanır.
 *
 * Ölçek ve kayma `useSharedValue`da tutulur: React state'te tutulsaydı her parmak karesinde
 * yeniden çizim tetiklenir ve hareket takılırdı. Dönüşümü uygulayan `useAnimatedStyle` UI iş
 * parçacığında koşar, yani hareketin kendisi kare atlamaz.
 *
 * El hareketleri `.runOnJS(true)` ile JS tarafında koşuyor ve bu BİLİNÇLİ bir ödünleşme: geri
 * çağrılar (`onZoomChange`, `reset`) worklet değil, worklet'ten çağrılmaları ayrıca `runOnJS`
 * sarmalaması isterdi. Parmak olayları saniyede birkaç düzine; asıl maliyet olan dönüşüm zaten
 * UI tarafında. Dışarıya çıkan tek bilgi "yakınlaştı mı" — listenin kaymayı bırakması için gereken.
 */
function ZoomablePhoto({
  uri,
  width,
  label,
  onZoomChange,
  testID,
}: {
  uri: string;
  width: number;
  label: string;
  onZoomChange: (zoomed: boolean) => void;
  testID?: string;
}) {
  const scale = useSharedValue(MIN_SCALE);
  const startScale = useSharedValue(MIN_SCALE);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const reset = useCallback(() => {
    scale.value = withTiming(MIN_SCALE);
    offsetX.value = withTiming(0);
    offsetY.value = withTiming(0);
    onZoomChange(false);
  }, [scale, offsetX, offsetY, onZoomChange]);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((event) => {
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, startScale.value * event.scale));
    })
    .onEnd(() => {
      // Sığdırılmış hâle dönüldüyse kayma da sıfırlanır: yoksa fotoğraf ortadan kaymış görünürdü.
      if (scale.value <= MIN_SCALE) {
        offsetX.value = withTiming(0);
        offsetY.value = withTiming(0);
      }
    })
    .runOnJS(true)
    .onFinalize(() => {
      onZoomChange(scale.value > MIN_SCALE);
    });

  const pan = Gesture.Pan()
    .onStart(() => {
      startX.value = offsetX.value;
      startY.value = offsetY.value;
    })
    .onUpdate((event) => {
      // Sığdırılmışken sürükleme YOK: o parmak hareketi listenin, fotoğrafın değil.
      if (scale.value <= MIN_SCALE) return;
      offsetX.value = startX.value + event.translationX;
      offsetY.value = startY.value + event.translationY;
    })
    .runOnJS(true);

  const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(reset).runOnJS(true);

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }, { translateY: offsetY.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
      <View style={[styles.page, { width }]}>
        <Animated.Image
          source={{ uri }}
          style={[styles.photo, animated]}
          resizeMode="contain"
          accessible
          accessibilityRole="image"
          accessibilityLabel={label}
          accessibilityIgnoresInvertColors
          testID={testID}
        />
      </View>
    </GestureDetector>
  );
}

export function PhotoViewer({ uris, initialIndex, visible, onClose, labels, testID }: PhotoViewerProps) {
  const { width } = useWindowDimensions();
  const [active, setActive] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);

  /*
    AÇILIŞTA BAŞLANGIÇ SIRASINA DÖN — `useState(initialIndex)` TEK BAŞINA YETMEZ ve bu ölçülmüş bir
    arızadır (07.09, testte yakalandı): perde kapalıyken de bu bileşen mount edilmiş durumda
    duruyor, yani `useState` ilk değerini kapalı hâldeki `initialIndex`ten (0) alıyor. İkinci karoya
    dokunulduğunda sayaç "1 / 2" yazıyordu — açılan fotoğraf ikincisi olduğu hâlde.

    Perdeyi kapalıyken hiç çizmemek de çözerdi ama Modal'ın kendi geçiş animasyonunu kaybettirirdi;
    doğrusu, açılışın bir OLAY olduğunu kabul edip durumu o an tazelemek.
  */
  useEffect(() => {
    if (!visible) return;
    setActive(initialIndex);
    setZoomed(false);
  }, [visible, initialIndex]);

  /* Etkin sayfa İVMENİN BİTTİĞİ yerde okunur (galerinin aynı kararı): her karede durum
     güncellemek listeyi yeniden çizdirir ve sayaç parmağın altında titrer. */
  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    if (index !== active) {
      setActive(index);
      setZoomed(false); // sayfa değişti — önceki fotoğrafın yakınlaştırması bu sayfaya taşınmaz
    }
  };

  const renderPhoto = ({ item, index }: ListRenderItemInfo<string>) => (
    <ZoomablePhoto
      uri={item}
      width={width}
      label={fillCounter(labels.counter, index + 1, uris.length)}
      onZoomChange={setZoomed}
      testID={testID === undefined ? undefined : `${testID}-photo-${index}`}
    />
  );

  if (uris.length === 0) return null;

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose} // Android'in donanım geri tuşu — görüntüleyici uygulamadan ÇIKMAZ, kapanır
      animationType="fade"
      statusBarTranslucent
      testID={testID}
    >
      <View style={styles.backdrop}>
        <FlatList
          data={uris as string[]}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          keyExtractor={(_uri, index) => String(index)}
          getItemLayout={(_data, index) => ({ length: width, offset: width * index, index })}
          onMomentumScrollEnd={settle}
          renderItem={renderPhoto}
        />

        {/* Kapatma ve sayaç fotoğrafın ÜSTÜNDE yüzer: fotoğraf tüm ekranı alsın diye yer
            ayrılmadı. Sayaç tek fotoğrafta çizilmez — "1 / 1" hiçbir bilgi taşımaz. */}
        <View style={styles.bar} pointerEvents="box-none">
          {uris.length > 1 ? (
            <Text style={styles.counter} testID={testID === undefined ? undefined : `${testID}-counter`}>
              {fillCounter(labels.counter, active + 1, uris.length)}
            </Text>
          ) : (
            <View />
          )}
          <PressableSurface
            onPress={onClose}
            feedback="opacity"
            compact
            style={styles.close}
            accessibilityLabel={labels.close}
            testID={testID === undefined ? undefined : `${testID}-close`}
          >
            <Icon name="close" size={CLOSE_ICON} color={CLOSE_TINT} />
          </PressableSurface>
        </View>
      </View>
    </Modal>
  );
}

/* Görüntüleyicinin zemini SİYAHTIR ve temadan gelmez: burası bir yüzey değil, fotoğrafın kendi
   karanlık odasıdır — krem zemin açık bir fotoğrafın kenarını yutar. Aynı gerekçeyle kapatma
   işareti beyazdır. İkisi de yapısal karar, tema kararı değil. */
const BACKDROP = '#000000';
const CLOSE_TINT = '#ffffff';
const CLOSE_ICON = 22;

const styles = StyleSheet.create((theme, rt) => ({
  backdrop: {
    flex: 1,
    backgroundColor: BACKDROP,
  },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    // Durum çubuğunun altına inmez: perde `statusBarTranslucent` ile tepeye kadar uzanıyor.
    top: rt.insets.top,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space['4xl'],
    paddingVertical: theme.space.xl,
  },
  counter: {
    fontFamily: theme.font.body[400],
    // `helper` — kit iki temaya birden bakıyor; `meta` yalnız operasyon temasında var.
    fontSize: theme.text.helper,
    color: CLOSE_TINT,
  },
  close: {
    padding: theme.space.md,
  },
}));
