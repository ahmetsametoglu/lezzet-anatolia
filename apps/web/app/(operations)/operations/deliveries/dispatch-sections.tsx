'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { AnchoredMenu } from '@/components/operation/ui/anchored-menu';
import { Badge } from '@/components/operation/ui/badge';
import { Chip } from '@/components/operation/ui/chip';
import { DateFilterChip } from '@/components/operation/ui/date-filter-chip';
import { money, num } from '@/components/operation/ui/format';
import { Table, withCells } from '@/components/operation/ui/table';
import type { ColumnTrack } from '@/components/operation/ui/table-columns';
// Kanal rozetinin tonu Siparişler tablosuyla AYNI kaynaktan (16.08): aynı kanal iki ekranda iki
// renk olamaz. Sözlük orada tanımlı ve süzgeç çipleriyle paylaşılıyor — kopyası yazılmadı.
import { CHANNEL_TONE } from '../orders/orders-url';
import { CARRIER_LABEL, DISPATCH_NOTES, PREP_VIEW, RUN_NOTES } from './deliveries-labels';
import { dayLabel, shiftDay } from './deliveries-url';
import type { DispatchDayView, DispatchStopView } from './dispatch-types';

// Sevkiyatçının gün planının blokları (09.15).
//
// ⚠ **Duraklar arası SIRA çizilmiyor** (tasarım §6): sistem sırayı bilmiyor (rota optimizasyonu
// ileriki faz). Numaralı bir liste, olmayan bir yeteneği ima ederdi — kurye ekranındaki numara ise
// "kaçıncı duraktayım" sayacıdır, bir rota sırası değil.

/**
 * **Günün özeti — ÜSTTE KÜNYE, ALTTA ENGEL** (kullanıcı kararı 16.08).
 *
 * ── ÖNCE DÖRT SAYAÇTI, ALTI KUSURU ÖLÇÜLDÜ ─────────────────────────────────
 *   1. **Aynı sayı üç kez.** `ÇIKIŞ 4` · `HAZIR 2/4` · hemen altta `4 durak` — 250 piksel içinde.
 *   2. **Kargo özete hiç girmiyordu.** Aşağıda iki paket vardı ve birinde takip numarası yoktu;
 *      tasarım §2 ona *"gün kapanmadan görünür bir eksiklik"* diyor ama özet susuyordu.
 *   3. **Yük toplamı yoktu.** Satırlarda adet vardı (2+3+1+4 = 10), künyede yoktu — oysa
 *      sevkiyatçının ilk sorusu *"araca ne kadar yer lazım"* ve kolon tam bunun için eklenmişti.
 *   4. **Boş günde üç sıfır ve tek kelime açıklama yok** (ölçüldü: 22 Ağu → `0` · `0/0` · `0`).
 *   5. **İki amber yan yana, sahipleri farklı.** `HAZIR 2/4` depoyu bekler, `ATANMAMIŞ 3` sevkiyatçının
 *      kendi işi; aynı tonda oldukları için *"hangisi bana bakıyor"* ayrılmıyordu.
 *   6. **Kesim cümlesi sağ yarıyı kaplıyordu** — ikili bir olgu için iki satır metin.
 *
 * ── ŞİMDİ ──────────────────────────────────────────────────────────────────
 * **Künye** günün ne olduğunu söyler: kaç durak, ne kadar yük, hangi depodan, liste kesin mi.
 * **Engel şeridi** yalnız sevkiyatçının kapatması gerekenleri sayar; hiçbiri yoksa sayı basmaz,
 * *"araç çıkabilir"* der. Para engel değildir — künye bilgisidir, o yüzden sağ uçta ve nötr.
 */
