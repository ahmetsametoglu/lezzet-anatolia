'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { placesLabel } from './labels';
import { attachGoogleTiles, mapToken } from '@/lib/map/leaflet-base';
import {
  FREE_CODE_MIN_ZOOM,
  type ZoneCodeState,
  type ZoneMapFact,
  type ZoneMapPoint,
  type ZoneMapProps,
} from './zone-map-model';

/**
 * Bölge haritasının Leaflet gövdesi: `leaflet` modül düzeyinde `window`a dokunduğu için yalnız `zone-map.tsx` kapısından
 * (`next/dynamic`, `ssr: false`) yüklenir. Noktalar `L.canvas()` üstünde, çünkü "boşta" kodlar açılınca görüş alanı başına
 * yüzlerce nokta çiziliyor ve nokta başına SVG düğümü tarayıcıyı yorardı.
 */

/** Etiketin (kod + yerleşim adı) kalıcı olduğu yakınlık — tasarımın kendi eşiği. */
const LABEL_MIN_ZOOM = 13;

// Karo kaynağı ve künyesi ORTAK (`leaflet-base`): kopyalansaydı iki harita bir gün iki farklı
// sunucudan çizerdi — biri CSP'de açık olmayan bir hosttan.



/**
 * Üç kod hâlinin biçimi, tasarımın `STYLE` bloğunun token karşılığı: yarıçap da anlam taşır (8 · 7 · 6,5), göz önce kendi
 * rotasını görsün diye. İçi boş nokta "henüz kimsenin değil" der, dolu nokta ona sahiplik yüklerdi.
 */
function styleOf(state: ZoneCodeState): L.CircleMarkerOptions {
  if (state === 'mine') {
    const olive = mapToken('--color-ops-olive', '#5f7a2c');
    return { radius: 8, color: olive, weight: 2.5, fillColor: olive, fillOpacity: 1 };
  }
  // ÖNERİ mor ailesindedir ve bu bir tercih değil, envanterin kendi tanımı: `--color-ops-violet-bg`
  // künyesinde "öneri kutusu" yazıyor. Yarıçap "benim" ile aynı (8): öneri de bir DAVETTİR, boştaki
  // kodun sessizliği değil — göz onu tanımlı kodlarla aynı ağırlıkta görmeli.
  if (state === 'suggested') {
    return {
      radius: 8,
      color: mapToken('--color-ops-violet', '#5a4a8a'),
      weight: 2.5,
      fillColor: mapToken('--color-ops-violet-dot', '#6a5acd'),
      fillOpacity: 1,
    };
  }
  /**
   * Zeytin dolgu "artık bu rotanın", mor çember "asistanın önerisiydi" der. Yarıçap `mine`dan bir tık iri: nokta operatörün az
   * önce verdiği karar ve kalabalığın içinde kaybolmamalı.
   */
  if (state === 'adding') {
    return {
      radius: 9,
      color: mapToken('--color-ops-violet', '#5a4a8a'),
      weight: 3,
      fillColor: mapToken('--color-ops-olive', '#5f7a2c'),
      fillOpacity: 1,
    };
  }
  if (state === 'taken') {
    return {
      radius: 7,
      color: mapToken('--color-ops-blue', '#3a6b8a'),
      weight: 2,
      fillColor: mapToken('--color-ops-blue-line', '#bcd0e0'),
      fillOpacity: 1,
    };
  }
  return {
    radius: 6.5,
    color: mapToken('--color-ops-gray-700', '#b3b7ac'),
    weight: 2,
    fillColor: mapToken('--color-ops-card', '#fbfbf9'),
    fillOpacity: 1,
  };
}

/**
 * Kalıcı etiketin taşıdığı en fazla yerleşim adı; kalanı sayılır (`+2`), susturulmaz. Etiketler z13'ten sonra kalıcı ve o
 * kademede görüş alanında bir avuç kod var, üç ad haritayı örtmüyor.
 */
const LABEL_MAX_PLACES = 3;

/**
 * Künye ikonları çizgisel, tek `path` ve `currentColor`: dolgulu yol 13 pikselde aynı lekeye dönüyor. React ikonları burada
 * kullanılamıyor, çünkü ipucu React ağacının dışında elle kurulan bir DOM.
 */
