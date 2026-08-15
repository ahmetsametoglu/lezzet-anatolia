'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { placesLabel } from './labels';
import type { ZoneCodeState, ZoneMapPoint, ZoneMapProps } from './zone-map-model';

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
    const olive = token('--color-ops-olive', '#5f7a2c');
    return { radius: 8, color: olive, weight: 2.5, fillColor: olive, fillOpacity: 1 };
  }
  // ÖNERİ mor ailesindedir ve bu bir tercih değil, envanterin kendi tanımı: `--color-ops-violet-bg`
  // künyesinde "öneri kutusu" yazıyor. Yarıçap "benim" ile aynı (8): öneri de bir DAVETTİR, boştaki
  // kodun sessizliği değil — göz onu tanımlı kodlarla aynı ağırlıkta görmeli.
  if (state === 'suggested') {
    return {
      radius: 8,
      color: token('--color-ops-violet', '#5a4a8a'),
      weight: 2.5,
      fillColor: token('--color-ops-violet-dot', '#6a5acd'),
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
      color: token('--color-ops-violet', '#5a4a8a'),
      weight: 3,
      fillColor: token('--color-ops-olive', '#5f7a2c'),
      fillOpacity: 1,
    };
  }
  if (state === 'taken') {
    return {
      radius: 7,
      color: token('--color-ops-blue', '#3a6b8a'),
      weight: 2,
      fillColor: token('--color-ops-blue-line', '#bcd0e0'),
      fillOpacity: 1,
    };
  }
  return {
    radius: 6.5,
    color: token('--color-ops-gray-700', '#b3b7ac'),
    weight: 2,
    fillColor: token('--color-ops-card', '#fbfbf9'),
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
 * Etiket metni — ad varsa kodla birlikte, yoksa yalnız kod; gerekçe varsa arkasına.
 *
 * Gerekçe ÜZERİNE GELİNCE okunuyor ve bu bilinçli: haritada kalıcı olarak yazılsaydı önerilen her
 * noktanın yanında bir cümle dururdu ve harita okunmaz olurdu. Soru sırayla geliyor — önce "nerede",
 * sonra "neden".
 *
 * **`permanent` iki farklı metin üretiyor** (`OB-04`): kalıcı etiket dar (üç ad), üzerine gelince
 * açılan ipucu TAM. Leaflet katman başına tek ipucu bağlıyor, yani ikisini aynı anda taşıyamayız —
 * ama gerek de yok: kalıcı etiket zaten hover'ın yerine geçiyor, dolayısıyla her yakınlıkta
 * operatörün gördüğü metin o anki soruya uygun oluyor.
 */
function labelOf(point: ZoneMapPoint, permanent: boolean): string {
  const where = placesLabel(point.places ?? [], permanent ? LABEL_MAX_PLACES : undefined);
  const head = where ? `${point.postalCode} · ${where}` : point.postalCode;
  return point.note ? `${head} — ${point.note}` : head;
}

export function ZoneMapLeaflet({ points, stateOf, onPick, onViewport, note, hint, center, className }: ZoneMapProps) {
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

    // Yakınlaştırma denetimi SAĞ ÜSTTE (tasarım): sol üst lejanta ayrıldı ve iki kutu üst üste binerdi.
    const map = L.map(box, {
      center: center ? [center.lat, center.lng] : [48.583, 7.75],
      zoom: 11,
      zoomControl: false,
      renderer: L.canvas(),
    });
    L.control.zoom({ position: 'topright' }).addTo(map);
    // `className` tasarımın soluklaştırmasını taşıyor (`globals.css` → `.ops-map-tiles`): zemin
    // sönükleşir, noktalar öne çıkar. Raster olduğu için tek CSS filtresi yetiyor.
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 18, className: 'ops-map-tiles' }).addTo(map);
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
          .bindTooltip(labelOf(point, labelsOn), { permanent: labelsOn, direction: 'right', offset: [9, 0] })
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
    <div className={`relative h-full w-full ${className ?? ''}`}>
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
