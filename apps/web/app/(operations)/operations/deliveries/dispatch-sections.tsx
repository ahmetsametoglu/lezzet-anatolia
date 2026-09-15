'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { AnchoredMenu } from '@/components/operation/ui/anchored-menu';
import { RouteMap } from '@/components/operation/ui/route-map';
import { Badge } from '@/components/operation/ui/badge';
import { Chip } from '@/components/operation/ui/chip';
import { DateFilterChip } from '@/components/operation/ui/date-filter-chip';
import { money, num, shortDate } from '@/components/operation/ui/format';
import { Table, withCells } from '@/components/operation/ui/table';
import { CustomerChatButton } from '@/components/operation/ui/customer-chat-button';
import { chatContext } from '@/components/operation/ui/customer-channel-model';
import type { ColumnTrack } from '@/components/operation/ui/table-columns';
// Kanal tonu Siparişler'in sözlüğünden: aynı kanal iki ekranda iki renk olamaz.
import { CHANNEL_TONE } from '../orders/orders-url';
import { CARRIER_LABEL } from '@/components/operation/ui/labels';
import { DISPATCH_NOTES, PREP_VIEW, RUN_NOTES } from './deliveries-labels';
import { dayLabel, shiftDay } from './deliveries-url';
import type { DispatchDayView, DispatchStopView } from './dispatch-types';

// Tabloda durak numarası yok: tablo bölgeye göre sıralı bir liste, turun kendisi değil; iki sıralama yan yana hangisinin rota
// olduğunu belirsizleştirirdi.

/**
 * Künye günün ne olduğunu söyler (durak, yük, depo, liste kesin mi); engel şeridi yalnız sevkiyatçının kapatması gerekenleri sayar.
 * Para engel değil künye bilgisidir, o yüzden sağ uçta ve nötr.
 */
