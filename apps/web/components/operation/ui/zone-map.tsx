'use client';

import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, NavigationControl, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * **Bölge haritası** (19.20) — `design/project/Depolar - Bolge Haritasi.html`.
 *
 * ── NEDEN HARİTA ────────────────────────────────────────────────────────────
 * Bölge kararı COĞRAFİ bir karardır: operatör kodu değil YOLU bilir. Tasarımın cümlesi bunu
 * kuruyor — *"noktaya tıkla → ekle / çıkar; karar 'bu yol üstünde mi' olduğu için taban harita yol
 * ağını gösterir."* Kod listesi haritanın SONUCUDUR, girdisi değil.
 *
 * ── NOKTALAR BİZİM, ZEMİN DIŞARIDAN ─────────────────────────────────────────
 * Çizilen her nokta `postal_code_place`ten gelir (16.878 kod, enlem/boylamıyla). Dışarıdan gelen tek
 * şey altındaki karo: sokaklar, nehirler, yer adları. Dışarı giden istek de yalnız karo koordinatıdır
 * (z/x/y) — posta kodlarımız, bölgelerimiz ve müşterilerimiz o tarafa hiç geçmez.
 *
 * ── DOM İŞARETÇİSİ DEĞİL, GPU KATMANI ───────────────────────────────────────
 * Altı bin nokta için `Marker` başına bir DOM düğümü açmak tarayıcıyı dizler. Noktalar tek bir
 * GeoJSON kaynağı + `circle` katmanı olarak çiziliyor; hâl (bu bölgenin · başka bölgede · boşta)
 * bir özellik olarak taşınıyor ve renk `match` ifadesiyle GPU'da seçiliyor.
 *
 * ── RENK TOKEN'DAN OKUNUYOR, GÖMÜLMÜYOR ─────────────────────────────────────
 * WebGL katmanı bir CSS sınıfı alamaz, gerçek renk ister. Ham hex yazmak yasak (CLAUDE §3) ve
 * ayrıca YANLIŞ olurdu: palet karanlık temada bütünüyle dönüyor, gömülü renk orada zemine karışırdı.
 * Bu yüzden değerler çalışma anında `globals.css` değişkenlerinden okunuyor ve tema değişince
 * yeniden okunuyor — token tek kaynak olarak kalıyor.
 */

/** Haritanın çizdiği tek nokta. `places` BİLEREK yok: ad ancak tıklanan kod için gerekir. */
export interface ZoneMapPoint {
  country: string;
  postalCode: string;
  lat: number;
  lng: number;
}

/** Kodun haritadaki hâli — tasarımın üç kod hâli (§"Kod hâlleri"). */
export type ZoneCodeState = 'mine' | 'taken' | 'free';

interface ZoneMapProps {
  points: readonly ZoneMapPoint[];
  /** Kod → hâl. Anahtar `ülke:kod` (`67000` iki ülkede geçerli — ülkesiz anahtar eksik bir sorudur). */
  stateOf: (point: ZoneMapPoint) => ZoneCodeState;
  /** Tıklanan nokta — çağıran ekler ya da çıkarır; harita karar vermez, bildirir. */
  onPick: (point: ZoneMapPoint) => void;
  /** Başlangıç merkezi (deponun bölgesi). Verilmezse noktaların ortalaması. */
  center?: { lat: number; lng: number };
  className?: string;
}

export function keyOfPoint(point: { country: string; postalCode: string }): string {
  return `${point.country}:${point.postalCode}`;
}

/** OpenFreeMap'in açık stili — teknik karar 02.08. CSP host'u `next.config.ts`te açık. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

const SOURCE = 'posta-kodlari';
const LAYER = 'posta-kodu-noktalari';

/** Token değerini gerçek renge çevirir. Değişken yoksa boş döner — çağıran görünür bir varsayılana düşer. */
function token(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function paletteNow(): Record<ZoneCodeState, string> {
  return {
    // Marka rengi = "benim": seçili kodlar bölgenin kimliğidir.
    mine: token('--color-ops-olive') || '#5f7a2c',
    // Amber = "başkasında": bir engel değil, bir bilgi — taşınabilir ama önce çıkarılması gerekir.
    taken: token('--color-ops-amber') || '#9a6416',
    // Nötr = "boşta": zemin üstünde sakin durmalı, dikkat çekmemeli.
    free: token('--color-ops-slate') || '#5a6472',
  };
}

/**
 * Kaynağın beslendiği GeoJSON. Tip `geojson` paketinden İTHAL EDİLMİYOR: o paket MapLibre'ın geçişli
 * bağımlılığı ve pnpm'in katı düzeninde `apps/web`ten görünmüyor — yalnız iki alan için doğrudan
 * bağımlılık eklemek, görünmez bir bağı kalıcı bir yüke çevirirdi.
 */
interface PointCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: { country: string; postalCode: string; state: ZoneCodeState };
  }>;
}

