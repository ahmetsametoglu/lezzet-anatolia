'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  FREE_CODE_MIN_ZOOM,
  keyOfPoint,
  type MapViewport,
  type ZoneMapPoint,
} from '@/components/operation/ui/zone-map-model';
import { readMapCodesAction, saveZoneAction } from './routes-actions';
import { RoutesDesktop } from './routes.desktop';
import { ROUTE_NOTES } from './deliveries-labels';
import type { RoutesData, RouteView } from './routes-read';
import type { ZoneHandoff } from './routes-handoff';
import type { PostalCodePick } from './routes-types';
import type { Country } from '@lezzet/types';

interface Draft {
  name: string;
  weekdays: number[];
  isActive: boolean;
  codes: PostalCodePick[];
}

/**
 * Rota kurulumunun istemci kökü (19.20).
 *
 * **Seçili rota ADRESTE** (`?tab=routes&route=<id>`): bir güzergâhın bağlantısı paylaşılabilmeli ve
 * Depolar'dan gelen köprü doğrudan o rotayı açabilmeli. Taslak (yazılan ad, işaretlenen gün, atılan
 * kod) adreste DEĞİL — o bir işlemin yarısıdır; geri düğmesi yarım bir rotayı geri getirmemeli.
 */
export function RoutesClient({
  data,
  routeId,
  warehouseId,
  handoff = null,
}: {
  data: RoutesData;
  routeId: string | null;
  warehouseId: string | null;
  /** Asistan önerisinden gelindiyse ön dolgu (22.5); `null` ise ekran hiç değişmez. */
  handoff?: ZoneHandoff | null;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Tıklamanın kısa geri bildirimi (tasarımın `hint` şeridi). `error`den AYRI: biri olanı anlatır,
  // öteki olmayanı — ikisini tek alanda toplamak, bir eklemeyi hata gibi kırmızıya boyardı.
  const [hint, setHint] = useState<string | null>(null);
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  /**
   * Görüş alanındaki BOŞTA kodlar. `null` = henüz okunmadı — boş dizi "hiç yok" demek ve ikisi aynı
   * şey değil (`CLAUDE §1`); lejant da bu ikisini ayrı cümleyle söylüyor.
   */
  const [freePoints, setFreePoints] = useState<ZoneMapPoint[] | null>(null);
  const [truncated, setTruncated] = useState(false);

  const selected: RouteView | null = routeId ? (data.routes.find((route) => route.id === routeId) ?? null) : null;
  // Kod aramasında ülke etiketi yalnız YABANCI kod için basılır; "kendi ülkemiz" seçili rotanın
  // deposundan gelir, yeni rotada adresten ya da tek depodan.
  const home = data.warehouses.find((w) => w.id === (selected?.warehouseId ?? warehouseId)) ?? data.warehouses[0];
  /**
   * Taslak seçili rotadan doğar; `key` ile bileşen yeniden kurulduğu için seçim değişince tazelenir.
   *
   * **Öneriden gelindiyse kodlar ÜSTÜNE eklenir, yerine geçmez** — `zone_extend` bir EKLEME
   * önerisidir; mevcut kümeyi önerininkiyle değiştirmek, kaydetmeye basan operatörün haberi olmadan
   * rotadan kod düşürürdü (uygulayıcının kendi kuralı da bu: *"önce okur, üstüne ekler — 'ekle'
   * sessizce 'değiştir' olmasın"*). Zaten var olan kod ikinci kez eklenmiyor.
   */
  const [draft, setDraft] = useState<Draft | null>(() => {
    const base = selected
      ? { name: selected.name, weekdays: selected.weekdays, isActive: selected.isActive, codes: selected.postalCodes }
      : { name: handoff?.zoneName ?? '', weekdays: [], isActive: true, codes: [] as PostalCodePick[] };
    if (!handoff) return base;
    const have = new Set(base.codes.map((code) => `${code.country}:${code.postalCode}`));
    const added = handoff.codes.filter((code) => !have.has(`${code.country}:${code.postalCode}`));
    return { ...base, codes: [...base.codes, ...added] };
  });

  const select = (id: string | null) => {
    setError(null);
    setHint(null);
    router.push(`/operations/deliveries?tab=routes${id ? `&route=${id}` : ''}`);
  };

  /**
   * Haritadaki (ya da çipteki) bir koda dokunma — tasarımın tek etkileşimi: *"noktaya tıkla →
   * ekle / çıkar."*
   *
   * Üç dal, üç kod hâline birebir karşılık geliyor:
   * **benim** → çıkar · **başka rotada** → çıkarılamaz, kimin tuttuğu yazılır · **boşta** → ekle.
   *
   * Üçüncü dal bugün de ULAŞILABİLİR ve bu önemli: operatör kendi kodunu çıkardığında nokta
   * "boşta"ya döner ve aynı noktaya ikinci kez tıklamak onu geri getirmelidir. O dal olmasaydı
   * yanlışlıkla çıkarılan bir kod geri konulamaz, tıklama sessizce hiçbir şey yapmazdı — ki
   * sessiz tıklama operatöre "bozuk" der.
   */
  const pick = (point: ZoneMapPoint) => {
    if (!draft) return;
    const key = keyOfPoint(point);
    setError(null);

    if (draft.codes.some((code) => keyOfPoint(code) === key)) {
      setDraft({ ...draft, codes: draft.codes.filter((code) => keyOfPoint(code) !== key) });
      setHint(ROUTE_NOTES.removed(point.postalCode, point.place));
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
    setHint(ROUTE_NOTES.added(point.postalCode, point.place));
  };

  const save = () => {
    if (!draft) return;
    // Yeni rotanın deposu ADRESTEN gelir (Depolar'dan köprüyle) ya da tek depo varsa odur; iki depolu
    // kurulumda seçimsiz kaydetmek, güzergâhı yanlış tesise bağlardı.
    const targetWarehouse = selected?.warehouseId ?? warehouseId ?? (data.warehouses.length === 1 ? data.warehouses[0]!.id : null);
    if (!targetWarehouse) {
      setError('Bu rotanın hangi depodan çıkacağı belli değil — Depolar sayfasından depoyu seçip "Rota ekle" ile gelin.');
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
        // Öneriden gelindiyse kuyruk satırı bu kayıtla birlikte kapanır (`withProposal`). Elle
        // kurulumda alan hiç gitmez ve akış değişmez.
        proposalId: handoff?.proposalId,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      // Öneri kapandıysa adresten de düşer: sayfa yenilenince aynı öneri ikinci kez ön dolgu
      // yapmamalı — satır artık `pending` değil, `readZoneHandoff` zaten `null` dönerdi ama adreste
      // ölü bir parametre bırakmak da bir sonraki paylaşımda kafa karıştırırdı.
      if (handoff) {
        router.replace(`/operations/deliveries?tab=routes&route=${selected?.id ?? handoff.zoneId}`);
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
   * **Görüş alanı okuması** — haritanın boştaki kodları çizebilmesinin tek yolu (19.20).
   *
   * Eşiğin ALTINDA istek atılmıyor: o yakınlıkta noktalar birbirine değip tıklanamaz hâle geliyor
   * (ölçüm `FREE_CODE_MIN_ZOOM` künyesinde), yani getirilen veri kullanılamazdı. Kaydırma zaten
   * haritada 250 ms geciktiriliyor; burada ikinci bir gecikme yok.
   *
   * Yarış koşulu: iki kaydırma arka arkaya yapıldığında ikinci istek daha önce dönebilir ve eski
   * cevap yenisini ezerdi. `latest` damgası son isteğin dışındaki cevapları atıyor.
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
          place: point.place ?? undefined,
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
      selected={selected}
      draft={draft}
      onSelect={select}
      onDraft={(patch) => setDraft((current) => (current ? { ...current, ...patch } : current))}
      onPick={pick}
      onSave={save}
      onViewport={setViewport}
      hint={hint}
      homeCountry={(home?.countryCode ?? 'FR') as Country}
      busy={busy}
      error={error}
      handoff={handoff}
    />
  );
}
