'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { cardClass } from '@/components/operation/ui/card';
import { Input } from '@/components/operation/form/input';
import { num, shortDateTime } from '@/components/operation/ui/format';
import { recordTemperatureAction } from './actions';
import { AREA_KIND_SHORT } from './warehouses-labels';
import type { MeasureDayState } from './measure-rules';
import type { MeasureDayView, MeasurePointView } from './warehouses-types';

/**
 * **Ölçüm noktaları ve hijyen takvimi** (19.28 · takvim 19.30, kullanıcı tarifi 17.08).
 *
 * ── İKİ SÜTUN GİTTİ, TEK LİSTE GELDİ (kullanıcı kararı 17.08) ───────────────
 * Alanlar ve araçlar yan yana iki sütundu. Kullanıcının itirazı ölçümle birebir örtüştü: *"depolama
 * alanları birden fazla olacakken araç sayısı çok fazla olmayacak"* — ölçüldü, 5 alan / 1 araç.
 * İki sütun bu oranda hep dengesiz duracaktı: sağdaki sütun tek satırla, solunda beş satır. Tek
 * liste + tür süzgeci ikisini de doğal boyunda gösteriyor.
 *
 * ── TAKVİM: DENETİMİN SORDUĞU EKRAN ─────────────────────────────────────────
 * Denetmen "şu dolabın son üç ayını göster" der; bugüne kadar böyle bir görünüm YOKTU — ekran
 * yalnız BUGÜNÜ biliyordu. Takvim o soruya cevap veriyor ve cevabın en önemli parçası boş günler:
 * sapma karar verilmiş bir olaydır (birisi baktı, gördü, yazdı), **boşluk cevapsız bir sorudur.**
 *
 * ── PENCERE İSTEMCİDE DARALIYOR ─────────────────────────────────────────────
 * Sunucu hep 3 ay gönderiyor, düğmeler 1/2/3 ay arasında yerel olarak kesiyor. 550 gün nesnesi için
 * sunucuya dönmek, kazandırdığından çok bekletirdi (`measure-read` künyesi).
 */
interface MeasurePointsProps {
  points: readonly MeasurePointView[];
  warehouseId: string;
  /** Takvim okuması tavana çarptıysa ekran ölçemediğini SÖYLER, eksik takvimi tam gibi çizmez. */
  truncated: boolean;
  onAdd: (kind: 'area' | 'vehicle') => void;
  onEdit: (point: MeasurePointView) => void;
  onToggle: (point: MeasurePointView) => void;
}

/** Süzgecin üç hâli. `all` varsayılan: operatörün ilk sorusu "noktalarım neler". */
type PointFilter = 'all' | 'area' | 'vehicle';

/**
 * Pencere seçenekleri — **TAKVİM AYI, kayan gün DEĞİL** (kullanıcı kararı 17.08).
 *
 * Önce "son N gün" idi (31/62/92) ve pencerenin kenarındaki ay hep YARIM başlıyordu: 1 ay seçince
 * Temmuz'un 18'inden Ağustos'un 17'sine kadar iki kırık ay görünüyordu. Ay kutusu bir takvimdir;
 * yarısı kesilmiş bir takvim, okuyanı "gerisi nerede" diye düşündürür ve o soru veriyle ilgili
 * değil, ekranla ilgilidir.
 *
 * Bugün `1 ay` = **bu ayın 1'inden bugüne**, `2 ay` = geçen ayın 1'inden, `3 ay` = iki ay öncenin
 * 1'inden. Sunucunun gönderdiği 92 gün üç takvim ayının EN UZUNUNU (31+31+30) tam karşılıyor.
 */
const RANGES = [
  { months: 1, label: '1 ay' },
  { months: 2, label: '2 ay' },
  { months: 3, label: '3 ay' },
] as const;

