'use client';

import dynamic from 'next/dynamic';
import type { ZoneMapProps } from './zone-map-model';

/**
 * **Rota haritasının kapısı** — gövde yalnız TARAYICIDA yüklenir (`zone-map-leaflet`).
 *
 * `ssr: false` bir başarım ayarı değil, ÖLÇÜLMÜŞ bir arızanın çözümü (07.08): `leaflet` modül
 * düzeyinde `window`a dokunuyor ve Next istemci komponentlerini de sunucuda bir kez çiziyor. Gövde
 * doğrudan ithal edildiğinde `/operations/deliveries?tab=routes` **500** dönüyordu
 * (`Error: window is not defined`); ekran istemcide toparladığı için gözle görünmüyor, yalnız
 * konsolda ve HTTP durumunda okunuyordu.
 *
 * Tip ve sabitler `zone-map-model` içinde ve oradan ithal edilir — buradan yeniden ihraç edilseydi
 * sunucudan okuyan dosyalar (ör. `routes-read`) bu modülü, o da Leaflet'i çekerdi.
 */
const ZoneMapLeaflet = dynamic(() => import('./zone-map-leaflet').then((mod) => mod.ZoneMapLeaflet), {
  ssr: false,
  // Yükleme sırasında kutu BOŞ bırakılmaz: harita sayfanın yarısını kaplıyor ve boş bir alan
  // "bozuk" diye okunur. Zemin, karo yüklendiğindeki tonun aynısı.
  loading: () => <div className="h-full w-full bg-ops-subtle" />,
});

export function ZoneMap(props: ZoneMapProps) {
  return <ZoneMapLeaflet {...props} />;
}
