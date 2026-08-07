'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ZoneMapPoint } from '@/components/operation/ui/zone-map';
import { saveZoneAction } from './routes-actions';
import { RoutesDesktop } from './routes.desktop';
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
    router.push(`/operations/deliveries?tab=routes${id ? `&route=${id}` : ''}`);
  };

  /**
   * Haritadaki (ya da çipteki) bir koda dokunma. **Yalnız KENDİ kodunu çıkarır.** Başka rotanın
   * tuttuğu koda tıklamak bir işlem değil bir SORUDUR ("kim tutuyor?") ve cevabı yazılır — sessizce
   * hiçbir şey yapmayan tıklama operatöre "bozuk" der.
   */
  const pick = (point: ZoneMapPoint) => {
    if (!draft) return;
    const key = `${point.country}:${point.postalCode}`;
    if (draft.codes.some((code) => `${code.country}:${code.postalCode}` === key)) {
      setDraft({ ...draft, codes: draft.codes.filter((code) => `${code.country}:${code.postalCode}` !== key) });
      setError(null);
      return;
    }
    const holder = data.routes.find(
      (route) => route.id !== routeId && route.postalCodes.some((code) => `${code.country}:${code.postalCode}` === key),
    );
    setError(
      holder
        ? `${point.postalCode} eklenemez — ${holder.name} rotasında tanımlı. Bir kod tek rotada olabilir; taşımak için önce oradan çıkarın.`
        : null,
    );
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

  return (
    <RoutesDesktop
      data={data}
      selected={selected}
      draft={draft}
      onSelect={select}
      onDraft={(patch) => setDraft((current) => (current ? { ...current, ...patch } : current))}
      onPick={pick}
      onSave={save}
      homeCountry={(home?.countryCode ?? 'FR') as Country}
      busy={busy}
      error={error}
    />
  );
}