export function MeasurePoints({ points, warehouseId, truncated, onAdd, onEdit, onToggle }: MeasurePointsProps) {
  const [filter, setFilter] = useState<PointFilter>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [rangeMonths, setRangeMonths] = useState<number>(RANGES[0].months);

  const areaCount = points.filter((p) => p.kind === 'area').length;
  const shown = points.filter((p) => filter === 'all' || p.kind === filter);

  /**
   * "Son 3 ayda hiç ölçülmemiş" — eskiden "hiç ölçülmemiş" deniyordu ve dört ay önce ölçülmüş bir
   * dolap için YANLIŞTI. Sayı yalnız ölçüm BEKLENEN noktaları kapsıyor: beklenmeyen bir noktanın
   * sessizliği bir eksiklik değil (`expectedDailyChecks = 0`).
   */
  const silent = points.filter((p) => p.isActive && p.expectedDailyChecks > 0 && p.lastRecordedAt === null).length;

  return (
    <div className="flex flex-col gap-2.5">
      {truncated ? (
        <p className="rounded-ops-btn border border-ops-amber-line bg-ops-amber-bg px-3 py-2 font-ops-body text-ops-sm text-ops-amber-dark">
          Bu pencerede okunabilecekten çok kayıt var — takvim eksik. Boş görünen günler ölçülmemiş
          olmayabilir; daha dar bir aralık seçin.
        </p>
      ) : null}
      {silent > 0 ? (
        <p className="rounded-ops-btn border border-ops-amber-line bg-ops-amber-bg px-3 py-2 font-ops-body text-ops-sm text-ops-amber-dark">
          {num(silent)} nokta son 3 ayda hiç ölçülmemiş — tanımlı ama tura girmemiş. Sapma uyarısı ancak geçmiş
          biriktikçe çalışır.
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <FilterTabs
          value={filter}
          onChange={setFilter}
          counts={{ all: points.length, area: areaCount, vehicle: points.length - areaCount }}
        />
        <Button size="sm" variant="secondary" className="ml-auto" onClick={() => onAdd('area')}>
          + Alan
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onAdd('vehicle')}>
          + Araç
        </Button>
      </div>

      {shown.length === 0 ? (
        <p className={cardClass('px-3 py-2.5 font-ops-body text-ops-xs leading-relaxed text-ops-muted')}>
          {filter === 'vehicle'
            ? 'Bu tesise künyelenmiş araç yok.'
            : 'Henüz alan yok — dolap, soğuk oda ya da geçiş alanı ekleyin.'}
        </p>
      ) : (
        <ul className="flex flex-col rounded-ops-card border border-ops-line">
          {shown.map((point) => {
            const key = `${point.kind}:${point.id}`;
            return (
              <PointRow
                key={key}
                point={point}
                warehouseId={warehouseId}
                open={openKey === key}
                rangeMonths={rangeMonths}
                onRangeChange={setRangeMonths}
                // Tek nokta açık kalıyor: iki takvim aynı anda açıkken bölüm ekranı taşırıyor ve
                // karşılaştırma da yapılamıyor (ikisi alt alta, aynı anda görünmüyorlar).
                onToggleOpen={() => setOpenKey(openKey === key ? null : key)}
                onEdit={() => onEdit(point)}
                onToggleActive={() => onToggle(point)}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Süzgeç ──────────────────────────────────────────────────────────────────

function FilterTabs({
  value,
  onChange,
  counts,
}: {
  value: PointFilter;
  onChange: (next: PointFilter) => void;
  counts: Record<PointFilter, number>;
}) {
  const tabs: Array<{ key: PointFilter; label: string }> = [
    { key: 'all', label: 'Hepsi' },
    { key: 'area', label: 'Alanlar' },
    { key: 'vehicle', label: 'Araçlar' },
  ];
  return (
    <div className="flex items-center gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`cursor-pointer rounded-ops-btn border px-2.5 py-1 font-ops-body text-ops-xs transition-colors ${
            value === tab.key
              ? 'border-ops-olive bg-ops-olive-bg font-semibold text-ops-olive-dark'
              : 'border-ops-line text-ops-muted hover:border-ops-line-strong hover:text-ops-ink'
          }`}
        >
          {tab.label} <span className="text-ops-faint">{num(counts[tab.key])}</span>
        </button>
      ))}
    </div>
  );
}

// ── Nokta satırı ────────────────────────────────────────────────────────────

function PointRow({
  point,
  warehouseId,
  open,
  rangeMonths,
  onRangeChange,
  onToggleOpen,
  onEdit,
  onToggleActive,
}: {
  point: MeasurePointView;
  warehouseId: string;
  open: boolean;
  rangeMonths: number;
  onRangeChange: (months: number) => void;
  onToggleOpen: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  /**
   * Kesme noktası **veriden** çıkıyor (`days`in son günü), istemcinin saatinden değil: `Date.now()`
   * ile hesaplansaydı sunucunun boyadığı ilk hâl ile istemcininki gece yarısı ayrışır ve hidrasyon
   * uyuşmazlığı doğardı — üstelik sunucunun günü doğru olan.
   */
  const days = useMemo(() => {
    const last = point.days[point.days.length - 1]?.date;
    if (!last) return [];
    return point.days.filter((day) => day.date >= monthStartKey(last, rangeMonths - 1));
  }, [point.days, rangeMonths]);

  return (
    <li className={`border-b border-ops-line-soft last:border-b-0 ${point.isActive ? '' : 'bg-ops-subtle'}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Satırın kendisi açıp kapıyor: takvim satırın DETAYI, ayrı bir nesne değil. */}
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 text-left"
        >
          <span className="flex items-center gap-1.5">
            <span className={`text-ops-faint transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
            <span className="truncate font-ops-body text-ops-sm text-ops-ink">{point.name}</span>
            {point.label ? <span className="truncate font-ops-body text-ops-xs text-ops-muted">{point.label}</span> : null}
            {point.areaKind ? <Badge tone="slate">{AREA_KIND_SHORT[point.areaKind]}</Badge> : null}
            {point.isActive ? null : <Badge tone="slate">Pasif</Badge>}
          </span>
          <span className="pl-4 font-ops-body text-ops-micro text-ops-muted">
            {/* Beklenen aralık · günlük tur · son ölçüm — üçü birlikte okunmadan nokta hakkında
                karar verilemez: ne bekleniyor, ne sıklıkta bakılmalı, en son ne zaman bakıldı. */}
            {point.targetMinC !== null && point.targetMaxC !== null
              ? `${degree(point.targetMinC)} … ${degree(point.targetMaxC)} · `
              : ''}
            {point.expectedDailyChecks === 0 ? 'günlük ölçüm beklenmiyor' : `günde ${num(point.expectedDailyChecks)} ölçüm`}
            {' · '}
            {point.lastRecordedAt ? `son ölçüm ${shortDateTime(point.lastRecordedAt)}` : 'son 3 ayda ölçüm yok'}
          </span>
        </button>

        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 cursor-pointer rounded-ops-btn px-2 py-1 font-ops-body text-ops-xs text-ops-muted transition-colors hover:bg-ops-subtle hover:text-ops-ink"
        >
          Düzenle
        </button>
        {/* SİLME YOK: kayıtlı nokta veritabanında zaten silinemiyor (`restrict`) ve silinebilseydi
            denetim geçmişi sahipsiz kalırdı. Susturmak yeter. */}
        <button
          type="button"
          onClick={onToggleActive}
          className="shrink-0 cursor-pointer rounded-ops-btn px-2 py-1 font-ops-body text-ops-xs text-ops-muted transition-colors hover:bg-ops-subtle hover:text-ops-ink"
        >
          {point.isActive ? 'Pasife al' : 'Geri aç'}
        </button>
      </div>

      {open ? (
        <div className="flex flex-col gap-3 border-t border-ops-line-soft bg-ops-subtle px-3 py-3">
          <div className="flex items-center gap-2">
            <RangeTabs value={rangeMonths} onChange={onRangeChange} />
            <Tally days={days} />
          </div>
          <Calendar days={days} />
          {point.isActive ? <TodayEntry point={point} warehouseId={warehouseId} /> : null}
        </div>
      ) : null}
    </li>
  );
}

function RangeTabs({ value, onChange }: { value: number; onChange: (months: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {RANGES.map((range) => (
        <button
          key={range.months}
          type="button"
          onClick={() => onChange(range.months)}
          className={`cursor-pointer rounded-ops-btn border px-2 py-0.5 font-ops-body text-ops-xs transition-colors ${
            value === range.months
              ? 'border-ops-olive bg-ops-olive-bg font-semibold text-ops-olive-dark'
              : 'border-ops-line text-ops-muted hover:border-ops-line-strong hover:text-ops-ink'
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Pencerenin özeti — takvimin ÜSTÜNDE, çünkü "kaç gün eksik" sorusu 92 kutuyu tek tek saymadan
 * cevaplanmalı. Beklenmeyen günler (`idle`) hiç sayılmıyor: bir eksiklik değiller.
 */
function Tally({ days }: { days: readonly MeasureDayView[] }) {
  const count = (states: readonly MeasureDayState[]) => days.filter((d) => states.includes(d.state)).length;
  const missing = count(['missing']);
  const short = count(['short']);
  const deviant = count(['target', 'habit']);

  return (
    <div className="ml-auto flex items-center gap-2.5 font-ops-body text-ops-xs">
      <span className="text-ops-muted">
        <span className="font-ops-mono text-ops-olive-dark">{num(count(['ok']))}</span> tam
      </span>
      {short > 0 ? (
        <span className="text-ops-muted">
          <span className="font-ops-mono text-ops-amber-dark">{num(short)}</span> yarım
        </span>
      ) : null}
      {deviant > 0 ? (
        <span className="text-ops-muted">
          <span className="font-ops-mono text-ops-red">{num(deviant)}</span> sapma
        </span>
      ) : null}
      {missing > 0 ? (
        <span className="text-ops-muted">
          <span className="font-ops-mono text-ops-strong">{num(missing)}</span> ölçülmedi
        </span>
      ) : null}
    </div>
  );
}

// ── Takvim ──────────────────────────────────────────────────────────────────

/** Pazartesi ilk — Türkiye ve Fransa'da haftanın başı budur. */
const WEEKDAY_HEADS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];

/**
 * Gün kutusunun rengi — **dört ayrı şey söylüyor, üç değil.**
 *
 * `missing` KIRMIZI DEĞİL, boş: tesisin çalışma günü tanımı veride yok (ölçüldü 17.08), yani
 * pazar günlerini kırmızıya boyamak her hafta yalancı bir alarm üretirdi. Yokluğun kendisi zaten
 * görünür — üstteki sayaç da onu yazıyor. Renk suçlamaz, boşluk gösterir.
 *
 * `idle` hiç boyanmıyor: ölçüm beklenmeyen bir günü işaretlemek gürültüdür ve gürültü, denetimi
 * gerçek eksiklere kör eder.
 */
const DAY_CLASS: Record<MeasureDayState, string> = {
  ok: 'border-ops-olive-line bg-ops-olive-bg text-ops-olive-dark',
  target: 'border-ops-red-line bg-ops-red-bg font-semibold text-ops-red',
  habit: 'border-ops-amber-line bg-ops-amber-bg text-ops-amber-dark',
  short: 'border-dashed border-ops-amber-line bg-ops-card text-ops-amber-dark',
  missing: 'border-dashed border-ops-line-strong bg-ops-card text-ops-faint',
  idle: 'border-transparent bg-transparent text-ops-faint',
};

function Calendar({ days }: { days: readonly MeasureDayView[] }) {
  const months = useMemo(() => groupByMonth(days), [days]);

  return (
    // `overflow-visible` ŞART: tooltip kutunun dışına taşıyor ve gizlenirse ayın kenarındaki
    // günlerde yarım görünür. Yatay taşma kendi kabında akıyor (`CLAUDE` — gövde asla kaymaz).
    <div className="flex gap-4 overflow-x-auto pb-1">
      {months.map((month) => (
        <div key={month.key} className="flex shrink-0 flex-col gap-1">
          <span className="font-ops-display text-ops-xs font-semibold text-ops-muted">{month.label}</span>
          <div className="grid grid-cols-7 gap-[3px]">
            {WEEKDAY_HEADS.map((head) => (
              <span key={head} className="text-center font-ops-body text-ops-micro text-ops-faint">
                {head}
              </span>
            ))}
            {/* Ayın ilk gününü kendi haftasına oturtan boşluklar. */}
            {Array.from({ length: month.lead }, (_, i) => (
              <span key={`lead-${i}`} />
            ))}
            {month.days.map((day) => (
              <DayCell key={day.date} day={day} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DayCell({ day }: { day: MeasureDayView }) {
  return (
    <span className="group relative">
      <span
        className={`flex h-6 w-6 cursor-default items-center justify-center rounded-[4px] border font-ops-mono text-ops-micro ${DAY_CLASS[day.state]}`}
      >
        {Number(day.date.slice(8, 10))}
      </span>
      <DayTip day={day} />
    </span>
  );
}

/**
 * Günün künyesi — hover'da açılır.
 *
 * **`w-max` ŞART:** kutu `absolute` ve kabı 24 pikselik bir hücre; genişlik verilmezse metin
 * hücrenin genişliğine sıkışır ve her kelime alt satıra düşer (aynı hata harita etiketinde
 * yaşandı 16.08 — orada kap sıfır genişlikteydi).
 *
 * İçerik bir KARTTIR, cümle değil: tarih başlıkta, ölçümler alt alta saat + derece. Sapmalı olan
 * kendi rengiyle yazılıyor — hangi ölçümün sorunlu olduğu okunmadan anlaşılsın.
 */
function DayTip({ day }: { day: MeasureDayView }) {
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden w-max max-w-[16rem] -translate-x-1/2 flex-col gap-1 rounded-ops-card border border-ops-line bg-ops-card px-2.5 py-2 shadow-ops-pop group-hover:flex">
      <span className="font-ops-display text-ops-xs font-semibold text-ops-ink">{longDate(day.date)}</span>

      {day.readings.length > 0 ? (
        <span className="flex flex-col gap-0.5">
          {day.readings.map((reading) => (
            <span key={reading.at} className="flex items-baseline gap-1.5 font-ops-body text-ops-micro">
              <span className="font-ops-mono text-ops-faint">{clock(reading.at)}</span>
              <span
                className={`font-ops-mono ${
                  reading.deviation === 'target'
                    ? 'text-ops-red'
                    : reading.deviation === 'habit'
                      ? 'text-ops-amber-dark'
                      : 'text-ops-strong'
                }`}
              >
                {degree(reading.temperatureC)}
              </span>
            </span>
          ))}
        </span>
      ) : null}

      <span className="font-ops-body text-ops-micro leading-snug text-ops-muted">{dayNote(day)}</span>
    </span>
  );
}

/** Kutunun altındaki tek cümle — RENGİN NEDENİ. Renk bir işarettir, gerekçe burada yazılı. */
function dayNote(day: MeasureDayView): string {
  switch (day.state) {
    case 'idle':
      return day.expected === 0 ? 'Bu noktadan günlük ölçüm beklenmiyor.' : 'Nokta o gün henüz tanımlı değildi.';
    case 'missing':
      return `Ölçüm yok — ${num(day.expected)} bekleniyordu.`;
    case 'short':
      return `${num(day.expected)} bekleniyordu, ${num(day.readings.length)} alınmış.`;
    case 'target':
      return 'Beklenen aralığın dışında.';
    case 'habit':
      return 'Bu nokta genelde başka okuyor — yazım hatası mı, gerçek sorun mu?';
    case 'ok':
      return 'Tur tamam.';
  }
}

// ── Bugünün kaydı ───────────────────────────────────────────────────────────

/**
 * **Yalnız BUGÜN yazılır** (kullanıcı kararı 17.08). Takvimde geçmiş bir güne tıklayıp kayıt
 * eklemek de mümkündü ve kasten yapılmadı: hijyen defterine sonradan kayıt düşmek defteri denetimde
 * değersiz kılar — boş bir gün dürüsttür, sonradan doldurulmuş bir gün değildir. Kapı da buna göre
 * yazılı (`recordTemperatureAction` `recordedAt` almıyor).
 *
 * Cümle DAİMA "kaydedildi" ile başlıyor: uyarıyı ret sanan kişi aynı ölçümü ikinci kez girerdi.
 */
function TodayEntry({ point, warehouseId }: { point: MeasurePointView; warehouseId: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [degreeText, setDegreeText] = useState('');
  const [notice, setNotice] = useState<{ text: string; warn: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const value = Number(degreeText.replace(',', '.'));
  const ready = degreeText.trim().length > 0 && Number.isFinite(value);

  const submit = () => {
    if (!ready) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const { data, error: failed } = await recordTemperatureAction({
        warehouseId,
        kind: point.kind,
        pointId: point.id,
        temperatureC: value,
      });
      if (failed || !data) {
        setError(failed ?? 'Kayıt yazılamadı.');
        return;
      }
      setNotice(
        data.deviation === 'target'
          ? { text: `Kaydedildi — ${degree(value)}. Beklenen aralığın dışında.`, warn: true }
          : data.deviation === 'habit' && data.usualC !== null
            ? {
                text: `Kaydedildi — ${degree(value)}. Bu nokta genelde ${degree(data.usualC)} okuyor; yazım hatası mı, gerçek sorun mu?`,
                warn: true,
              }
            : { text: `Kaydedildi — ${degree(value)}`, warn: false },
      );
      setDegreeText('');
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-1.5 border-t border-ops-line-soft pt-2.5">
      <div className="flex items-center gap-2">
        <span className="font-ops-body text-ops-xs text-ops-muted">Bugüne ölçüm ekle</span>
        {/* **`type="text"`, `number` DEĞİL** ve sebebi ölçüldü (17.08): sayı alanı virgülü kabul
            etmiyor, oysa placeholder virgül vaat ediyor ve operasyon yüzeyi Türkçe — "−18,5" yazan
            depocunun alanı sessizce BOŞ kalıyordu. Eski sıcaklık kartından taşınan kusurdu; kodda
            zaten `replace(',', '.')` vardı, yani virgül beklendiği yazılıydı ama alan onu hiç
            görmüyordu. `inputMode="decimal"` sayısal tuş takımını yine getiriyor. */}
        <Input
          type="text"
          inputMode="decimal"
          placeholder="−18,5"
          fullWidth={false}
          className="w-24"
          value={degreeText}
          onChange={(event) => setDegreeText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
          disabled={busy}
        />
        <Button size="sm" variant="secondary" disabled={busy || !ready} onClick={submit}>
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
        {/* Geçmişe yazılamadığı SÖYLENİYOR, sessizce engellenmiyor: kuralı bilmeyen kişi eksik bir
            günü doldurmayı dener ve neden yapamadığını anlamazsa arayüzü bozuk sanır. */}
        <span className="font-ops-body text-ops-micro text-ops-faint">geçmiş günlere yazılmaz</span>
      </div>

      {error ? <span className="font-ops-body text-ops-xs text-ops-red">{error}</span> : null}
      {notice ? (
        <span className={`font-ops-body text-ops-xs ${notice.warn ? 'text-ops-amber-dark' : 'text-ops-olive-dark'}`}>
          {notice.text}
        </span>
      ) : null}
    </div>
  );
}

// ── Biçimleyiciler ──────────────────────────────────────────────────────────

/**
 * `back` ay geriye giden ayın **1'i** (`2026-06-01`) — takvim penceresinin başlangıcı.
 *
 * Metin üzerinden yürüyor, `Date` üzerinden değil: gün anahtarları zaten `YYYY-MM-DD` ve bir `Date`
 * kurmak burada yalnız saat dilimi sorusunu geri getirirdi (ayın 1'i yerel saatte bir önceki ayın
 * 30'u olabilir). Ay taşması elle: 0'ın altına düşen ay, bir önceki yıla geçer.
 */
function monthStartKey(dayKey: string, back: number): string {
  const year = Number(dayKey.slice(0, 4));
  const monthIndex = Number(dayKey.slice(5, 7)) - 1 - back;
  // `Math.floor` negatif ayda da doğru yılı verir (−1 → bir önceki yılın Aralık'ı).
  const y = year + Math.floor(monthIndex / 12);
  const m = ((monthIndex % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

/** "−18°" — eksi işareti U+2212; mono yazıtipinde tire, rakamların yanında ayraç gibi okunuyor. */
function degree(celsius: number): string {
  return `${celsius.toLocaleString('tr-TR', { maximumFractionDigits: 1 }).replace('-', '−')}°`;
}

/** "09:14" — gün içindeki sıra. UTC: gün anahtarı da UTC (`measure-rules.dayKeyOf` künyesi). */
function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

/** "17 Ağustos 2026, Pazartesi" — tooltipin başlığı; gün adı denetimde işe yarıyor (haftasonu mu). */
function longDate(dayKey: string): string {
  return new Date(`${dayKey}T12:00:00.000Z`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
    timeZone: 'UTC',
  });
}

/**
 * Günleri ay ay kutulara böler ve her ayın ilk gününü kendi hafta gününe oturtur.
 *
 * Pazartesi ilk: `getUTCDay()` pazarı 0 verir, o yüzden `(gün + 6) % 7`. Pencere ayın ortasında
 * başlıyorsa (1 ay seçilince öyle olur) ilk ayın başındaki günler zaten yok — boşluk sayısı ilk
 * VAR OLAN günün hafta gününden çıkıyor, ayın 1'inden değil.
 */
function groupByMonth(days: readonly MeasureDayView[]): Array<{ key: string; label: string; lead: number; days: MeasureDayView[] }> {
  const out: Array<{ key: string; label: string; lead: number; days: MeasureDayView[] }> = [];
  for (const day of days) {
    const key = day.date.slice(0, 7);
    const last = out[out.length - 1];
    if (last && last.key === key) {
      last.days.push(day);
      continue;
    }
    out.push({
      key,
      label: new Date(`${day.date}T12:00:00.000Z`).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      lead: (new Date(`${day.date}T12:00:00.000Z`).getUTCDay() + 6) % 7,
      days: [day],
    });
  }
  return out;
}
