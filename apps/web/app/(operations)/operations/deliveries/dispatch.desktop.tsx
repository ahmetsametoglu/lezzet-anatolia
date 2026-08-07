'use client';

import { EmptyState } from '@/components/operation/ui/empty-state';
import { PageHeader } from '@/components/operation/ui/page-header';
import { DeliveryTabs } from './delivery-tabs';
import { AssignBar, DayPicker, DaySummary, ShippingSection, ZoneGroup } from './dispatch-sections';
import { DISPATCH_NOTES } from './deliveries-labels';
import { dayLabel } from './deliveries-url';
import type { DispatchViewProps } from './dispatch-types';

// Sevkiyatçının gün planı — MASAÜSTÜ.
//
// Kuryenin dalı dar sütunda (560 px), bu dal TAM GENİŞLİKTE ve sebebi aynı: içerik neyi istiyorsa o.
// Kurye tek durağa bakar, sevkiyatçı günün tamamına — bölge grupları, atama durumu ve kargo listesi
// yan yana okunmak zorunda.

export function DispatchDesktop(props: DispatchViewProps) {
  const { day, busy, error } = props;
  const empty = day.zones.length === 0 && day.shipping.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Teslimat & Rota" subtitle={`${dayLabel(day.date, day.today)} · günün çıkışları`}>
        <DeliveryTabs value="plan" />
      </PageHeader>

      <DayPicker day={day} onDate={props.onDate} />
      <DaySummary day={day} />
      <AssignBar day={day} selected={props.selected} onAssign={props.onAssign} busy={busy} />

      {error ? (
        <p className="mx-6 mt-3 rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
          {error}
        </p>
      ) : null}

      {empty ? (
        <EmptyState title="Bu güne çıkış yok" description={DISPATCH_NOTES.emptyDay} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {day.zones.map((zone) => (
            <ZoneGroup
              key={zone.id || 'orphan'}
              zone={zone}
              selected={props.selected}
              onToggle={props.onToggle}
              onSelectZone={props.onSelectZone}
              moveDates={day.moveDatesByZone[zone.id] ?? []}
              onMove={props.onMove}
              busy={busy}
            />
          ))}
          {/* Bir tür hiç yoksa o bölüm sessizce yer kaplamaz (tasarım §4). */}
          {day.shipping.length > 0 ? (
            <ShippingSection stops={day.shipping} truncated={day.shippingTruncated} />
          ) : null}
        </div>
      )}
    </div>
  );
}
