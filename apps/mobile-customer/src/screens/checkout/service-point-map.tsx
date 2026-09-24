import { MAP_STYLE, type CarrierTone } from '@lezzet/helper';
import { useCallback, useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type LatLng } from 'react-native-maps';
import { StyleSheet } from 'react-native-unistyles';

import { carrierToneStyles } from './carrier-tone';

/** Haritadaki nokta: konum, taşıyıcının rengi ve ekran okuyucu adı. Fiyat haritada değil kartta durur. */
export interface ServicePointMapPin {
  id: string;
  lat: number;
  lng: number;
  tone: CarrierTone;
  title: string;
}

interface ServicePointMapProps {
  pins: readonly ServicePointMapPin[];
  selectedId: string | null;
  /** Aramanın merkezi, müşterinin adresi; `null`da harita noktalara göre açılır. */
  home: { lat: number; lng: number; label: string } | null;
  /** Alt güvenli alan: Google logosu ve telif satırı ev çubuğunun altında kalmasın. */
  bottomInset: number;
  onPick: (id: string) => void;
}

/** Sığdırmanın kenar payı ve tek noktada yakınlık; web haritasının `fitBounds` ayarıyla aynı. */
const FIT_PADDING = 36;
const SINGLE_POINT_ZOOM = 15;

/**
 * Google altlıklı harita, web'in karolarıyla aynı stil (`MAP_STYLE`). İşaretler bir kez çizilir (`tracksViewChanges`), seçim
 * değişince anahtar değişir ve işaret yeniden çizilir; yalnız seçim kamerayı kaydırır.
 */
export function ServicePointMap({ pins, selectedId, home, bottomInset, onPick }: ServicePointMapProps) {
  const map = useRef<MapView>(null);
  const ready = useRef(false);

  const fit = useCallback((): void => {
    const coords: LatLng[] = pins.map((p) => ({ latitude: p.lat, longitude: p.lng }));
    if (home) coords.push({ latitude: home.lat, longitude: home.lng });
    const [first] = coords;
    if (!first) return;
    if (coords.length === 1) {
      map.current?.animateCamera({ center: first, zoom: SINGLE_POINT_ZOOM }, { duration: 0 });
      return;
    }
    map.current?.fitToCoordinates(coords, {
      edgePadding: { top: FIT_PADDING, right: FIT_PADDING, bottom: FIT_PADDING, left: FIT_PADDING },
      animated: false,
    });
  }, [pins, home]);

  // Görüş alanı yalnız nokta kümesi değişince kurulur; seçim değişince müşterinin yakınlığı korunur.
  useEffect(() => {
    if (ready.current) fit();
  }, [fit]);

  useEffect(() => {
    const chosen = pins.find((p) => p.id === selectedId);
    if (chosen) map.current?.animateCamera({ center: { latitude: chosen.lat, longitude: chosen.lng } });
  }, [pins, selectedId]);

  return (
    <MapView
      ref={map}
      provider={PROVIDER_GOOGLE}
      style={styles.map}
      customMapStyle={MAP_STYLE}
      mapPadding={{ top: 0, right: 0, bottom: bottomInset, left: 0 }}
      toolbarEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      moveOnMarkerPress={false}
      onMapReady={() => {
        ready.current = true;
        fit();
      }}
      testID="service-point-map"
    >
      {home ? (
        <Marker coordinate={{ latitude: home.lat, longitude: home.lng }} tracksViewChanges={false} zIndex={2} tappable={false}>
          <View style={styles.home}>
            <Text style={styles.homeLabel}>{home.label}</Text>
          </View>
        </Marker>
      ) : null}
      {pins.map((pin) => {
        const selected = pin.id === selectedId;
        return (
          <Marker
            key={`${pin.id}-${selected ? 'selected' : 'idle'}`}
            coordinate={{ latitude: pin.lat, longitude: pin.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            zIndex={selected ? 1 : 0}
            accessibilityLabel={pin.title}
            onPress={() => onPick(pin.id)}
          >
            <View style={selected ? styles.pinSelected : [styles.pin, carrierToneStyles[pin.tone]]} />
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create((theme) => ({
  map: {
    flex: 1,
  },
  pin: {
    width: theme.space['2xl'],
    height: theme.space['2xl'],
    borderRadius: theme.space['2xl'] / 2,
    borderWidth: theme.border.accent,
    borderColor: theme.colors.card,
  },
  pinSelected: {
    width: theme.space['6xl'],
    height: theme.space['6xl'],
    borderRadius: theme.space['6xl'] / 2,
    borderWidth: theme.border.ring,
    borderColor: theme.colors.card,
    backgroundColor: theme.colors.olive,
  },
  home: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.ink,
    paddingVertical: theme.space['2xs'],
    paddingHorizontal: theme.space.md,
  },
  homeLabel: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.card,
  },
}));
