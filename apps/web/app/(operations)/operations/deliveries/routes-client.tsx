'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  FREE_CODE_MIN_ZOOM,
  keyOfPoint,
  type MapViewport,
  type ZoneMapPoint,
} from '@/components/operation/ui/zone-map-model';
import { saveZoneAction } from './routes-actions';
import { RoutesDesktop } from './routes.desktop';
import { ROUTE_NOTES } from './deliveries-labels';
import type { RoutesData, RouteView } from './routes-read';
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
export function RoutesClient({ data, routeId, warehouseId }: { data: RoutesData; routeId: string | null; warehouseId: string | null }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Tıklamanın kısa geri bildirimi (tasarımın `hint` şeridi). `error`den AYRI: biri olanı anlatır,
  // öteki olmayanı — ikisini tek alanda toplamak, bir eklemeyi hata gibi kırmızıya boyardı.
  const [hint, setHint] = useState<string | null>(null);
  // Haritanın görüş alanı. Bugün yalnız lejant satırını belirliyor; "boşta" kod okuması gelince
  // isteğin kendisi de bundan doğacak (`arka-uc-harita-icin-posta-kodu-okumasi`).
  const [viewport, setViewport] = useState<MapViewport | null>(null);

  const selected: RouteView | null = routeId ? (data.routes.find((route) => route.id === routeId) ?? null) : null;
  // Kod aramasında ülke etiketi yalnız YABANCI kod için basılır; "kendi ülkemiz" seçili rotanın
  // deposundan gelir, yeni rotada adresten ya da tek depodan.
  const home = data.warehouses.find((w) => w.id === (selected?.warehouseId ?? warehouseId)) ?? data.warehouses[0];
  // Taslak seçili rotadan doğar; `key` ile bileşen yeniden kurulduğu için seçim değişince tazelenir.
  const [draft, setDraft] = useState<Draft | null>(
    selected
      ? { name: selected.name, weekdays: selected.weekdays, isActive: selected.isActive, codes: selected.postalCodes }
      : { name: '', weekdays: [], isActive: true, codes: [] },
  );

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
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  // Harita ilk kez `zoom: 11` ile doğuyor; ilk `moveend` gelene kadar eşiğin ÜSTÜNDE saymak doğru
  // olan — aksi hâlde ekran bir an "yakınlaşın" deyip sonra kendi kendine düzelirdi.
  const zoom = viewport?.zoom ?? FREE_CODE_MIN_ZOOM;
  const tooFar = zoom < FREE_CODE_MIN_ZOOM;

  return (
    <RoutesDesktop
      tooFar={tooFar}
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
    />
  );
}
