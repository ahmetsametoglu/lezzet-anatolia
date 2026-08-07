'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { AnchoredMenu } from '@/components/operation/ui/anchored-menu';
import { Badge } from '@/components/operation/ui/badge';
import { Chip } from '@/components/operation/ui/chip';
import { money, num } from '@/components/operation/ui/format';
import { CARRIER_LABEL, DISPATCH_NOTES, PREP_VIEW } from './deliveries-labels';
import { dayLabel, shiftDay } from './deliveries-url';
import type { DispatchDayView, DispatchStopView, DispatchZoneView } from './dispatch-types';

// Sevkiyatçının gün planının blokları (09.15).
//
// ⚠ **Duraklar arası SIRA çizilmiyor** (tasarım §6): sistem sırayı bilmiyor (rota optimizasyonu
// ileriki faz). Numaralı bir liste, olmayan bir yeteneği ima ederdi — kurye ekranındaki numara ise
// "kaçıncı duraktayım" sayacıdır, bir rota sırası değil.

/** Günün özeti — araç çıkmadan önceki son kontrol; tek bakışta okunmalı (tasarım §2). */
export function DaySummary({ day }: { day: DispatchDayView }) {
  const { summary } = day;
  return (
    <div className="flex flex-wrap items-stretch gap-5 border-b border-ops-line-soft bg-ops-surface-sunken px-6 py-3">
      <Figure label="Çıkış" value={num(summary.total)} />
      <Figure
        label="Hazır"
        value={`${num(summary.ready)}/${num(summary.total)}`}
        tone={summary.ready < summary.total ? 'amber' : undefined}
      />
      <Figure
        label="Atanmamış"
        value={num(summary.unassigned)}
        tone={summary.unassigned > 0 ? 'amber' : undefined}
      />
      {summary.doorCount > 0 ? (
        <Figure label="Kapıda tahsilat" value={money(summary.doorCents)} hint={`${num(summary.doorCount)} siparişte`} />
      ) : null}
      {/* Kesim saati burada DEĞİŞTİRİLMEZ (ayarların işi) — yalnız etkisi görünür. */}
      <div className="ml-auto flex max-w-[300px] items-center">
        <p
          className={`font-ops-body text-ops-xs leading-[1.5] ${day.cutoff.settled ? 'text-ops-olive-dark' : 'text-ops-muted'}`}
        >
          {day.cutoff.settled ? DISPATCH_NOTES.settled : DISPATCH_NOTES.open(day.cutoff.time)}
        </p>
      </div>
    </div>
  );
}

function Figure({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'amber' }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
        {label}
      </span>
      <span
        className={`whitespace-nowrap font-ops-mono text-ops-section tracking-tight ${tone === 'amber' ? 'text-ops-amber-dark' : 'text-ops-ink'}`}
      >
        {value}
      </span>
      {hint ? <span className="font-ops-body text-ops-micro text-ops-faint">{hint}</span> : null}
    </div>
  );
}

/** Gün seçici — dün / bugün / yarın ve iki gün ilerisi. Sayfa gün üzerine kurulu (tasarım §2). */
export function DayPicker({ day, onDate }: { day: DispatchDayView; onDate: (date: string) => void }) {
  const offsets = [-1, 0, 1, 2];
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-ops-line-soft px-6 py-2.5">
      {offsets.map((offset) => {
        const date = shiftDay(day.today, offset);
        return (
          <Chip key={date} active={date === day.date} onClick={() => onDate(date)}>
            {dayLabel(date, day.today)}
          </Chip>
        );
      })}
      {/* Seçili gün bu dörtlünün dışındaysa kaybolmaz — kendi çipiyle görünür. */}
      {offsets.every((offset) => shiftDay(day.today, offset) !== day.date) ? (
        <Chip active onClick={() => onDate(day.date)}>
          {dayLabel(day.date, day.today)}
        </Chip>
      ) : null}
    </div>
  );
}

/**
 * **Toplu atama çubuğu.** Seçim varken belirir; seçim yokken hiç çizilmez — boş bir eylem çubuğu
 * "bir şey yapabilirsin" der ve yapamazsın.
 */
export function AssignBar({
  day,
  selected,
  onAssign,
  busy,
}: {
  day: DispatchDayView;
  selected: string[];
  onAssign: (courierId: string | null) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  if (selected.length === 0) return null;

  return (
    <div className="flex items-center gap-3 border-b border-ops-olive-line bg-ops-olive-bg px-6 py-2.5">
      <span className="font-ops-body text-ops-sm text-ops-olive-dark">{num(selected.length)} sipariş seçildi</span>
      <div ref={anchorRef} className="ml-auto inline-flex">
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen((current) => !current)}
          className="cursor-pointer rounded-ops-btn bg-ops-ink px-3 py-1.5 font-ops-display text-ops-xs font-semibold text-ops-card transition-colors hover:bg-ops-ink-hover disabled:opacity-50"
        >
          Kurye ata ▾
        </button>
      </div>
      <AnchoredMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={220}>
        {day.couriers.map((courier) => (
          <MenuRow
            key={courier.id}
            label={courier.name}
            onClick={() => {
              onAssign(courier.id);
              setOpen(false);
            }}
          />
        ))}
        {/* Atamayı kaldırmak da bir karar: yanlış kuryeye düşen günü geri almanın yolu olmalı. */}
        <MenuRow
          label="Atamayı kaldır"
          onClick={() => {
            onAssign(null);
            setOpen(false);
          }}
        />
      </AnchoredMenu>
    </div>
  );
}

function MenuRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer px-[13px] py-2.5 text-left font-ops-body text-ops-base text-ops-strong transition-colors hover:bg-ops-subtle"
    >
      {label}
    </button>
  );
}

/** Rota bölümü — bölge bazında gruplu. Bölge TANIMI burada değişmez, Depolar'a köprü verilir. */
export function ZoneGroup({
  zone,
  selected,
  onToggle,
  onSelectZone,
  moveDates,
  onMove,
  busy,
}: {
  zone: DispatchZoneView;
  selected: string[];
  onToggle: (orderId: string) => void;
  onSelectZone: (zoneId: string) => void;
  moveDates: string[];
  onMove: (orderId: string, date: string) => void;
  busy: boolean;
}) {
  const allSelected = zone.stops.every((stop) => selected.includes(stop.orderId));
  // Bölgenin kuryesi: tasarım grubu tek kuryeyle anıyor. Karışıksa uydurmuyoruz — "karışık" demek,
  // rastgele birini yazıp öbür duraklara yanlış kurye göstermekten dürüsttür.
  const couriers = new Set(zone.stops.map((stop) => stop.courierName ?? '—'));
  const zoneCourier = couriers.size === 1 ? [...couriers][0]! : 'karışık';
  const notReady = zone.stops.filter((stop) => stop.prep === 'not_started' || stop.prep === 'preparing');

  return (
    <section className="border-b border-ops-line">
      <div className="flex items-center gap-3 bg-ops-surface-sunken px-6 py-2">
        <button
          type="button"
          onClick={() => onSelectZone(zone.id)}
          className="cursor-pointer font-ops-display text-ops-sm font-semibold text-ops-ink hover:text-ops-olive"
        >
          {allSelected ? '☑' : '☐'} {zone.name}
        </button>
        <span className="font-ops-body text-ops-xs text-ops-muted">
          {zone.warehouseName} · {num(zone.stops.length)} durak
        </span>
        <span className="ml-auto font-ops-body text-ops-xs text-ops-muted">
          {zoneCourier === '—' ? 'Atanmadı' : zoneCourier}
        </span>
      </div>

      {/* Uyarı ADLARI sayıyor, yalnız sayıyı değil: "1 sipariş hazır değil" sevkiyatçıyı listede
          aramaya gönderirdi; adı yazmak müdahaleyi tek adıma indiriyor (tasarım §2). */}
      {notReady.length > 0 ? (
        <p className="border-b border-ops-amber-line bg-ops-amber-bg px-6 py-1.5 font-ops-body text-ops-xs text-ops-amber-dark">
          {/* Ad TEKİLLEŞTİRİLİR: aynı müşterinin iki siparişi "Claire Weber, Claire Weber" diye
              okunuyordu — uyarı, bir sipariş sayımı değil bir ADRES işaretidir. */}
          {DISPATCH_NOTES.notReady([...new Set(notReady.map((stop) => stop.customerName))])}
        </p>
      ) : null}
      <ul>
        {zone.stops.map((stop) => (
          <StopRow
            key={stop.orderId}
            stop={stop}
            checked={selected.includes(stop.orderId)}
            onToggle={() => onToggle(stop.orderId)}
            moveDates={moveDates}
            onMove={onMove}
            busy={busy}
          />
        ))}
      </ul>
    </section>
  );
}

