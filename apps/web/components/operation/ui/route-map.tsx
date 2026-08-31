'use client';

import dynamic from 'next/dynamic';
import type { RouteMapProps } from './route-map-model';

/**
 * **Rota önizlemesinin kapısı** — gövde yalnız TARAYICIDA yüklenir (`route-map-leaflet`).
 *
 * `ssr: false` bir başarım ayarı değil, ölçülmüş bir arızanın çözümü (`zone-map.tsx` künyesi,
 * 07.08): `leaflet` modül düzeyinde `window`a dokunuyor ve Next istemci komponentlerini de sunucuda
 * bir kez çiziyor — doğrudan ithal edilen gövde sayfayı **500**'e düşürüyordu.
 *
 * Tipler `route-map-model` içinde ve oradan ithal edilir; buradan yeniden ihraç edilseydi sunucudan
 * okuyan dosyalar bu modülü, o da Leaflet'i çekerdi.
 */
const RouteMapLeaflet = dynamic(() => import('./route-map-leaflet').then((mod) => mod.RouteMapLeaflet), {
  ssr: false,
  loading: () => <div className="h-full min-h-64 w-full rounded-ops-card bg-ops-subtle" />,
});

export function RouteMap(props: RouteMapProps) {
  return <RouteMapLeaflet {...props} />;
}
