'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { placesLabel } from './labels';
import { mapToken, TILE_ATTRIBUTION, TILE_MAX_ZOOM, TILE_URL } from './leaflet-base';
import {
  FREE_CODE_MIN_ZOOM,
  type ZoneCodeState,
  type ZoneMapFact,
  type ZoneMapPoint,
  type ZoneMapProps,
} from './zone-map-model';

/**
 * **Rota haritası — Leaflet gövdesi** (19.20). `design/project/Depolar - Bolge Haritasi.html`.
 *
 * Bu dosya YALNIZ tarayıcıda yüklenir; kapısı `zone-map.tsx` (`next/dynamic`, `ssr: false`).
 * Doğrudan ithal ETMEYİN — `leaflet` modül düzeyinde `window`a dokunuyor ve sunucu çizimini düşürür.
 *
 * ── NEDEN HARİTA ────────────────────────────────────────────────────────────
 * Rota kararı COĞRAFİ bir karardır: operatör kodu değil YOLU bilir. Tasarımın cümlesi bunu kuruyor —
 * *"noktaya tıkla → ekle / çıkar; karar 'bu yol üstünde mi' olduğu için taban harita yol ağını
 * gösterir."* Kod listesi haritanın SONUCUDUR, girdisi değil.
 *
 * ── NEDEN LEAFLET, MapLibre DEĞİL (07.08, kullanıcı bildirimi) ──────────────
 * Görev satırı *"MapLibre GL JS + OpenFreeMap vektör karoları"* diyordu ve ben o nota uydum;
 * **çalışan tasarımı açmadım.** Tasarım Leaflet + raster karo kullanıyor ve sorunsuz çalışıyor.
 *
 * Fark tam olarak üç turluk arızanın kendisiydi: MapLibre vektör karoyu bir **Web Worker**'da çözüp
 * **WebGL** ile boyuyor; zincirin bir halkası kopunca stil ve künye yükleniyor ama tuval BOŞ kalıyor.
 * Leaflet karoyu `<img>` olarak yükler: worker yok, WebGL yok, CSP'de yalnız `img-src` gerekir.
 *
 * ── NOKTALAR BİZİM, ZEMİN DIŞARIDAN ─────────────────────────────────────────
 * Çizilen her nokta `postal_code_place`ten gelir (16.878 kod, enlem/boylamıyla). Dışarıdan gelen tek
 * şey altındaki karo; giden istek de yalnız karo koordinatıdır (z/x/y) — posta kodlarımız,
 * rotalarımız ve müşterilerimiz o tarafa hiç geçmez.
 *
 * ── CANVAS RENDERER, SVG DEĞİL ──────────────────────────────────────────────
 * Nokta başına bir SVG düğümü bugünkü avuç dolusu kod için sorun değil ama "boşta" kodlar açılınca
 * (görüş alanı başına yüzlerce) tarayıcıyı dizer. Katman baştan `L.canvas()` üstünde kuruluyor.
 */

/** Etiketin (kod + yerleşim adı) kalıcı olduğu yakınlık — tasarımın kendi eşiği. */
const LABEL_MIN_ZOOM = 13;

// Karo kaynağı ve künyesi ORTAK (`leaflet-base`): kopyalansaydı iki harita bir gün iki farklı
// sunucudan çizerdi — biri CSP'de açık olmayan bir hosttan.



