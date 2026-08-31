'use client';

import { useEffect, useRef } from 'react';
import { mapToken, TILE_ATTRIBUTION, TILE_MAX_ZOOM, TILE_URL } from './leaflet-base';
import { allPoints, metricNote, tourPath, type RouteMapProps } from './route-map-model';

/**
 * **Rota önizlemesi** (11.9) — motorun dizdiği turun gövdesi. Yalnız TARAYICIDA yüklenir
 * (`route-map.tsx` kapısı); Leaflet modül düzeyinde `window`a dokunuyor.
 *
 * ── NEDEN VAR: MOTORUN DENETİM GÖZÜ ─────────────────────────────────────────
 * Sıra bir hesaptır ve hesabın yanıldığı yer sahada anlaşılır — araç çıktıktan sonra. Bu ekran onu
 * ÖNCE gösteriyor: sevkiyatçı turun şeklini bir bakışta okur, bariyer atlayan bir bacak varsa
 * görür. Kuş uçuşu ölçüsüyle dizilmiş bir rotanın nerede yanıldığını ölçmenin de tek yolu bu —
 * `RouteMatrixProvider` kararı buradan çıkacak.
 *
 * Sırasız duraklar haritada DURUR ama tura girmez ve numarasız çizilir: çizgiye katmak, olmayan bir
 * sırayı varmış gibi göstermek olurdu (`CLAUDE §1`).
 */
export function RouteMapLeaflet({ origin, stops, metric, precision, className }: RouteMapProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    // Dinamik ithal: modül `window`a dokunuyor ve bu dosya istemcide bile bir kez sunucuda çizilebilir.
    void import('leaflet').then((L) => {
      if (disposed || !boxRef.current) return;

      const ink = mapToken('--color-ops-ink', '#1b2119');
      const accent = mapToken('--color-ops-olive', '#5f7a2c');
      const faint = mapToken('--color-ops-faint', '#8a917f');
      const card = mapToken('--color-ops-card', '#ffffff');

      const map = L.map(boxRef.current, { attributionControl: true, scrollWheelZoom: false });
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: TILE_MAX_ZOOM, className: 'ops-map-tiles' }).addTo(map);

      const path = tourPath({ origin, stops });
      if (path.length > 1) {
        L.polyline(path.map((point) => [point.lat, point.lng] as [number, number]), {
          color: accent,
          weight: 2,
          opacity: 0.65,
        }).addTo(map);
      }

      if (origin) {
        // Depo KARE, duraklar daire: turun çıpası bir durak değil ve şekil farkı onu tek bakışta ayırır.
        L.marker([origin.lat, origin.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="width:14px;height:14px;background:${ink};border-radius:2px"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
        })
          .addTo(map)
          .bindTooltip(origin.label);
      }

      for (const stop of stops) {
        const sequenced = stop.sequence !== null;
        L.marker([stop.lat, stop.lng], {
          icon: L.divIcon({
            className: '',
            html:
              `<div style="width:22px;height:22px;border-radius:50%;display:grid;place-items:center;` +
              `background:${sequenced ? accent : card};border:1.5px solid ${sequenced ? accent : faint};` +
              `color:${sequenced ? card : faint};font:500 11px/1 ui-monospace,monospace">` +
              `${sequenced ? String(stop.sequence) : '·'}</div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
        })
          .addTo(map)
          .bindTooltip(sequenced ? `${stop.sequence}. ${stop.label}` : `${stop.label} — sırasız`);
      }

      const points = allPoints({ origin, stops });
      if (points.length > 0) {
        map.fitBounds(L.latLngBounds(points.map((point) => [point.lat, point.lng] as [number, number])), {
          padding: [28, 28],
          maxZoom: 14,
        });
      } else {
        // Hiç nokta yoksa harita bir yere odaklanamaz; Strasbourg merkezli sakin bir görünüm.
        map.setView([48.5839, 7.7455], 11);
      }

      cleanup = () => map.remove();
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [origin, stops, metric, precision]);

  const note = metricNote({ metric, precision });

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <div ref={boxRef} className="h-full min-h-64 w-full rounded-ops-card bg-ops-subtle" />
      {/* ÖLÇÜ VE İNCELİK YAZILI (11.9): kuş uçuşuyla dizilmiş bir sıra ile yol süresiyle dizilmiş
          olan haritada aynı görünür. Farkı yalnız bu satır söyler — sonucun ne kadar güvenilir
          olduğu sonucun yanında durmazsa, operatör kaba bir sırayı kesin sanar. */}
      {note ? <p className="font-ops-body text-ops-xs text-ops-faint">{note}</p> : null}
    </div>
  );
}
