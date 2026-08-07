'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * **Rota haritası** (19.20) — `design/project/Depolar - Bolge Haritasi.html`.
 *
 * ── NEDEN HARİTA ────────────────────────────────────────────────────────────
 * Rota kararı COĞRAFİ bir karardır: operatör kodu değil YOLU bilir. Tasarımın cümlesi bunu kuruyor —
 * *"noktaya tıkla → ekle / çıkar; karar 'bu yol üstünde mi' olduğu için taban harita yol ağını
 * gösterir."* Kod listesi haritanın SONUCUDUR, girdisi değil.
 *
 * ── NEDEN LEAFLET, MapLibre DEĞİL (07.08, kullanıcı bildirimi) ──────────────
 * Görev satırı *"MapLibre GL JS + OpenFreeMap vektör karoları (teknik karar 02.08, bağlayıcı)"*
 * diyordu ve ben o nota uydum; **çalışan tasarımı açmadım.** Tasarım Leaflet + raster karo kullanıyor
 * ve sorunsuz çalışıyor. CLAUDE §3 zaten bunu söylüyor: görsel karar `.dc.html`'de verilidir.
 *
 * Fark tam olarak üç turluk arızanın kendisiydi: MapLibre vektör karoyu bir **Web Worker**'da çözüp
 * **WebGL** ile boyuyor; zincirin bir halkası kopunca stil ve künye yükleniyor ama tuval BOŞ kalıyor —
 * ekranda tam olarak bu görüldü. Leaflet karoyu `<img>` olarak yükler: worker yok, WebGL yok, ve
 * CSP'de yalnız `img-src` gerekir (`worker-src` ile `connect-src` harita host'u geri çıktı).
 *
 * ── NOKTALAR BİZİM, ZEMİN DIŞARIDAN ─────────────────────────────────────────
 * Çizilen her nokta `postal_code_place`ten gelir (16.878 kod, enlem/boylamıyla). Dışarıdan gelen tek
 * şey altındaki karo; giden istek de yalnız karo koordinatıdır (z/x/y) — posta kodlarımız,
 * rotalarımız ve müşterilerimiz o tarafa hiç geçmez.
 *
 * ── CANVAS RENDERER, SVG DEĞİL ──────────────────────────────────────────────
 * Nokta başına bir SVG düğümü bugünkü avuç dolusu kod için sorun değil ama "boşta" kodlar açılınca
 * (ülke başına binlerce) tarayıcıyı dizer. Katman baştan `L.canvas()` üstünde kuruluyor: sonradan
 * geçmek, çalışan bir ekranı yeniden yazmak olurdu.
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
  center?: { lat: number; lng: number };
  className?: string;
}

export function keyOfPoint(point: { country: string; postalCode: string }): string {
  return `${point.country}:${point.postalCode}`;
}

/**
 * Karo kaynağı — tasarımın kullandığının aynısı.
 *
 * ⚠ `tile.openstreetmap.org` KAMUSAL bir sunucudur ve ağır kullanım için değildir. Bir avuç
 * operatörün rota kurduğu iç ekran için uygun; yayına çıkarken kendi sağlayıcımıza geçilmeli.
 * BEKLEYEN(19.20)
 */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; OpenStreetMap';

/** Token değerini gerçek renge çevirir — canvas bir CSS sınıfı alamaz, ham hex de yazılamaz (§3). */
function token(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function colorOf(state: ZoneCodeState): string {
  // Marka rengi = "benim"; amber = "başkasında" (engel değil, bilgi); nötr = "boşta" (sakin durmalı).
  if (state === 'mine') return token('--color-ops-olive', '#5f7a2c');
  if (state === 'taken') return token('--color-ops-amber', '#9a6416');
  return token('--color-ops-slate', '#5a6472');
}

export function ZoneMap({ points, stateOf, onPick, center, className }: ZoneMapProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  // Tıklama işleyicisi katmana her çizimde bağlanıyor ama en taze `onPick`i çağırmalı.
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    const box = boxRef.current;
    if (!box || mapRef.current) return;

    const map = L.map(box, {
      center: center ? [center.lat, center.lng] : [48.583, 7.75],
      zoom: 11,
      renderer: L.canvas(),
    });
    // `className` tasarımın soluklaştırmasını taşıyor (`globals.css` → `.ops-map-tiles`): zemin
    // sönükleşir, noktalar öne çıkar. Raster olduğu için tek CSS filtresi yetiyor.
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 18, className: 'ops-map-tiles' }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    /**
     * **Kap ölçüsü sonradan oturuyor.** Harita bir diyaloğun/sekmenin içinde doğuyor ve kurulurken
     * kabın yüksekliği 0 olabiliyor; Leaflet ölçüyü bir kez okur. Gözlemci gerçeğe bağlıdır —
     * tek seferlik bir gecikme bir TAHMİNE bağlı olurdu.
     */
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(box);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // Kurulum BİR KEZ: veri değişimi aşağıdaki etkiyle yansır. Yeniden kurmak, operatörün kaydırdığı
    // görünümü her tıklamada başa alırdı.
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();

    for (const point of points) {
      L.circleMarker([point.lat, point.lng], {
        radius: 7,
        color: token('--color-ops-card', '#fbfbf9'),
        weight: 1.5,
        fillColor: colorOf(stateOf(point)),
        fillOpacity: 0.92,
      })
        // Etiket TIKLAMADAN görünür: "hangi kod" sorusu haritanın en sık sorulanı.
        .bindTooltip(point.postalCode, { direction: 'top', offset: [0, -6] })
        .on('click', () => pickRef.current(point))
        .addTo(layer);
    }
  }, [points, stateOf]);

  return <div ref={boxRef} className={`h-full w-full ${className ?? ''}`} />;
}