/**
 * Üç kod hâlinin biçimi — tasarımın `STYLE` bloğunun token karşılığı.
 *
 * Yarıçap da anlam taşıyor ve tasarımdan birebir alındı (8 · 7 · 6,5): "benim" kodum en iri, "boşta"
 * en küçük — göz önce kendi rotasını görür. Eşit yarıçap, üç hâli aynı ağırlıkta okuturdu.
 *
 * **Token eşlemesi** (tasarımın ham hex'leri palette birebir yok, aile korundu):
 * `mine` `#5f7a2c` = `ops-olive` birebir · `taken` `#8ea3b5`/`#6e8598` → `ops-blue-line`/`ops-blue`
 * (mavi ailesi = "bilgi, nötr bildirim"; başka rotada tanımlı olmak bir engel değil bir BİLGİdir) ·
 * `free` içi `#fbfbf9` = `ops-card` birebir, halkası `#a7ac9f` → `ops-gray-700` (pasif kademe).
 * İçi boş nokta "henüz kimsenin değil" der; dolu bir nokta ona sahiplik yüklerdi.
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
   * **BU KARARLA EKLENEN** (15.08) — zeytin dolgu, MOR çember.
   *
   * İki aile bilerek birleşti: dolgu "artık bu rotanın" der (`mine` ile aynı zeytin), çember
   * "asistanın önerisiydi" der (`suggested`in moru). Yarıçap `mine`'dan bir tık iri (9) çünkü bu
   * nokta operatörün AZ ÖNCE verdiği karardır — gözün ilk gideceği yer o olmalı; bölgenin yıllardır
   * taşıdığı kodla aynı ağırlıkta çizilseydi karar yine kalabalığın içinde kaybolurdu.
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
 * KALICI etiketin taşıdığı en fazla yerleşim adı (`OB-04`). Kalanı sayılır (`+2`), susturulmaz.
 *
 * İki değil de üç olmasının sebebi ölçüm: etiketler yalnız z13'ten sonra kalıcı ve o kademede
 * görüş alanında ~14 kod var (`FREE_CODE_MIN_ZOOM` tablosu) — üç ad haritayı örtmüyor. Üzerine
 * gelince açılan ipuçta tavan YOK; oradaki soru zaten "burası tam olarak neresi".
 */
const LABEL_MAX_PLACES = 3;

/**
 * Etiket — kod, yerleşim adları ve gerekçe **ayrı satırlarda**.
 *
 * Metin dizesi değil DOM kuruyor ve iki sebebi var. Birincisi kullanıcının gördüğü kusur (17.08):
 * her şey tek satırdaydı, çok yerleşimli bir kodda ad listesi uzayınca ipucu ekranı kesen bir şerit
 * hâline geliyor ve okunmuyordu — Leaflet'in kendi ipucu `white-space: nowrap` ile çiziliyor.
 * İkincisi güvenlik: satırların içinde veritabanından gelen yerleşim adları var; HTML dizesi kurup
 * `innerHTML`e vermek onları işaretleme olarak yorumlatırdı. `textContent` ile yazılan DOM'da böyle
 * bir kapı yok.
 *
 * **`permanent` yine iki farklı metin üretiyor** (`OB-04`): kalıcı etiket dar (üç ad), üzerine
 * gelince açılan ipucu TAM. Leaflet katman başına tek ipucu bağlıyor, yani ikisini aynı anda
 * taşıyamayız — ama gerek de yok: kalıcı etiket zaten hover'ın yerine geçiyor.
 */
/**
 * Künye ikonları — 24'lük kutuda tek `path`, `currentColor` ile boyanır.
 *
 * `components/operation/ui/icons.tsx`teki React ikonları BURADA kullanılamıyor: ipucu React
 * ağacının dışında, elle kurulan bir DOM. Bir React ağacını her ipucu için ayrıca boyamak, tek
 * `path` kopyalamaktan pahalı olurdu.
 */