export function DaySummary({ day }: { day: DispatchDayView }) {
  const s = day.summary;
  const cutoffShort = day.cutoff.settled
    ? DISPATCH_NOTES.settledShort
    : day.date === day.today
      ? DISPATCH_NOTES.openShort(day.cutoff.time)
      : DISPATCH_NOTES.openShortAhead;
  // Açıklama kesimin ait olduğu güne bakar: sarkan kesimde "kesim saati geçti" demek yanlış okunur, geçen bir önceki günün saatidir.
  const cutoffWhy = day.cutoff.settled
    ? day.cutoff.isPrevDay
      ? DISPATCH_NOTES.settledPrevDay(day.cutoff.time)
      : DISPATCH_NOTES.settled
    : day.cutoff.isPrevDay
      ? DISPATCH_NOTES.openPrevDay(day.cutoff.time)
      : DISPATCH_NOTES.open(day.cutoff.time);

  // Sıra sertliğe göre: rotaya düşmemiş sipariş > depo yetişmedi > kurye atanmadı > kargo künyesi eksik. Hazır olmayanlar adıyla
  // anılır ki aynı uyarı tabloda ikinci kez yazılmasın.
  const blockers = [
    // Askıda kalan önce: bugünün değil geçmişin borcudur ve büyümeye devam eder.
    s.stranded > 0 ? DISPATCH_NOTES.blockers.stranded(s.stranded) : null,
    s.zoneless > 0 ? DISPATCH_NOTES.blockers.zoneless(s.zoneless) : null,
    // Adres uyarıları `zoneless`in ardında: üçü de "araç yanlış yere gidiyor ya da hiç gitmiyor" ailesinden. `elsewhere` daha
    // sert, çünkü doğrusu elimizde ve telefon açılabilir.
    s.doorElsewhere > 0 ? DISPATCH_NOTES.blockers.doorElsewhere(s.doorElsewhere) : null,
    s.notReadyNames.length > 0 ? DISPATCH_NOTES.blockers.notReady(s.notReadyNames) : null,
    s.runless > 0 ? DISPATCH_NOTES.blockers.runless(s.runless) : null,
    s.doorUnverified > 0 ? DISPATCH_NOTES.blockers.doorUnverified(s.doorUnverified) : null,
    s.parcelsUntracked > 0 ? DISPATCH_NOTES.blockers.untracked(s.parcelsUntracked) : null,
  ].filter((note) => note !== null);

  return (
    <div className="border-b border-ops-line-soft bg-ops-surface-sunken px-6 pb-2.5 pt-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-ops-body text-ops-sm text-ops-body">
        {s.stops === 0 ? (
          <span className="text-ops-muted">{DISPATCH_NOTES.emptyRoute}</span>
        ) : (
          <>
            <Fact value={num(s.stops)} unit="durak" />
            <Dot />
            <Fact value={num(s.units)} unit="adet" />
            {/* Çok depolu gün iki ayrı araç, iki ayrı yükleme demek: karar künyede okunur. */}
            {s.warehouses.length > 0 ? (
              <>
                <Dot />
                <span>{s.warehouses.join(' · ')}</span>
              </>
            ) : null}
          </>
        )}
        {/* Kargo kuyruğu bir güne ait değil, künyenin sonunda ayrı sayılır; tavana dayanmışsa "+", çünkü sessiz kırpma kuyruğu kısa gösterirdi. */}
        {s.parcels > 0 ? (
          <>
            <Dot />
            <Fact value={`${num(s.parcels)}${day.shippingTruncated ? '+' : ''}`} unit="kargo paketi" />
          </>
        ) : null}
        <Dot />
        {/* Kesim saati burada değiştirilmez, yalnız etkisi görünür; uzun gerekçe kısa etiketin başlığında. */}
        <span
          title={cutoffWhy}
          className={`cursor-help underline decoration-dotted underline-offset-4 ${day.cutoff.settled ? 'text-ops-olive-dark' : 'text-ops-muted'}`}
        >
          {cutoffShort}
        </span>
      </p>

      {/* Boş güne "araç çıkabilir" yazılmaz: çıkacak araç yok, o cümle onay değil yanlış anlama olurdu. */}
      {blockers.length > 0 || s.stops > 0 || s.doorCount > 0 ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-ops-body text-ops-xs">
          {blockers.length > 0 ? (
            blockers.map((note) => (
              <span key={note} className="text-ops-amber-dark">
                ⚠ {note}
              </span>
            ))
          ) : s.stops > 0 && day.date >= day.today ? (
            // "Araç çıkabilir" gelecek zamanlı bir cümle: geçmiş günde engel kalmadıysa şerit susar.
            <span className="text-ops-olive-dark">✓ {DISPATCH_NOTES.readyToGo}</span>
          ) : null}
          {/* Kapıda tahsilat gün planını durdurmaz, kuryeye not düşer: uyarı tonuna sokulmaz. */}
          {s.doorCount > 0 ? (
            <span className="ml-auto whitespace-nowrap text-ops-muted">
              <span className="font-ops-mono text-ops-sm text-ops-ink">{money(s.doorCents)}</span> kapıda ·{' '}
              {num(s.doorCount)} siparişte
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/** Askıda şeridi de aynı hücreyi kullanır: "Ödendi" ile "borç kaldı" ayrımı orada da aynı ölçüde önemli. */
function DueCell({ stop }: { stop: DispatchStopView }) {
  if (stop.dueAmountCents !== null) {
    return (
      <span className="flex flex-col items-end">
        <span className="font-ops-mono text-ops-sm text-ops-ink">{money(stop.dueAmountCents)}</span>
        <span className="font-ops-body text-ops-micro text-ops-faint">kapıda</span>
      </span>
    );
  }
  if (stop.outstandingCents > 0) {
    return (
      <span className="flex flex-col items-end">
        <span className="font-ops-mono text-ops-sm text-ops-amber-dark">{money(stop.outstandingCents)}</span>
        <span className="font-ops-body text-ops-micro text-ops-amber-dark">borç kaldı</span>
      </span>
    );
  }
  return <span className="font-ops-body text-ops-xs text-ops-faint">Ödendi</span>;
}

function Fact({ value, unit }: { value: string; unit: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="font-ops-mono text-ops-base text-ops-ink">{value}</span> {unit}
    </span>
  );
}

function Dot() {
  return <span className="text-ops-faint">·</span>;
}

/**
 * Hızlı üç gün çip, gerisi takvim: en sık üç sorgu tek tıkta kalmalı, geçmiş de serbest ("geçen salı ne çıktı"). ✕ bugüne döner,
 * çünkü sayfanın konusu bir gündür ve gün boş olamaz.
 */
export function DayPicker({ day, onDate }: { day: DispatchDayView; onDate: (date: string) => void }) {
  const quick = [-1, 0, 1].map((offset) => shiftDay(day.today, offset));
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-ops-line-soft px-6 py-2.5">
      {quick.map((date) => (
        <Chip key={date} active={date === day.date} onClick={() => onDate(date)}>
          {dayLabel(date, day.today)}
        </Chip>
      ))}
      <DateFilterChip
        value={quick.includes(day.date) ? '' : day.date}
        placeholder="+ başka gün"
        label="Gün"
        onChange={(date) => onDate(date || day.today)}
      />
    </div>
  );
}

/**
 * Sevkiyatçının sorusu sipariş başına "kime atandı" değil, rota başına "araç çıktı mı, döndü mü, kim sürüyor". Kalan tek elle
 * müdahale devir: açık seferi başka kuryeye vermek.
 */
export function RunStrip({
  day,
  onReassign,
  busy,
}: {
  day: DispatchDayView;
  onReassign: (runId: string, courierId: string) => void;
  busy: boolean;
}) {
  if (day.runs.length === 0) return null;

  return (
    <div className="flex flex-col border-b border-ops-line-soft px-6 py-2">
      {day.runs.map((route) => (
        <RunRow key={route.zoneId} route={route} couriers={day.couriers} onReassign={onReassign} busy={busy} />
      ))}
    </div>
  );
}

function RunRow({
  route,
  couriers,
  onReassign,
  busy,
}: {
  route: DispatchDayView['runs'][number];
  couriers: DispatchDayView['couriers'];
  onReassign: (runId: string, courierId: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const run = route.run;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2.5 py-1.5">
      <span className="min-w-0 truncate font-ops-display text-ops-sm font-semibold text-ops-ink">{route.zoneName}</span>
      {route.warehouseName ? <span className="font-ops-body text-ops-xs text-ops-faint">{route.warehouseName}</span> : null}
      <span className="font-ops-mono text-ops-xs text-ops-muted">{num(route.stopCount)} durak</span>

      {run ? (
        <>
          <span className="font-ops-mono text-ops-xs text-ops-faint">{run.referenceNo}</span>
          {run.closed ? (
            <Badge tone="olive">Kapandı</Badge>
          ) : run.returnedAt ? (
            <Badge tone="neutral">{RUN_NOTES.returned(run.returnedAt)}</Badge>
          ) : (
            <Badge tone="blue">{RUN_NOTES.onRoad(run.departedAt)}</Badge>
          )}
          <span className="truncate font-ops-body text-ops-sm text-ops-body">
            {run.courierName ?? 'bilinmeyen kurye'}
            {run.vehicleLabel ? <span className="text-ops-faint"> · {run.vehicleLabel}</span> : null}
          </span>
          {/* Devir yalnız açık seferde: kapanmış seferin mutabakatı yapıldı, devredilecek yol yok. */}
          {!run.closed ? (
            <div ref={anchorRef} className="ml-auto inline-flex">
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen((current) => !current)}
                className="cursor-pointer rounded-ops-btn border border-ops-line-strong px-2.5 py-1 font-ops-display text-ops-xs font-semibold text-ops-strong transition-colors hover:border-ops-olive disabled:opacity-50"
              >
                Devret ▾
              </button>
            </div>
          ) : null}
          <AnchoredMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={220}>
            {couriers
              .filter((courier) => courier.id !== run.courierId)
              .map((courier) => (
                <MenuRow
                  key={courier.id}
                  label={courier.name}
                  onClick={() => {
                    onReassign(run.runId, courier.id);
                    setOpen(false);
                  }}
                />
              ))}
          </AnchoredMenu>
        </>
      ) : (
        // Sefer açılmamış rota amber: gün başında normal, çıkış saati yaklaşırken bir engel.
        <span className="ml-auto font-ops-body text-ops-xs text-ops-amber-dark">{RUN_NOTES.waiting}</span>
      )}
      </div>
      {/* Harita motorun sırasını araç çıkmadan gösterir: kuş uçuşu kusursuz görünen tur bir bariyeri (nehir, tek yön) atlayabilir
          ve onu burada insan gözü yakalar. Katlanır, çünkü şerit bir durum satırıdır, harita incelenen bir şey. */}
      {run?.stopOrder ? (
        // Kimlikli kanca: şeritte birden çok sefer var ve duman senaryosu kendi seferinin haritasını açmalı.
        <details data-testid={`run-map-${run.runId}`} className="px-1 pb-2">
          <summary className="cursor-pointer font-ops-body text-ops-xs text-ops-muted transition-colors hover:text-ops-olive">
            Turu haritada gör
          </summary>
          <div className="mt-2 h-72">
            <RouteMap
              origin={run.stopOrder.origin}
              stops={run.stopOrder.stops}
              metric={run.stopOrder.metric}
              precision={run.stopOrder.precision}
              className="h-full"
            />
          </div>
        </details>
      ) : null}
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

interface StopCustomerProps {
  stop: DispatchStopView;
}

/**
 * Üç tablo da (rota, askıda, kargo) aynı hücreyi çizer: gecikme haberi, yeni gün ve takip sorusu müşteriyle konuşmayı ister.
 * Satır başına kanal okunmaz, düğme basınca okur.
 */
function StopCustomer({ stop }: StopCustomerProps) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate font-ops-body text-ops-sm text-ops-ink">{stop.customerName}</span>
      <CustomerChatButton
        customerId={stop.customerId}
        context={chatContext('Teslimattan', [
          stop.referenceNo ?? 'Sipariş',
          stop.deliveryDate ? `${shortDate(stop.deliveryDate)} teslim` : null,
        ])}
      />
    </span>
  );
}

/**
 * Ölçüler Siparişler tablosuyla bilinçli olarak aynı, şerit ayrı tanımlı: kolon kümeleri farklı ve ortak sabit ikisini de
 * kısıtlardı. Kanal kolonu tahsilat için: kurumsal müşterinin ödemesi vadeli olabilir.
 */
const ROUTE_TRACKS: ColumnTrack[] = [
  { key: 'no', header: 'No', width: '100px' },
  { key: 'customer', header: 'Müşteri', width: 'minmax(132px,1fr)' },
  { key: 'channel', header: 'Kanal', width: '48px' },
  { key: 'zone', header: 'Bölge', width: 'minmax(120px,150px)' },
  { key: 'load', header: 'Yük', width: '56px', align: 'right' },
  { key: 'prep', header: 'Durum', width: '110px' },
  { key: 'courier', header: 'Kurye', width: 'minmax(96px,120px)' },
  { key: 'due', header: 'Tahsilat', width: 'minmax(104px,130px)', align: 'right' },
  // Eylem kolonu sağ uçta ve geniş: tutarla bitişikken "60,00 € kapıda başka güne taşı" tek bir metin gibi okunuyordu.
  { key: 'move', header: '', width: '116px', align: 'right' },
];

export function RouteTable({
  day,
  onMove,
  busy,
}: {
  day: DispatchDayView;
  onMove: (orderId: string, date: string) => void;
  busy: boolean;
}) {
  const rows = day.route;

  const columns = withCells<DispatchStopView>(ROUTE_TRACKS, {
    no: (stop) => (
      <Link
        href={`/operations/orders/${stop.orderId}`}
        className="truncate font-ops-mono text-ops-xs text-ops-muted hover:text-ops-olive"
      >
        {stop.referenceNo ?? '—'}
      </Link>
    ),
    customer: (stop) => <StopCustomer stop={stop} />,
    channel: (stop) => <Badge tone={CHANNEL_TONE[stop.channel]}>{stop.channel.toUpperCase()}</Badge>,
    // Bölgesiz satır amber: hiçbir rotaya düşmemiş sipariş bir eksikliktir, boşluk değil.
    zone: (stop) =>
      stop.zoneName ? (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-ops-body text-ops-sm text-ops-body">{stop.zoneName}</span>
          {stop.warehouseName ? (
            <span className="truncate font-ops-body text-ops-micro text-ops-faint">{stop.warehouseName}</span>
          ) : null}
        </span>
      ) : (
        <span className="font-ops-body text-ops-sm text-ops-amber">Bölgesiz</span>
      ),
    load: (stop) => <span className="font-ops-mono text-ops-sm text-ops-body">{num(stop.unitCount)}</span>,
    // Hazır olmayan görünür bir uyarıdır ki araç eksik yüklenmesin. "Hazır" rozet değil soluk metin: boş hücre "bilinmiyor" diye
    // okunurdu, dördü de rozet olsaydı asıl uyarılar kalabalıkta kaybolurdu.
    prep: (stop) => {
      const view = PREP_VIEW[stop.prep];
      return view ? (
        <Badge tone={view.tone}>{view.label}</Badge>
      ) : (
        <span className="font-ops-body text-ops-xs text-ops-faint">Hazır</span>
      );
    },
    // Kurye seferden gelir: boş hücre "sefer henüz açılmadı" demek ve uyarının evi sefer şeridi ile engel sayacı, satırda tekrar edilmez.
    courier: (stop) =>
      stop.courierName ? (
        <span className="truncate font-ops-body text-ops-sm text-ops-body">{stop.courierName}</span>
      ) : (
        <span className="font-ops-body text-ops-xs text-ops-faint">Sefer bekliyor</span>
      ),
    // `dueAmountCents` null yalnız "kapıda para konuşulmayacak" demek ve sonuçlanmış siparişte de null olur: borç duruyorsa
    // "Ödendi" yazmak yalan olurdu.
    due: (stop) => <DueCell stop={stop} />,
    // Hedefler bölgenin yaklaşan teslim günleri; bölgesiz siparişin taşınacağı gün yok.
    move: (stop) => {
      const dates = stop.zoneId ? (day.moveDatesByZone[stop.zoneId] ?? []) : [];
      return dates.length > 0 ? (
        <MoveMenu stop={stop} dates={dates} today={day.today} onMove={onMove} busy={busy} />
      ) : null;
    },
  });

  return (
    <section className="flex min-h-0 flex-col">
      {/* Durak sayısı burada yazılmaz: künye zaten söylüyor. */}
      <div className="flex items-center gap-3 border-b border-ops-line bg-ops-surface-sunken px-6 py-2">
        <span className="font-ops-display text-ops-sm font-semibold text-ops-ink">Araçla giden</span>
      </div>

      <Table columns={columns} rows={rows} rowKey={(stop) => stop.orderId} />
    </section>
  );
}

/** Hedefler bölgenin yaklaşan teslim günleri, serbest tarih değil. Gün adıyla yazılır (`dayLabel`): üstteki gün çipleriyle tek dil. */
function MoveMenu({
  stop,
  dates,
  today,
  onMove,
  busy,
}: {
  stop: DispatchStopView;
  dates: string[];
  today: string;
  onMove: (orderId: string, date: string) => void;
  busy: boolean;
}) {
  const movable = stop.status === 'confirmed' || stop.status === 'preparing' || stop.status === 'ready';
  // Yola çıkmış siparişin günü değişmez ve düğme hiç çizilmez; gün geçince sipariş askıda şeridine düşer, orada kendi kapısı var.
  if (!movable) return null;

  return (
    <DateMenu
      label="başka güne taşı"
      dates={dates}
      today={today}
      onPick={(date) => onMove(stop.orderId, date)}
      busy={busy}
    />
  );
}

/** Taşıma ve askıdan kurtarma aynı taşı kullanır: ikisi de bölgenin yaklaşan teslim günlerinden birini yazar. */
function DateMenu({
  label,
  dates,
  today,
  onPick,
  busy,
}: {
  label: string;
  dates: string[];
  today: string;
  onPick: (date: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div ref={anchorRef} className="inline-flex">
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen((current) => !current)}
          className="cursor-pointer font-ops-display text-ops-micro font-semibold text-ops-muted underline-offset-2 hover:text-ops-olive hover:underline disabled:opacity-50"
        >
          {label}
        </button>
      </div>
      {/* 132 px en uzun etikete ("21 Ağu Cum") sığan ölçü; daha genişi her satırın sağında boş şerit bırakırdı. */}
      <AnchoredMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={132}>
        {dates.map((date) => (
          <MenuRow
            key={date}
            label={dayLabel(date, today)}
            onClick={() => {
              onPick(date);
              setOpen(false);
            }}
          />
        ))}
      </AnchoredMenu>
    </>
  );
}

/**
 * Bu satırlar başka hiçbir listede görünmez (sevkiyat da kurye de bugünü süzer), şerit bu yüzden planın üstünde. "Bugüne al"
 * kestirmesi yok: bakılan gün bölgenin günü olmayabilir ve araç gitmeyen bir güne sipariş yazılırdı.
 */
const STRANDED_TRACKS: ColumnTrack[] = [
  { key: 'day', header: 'Teslim günü', width: '112px' },
  { key: 'no', header: 'No', width: '100px' },
  { key: 'customer', header: 'Müşteri', width: 'minmax(132px,1fr)' },
  { key: 'zone', header: 'Bölge', width: 'minmax(120px,150px)' },
  { key: 'load', header: 'Yük', width: '56px', align: 'right' },
  { key: 'state', header: 'Neden askıda', width: 'minmax(120px,150px)' },
  { key: 'due', header: 'Tahsilat', width: 'minmax(104px,130px)', align: 'right' },
  { key: 'act', header: '', width: 'minmax(150px,180px)', align: 'right' },
];

export function StrandedSection({
  day,
  onBringForward,
  busy,
}: {
  day: DispatchDayView;
  onBringForward: (orderId: string, date: string) => void;
  busy: boolean;
}) {
  const columns = withCells<DispatchStopView>(STRANDED_TRACKS, {
    day: (stop) => (
      <span className="whitespace-nowrap font-ops-body text-ops-sm text-ops-amber-dark">
        {stop.deliveryDate ? dayLabel(stop.deliveryDate, day.today) : '—'}
      </span>
    ),
    no: (stop) => (
      <Link
        href={`/operations/orders/${stop.orderId}`}
        className="truncate font-ops-mono text-ops-xs text-ops-muted hover:text-ops-olive"
      >
        {stop.referenceNo ?? '—'}
      </Link>
    ),
    customer: (stop) => <StopCustomer stop={stop} />,
    zone: (stop) =>
      stop.zoneName ? (
        <span className="truncate font-ops-body text-ops-sm text-ops-body">{stop.zoneName}</span>
      ) : (
        <span className="font-ops-body text-ops-sm text-ops-amber">Bölgesiz</span>
      ),
    load: (stop) => <span className="font-ops-mono text-ops-sm text-ops-body">{num(stop.unitCount)}</span>,
    // İki ayrı hikâye: yolda kalan araçla çıkmıştır (kurye sonucu yazmamış), yola çıkmamış olan depoda ya da rafta beklemiştir.
    state: (stop) => (
      <span className="font-ops-body text-ops-xs text-ops-muted">
        {stop.status === 'out_for_delivery' ? DISPATCH_NOTES.strandedStuck : DISPATCH_NOTES.strandedWaiting}
      </span>
    ),
    due: (stop) => <DueCell stop={stop} />,
    act: (stop) => {
      const dates = stop.zoneId ? (day.moveDatesByZone[stop.zoneId] ?? []) : [];
      return dates.length > 0 ? (
        <DateMenu
          label="bir güne yaz"
          dates={dates}
          today={day.today}
          onPick={(date) => onBringForward(stop.orderId, date)}
          busy={busy}
        />
      ) : (
        <span className="font-ops-body text-ops-micro text-ops-amber-dark">{DISPATCH_NOTES.strandedNoZone}</span>
      );
    },
  });

  return (
    <section className="border-b border-ops-amber-line">
      <div className="flex items-center gap-3 border-b border-ops-amber-line bg-ops-amber-bg px-6 py-2">
        <span className="font-ops-display text-ops-sm font-semibold text-ops-amber-dark">Önceki günlerden askıda</span>
        <span className="ml-auto max-w-[520px] text-right font-ops-body text-ops-micro text-ops-amber-dark">
          {DISPATCH_NOTES.strandedHint}
        </span>
      </div>
      {day.strandedTruncated ? (
        <p className="border-b border-ops-amber-line bg-ops-amber-bg px-6 py-1.5 font-ops-body text-ops-xs text-ops-amber-dark">
          {DISPATCH_NOTES.strandedTruncated}
        </p>
      ) : null}
      <Table columns={columns} rows={day.stranded} rowKey={(stop) => stop.orderId} />
    </section>
  );
}

/**
 * Eksik kolonların sebebi var: kargonun rotası ve kuryesi olmaz, ödemesi yalnız online peşindir (boş para kolonu "bilgi gelmedi"
 * diye okunurdu), kuyruğun tanımı zaten "hazırlanmış".
 */
const SHIPPING_TRACKS: ColumnTrack[] = [
  { key: 'gutter', header: '', width: '28px' },
  { key: 'no', header: 'No', width: '100px' },
  { key: 'customer', header: 'Müşteri', width: 'minmax(132px,1fr)' },
  { key: 'channel', header: 'Kanal', width: '48px' },
  { key: 'load', header: 'Yük', width: '56px', align: 'right' },
  { key: 'tracking', header: 'Taşıyıcı · takip', width: 'minmax(180px,240px)', align: 'right' },
];

const shippingColumns = withCells<DispatchStopView>(SHIPPING_TRACKS, {
  no: (stop) => (
    <Link
      href={`/operations/orders/${stop.orderId}`}
      className="truncate font-ops-mono text-ops-xs text-ops-muted hover:text-ops-olive"
    >
      {stop.referenceNo ?? '—'}
    </Link>
  ),
  customer: (stop) => <StopCustomer stop={stop} />,
  channel: (stop) => <Badge tone={CHANNEL_TONE[stop.channel]}>{stop.channel.toUpperCase()}</Badge>,
  load: (stop) => <span className="font-ops-mono text-ops-sm text-ops-body">{num(stop.unitCount)}</span>,
  tracking: (stop) =>
    stop.trackingNumber ? (
      <span className="truncate font-ops-mono text-ops-xs text-ops-strong">
        {stop.carrier ? `${CARRIER_LABEL[stop.carrier]} · ` : ''}
        {stop.trackingNumber}
      </span>
    ) : (
      // Paket çıkmış ama müşteri bilmiyor: gün kapanmadan görünür bir eksiklik.
      <Badge tone="amber">Takip numarası yok</Badge>
    ),
});

/** Takip numarası okunur, yazılmaz: kaydı paketi kapatan hazırlık ekranı yazar, bu sayfa planlar ve eksiği gösterir. */
export function ShippingSection({ stops, truncated }: { stops: DispatchStopView[]; truncated: boolean }) {
  return (
    <section className="border-b border-ops-line">
      {/* Paket sayısı burada yazılmaz: künye zaten söylüyor. */}
      <div className="flex items-center gap-3 bg-ops-surface-sunken px-6 py-2">
        <span className="font-ops-display text-ops-sm font-semibold text-ops-ink">Kargo kuyruğu</span>
        <span className="ml-auto max-w-[460px] text-right font-ops-body text-ops-micro text-ops-faint">
          {DISPATCH_NOTES.shipping}
        </span>
      </div>
      {truncated ? (
        <p className="border-b border-ops-amber-line bg-ops-amber-bg px-6 py-1.5 font-ops-body text-ops-xs text-ops-amber-dark">
          {DISPATCH_NOTES.shippingTruncated}
        </p>
      ) : null}
      <Table columns={shippingColumns} rows={stops} rowKey={(stop) => stop.orderId} />
    </section>
  );
}
