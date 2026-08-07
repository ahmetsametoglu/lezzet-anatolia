'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Chip } from '@/components/operation/ui/chip';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { PageHeader } from '@/components/operation/ui/page-header';
import { DeliveryTabs } from './delivery-tabs';
import { Input } from '@/components/operation/form/input';
import { FieldShell } from '@/components/operation/form/field-shell';
import { ToggleField } from '@/components/operation/form/toggle';
import { WEEKDAYS } from '@/components/operation/form/calendar-math';
import { ZoneMap, keyOfPoint, type ZoneCodeState, type ZoneMapPoint } from '@/components/operation/ui/zone-map';
import { num } from '@/components/operation/ui/format';
import { PostalCodePicker } from './postal-code-picker';
import { ROUTE_NOTES } from './deliveries-labels';
import type { RouteView, RoutesData } from './routes-read';
import type { Country } from '@lezzet/types';

/**
 * **Rotalar** — güzergâh kurulumu (19.20 · 09.15). `Depolar - Bolge Haritasi.html`.
 *
 * Diyalog DEĞİL, sayfanın kendisi: rota kurmak dar bir kutuya sığmaz — operatör haritayı kaydırır,
 * yakınlaşır, komşu güzergâhla karşılaştırır. 280 piksellik bir pencerede yapılan iş, yapılmamış iştir.
 *
 * Harita SOLDA ve baskın: kod listesi haritanın SONUCUDUR, girdisi değil (tasarım §"Kod hâlleri").
 */
interface RoutesViewProps {
  data: RoutesData;
  selected: RouteView | null;
  draft: { name: string; weekdays: number[]; isActive: boolean; codes: RouteView['postalCodes'] } | null;
  onSelect: (routeId: string | null) => void;
  onDraft: (patch: Partial<NonNullable<RoutesViewProps['draft']>>) => void;
  onPick: (point: ZoneMapPoint) => void;
  onSave: () => void;
  /** Kod aramasında ülke etiketini bastırmak için: kendi ülkemizin kodu sade yazılır. */
  homeCountry: Country;
  busy: boolean;
  error: string | null;
}

export function RoutesDesktop(props: RoutesViewProps) {
  const { data, selected, draft } = props;

  const mine = new Set((draft?.codes ?? []).map((code) => `${code.country}:${code.postalCode}`));
  const takenBy = new Map<string, string>();
  for (const route of data.routes) {
    if (route.id === selected?.id) continue;
    for (const code of route.postalCodes) takenBy.set(`${code.country}:${code.postalCode}`, route.name);
  }

  const stateOf = (point: ZoneMapPoint): ZoneCodeState =>
    mine.has(keyOfPoint(point)) ? 'mine' : takenBy.has(keyOfPoint(point)) ? 'taken' : 'free';

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Teslimat & Rota" subtitle="Dağıtım güzergâhları — kodlar, günler, harita">
        <DeliveryTabs value="routes" />
      </PageHeader>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_380px] overflow-hidden">
      {/* Harita her zaman çizilir — rota seçilmemişken bile tanımlı güzergâhların şekli görünür;
          boş bir gri kutu, ekranın ne işe yaradığını anlatmazdı. */}
      <div className="min-h-0 border-r border-ops-line">
        <ZoneMap points={data.points} stateOf={stateOf} onPick={props.onPick} />
      </div>

      <aside className="flex min-h-0 flex-col overflow-y-auto">
        <div className="flex items-center gap-2 border-b border-ops-line-soft px-4 py-2.5">
          <span className="font-ops-display text-ops-sm font-semibold text-ops-ink">Rotalar</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">{num(data.routes.length)}</span>
          <Button size="sm" variant="secondary" className="ml-auto" onClick={() => props.onSelect(null)}>
            + Rota
          </Button>
        </div>

        <ul className="border-b border-ops-line-soft">
          {data.routes.map((route) => (
            <li key={route.id}>
              <button
                type="button"
                onClick={() => props.onSelect(route.id)}
                className={`flex w-full flex-col gap-0.5 border-b border-ops-line-soft px-4 py-2 text-left transition-colors last:border-b-0 hover:bg-ops-subtle ${
                  route.id === selected?.id ? 'bg-ops-olive-bg' : ''
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="font-ops-body text-ops-base text-ops-ink">{route.name}</span>
                  {route.isActive ? null : <Badge tone="slate">Pasif</Badge>}
                </span>
                <span className="font-ops-body text-ops-xs text-ops-muted">
                  {route.warehouseName} · {num(route.postalCodes.length)} kod
                  {route.weekdays.length > 0 ? ` · ${route.weekdays.map((d) => WEEKDAYS[d - 1]).join(' ')}` : ' · gün yok'}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {draft ? (
          <div className="flex flex-col gap-3.5 px-4 py-3">
            <FieldShell label="Rota adı" required>
              <Input value={draft.name} onChange={(e) => props.onDraft({ name: e.target.value })} placeholder="Strasbourg Merkez" />
            </FieldShell>

            <FieldShell
              label="Teslim günleri"
              labelAside={draft.weekdays.length === 0 ? 'gün verilmezse bu rota dağıtıma çıkmaz' : undefined}
            >
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((label, i) => {
                  const iso = i + 1;
                  const on = draft.weekdays.includes(iso);
                  return (
                    <Chip
                      key={iso}
                      active={on}
                      onClick={() =>
                        props.onDraft({
                          weekdays: on ? draft.weekdays.filter((d) => d !== iso) : [...draft.weekdays, iso].sort((a, b) => a - b),
                        })
                      }
                    >
                      {label}
                    </Chip>
                  );
                })}
              </div>
            </FieldShell>

            <FieldShell label="Posta kodları" labelAside={`${draft.codes.length} kod`}>
              {/* Seçici EKLEME yolu, harita ÇIKARMA yolu — ikisi aynı listeyi besliyor. Seçiciyi
                  kaldırmak, kod eklenemeyen bir rota kurulumu bırakırdı. */}
              <PostalCodePicker
                codes={draft.codes}
                onChange={(codes) => props.onDraft({ codes })}
                homeCountry={props.homeCountry}
              />
            </FieldShell>

            {/* Ekleme kapısı gelene kadar bu cümle duruyor: eksik olanı GİZLEMEK, operatöre
                "harita bozuk" dedirtirdi. */}
            <p className="rounded-ops-btn border border-ops-line bg-ops-surface-sunken px-3 py-2 font-ops-body text-ops-xs leading-[1.55] text-ops-muted">
              {ROUTE_NOTES.addPending}
            </p>

            {props.error ? (
              <p className="rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
                {props.error}
              </p>
            ) : null}

            <div className="flex items-center gap-3">
              <ToggleField on={draft.isActive} onChange={(on) => props.onDraft({ isActive: on })} label="Rota aktif" bare />
              <Button
                variant="primary"
                className="ml-auto"
                onClick={props.onSave}
                disabled={props.busy || draft.name.trim().length === 0}
              >
                Kaydet
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState title="Rota seçin" description={ROUTE_NOTES.pickRoute} />
        )}
        </aside>
      </div>
    </div>
  );
}