export function DaySummary({ day }: { day: DispatchDayView }) {
  const s = day.summary;
  const cutoffShort = day.cutoff.settled
    ? DISPATCH_NOTES.settledShort
    : day.date === day.today
      ? DISPATCH_NOTES.openShort(day.cutoff.time)
      : DISPATCH_NOTES.openShortAhead;
  /**
   * Açıklama cümlesi kesimin AİT OLDUĞU güne bakıyor (`isPrevDay`, 17.08 kuralı): sarkan bir kesimde
   * "kesim saati geçti" demek yanlış okunuyordu — geçen şey bir önceki günün saatiydi.
   */
  const cutoffWhy = day.cutoff.settled
    ? day.cutoff.isPrevDay
      ? DISPATCH_NOTES.settledPrevDay(day.cutoff.time)
      : DISPATCH_NOTES.settled
    : day.cutoff.isPrevDay
      ? DISPATCH_NOTES.openPrevDay(day.cutoff.time)
      : DISPATCH_NOTES.open(day.cutoff.time);

  // Sıra SERTLİĞE göre: rotaya hiç düşmemiş sipariş (araç uğramaz) > depo yetişmedi > kurye
  // atanmadı > kargo künyesi eksik. Hazır olmayanlar ADIYLA anılıyor — tablodaki amber bant buraya
  // taşındı, aynı uyarı iki yerde iki kez yazılmasın diye.
  const blockers = [
    // Askıda kalan ÖNCE: bugünün değil, geçmişin borcudur ve büyümeye devam eder.
    s.stranded > 0 ? DISPATCH_NOTES.blockers.stranded(s.stranded) : null,
    s.zoneless > 0 ? DISPATCH_NOTES.blockers.zoneless(s.zoneless) : null,
    s.notReadyNames.length > 0 ? DISPATCH_NOTES.blockers.notReady(s.notReadyNames) : null,
    s.runless > 0 ? DISPATCH_NOTES.blockers.runless(s.runless) : null,
    s.parcelsUntracked > 0 ? DISPATCH_NOTES.blockers.untracked(s.parcelsUntracked) : null,
  ].filter((note) => note !== null);

  return (
    <div className="border-b border-ops-line-soft bg-ops-surface-sunken px-6 pb-2.5 pt-3">
      {/* ── KÜNYE ───────────────────────────────────────────────────────── */}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-ops-body text-ops-sm text-ops-body">
        {s.stops === 0 ? (
          <span className="text-ops-muted">{DISPATCH_NOTES.emptyRoute}</span>
        ) : (
          <>
            <Fact value={num(s.stops)} unit="durak" />
            <Dot />
            <Fact value={num(s.units)} unit="adet" />
            {/* Çok depolu gün = iki ayrı araç, iki ayrı yükleme (tasarım §4) — karar künyede okunur. */}
            {s.warehouses.length > 0 ? (
              <>
                <Dot />
                <span>{s.warehouses.join(' · ')}</span>
              </>
            ) : null}
          </>
        )}
        {/* Kargo kuyruğu bir GÜNE ait değil, o yüzden künyenin sonunda ve ayrı sayılıyor. Tavana
            dayanmışsa "+" ile yazılır: sessiz kırpma, kuyruğu olduğundan kısa gösterirdi. */}
        {s.parcels > 0 ? (
          <>
            <Dot />
            <Fact value={`${num(s.parcels)}${day.shippingTruncated ? '+' : ''}`} unit="kargo paketi" />
          </>
        ) : null}
        <Dot />
        {/* Kesim saati burada DEĞİŞTİRİLMEZ (ayarların işi) — yalnız etkisi görünür. Uzun gerekçe
            kaybolmadı: kısa etiketin başlığında duruyor. */}
        <span
          title={cutoffWhy}
          className={`cursor-help underline decoration-dotted underline-offset-4 ${day.cutoff.settled ? 'text-ops-olive-dark' : 'text-ops-muted'}`}
        >
          {cutoffShort}
        </span>
      </p>

      {/* ── ENGELLER ─────────────────────────────────────────────────────
          Boş güne "✓ araç çıkabilir" YAZILMAZ: çıkacak araç yok, o cümle bir onay değil bir
          yanlış anlama olurdu. Söylenecek hiçbir şey yoksa şerit hiç çizilmiyor. */}
      {blockers.length > 0 || s.stops > 0 || s.doorCount > 0 ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-ops-body text-ops-xs">
          {blockers.length > 0 ? (
            blockers.map((note) => (
              <span key={note} className="text-ops-amber-dark">
                ⚠ {note}
              </span>
            ))
          ) : s.stops > 0 && day.date >= day.today ? (
            // "Araç çıkabilir" GELECEK zamanlı bir cümle: geçmiş güne bakarken çıkacak araç yok ve
            // o gün zaten yaşandı. Geçmişte engel kalmadıysa şerit susar (16.08).
            <span className="text-ops-olive-dark">✓ {DISPATCH_NOTES.readyToGo}</span>
          ) : null}
          {/* Para bir ENGEL DEĞİL, künye bilgisi: kapıda tahsilat gün planını durdurmaz, kuryeye
              not düşer. Uyarı tonuna sokmamak için nötr ve şeridin sağ ucunda. */}
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

/**
 * Tahsilat hücresi — üç hâl (künyesi `RouteTable`in `due` kolonunda). Askıda şeridi de aynı hücreyi
 * kullanıyor: orada da "Ödendi" ile "borç kaldı" ayrımı aynı ölçüde önemli.
 */
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

/** Künyenin sayı+birim ikilisi — sayı vurgulu, birim sakin. */
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
 * Gün seçici — dün / bugün / yarın **ve takvim** (tasarım §2: sayfa gün üzerine kurulu).
 *
 * ── DÖRDÜNCÜ ÇİP TAKVİME DÖNDÜ (16.08, kullanıcı isteği) ────────────────────
 * Eskiden `+2` diye sabit bir dördüncü gün vardı ve **neden iki gün** sorusunun cevabı yoktu:
 * bugün 16 Ağustos ise dördüncü çip "18 Ağu Sal" der, 19'una bakmanın yolu bulunmazdı. Seçili gün
 * dörtlünün dışına düşerse kendi çipiyle görünen bir kaçış yolu vardı ama o çipe basılarak
 * ULAŞILAMIYORDU — yalnız adresten gelen bir günü gösteriyordu.
 *
 * Takvim her günü açar ve geçmiş de serbesttir: *"geçen salı ne çıktı"* sevkiyatın gerçek sorusu.
 * Hızlı üç gün ÇİP olarak kaldı — en sık üç sorgu tek tıkta kalmalı; takvim iki tık.
 *
 * **`DateFilterChip` aynen kullanılıyor** (Siparişler'in teslim günü süzgeciyle aynı taş): ikinci
 * bir takvim çizilmedi. Sözleşmesi de örtüşüyor — boş değer = "hızlı günlerden birindeyiz", dolu
 * değer = adıyla yazılı özel gün + ✕. Tek fark ✕'in anlamı: burada gün BOŞ olamaz (sayfanın konusu
 * bir gün), o yüzden temizlemek bugüne döner.
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
 * **SEFER ŞERİDİ** (18.08, `docs/feature/sefer.md` — AssignBar'ın halefi). Toplu kurye ataması
 * söküldü (K2: *"arayüzden atama saçma — kurye rotayı alır ve sürer"*); sevkiyatçının yeni sorusu
 * sipariş başına "kime atandı" değil, ROTA başına **"araç çıktı mı, döndü mü, kim sürüyor"**.
 *
 * Rota başına tek satır: durum · kurye · araç · SF kodu. Kalan tek elle müdahale DEVİR — açık
 * seferi başka kuryeye vermek (hasta kurye, evde kalan telefon); sipariş seçimi geri gelmez.
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

/** Şeridin bir satırı — durum cümlesi + devir menüsü satırın kendi içinde. */
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
          {/* Devir yalnız AÇIK seferde: kapanmış seferin mutabakatı yapıldı, devredilecek yol yok. */}
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
        // Sefer açılmamış rota SOLUK değil AMBER: kurye henüz rotayı almadı — gün başında normal,
        // çıkış saati yaklaşırken bir engel (engel şeridi sayıyor).
        <span className="ml-auto font-ops-body text-ops-xs text-ops-amber-dark">{RUN_NOTES.waiting}</span>
      )}
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

/**
 * **Rota çıkışları — TABLO** (kullanıcı kararı 16.08: *"sipariş sayfasındaki tablonun formatını
 * kullanalım"*). Bölge TANIMI burada değişmez, Depolar'a köprü verilir.
 *
 * ── ÖNCE İKİ KATLI SATIR LİSTESİYDİ, ÜÇ SORUNU ÖLÇÜLDÜ ──────────────────────
 *   1. **Açık adres bir karar üretmiyordu.** Navigasyon ve arama kuryenin ekranında
 *      (`kurye-teslimat.md §2` — *"navigasyon ve arama/WhatsApp erişimi buradan"*); sevkiyatçının
 *      adresle yapabileceği tek iş durak sırası kurmaktı ve tasarım onu açıkça yasaklıyor (§6 —
 *      sistem sırayı bilmiyor). Kaldırıldı; tam adres sipariş detayında duruyor.
 *   2. **"1 kalem" yanlış birimi sayıyordu** (`order_item` satırı). Günün dört siparişinin dördü de
 *      "1 kalem" yazıyordu, gerçek adetler 1 · 2 · 3 · 4'tü — dört farklı yük eşit görünüyordu.
 *   3. **Bölgesiz sipariş SON grupta kayboluyordu** (*"Bölgesi çözülemedi"*), oysa en acil satır o.
 *
 * ── KOLONLAR SİPARİŞLER TABLOSUNUN ŞERİDİNDEN ────────────────────────────────
 * Ölçüler `ORDERS_COLUMN_TRACKS` ile bilinçli olarak aynı (No 100px, Müşteri esnek, Kanal 48px,
 * Tahsilat ~130px): iki ekran aynı nesneyi listeliyor ve operatörün gözünün aynı yerde aynı şeyi
 * bulması bir tutarlılık kararı. Şerit KOPYALANMADI, ayrı tanımlı — kolon kümeleri farklı (burada
 * bölge/yük/kurye var, orada durum/teslim/depo) ve ortak bir sabit ikisini de kısıtlardı.
 *
 * **Kanal (B2B/B2C) Siparişler'den GELDİ** ve sebebi tahsilat: kurumsal müşterinin ödemesi vadeli
 * olabiliyor, yani "kapıda ne olacak" sorusunun cevabı kanala göre değişiyor.
 */
const ROUTE_TRACKS: ColumnTrack[] = [
  // `select` kolonu SÖKÜLDÜ (18.08): seçimin tek tüketicisi toplu atamaydı ve atama kalktı —
  // kurye rotayı kendisi alıyor, elle müdahale sefer şeridindeki DEVİR.
  { key: 'no', header: 'No', width: '100px' },
  { key: 'customer', header: 'Müşteri', width: 'minmax(132px,1fr)' },
  { key: 'channel', header: 'Kanal', width: '48px' },
  { key: 'zone', header: 'Bölge', width: 'minmax(120px,150px)' },
  { key: 'load', header: 'Yük', width: '56px', align: 'right' },
  { key: 'prep', header: 'Durum', width: '110px' },
  { key: 'courier', header: 'Kurye', width: 'minmax(96px,120px)' },
  { key: 'due', header: 'Tahsilat', width: 'minmax(104px,130px)', align: 'right' },
  // Eylem kolonu SAĞ UÇTA ve geniş: "60,00 € kapıda" ile "başka güne taşı" bitişikken tek bir metin
  // gibi okunuyordu (ekranda ölçüldü). 116px, tutarla arasında görünür bir boşluk bırakıyor.
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
    customer: (stop) => <span className="truncate font-ops-body text-ops-sm text-ops-ink">{stop.customerName}</span>,
    channel: (stop) => <Badge tone={CHANNEL_TONE[stop.channel]}>{stop.channel.toUpperCase()}</Badge>,
    // Bölgesiz satır AMBER: hiçbir rotaya düşmemiş sipariş bir eksiklik hâlidir, boşluk değil.
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
    /**
     * Hazır olmayan sipariş GÖRÜNÜR bir uyarıdır: araç eksik yüklenmesin (tasarım §4).
     *
     * **"Hazır" hâli rozet değil, soluk metin.** `PREP_VIEW.ready` `null` döndürüyor ve bu satır
     * listesinde doğruydu — dikkat isteyen konuşur, ötekiler susar. Tabloda ise başlığı olan bir
     * kolon boş kalıyordu ve boş hücre *"durumu bilinmiyor"* diye okunur (`CLAUDE §1` — ölçülemeyen
     * değer boş bırakılmaz, adı konur). Rozet YAPILMADI: dördü de rozet olsaydı asıl uyarılar
     * kalabalığın içinde kaybolurdu.
     */
    prep: (stop) => {
      const view = PREP_VIEW[stop.prep];
      return view ? (
        <Badge tone={view.tone}>{view.label}</Badge>
      ) : (
        <span className="font-ops-body text-ops-xs text-ops-faint">Hazır</span>
      );
    },
    /**
     * Kurye SEFERDEN gelir (18.08): `courier_id`yi artık `start_delivery_run` claim'i yazıyor —
     * boş hücre "sevkiyatçı atamayı unuttu" değil "rotanın seferi henüz açılmadı" demek. Rozet bu
     * yüzden amber DEĞİL soluk metin: uyarının evi sefer şeridi + engel sayacı (`runless`), satır
     * satır tekrar etmek aynı uyarıyı iki yerde iki kez yazmak olurdu.
     */
    courier: (stop) =>
      stop.courierName ? (
        <span className="truncate font-ops-body text-ops-sm text-ops-body">{stop.courierName}</span>
      ) : (
        <span className="font-ops-body text-ops-xs text-ops-faint">Sefer bekliyor</span>
      ),
    /**
     * Tahsilat ÜÇ hâl, iki değil (düzeltme 16.08).
     *
     * Eskiden `dueAmountCents === null` doğrudan **"Ödendi"** diye yazılıyordu ve bu bir yalandı:
     * `null` yalnız *"kapıda para konuşulmayacak"* demek — sonuçlanmış siparişte de null oluyor.
     * Ekranda ölçüldü: dün teslim edilmiş bir sipariş "Ödendi" yazıyordu, oysa 6,00 € tutarın
     * 0,00 €'su tahsil edilmişti. Üçüncü hâl o boşluktu ve amber: kapıda toplanmayacak ama **borç
     * duruyor** — tahsilatı artık müşteri kartının işi.
     */
    due: (stop) => <DueCell stop={stop} />,
    // Hedefler bölgenin YAKLAŞAN teslim günleri; bölgesiz siparişin taşınacağı gün de yok.
    move: (stop) => {
      const dates = stop.zoneId ? (day.moveDatesByZone[stop.zoneId] ?? []) : [];
      return dates.length > 0 ? (
        <MoveMenu stop={stop} dates={dates} today={day.today} onMove={onMove} busy={busy} />
      ) : null;
    },
  });

  return (
    <section className="flex min-h-0 flex-col">
      {/* Durak SAYISI burada YAZMIYOR (16.08): künye zaten "4 durak" diyor. Seçim kutucuğu da
          KALKTI (18.08) — tek tüketicisi toplu atamaydı; bölümün adı düz başlık oldu. */}
      <div className="flex items-center gap-3 border-b border-ops-line bg-ops-surface-sunken px-6 py-2">
        <span className="font-ops-display text-ops-sm font-semibold text-ops-ink">Araçla giden</span>
      </div>

      <Table columns={columns} rows={rows} rowKey={(stop) => stop.orderId} />
    </section>
  );
}


