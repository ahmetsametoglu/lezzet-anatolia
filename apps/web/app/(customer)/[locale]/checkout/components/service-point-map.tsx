'use client';

import dynamic from 'next/dynamic';

/** Leaflet yalnız tarayıcıda çalışır: harita sunucuda çizilmez, yüklenene dek yerini boş bir zemin tutar. */
export const ServicePointMap = dynamic(() => import('./service-point-map-leaflet').then((mod) => mod.ServicePointMapLeaflet), {
  ssr: false,
  loading: () => <div className="size-full bg-sand-100" />,
});
