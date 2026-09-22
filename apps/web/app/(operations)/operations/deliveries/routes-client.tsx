'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  FREE_CODE_MIN_ZOOM,
  keyOfPoint,
  type MapViewport,
  type ZoneMapPoint,
} from '@/components/operation/ui/zone-map-model';
import { placesLabel } from '@/components/operation/ui/labels';
import { readMapCodesAction, saveZoneAction } from './routes-actions';
import { RoutesDesktop } from './routes.desktop';
import { ROUTE_NOTES } from './deliveries-labels';
import type { RoutesData, RouteView } from './routes-read';
import type { PostalCodePick } from './routes-types';
import { DAY_HOUR_KEYS, type DayHourKey } from '@/lib/settings/day-hours';
import type { Country } from '@lezzet/types';

/** Sönen ipucu bandının taşıdığı en fazla yerleşim adı: bant kısa görünür, tam listeyi haritanın ipucu verir. */
const HINT_MAX_PLACES = 2;

/**
 * Kaydedilecek saat farkı: değişmeyen istisna yeniden yazılmaz, yoksa "bu saati kim değiştirdi" izi rotayı son
 * kaydedeni gösterirdi. `null` yalnız gerçekten var olan istisna için gönderilir.
 */
function hoursPatch(
  draft: Partial<Record<DayHourKey, string | null>>,
  saved: Partial<Record<DayHourKey, string>>,
): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  for (const key of DAY_HOUR_KEYS) {
    const next = draft[key];
    const before = saved[key];
    if (next === undefined) continue;
    if (next === null) {
      if (before !== undefined) patch[key] = null;
      continue;
    }
    if (next !== before) patch[key] = next;
  }
  return patch;
}

interface Draft {
  name: string;
  /**
   * Güzergâhın çıkacağı depo taslağın alanıdır, çünkü çok depolu kurulumda operatör bu formdan depo seçebilmeli.
   * `null` = henüz seçilmedi; seçicinin yer tutucusunu ancak `null` doğru gösterir.
   */
  warehouseId: string | null;
  weekdays: number[];
  isActive: boolean;
  codes: PostalCodePick[];
  /**
   * Rotaya özel eşik saatleri üç hâl taşır: anahtar yok = dokunulmadı, `string` = yazılacak, `null` = istisna kalkacak.
   * Üçüncü hâl olmasaydı "genele dön" kaydetmede hiç gitmez, eski saat sessizce yaşardı.
   */
  hours: Partial<Record<DayHourKey, string | null>>;
}

/**
 * Rota kurulumunun istemci kökü. Seçili rota adreste durur (paylaşılabilir, Depolar'dan köprü açabilir); taslak
 * adreste durmaz, geri düğmesi yarım bir rotayı geri getirmemeli.
 */