/**
 * **ÇİZGİSEL, dolgulu değil** (17.08): ilk tur dolgu yollarla yazılmıştı ve 13 pikselde hepsi aynı
 * mor lekeye dönüştü — zil de torba da soru işareti de ayırt edilemiyordu. Çizgi, küçük boyda
 * biçimi korur; ikonun tek işi zaten "bu sayı neyin sayısı" demek.
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
     * Yakınlaştırma denetimi SOL ALTTA — üç köşe de dolu, dördüncüsü boş.
     *
     * Sağ üstteydi ve 17.08'de ölçülen bir çakışma çıkardı: Rotalar sekmesinde ray haritanın
     * üstüne yüzen bir panele dönünce denetim tam onun köşesine, "+ Rota" düğmesinin üzerine
     * bindi. Leaflet kendi denetimlerini `z-index: 1000`de çiziyor, panel 500'de — yani sıra
     * değil KONUM sorunuydu; z değeriyle oynamak düğmeleri bu kez panelin altına gömerdi.
     *
     * Kalan köşeler: sol üst lejant, alt orta ipucu şeridi, sağ alt OSM atıf yazısı (lisans
     * gereği görünür kalmalı). Sol alt hepsinde boş.
     */
    const map = L.map(box, {
      center: center ? [center.lat, center.lng] : [48.583, 7.75],
      zoom: 11,
      zoomControl: false,
      renderer: L.canvas(),
    });
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    // `className` tasarımın soluklaştırmasını taşıyor (`globals.css` → `.ops-map-tiles`): zemin
    // sönükleşir, noktalar öne çıkar. Raster olduğu için tek CSS filtresi yetiyor.
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: TILE_MAX_ZOOM, className: 'ops-map-tiles' }).addTo(map);
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
     * **Kap ölçüsü sonradan oturuyor.** Harita bir sekmenin içinde doğuyor ve kurulurken kabın
     * yüksekliği 0 olabiliyor; Leaflet ölçüyü bir kez okur. Gözlemci gerçeğe bağlıdır — tek
     * seferlik bir gecikme bir TAHMİNE bağlı olurdu. Ölçü oturunca görüş alanı da değişir, o
     * yüzden bildirim buradan da tetiklenir: ilk okuma yanlış bir kutuyla yapılmasın.
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
           * İçerik **FONKSİYON olarak** veriliyor ve bu bir üslup değil ölçülü bir tasarruf
           * (kullanıcı uyarısı 17.08): Leaflet fonksiyonu ipucu AÇILDIĞINDA çağırıyor, kurulurken
           * değil. Etiket bir metin dizesiyken bunun önemi yoktu; kart DOM'una dönünce her çizimde
           * **nokta sayısı kadar** kart (tavan 1200: svg + span'ler) kurulur olurdu — hepsi de
           * aynı anda en fazla BİRİ görünen kartlar. Şimdi yalnız üzerine gelinen nokta ödüyor.
           *
           * `labelsOn` (z ≥ 13) hâlinde ipuçları zaten açık olduğu için hepsi kurulur — ama o
           * yakınlıkta görüş alanında ~14 kod var (`FREE_CODE_MIN_ZOOM` tablosu), yani tavan 1200
           * değil bir avuç.
           *
           * Stil `globals.css`te (`.ops-map-tip`): içerik React ağacının dışında, ve renk/genişlik
           * Leaflet'in kendi kuralıyla eşit özgüllükte yarışmamalı.
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
   * **Taşıma emri** (`focus`) — ekran dışındaki bir öneriye tıklandığında harita oraya gider.
   *
   * Yakınlaşma `FREE_CODE_MIN_ZOOM`in altına DÜŞMEZ ve bu kritik: eşiğin altında boştaki kodlar hiç
   * çizilmiyor, yani uzaktan bakarken taşınan operatör gittiği yerde tam da aradığı noktayı
   * göremezdi. Zaten daha yakındaysa yakınlık korunur — emir "oraya bak" demek, "yakınlığını
   * sıfırla" değil.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.setView([focus.lat, focus.lng], Math.max(map.getZoom(), FREE_CODE_MIN_ZOOM), { animate: true });
  }, [focus]);

  /**
   * İpucu şeridi 2,6 sn sonra söner (tasarım). Ölçüt DEĞERİN kendisidir: art arda gelen iki AYNI
   * cümle sayaç sıfırlamaz — pratikte imkânsız, çünkü cümlenin içinde kodun kendisi geçiyor.
   */
  useEffect(() => {
    setVisibleHint(hint ?? null);
    if (!hint) return;
    const timer = setTimeout(() => setVisibleHint(null), 2600);
    return () => clearTimeout(timer);
  }, [hint]);

  return (
    /**
     * `isolate` = kendi katman kutusu, ve bu bir süsleme değil ÖLÇÜLMÜŞ bir arızanın çözümü
     * (17.08): Leaflet kendi panellerini `z-index: 400`, denetimlerini `1000` ile çiziyor. Bu
     * sayılar bir yalıtım olmadan sayfanın kökünde yarışıyordu — başlıktaki depo seçicisinin açılan
     * listesi `body`'ye portal edilip `z-[60]` ile çiziliyor, yani haritanın ALTINDA kalıyordu.
     *
     * `isolation: isolate` Leaflet'in bütün iç sayılarını bu kutunun içine hapsediyor: dışarıda
     * haritanın tek bir katmanı var, iç 1000'i artık kimseyle yarışmıyor. z değerlerini tek tek
     * büyütmek yerine burada durmasının sebebi bu — yarışı kazanmak değil, yarışı bitirmek.
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
