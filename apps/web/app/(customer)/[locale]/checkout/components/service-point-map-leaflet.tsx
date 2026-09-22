'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TILE_ATTRIBUTION, TILE_MAX_ZOOM, TILE_URL } from '@/lib/map/leaflet-base';

/** Haritadaki nokta: konum, taşıyıcının renk sınıfı ve erişilebilir başlık. Fiyat haritada değil, listede durur. */
export interface ServicePointMapPin {
  id: string;
  lat: number;
  lng: number;
  tone: string;
  title: string;
}

interface ServicePointMapLeafletProps {
  pins: readonly ServicePointMapPin[];
  selectedId: string | null;
  /** Listede üzerine gelinen kartın noktası; haritada öne çıkar. */
  highlightId: string | null;
  /** Müşterinin adresi; koordinatı yoksa `null` ve harita noktalara göre açılır. */
  home: { lat: number; lng: number; label: string } | null;
  onPick: (id: string) => void;
}

// Nokta taşıyıcı rengindedir; seçili nokta zeytin, listede üzerine gelinen mürekkep olup büyür ki iki hâl renkten ayrışsın.
const pinIcon = (pin: ServicePointMapPin, state: 'normal' | 'selected' | 'highlight'): L.DivIcon =>
  L.divIcon({
    className: '',
    iconSize: [0, 0],
    html:
      state === 'normal'
        ? `<span class="absolute block size-3.5 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border-2 border-white shadow-sm ${pin.tone}"></span>`
        : `<span class="absolute block size-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border-[3px] border-white shadow-md ${state === 'selected' ? 'bg-olive' : 'bg-ink'}"></span>`,
  });

const homeIcon = (label: string): L.DivIcon =>
  L.divIcon({
    className: '',
    iconSize: [0, 0],
    html: `<span class="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-ink px-2 py-0.5 font-sans text-note font-semibold text-white">${label}</span>`,
  });

/** Leaflet modül düzeyinde `window`a dokunur; bu dosya yalnız `next/dynamic` ile, sunucu çizimi kapalı yüklenir. */
export function ServicePointMapLeaflet({ pins, selectedId, highlightId, home, onPick }: ServicePointMapLeafletProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: TILE_MAX_ZOOM }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Görüş alanı yalnız nokta kümesi değişince kurulur; seçim değişince kullanıcının yakınlığı korunur.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const coords: L.LatLngExpression[] = pins.map((p) => [p.lat, p.lng]);
    if (home) coords.push([home.lat, home.lng]);
    if (coords.length === 0) return;
    map.fitBounds(L.latLngBounds(coords), { padding: [36, 36], maxZoom: 15 });
  }, [pins, home]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (home) L.marker([home.lat, home.lng], { icon: homeIcon(home.label), interactive: false, keyboard: false, zIndexOffset: 500 }).addTo(layer);
    for (const pin of pins) {
      const state = pin.id === selectedId ? 'selected' : pin.id === highlightId ? 'highlight' : 'normal';
      L.marker([pin.lat, pin.lng], { icon: pinIcon(pin, state), title: pin.title, zIndexOffset: state === 'normal' ? 0 : 1000 })
        .on('click', () => pickRef.current(pin.id))
        .addTo(layer);
    }
  }, [pins, selectedId, highlightId, home]);

  // Yalnız seçim haritayı kaydırır; üzerine gelmek kaydırsaydı liste üstünde gezinen fare haritayı sürekli oynatırdı.
  useEffect(() => {
    const chosen = pins.find((p) => p.id === selectedId);
    if (chosen) mapRef.current?.panTo([chosen.lat, chosen.lng]);
  }, [pins, selectedId]);

  return <div ref={containerRef} className="size-full" />;
}