function toGeoJson(points: readonly ZoneMapPoint[], stateOf: ZoneMapProps['stateOf']): PointCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [point.lng, point.lat] as [number, number] },
      properties: {
        country: point.country,
        postalCode: point.postalCode,
        state: stateOf(point),
      },
    })),
  };
}

export function ZoneMap({ points, stateOf, onPick, center, className }: ZoneMapProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // Tıklama işleyicisi haritaya BİR KEZ bağlanır ama en taze `onPick`i çağırmalı; ref olmasaydı
  // dinleyici ilk render'ın kapanışını (closure) ömür boyu taşırdı ve eski bölgeye yazardı.
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    const box = boxRef.current;
    if (!box || mapRef.current) return;

    const first = points[0];
    const map = new MapLibreMap({
      container: box,
      style: STYLE_URL,
      center: center ? [center.lng, center.lat] : first ? [first.lng, first.lat] : [7.75, 48.58],
      zoom: 10,
      // Kartografik süsler kapalı: bu bir keşif haritası değil, bir SEÇİM aracı.
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      map.addSource(SOURCE, { type: 'geojson', data: toGeoJson(points, stateOf) });
      map.addLayer({
        id: LAYER,
        type: 'circle',
        source: SOURCE,
        paint: {
          // Yakınlaştıkça büyür: uzaktan nokta bulutu, yakında tıklanabilir hedef.
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3.5, 12, 7, 15, 11],
          'circle-color': colorExpression() as never,
          'circle-stroke-width': 1,
          'circle-stroke-color': token('--color-ops-card') || '#fbfbf9',
          'circle-opacity': 0.9,
        },
      });
    });

    map.on('click', LAYER, (event: { features?: Array<{ properties: unknown; geometry: unknown }> }) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const props = feature.properties as { country: string; postalCode: string };
      const [lng, lat] = (feature.geometry as { coordinates: [number, number] }).coordinates;
      pickRef.current({ country: props.country, postalCode: props.postalCode, lat, lng });
    });
    // İmleç noktanın üstünde el olur: tıklanabilirlik görünür olmalı (CLAUDE §2).
    map.on('mouseenter', LAYER, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', LAYER, () => {
      map.getCanvas().style.cursor = '';
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Kurulum BİR KEZ ve bağımlılık dizisi bilerek BOŞ: `points`/`stateOf` değişimi aşağıdaki
    // etkiyle veriye yansır, harita yeniden kurulmaz — yeniden kurmak operatörün kaydırdığı görünümü
    // her tıklamada başa alırdı.
  }, []);

  // Veri ve renk tazelemesi: kod eklenip çıkarıldıkça nokta rengi anında dönmeli.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const source = map.getSource(SOURCE);
      if (!source) return;
      (source as GeoJSONSource).setData(toGeoJson(points, stateOf));
      if (map.getLayer(LAYER)) map.setPaintProperty(LAYER, 'circle-color', colorExpression() as never);
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [points, stateOf]);

  return <div ref={boxRef} className={`h-full w-full ${className ?? ''}`} />;
}

/**
 * Hâl → renk. Palet HER ÇAĞRIDA okunur: tema değişince renkler de dönmeli.
 *
 * Dönüş `as never` ile veriliyor çünkü MapLibre boya ifadesinin tipini (`DataDrivenPropertyValue…`)
 * DIŞA VERMİYOR — ithal edilebilecek bir ad yok. Kaçış tek satırda ve tek yerde tutuluyor.
 */
function colorExpression(): (string | string[])[] {
  const palette = paletteNow();
  return [
    'match',
    ['get', 'state'],
    'mine',
    palette.mine,
    'taken',
    palette.taken,
    palette.free,
  ];
}