/**
 * Başka güne taşıma — hedefler bölgenin YAKLAŞAN teslim günleri, serbest tarih değil.
 *
 * **Gün ADIYLA yazılır, ISO'yla değil** (16.08, kullanıcı bildirimi). Menü `2026-08-18` diye ham
 * tarih basıyordu; hemen üstündeki gün çipleri ise aynı günü *"18 Ağu Sal"* diye söylüyor — tek
 * ekranda aynı şeyin iki dili. Etiket artık gün seçicininkiyle AYNI işlevden geliyor (`dayLabel`),
 * yani "Yarın" olan hedef "Yarın" yazıyor.
 *
 * Genişlik de ölçüldü: 180 px'lik menüde en uzun satır ~101 px yer kaplıyordu, her satırın sağında
 * 80 px boş şerit kalıyordu. 132 px, en uzun etikete ("21 Ağu Cum") sığan ölçü.
 */
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
  // Yola çıkmış siparişin günü değişmez — düğme HİÇ çizilmiyor, kapalı da gösterilmiyor. Gün
  // GEÇTİKTEN sonra aynı sipariş askıda şeridine düşer ve orada kendi kapısı vardır
  // (`bringForwardAction`): kural bugünün kuralıdır, dünün değil.
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

/**
 * **Gün seçen açılır menü** — taşıma ve askıdan kurtarma AYNI taşı kullanıyor: iki eylem de bölgenin
 * yaklaşan teslim günlerinden birini yazıyor, tek farkı düğmenin adı ve arkasındaki eylem.
 *
 * Günler ADIYLA yazılır, ISO'yla değil (16.08) — üstteki gün çipleriyle tek dil.
 */
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
      {/* 132 px = en uzun etikete ("21 Ağu Cum") sığan ölçü; 180'de her satırın sağında 80 px boş
          şerit kalıyordu (ekranda ölçüldü). */}
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
 * **ASKIDA KALANLAR — teslim günü geçmiş ama sonuçlanmamış siparişler** (kullanıcı kararı 16.08:
 * *"görünür devir — sevkiyatçı karar verir"*).
 *
 * Şerit bugünün planının ÜSTÜNDE duruyor ve sebebi ölçüldü: bu satırlar hiçbir listede yoktu.
 * Sevkiyatçının bugünü onları göstermiyordu (`delivery_date = bugün` süzgeci), kuryenin ekranı da
 * göstermiyordu (aynı süzgeç, tarih hep bugün) — yalnız düne elle giden görebiliyordu ve düne kimse
 * bakmaz. Tam künye `DispatchDayView.stranded`ta.
 *
 * ── HEDEF GÜNLER SERBEST DEĞİL ─────────────────────────────────────────────
 * Aynı kural taşımadakiyle bir: **bölgenin yaklaşan teslim günleri.** Ekranda "bugüne al" diye
 * kestirme bir düğme YOK, çünkü bakılan gün o bölgenin günü olmayabilir ve o zaman düğme, oraya
 * araç gitmeyen bir güne sipariş yazardı — kaybolan siparişi kurtarırken teslim edilemeyecek bir
 * sipariş yaratmak. Bakılan gün bölgenin günüyse listede zaten görünüyor.
 *
 * **Bölgesi çözülemeyen satır sessiz bırakılmıyor:** hedef üretilemiyor ve sebebi yazılıyor —
 * yapılacak iş adresin kendisinde.
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
    customer: (stop) => <span className="truncate font-ops-body text-ops-sm text-ops-ink">{stop.customerName}</span>,
    zone: (stop) =>
      stop.zoneName ? (
        <span className="truncate font-ops-body text-ops-sm text-ops-body">{stop.zoneName}</span>
      ) : (
        <span className="font-ops-body text-ops-sm text-ops-amber">Bölgesiz</span>
      ),
    load: (stop) => <span className="font-ops-mono text-ops-sm text-ops-body">{num(stop.unitCount)}</span>,
    // "Neden askıda" iki ayrı hikâye ve ayrımı önemli: yolda kalan sipariş ARAÇLA çıkmıştır
    // (kurye sonucu yazmamış), yola çıkmamış olan depoda ya da rafta beklemiştir.
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
 * Kargo kuyruğunun kolonları — rota tablosuyla AYNI dili konuşur ama daha kısadır, ve eksik olan her
 * kolonun sebebi var: **bölge/kurye YOK** (kargonun rotası ve kuryesi olmaz, taşıyıcısı olur),
 * **tahsilat YOK** (kargo yalnız online peşin ödenir — K37; boş bir para kolonu "bilgi gelmedi" diye
 * okunurdu), **durum YOK** (kuyruğun tanımı zaten "hazırlanmış").
 *
 * Ölçüler rota tablosuyla birebir aynı (No 100px, Müşteri esnek, Kanal 48px, Yük 56px) ve **başta
 * boş bir şerit var**: iki tablo alt alta duruyor, rotada seçim kutucuğu için 28px'lik bir kolon
 * bulunuyor ve o kolon burada olmayınca bütün satır 28px kayıyordu — göz ikisini iki ayrı liste
 * sanıyordu (ekranda ölçüldü). Kargo satırı seçilemez (toplu kurye ataması kargoda anlamsız), o
 * yüzden şerit boş: yeteneği taklit etmiyor, hizayı koruyor.
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
  customer: (stop) => <span className="truncate font-ops-body text-ops-sm text-ops-ink">{stop.customerName}</span>,
  channel: (stop) => <Badge tone={CHANNEL_TONE[stop.channel]}>{stop.channel.toUpperCase()}</Badge>,
  load: (stop) => <span className="font-ops-mono text-ops-sm text-ops-body">{num(stop.unitCount)}</span>,
  tracking: (stop) =>
    stop.trackingNumber ? (
      <span className="truncate font-ops-mono text-ops-xs text-ops-strong">
        {stop.carrier ? `${CARRIER_LABEL[stop.carrier]} · ` : ''}
        {stop.trackingNumber}
      </span>
    ) : (
      // Paket çıkmış ama müşteri bilmiyor — gün kapanmadan görünür bir eksiklik.
      <Badge tone="amber">Takip numarası yok</Badge>
    ),
});

/**
 * Kargo bölümü. **Takip numarası OKUNUR, yazılmaz** (07.12): etiketi paketi kapatan kişi elinde
 * tutar, kaydı hazırlık ekranı yazar. Bu sayfa planlar ve EKSİĞİ gösterir.
 */
export function ShippingSection({ stops, truncated }: { stops: DispatchStopView[]; truncated: boolean }) {
  return (
    <section className="border-b border-ops-line">
      {/* Paket SAYISI burada yazmıyor (16.08): künye zaten "2 kargo paketi" diyor ve bu satır onu
          60 piksel altında ikinci kez tekrarlıyordu — rota şeridinde kaldırılan tekrarın aynısı. */}
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