export function RoutesClient({
  data,
  routeId,
  warehouseId,
  contextWarehouseId,
}: {
  data: RoutesData;
  routeId: string | null;
  warehouseId: string | null;
  /** Başlıktaki depo bağlamı (`null` = tüm depolar); yalnız seçicinin listesini daraltır, haritaya dokunmaz. */
  contextWarehouseId: string | null;
  /** Asistan önerisinden gelindiyse ön dolgu (22.5); `null` ise ekran hiç değişmez. */
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Tıklamanın kısa geri bildirimi `error`den ayrı: biri olanı anlatır, öteki olmayanı; eklemeyi kırmızıya boyamasın.
  const [hint, setHint] = useState<string | null>(null);
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  /**
   * Görüş alanındaki BOŞTA kodlar. `null` = henüz okunmadı — boş dizi "hiç yok" demek ve ikisi aynı
   * şey değil (`CLAUDE §1`); lejant da bu ikisini ayrı cümleyle söylüyor.
   */
  const [freePoints, setFreePoints] = useState<ZoneMapPoint[] | null>(null);
  const [truncated, setTruncated] = useState(false);

  const selected: RouteView | null = routeId ? (data.routes.find((route) => route.id === routeId) ?? null) : null;
  /**
   * Taslak seçili rotadan doğar; `key` ile bileşen seçim değişince yeniden kurulur. Öneriden gelindiyse kodlar üstüne
   * eklenir, yerine geçmez: ekleme önerisi operatörün haberi olmadan rotadan kod düşürmemeli.
   */
  const [draft, setDraft] = useState<Draft | null>(() => {
    const base = selected
      ? {
          name: selected.name,
          warehouseId: selected.warehouseId as string | null,
          weekdays: selected.weekdays,
          isActive: selected.isActive,
          codes: selected.postalCodes,
          // Yalnız VAR OLAN istisnalar; genel değeri okuyan eşikler burada yok ve olmamalı
          // (`routes-read.exceptionsOf` künyesi).
          hours: { ...selected.hours },
        }
      : {
          name: '',
          /** Yeni rotanın açılış deposu bir öneridir: adresteki depo ya da tek depo; ikisi de yoksa `null` ve seçici bunu söyler. */
          warehouseId: warehouseId ?? (data.warehouses.length === 1 ? (data.warehouses[0]?.id ?? null) : null),
          weekdays: [],
          isActive: true,
          codes: [] as PostalCodePick[],
          // Yeni rota genel saatlerle doğar: dördünü de istisna olarak yazmak, operatörün vermediği
          // bir kararı veriye geçirmek olurdu.
          hours: {} as Partial<Record<DayHourKey, string | null>>,
        };
    return base;
  });

  /**
   * Kod aramasında ülke etiketi yalnız yabancı kod için basılır; "kendi ülkemiz" taslaktaki depodan gelir, ki depo
   * değişince etiket de değişsin.
   */
  const home = data.warehouses.find((w) => w.id === draft?.warehouseId) ?? data.warehouses[0];

  const select = (id: string | null) => {
    setError(null);
    setHint(null);
    router.push(`/operations/deliveries?tab=routes${id ? `&route=${id}` : ''}`);
  };

  /**
   * Koda dokunma: benim → çıkar · başka rotada → çıkarılamaz, kimin tuttuğu yazılır · boşta → ekle. Üçüncü dal
   * yanlışlıkla çıkarılan kodu geri koyar; sessiz tıklama operatöre "bozuk" derdi.
   */
  const pick = (point: ZoneMapPoint) => {
    if (!draft) return;
    const key = keyOfPoint(point);
    setError(null);

    if (draft.codes.some((code) => keyOfPoint(code) === key)) {
      setDraft({ ...draft, codes: draft.codes.filter((code) => keyOfPoint(code) !== key) });
      setHint(ROUTE_NOTES.removed(point.postalCode, placesLabel(point.places ?? [], HINT_MAX_PLACES) ?? undefined));
      return;
    }

    const holder = data.routes.find(
      (route) => route.id !== routeId && route.postalCodes.some((code) => keyOfPoint(code) === key),
    );
    if (holder) {
      setHint(null);
      setError(
        `${point.postalCode} eklenemez — ${holder.name} rotasında tanımlı. Bir kod tek rotada olabilir; taşımak için önce oradan çıkarın.`,
      );
      return;
    }

    setDraft({ ...draft, codes: [...draft.codes, { country: point.country, postalCode: point.postalCode }] });
    setHint(ROUTE_NOTES.added(point.postalCode, placesLabel(point.places ?? [], HINT_MAX_PLACES) ?? undefined));
  };

  const save = () => {
    if (!draft) return;
    /**
     * Depo taslaktan gelir; düğme depo seçilmeden zaten kapalı, bu guard taslağı başka bir yol kurarsa deposuz
     * kaydı durdurmak için son çaredir.
     */
    const targetWarehouse = draft.warehouseId;
    if (!targetWarehouse) {
      setError('Bu rotanın hangi depodan çıkacağı seçilmedi — yukarıdaki "Çıkış deposu" alanından seçin.');
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await saveZoneAction({
        id: selected?.id,
        warehouseId: targetWarehouse,
        name: draft.name,
        weekdays: draft.weekdays,
        isActive: draft.isActive,
        postalCodes: draft.codes,
        hours: hoursPatch(draft.hours, selected?.hours ?? {}),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      // Yeni rota kaydedilince form onu seçer; seçmeseydi ikinci Kaydet aynı kodlarla ikinci bir rota açmaya çalışırdı.
      if (!selected && result.data) {
        select(result.data.id);
        return;
      }
      router.refresh();
    });
  };

  // Harita ilk kez `zoom: 11` ile doğuyor; ilk `moveend` gelene kadar eşiğin ÜSTÜNDE saymak doğru
  // olan — aksi hâlde ekran bir an "yakınlaşın" deyip sonra kendi kendine düzelirdi.
  const zoom = viewport?.zoom ?? FREE_CODE_MIN_ZOOM;
  const tooFar = zoom < FREE_CODE_MIN_ZOOM;

  /**
   * Görüş alanındaki boştaki kodların okuması: eşiğin altında istek atılmaz (noktalar tıklanamaz olur), `latest`
   * damgası geç dönen eski cevabın yenisini ezmesini önler.
   */
  const latestRequest = useRef(0);
  useEffect(() => {
    if (!viewport || viewport.zoom < FREE_CODE_MIN_ZOOM) {
      setFreePoints(null);
      setTruncated(false);
      return;
    }
    const stamp = ++latestRequest.current;
    void readMapCodesAction({
      minLat: viewport.minLat,
      maxLat: viewport.maxLat,
      minLng: viewport.minLng,
      maxLng: viewport.maxLng,
    }).then((result) => {
      if (stamp !== latestRequest.current) return;
      if (!result.data) {
        // Okuma düştü: elde veri YOK demek, "boşta kod yok" demek değil — `null` bırakılıyor.
        setFreePoints(null);
        setTruncated(false);
        return;
      }
      setFreePoints(
        result.data.points.map((point) => ({
          country: point.country,
          postalCode: point.postalCode,
          lat: point.lat,
          lng: point.lng,
          places: point.places,
        })),
      );
      setTruncated(result.data.truncated);
    });
  }, [viewport]);

  return (
    <RoutesDesktop
      tooFar={tooFar}
      freePoints={freePoints}
      truncated={truncated}
      data={data}
      contextWarehouseId={contextWarehouseId}
      selected={selected}
      draft={draft}
      onSelect={select}
      onDraft={(patch) => setDraft((current) => (current ? { ...current, ...patch } : current))}
      onPick={pick}
      onSave={save}
      onViewport={setViewport}
      viewport={viewport}
      hint={hint}
      homeCountry={(home?.countryCode ?? 'FR') as Country}
      busy={busy}
      error={error}
    />
  );
}