function StopRow({
  stop,
  checked,
  onToggle,
  moveDates,
  onMove,
  busy,
}: {
  stop: DispatchStopView;
  checked: boolean;
  onToggle: () => void;
  moveDates: string[];
  onMove: (orderId: string, date: string) => void;
  busy: boolean;
}) {
  const prep = PREP_VIEW[stop.prep];
  return (
    <li className="flex items-start gap-3 border-b border-ops-line-soft px-6 py-2.5 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-label={`${stop.customerName} seç`}
        className="mt-0.5 cursor-pointer font-ops-body text-ops-base text-ops-muted hover:text-ops-olive"
      >
        {checked ? '☑' : '☐'}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={`/operations/orders/${stop.orderId}`}
          className="truncate font-ops-body text-ops-base text-ops-ink hover:text-ops-olive"
        >
          {stop.customerName}
          {stop.referenceNo ? <span className="ml-1.5 font-ops-mono text-ops-xs text-ops-faint">{stop.referenceNo}</span> : null}
        </Link>
        <span className="truncate font-ops-body text-ops-sm text-ops-muted">{stop.address ?? 'Adres yok'}</span>
        <span className="font-ops-body text-ops-micro text-ops-faint">{num(stop.itemCount)} kalem</span>
      </div>

      <div className="flex flex-none flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          {/* Hazır olmayan sipariş GÖRÜNÜR bir uyarıdır: araç eksik yüklenmesin (tasarım §4). */}
          {prep ? <Badge tone={prep.tone}>{prep.label}</Badge> : null}
          {stop.courierName ? (
            <Badge tone="neutral">{stop.courierName}</Badge>
          ) : (
            <Badge tone="amber">Atanmadı</Badge>
          )}
        </div>
        {/* "Ödendi" AÇIKÇA yazılır: boşluk bırakmak "para bilgisi gelmedi" diye de okunabilirdi. */}
        {stop.dueAmountCents !== null ? (
          <span className="font-ops-mono text-ops-sm text-ops-ink">{money(stop.dueAmountCents)} kapıda</span>
        ) : (
          <span className="font-ops-body text-ops-xs text-ops-faint">Ödendi</span>
        )}
        {moveDates.length > 0 ? <MoveMenu stop={stop} dates={moveDates} onMove={onMove} busy={busy} /> : null}
      </div>
    </li>
  );
}

/** Başka güne taşıma — hedefler bölgenin YAKLAŞAN teslim günleri, serbest tarih değil. */
function MoveMenu({
  stop,
  dates,
  onMove,
  busy,
}: {
  stop: DispatchStopView;
  dates: string[];
  onMove: (orderId: string, date: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const movable = stop.status === 'confirmed' || stop.status === 'preparing' || stop.status === 'ready';
  // Yola çıkmış siparişin günü değişmez — düğme HİÇ çizilmiyor, kapalı da gösterilmiyor.
  if (!movable) return null;

  return (
    <>
      <div ref={anchorRef} className="inline-flex">
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen((current) => !current)}
          className="cursor-pointer font-ops-display text-ops-micro font-semibold text-ops-muted underline-offset-2 hover:text-ops-olive hover:underline disabled:opacity-50"
        >
          başka güne taşı
        </button>
      </div>
      <AnchoredMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={180}>
        {dates.map((date) => (
          <MenuRow
            key={date}
            label={date}
            onClick={() => {
              onMove(stop.orderId, date);
              setOpen(false);
            }}
          />
        ))}
      </AnchoredMenu>
    </>
  );
}

/**
 * Kargo bölümü. **Takip numarası OKUNUR, yazılmaz** (07.12): etiketi paketi kapatan kişi elinde
 * tutar, kaydı hazırlık ekranı yazar. Bu sayfa planlar ve EKSİĞİ gösterir.
 */
export function ShippingSection({ stops, truncated }: { stops: DispatchStopView[]; truncated: boolean }) {
  return (
    <section className="border-b border-ops-line">
      <div className="flex items-center gap-3 bg-ops-surface-sunken px-6 py-2">
        <span className="font-ops-display text-ops-sm font-semibold text-ops-ink">Kargo kuyruğu</span>
        <span className="font-ops-body text-ops-xs text-ops-muted">
          {num(stops.length)} paket{truncated ? '+' : ''}
        </span>
        <span className="ml-auto max-w-[460px] text-right font-ops-body text-ops-micro text-ops-faint">
          {DISPATCH_NOTES.shipping}
        </span>
      </div>
      {truncated ? (
        <p className="border-b border-ops-amber-line bg-ops-amber-bg px-6 py-1.5 font-ops-body text-ops-xs text-ops-amber-dark">
          {DISPATCH_NOTES.shippingTruncated}
        </p>
      ) : null}
      <ul>
        {stops.map((stop) => (
          <li key={stop.orderId} className="flex items-start gap-3 border-b border-ops-line-soft px-6 py-2.5 last:border-b-0">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Link
                href={`/operations/orders/${stop.orderId}`}
                className="truncate font-ops-body text-ops-base text-ops-ink hover:text-ops-olive"
              >
                {stop.customerName}
                {stop.referenceNo ? (
                  <span className="ml-1.5 font-ops-mono text-ops-xs text-ops-faint">{stop.referenceNo}</span>
                ) : null}
              </Link>
              <span className="truncate font-ops-body text-ops-sm text-ops-muted">{stop.address ?? 'Adres yok'}</span>
            </div>
            <div className="flex flex-none flex-col items-end gap-1">
              {/* Hazırlık rozeti YOK: kuyruğun tanımı zaten "hazırlanmış" — her satıra "Hazır"
                  basmak, tanımı tekrar etmekten başka bir şey söylemezdi. */}
              {stop.trackingNumber ? (
                <span className="font-ops-mono text-ops-xs text-ops-strong">
                  {stop.carrier ? `${CARRIER_LABEL[stop.carrier]} · ` : ''}
                  {stop.trackingNumber}
                </span>
              ) : (
                // Paket çıkmış ama müşteri bilmiyor — gün kapanmadan görünür bir eksiklik.
                <Badge tone="amber">Takip numarası yok</Badge>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