const FACT_ICONS: Record<ZoneMapFact['icon'], readonly string[]> = {
  // Zil — haber bekleyen kişi (izin vermiş, kimlikli).
  waiting: ['M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9z', 'M10.2 20.5a2 2 0 0 0 3.6 0'],
  // Torba — bu koda gitmiş sipariş.
  orders: ['M6.5 3 4 7v12.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5V7l-2.5-4z', 'M4 7h16', 'M16 11a4 4 0 0 1-8 0'],
  // Soru — anonim "buraya geliyor musunuz" sayacı.
  asked: ['M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19z', 'M9.3 9.2a2.8 2.8 0 0 1 5.4.9c0 1.9-2.7 2.5-2.7 4', 'M12 17.6h.01'],
  // İğne — rotaya uzaklık.
  distance: ['M20 10.2c0 5.7-8 11.9-8 11.9s-8-6.2-8-11.9a8 8 0 0 1 16 0z', 'M12 12.9a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z'],
  // Saat — son sorunun yaşı.
  age: ['M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19z', 'M12 6.8V12l3.6 2.1'],
};

const SVG_NS = 'http://www.w3.org/2000/svg';

function iconOf(name: ZoneMapFact['icon']): SVGSVGElement {
  // `createElementNS` + `setAttribute`: `innerHTML` ile kurulsaydı ipucunun içine işaretleme
  // yazmanın kapısı açık kalırdı — komşusundaki yerleşim adları veritabanından geliyor.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of FACT_ICONS[name]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

/**
 * Etiket metin dizesi değil DOM: kod, yerleşim adları ve künye ayrı satırlarda sarmalanır, veritabanından gelen adlar da
 * `textContent` ile yazıldığı için işaretleme olarak yorumlanamaz. Kalıcı etiket dar (üç ad), üzerine gelince açılan ipucu tam.
 */
function labelOf(point: ZoneMapPoint, permanent: boolean): HTMLElement {
  const box = document.createElement('div');

  const head = document.createElement('span');
  head.className = 'ops-map-tip-code';
  head.textContent = point.postalCode;
  box.appendChild(head);

  const where = placesLabel(point.places ?? [], permanent ? LABEL_MAX_PLACES : undefined);
  if (where) {
    const place = document.createElement('span');
    place.className = 'ops-map-tip-place';
    place.textContent = where;
    box.appendChild(place);
  }

  const facts = point.facts ?? [];
  if (facts.length > 0) {
    const strip = document.createElement('div');
    strip.className = 'ops-map-tip-stats';
    for (const fact of facts) {
      const chip = document.createElement('span');
      chip.className = 'ops-map-tip-stat';
      chip.appendChild(iconOf(fact.icon));
      const value = document.createElement('span');
      value.textContent = fact.label;
      chip.appendChild(value);
      strip.appendChild(chip);
    }
    box.appendChild(strip);
  }

  return box;
}

export function ZoneMapLeaflet({
  points,
  stateOf,
  onPick,
  onViewport,
  note,
  hint,
  center,
  focus,
  className,
}: ZoneMapProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  // Tıklama ve görüş bildirimi katmana her çizimde bağlanıyor ama en taze işleyiciyi çağırmalı.
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const viewportRef = useRef(onViewport);
  viewportRef.current = onViewport;
  const [visibleHint, setVisibleHint] = useState<string | null>(null);

  // Lejantta hangi satırların çizileceği — haritada FİİLEN bulunan hâller. Tek geçiş; nokta kümesi
  // ya da hâl fonksiyonu değişmedikçe yeniden hesaplanmıyor.
  const shownStates = useMemo(() => new Set(points.map(stateOf)), [points, stateOf]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box || mapRef.current) return;

    /**
     * Yakınlaştırma denetimi sol altta: öteki köşelerde lejant, ipucu şeridi ve atıf yazısı duruyor, sağ üstte de Rotalar
     * sekmesinin yüzen paneliyle çakışır. Çakışma sıra değil konum sorunu; z değeri büyütmek düğmeleri panelin altına gömer.
     */
    const map = L.map(box, {
      center: center ? [center.lat, center.lng] : [48.583, 7.75],
      zoom: 11,
      zoomControl: false,
      renderer: L.canvas(),
    });
    // `className` tasarımın soluklaştırmasını taşıyor (`globals.css` → `.ops-map-tiles`): zemin
    // sönükleşir, noktalar öne çıkar. Raster olduğu için tek CSS filtresi yetiyor.
    const detachTiles = attachGoogleTiles(L, map, { language: 'tr', className: 'ops-map-tiles' });
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    /**
     * Görüş alanı bildirimi GECİKMELİ: `moveend` kaydırma bitince bir kez atar, ama operatör
     * arka arkaya kaydırıp yakınlaşırken birkaç kez atar ve her biri bir sunucu turu olurdu.
     * Kaydırmanın KENDİSİ (`move`) dinlenmiyor — o saniyede onlarca kez atar.
     */
    let timer: ReturnType<typeof setTimeout> | undefined;
    const announce = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const bounds = map.getBounds();
        viewportRef.current?.({
          minLat: bounds.getSouth(),
          maxLat: bounds.getNorth(),
          minLng: bounds.getWest(),
          maxLng: bounds.getEast(),
          zoom: map.getZoom(),
        });
      }, 250);
    };
    map.on('moveend', announce);

    /**
     * Harita bir sekmenin içinde doğuyor ve kurulurken kabın yüksekliği 0 olabiliyor; Leaflet ölçüyü bir kez okuduğu için ölçü
     * oturunca yeniden okutuluyor. Görüş alanı da değiştiği için bildirim buradan da tetiklenir.
     */
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      announce();
    });
    observer.observe(box);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      map.off('moveend', announce);
      detachTiles();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // Kurulum BİR KEZ: veri değişimi aşağıdaki etkiyle yansır. Yeniden kurmak, operatörün kaydırdığı
    // görünümü her tıklamada başa alırdı.
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    const draw = () => {
      // Etiket YAKINLAŞINCA gelir (tasarım): uzakta nokta yoğunluğu okunur, z13'ten sonra kod +
      // yerleşim adı. Uzakta kalıcı etiket, noktaların üstünü örter ve haritayı okunmaz kılar.
      const labelsOn = map.getZoom() >= LABEL_MIN_ZOOM;
      layer.clearLayers();

      for (const point of points) {
        L.circleMarker([point.lat, point.lng], styleOf(stateOf(point)))
          /**
           * İçerik fonksiyon olarak veriliyor: Leaflet onu ipucu açıldığında çağırıyor, böylece her çizimde nokta sayısı kadar kart
           * kurulmuyor. Stil `globals.css`te (`.ops-map-tip`), çünkü içerik React ağacının dışında.
           */
          .bindTooltip(() => labelOf(point, labelsOn), {
            permanent: labelsOn,
            direction: 'right',
            offset: [9, 0],
            // Geniş taban YALNIZ künyesi olan noktaya: sıradan bir kodda iki sütunluk ızgara yok,
            // orada 15 rem'lik kutu boşluktan başka bir şey göstermezdi. Sınıf bağlama anında
            // seçiliyor — `facts` o an biliniyor, içeriğin geç kurulması bunu değiştirmiyor.
            className: point.facts && point.facts.length > 0 ? 'ops-map-tip ops-map-tip-wide' : 'ops-map-tip',
          })
          .on('click', () => pickRef.current(point))
          .addTo(layer);
      }
    };

    draw();
    // Yakınlaşma etiket kararını değiştiriyor; `permanent` bayrağı katman kurulurken okunduğu için
    // yeniden çizmek gerekiyor. Kaydırma (`moveend`) yeniden çizdirmez — nokta kümesi değişmedi.
    map.on('zoomend', draw);
    return () => {
      map.off('zoomend', draw);
    };
  }, [points, stateOf]);

  /**
   * Ekran dışındaki bir öneriye tıklanınca harita oraya gider; yakınlık `FREE_CODE_MIN_ZOOM`in altına düşmez, çünkü eşiğin
   * altında boştaki kodlar çizilmiyor ve operatör aradığı noktayı göremezdi. Zaten daha yakınsa yakınlık korunur.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.setView([focus.lat, focus.lng], Math.max(map.getZoom(), FREE_CODE_MIN_ZOOM), { animate: true });
  }, [focus]);

  /**
   * İpucu şeridi 2,6 sn sonra söner (tasarım). Sayaç değer değişince yeniden başlar; aynı cümle art arda gelmez, çünkü
   * cümlede kodun kendisi geçiyor.
   */
  useEffect(() => {
    setVisibleHint(hint ?? null);
    if (!hint) return;
    const timer = setTimeout(() => setVisibleHint(null), 2600);
    return () => clearTimeout(timer);
  }, [hint]);

  return (
    /**
     * `isolate` Leaflet'in iç z-index sayılarını (panel 400, denetim 1000) bu kutuya hapseder; yalıtım olmasa bu sayılar
     * sayfanın kökünde yarışır ve başlıktaki depo seçicisinin açılan listesi haritanın altında kalır.
     */
    <div className={`relative isolate h-full w-full ${className ?? ''}`}>
      <div ref={boxRef} className="absolute inset-0" />

      {/* Lejant — tasarımın "Kod hâlleri" kutusu. Harita chrome'u olduğu için burada yaşıyor:
          üç hâlin rengini bilen tek yer bu dosya, açıklamayı başka yere koymak ikisini ayrıştırırdı. */}
      <div className="pointer-events-none absolute left-3.5 top-3.5 z-[500] flex max-w-[15rem] flex-col gap-1.5 rounded-ops-card border border-ops-line bg-ops-card/95 px-3 py-2.5 shadow-[0_8px_24px_rgba(20,22,18,0.12)]">
        <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.07em] text-ops-muted">
          Kod hâlleri
        </span>
        <LegendRow state="mine" label="bu rotanın kodu" />
        {/* `adding` satırı YALNIZ o hâlden nokta varken çizilir: rota kurulum ekranı bu hâli hiç
            üretmiyor ve orada duran bir "bu kararla ekleniyor" satırı, hiç görünmeyecek bir rengi
            tarif ederdi — lejant haritanın aynası olmalı, sözlüğü değil. */}
        {shownStates.has('adding') ? <LegendRow state="adding" label="bu kararla ekleniyor" /> : null}
        <LegendRow state="suggested" label="önerilen — üzerine gelin" />
        <LegendRow state="taken" label="başka rotada tanımlı" />
        <LegendRow state="free" label="boşta" />
        <span className="border-t border-ops-line-soft pt-1.5 font-ops-body text-ops-micro leading-[1.5] text-ops-muted">
          {note ?? 'Noktaya tıkla → ekle / çıkar. Karar “bu yol üstünde mi” olduğu için taban harita yol ağını gösterir.'}
        </span>
      </div>

      {visibleHint ? (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-[500] -translate-x-1/2 rounded-ops-btn bg-ops-ink px-3.5 py-2 font-ops-body text-ops-xs font-medium text-ops-card shadow-[0_8px_24px_rgba(20,22,18,0.3)]">
          {visibleHint}
        </div>
      ) : null}
    </div>
  );
}

/** Lejantın tek satırı — noktanın kendisiyle AYNI biçimi taşır, yoksa lejant yalan söyler. */
function LegendRow({ state, label }: { state: ZoneCodeState; label: string }) {
  const dot =
    state === 'mine'
      ? 'bg-ops-olive ring-1 ring-ops-olive'
      : // Haritadaki noktanın birebir aynısı: zeytin dolgu, mor çember.
        state === 'adding'
        ? 'bg-ops-olive ring-2 ring-ops-violet'
        : state === 'suggested'
          ? 'bg-ops-violet-dot ring-1 ring-ops-violet'
          : state === 'taken'
            ? 'bg-ops-blue-line ring-1 ring-ops-blue'
            : 'bg-ops-card ring-[1.5px] ring-ops-gray-700';
  return (
    <span className="flex items-center gap-2 font-ops-body text-ops-xs text-ops-body">
      <span className={`size-3 rounded-full border-2 border-ops-card ${dot}`} />
      {label}
    </span>
  );
}
