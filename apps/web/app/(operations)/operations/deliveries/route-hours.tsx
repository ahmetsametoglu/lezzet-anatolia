'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cutoffBelongsToPreviousDay, ORDER_CUTOFF_KEY, PREP_CUTOFF_KEY } from '@lezzet/domain-core';
import { FieldShell } from '@/components/operation/form/field-shell';
import { DAY_HOURS, toMinutes, toTime, type DayHourKey } from '@/lib/settings/day-hours';

/**
 * **ROTANIN GÜN SAATLERİ** — sayı doğrusunda SÜRÜKLENEN rozetler (kullanıcı isteği 17.08).
 *
 * ── NEREDEN ÇIKTI ───────────────────────────────────────────────────────────
 * Dört eşik saati (kesim · hazırlık · çıkış · kapanış) rota ekseninde tutuluyor (kullanıcı kararı
 * 17.08, gerekçe `settings-catalog`'ta) ama girilebildiği tek yer Ayarlar → "istisna ekle" → kapsam
 * seç idi. Yani rotanın çıkış saati, rotanın kurulduğu ekranda görünmüyordu.
 *
 * ── TOOLTIP → SÜRÜKLEME (ikinci tur, aynı gün) ───────────────────────────────
 * İlk hâlde rozete tıklayınca çubuklu bir pencere açılıyordu. Kullanıcı doğrudan sürüklemeyi istedi
 * ve ölçüm onu destekledi: kaldırılan pencere içindeki çubuk 154px yani 9,6px/saat idi; ray canlıda
 * **212px** ölçüldü, iki uçtaki boşluk düşünce 172px kullanılabilir / 16 saat = **10,8px/saat** —
 * daha hassas, üstelik pencere açma-kapama adımı da düşüyor. Ara değer riski `STEP_MINUTES`
 * yuvarlamasıyla kapalı.
 *
 * ── ROZET `Chip` DEĞİL, KENDİ ROZETİ ────────────────────────────────────────
 * Bir dönem `Chip` kullanıldı ve iki sebeple bırakıldı. (1) **Ölçü:** `Chip` ortak kontrol
 * yüksekliğine bağlı (`CONTROL_H.sm` = 32px, `px-3`, `text-ops-sm`) ve o sözleşme süzgeç şeridi için
 * var — burada dört rozet alt alta duruyor, kullanıcının isteği daha kompakt bir blok (*"margin ve
 * padding'leri azalt, fontu küçült"*). `Chip`i küçültmek onu kullanan bütün süzgeçleri bozardı.
 * (2) **Anlam:** `Chip`in kendi künyesi *"çip tıklanabilir/seçilebilir bir kontrol"* diyor; buradaki
 * rozet bir kontrol değil, `role="slider"` taşıyan rayın GÖSTERGESİ. Kopyalanan şey üç renk dizisi,
 * `Chip`in sözlüğü değil — ve kopya değil, farklı bir öğenin kendi paleti (hepsi aynı token'lardan).
 *
 * ── KLAVYE BEDAVA GELMİYOR, ELLE YAZILDI ────────────────────────────────────
 * `input[type=range]` gittiği için erişilebilirliği ray taşıyor: `role="slider"` +
 * `aria-valuemin/max/now/text`, ok tuşları 15 dk, `Shift` ile 1 saat, `Home`/`End` uçlar.
 *
 * ── NEDEN DÖRT ŞERİT, TEK DOĞRU DEĞİL ───────────────────────────────────────
 * İstek *"bir sayı doğrusunda yerleşmiş saat rozetleri"*ydi. Tek doğruda rozetler üst üste binerdi
 * (bir rozet ~40px, eksende bu ~3,5 saat) ve sürüklenirken birbirini iterdi. Dört şerit tek EKSENİ
 * paylaşıyor: sayı doğrusu duruyor, binme yok. Bedava kazanç — rozetler merdiven gibi iner, sıra
 * bozulursa merdiven geri gider ve bozukluk hesaplanmadan GÖRÜNÜR.
 */

/** Sürükleme ve klavye adımı — 15 dakika. Eşik saatleri çeyrek saatten ince ayarlanmıyor. */
const STEP_MINUTES = 15;
/** `Shift` ile büyük adım: bir saat. Dört saatlik bir kaydırma dört tuşa iner. */
const COARSE_MINUTES = 60;

/**
 * Eksenin taban penceresi: 06:00–22:00. Sabit DEĞİL — dışına çıkan bir değer varsa eksen o yöne, tam
 * saate yuvarlanarak genişler. Günün tamamını çizmek kullanılan bölümü sıkıştırırdı.
 */
const AXIS_FLOOR = 6 * 60;
const AXIS_CEIL = 22 * 60;

/**
 * Rayın iki ucundaki iç boşluk, px — **rozetin YARISI kadar.**
 *
 * Slider matematiği: gösterge merkezi `[yarım, genişlik − yarım]` aralığında dolaşır, yoksa uçtaki
 * değer rayın dışına taşar (06:00 hazırlığı etiket kolonuna girerdi). Rozet genişliği metne bağlı
 * DEĞİL — dördü de `SS:DD`, yani sabit varsayılabilir. Bedeli kullanılabilir eksenin daralması ve
 * ölçüldü: 212px rayda 172px kalıyor, 10,8px/saat — kaldırdığımız çubuktan (9,6) yine iyi.
 *
 * Eksen etiketleri de AYNI aralığı kullanıyor (`AxisScale`): kenetleme yalnız rozete uygulansaydı
 * "06" yazısı ilk mümkün rozet konumundan kayar ve sayı doğrusu yalan söylerdi.
 */
const EDGE_PX = 20;

interface RouteHoursProps {
  /**
   * Bu rotaya YAZILI saatler — yalnız istisnalar. Anahtarı olmayan eşikte genel değer geçerlidir.
   *
   * Yürürlükteki değerin tamamı (`ZoneHours`) DEĞİL: taslak yalnız operatörün kararını taşımalı.
   * Genel değeri de taslağa koymak, hiç dokunulmamış bir eşiği kaydetmede istisna olarak yazardı.
   */
  exceptions: Partial<Record<DayHourKey, string | null>>;
  /** Genel (küresel) saatler — girilmemiş şeridin gösterdiği değer ve "genele dön" hedefi. */
  global: Record<DayHourKey, string>;
  /** `null` = istisnayı kaldır, bu eşik genel değeri okusun. */
  onChange: (key: DayHourKey, time: string | null) => void;
}

export function RouteHours({ exceptions, global, onChange }: RouteHoursProps) {
  const base = DAY_HOURS.map((hour) => {
    /**
     * `null` ile `undefined` burada AYNI şeyi gösteriyor: ikisi de "bu eşik genel değeri okuyor".
     * Fark yalnız kaydetmede anlamlı (`null` = var olan istisnayı sil, `undefined` = dokunulmadı).
     */
    const own = exceptions[hour.key] ?? null;
    const time = own ?? global[hour.key];
    return { ...hour, time, minutes: toMinutes(time), isException: own !== null };
  });

  /**
   * **Kesim hangi güne ait** — kararı MOTOR veriyor (`cutoffBelongsToPreviousDay`), ekran kendi
   * hesabını yapmıyor.
   *
   * Bir tur içinde burada `minutes > prepMinutes` diye yerel bir karşılaştırma vardı; motor aynı
   * kuralı uygulamaya başlayınca ikinci bir kopya olurdu ve biri bir gün ayrışsa ekran yanlış damga
   * basardı — rozet "önceki gün" derken sistem aynı günü sayardı (`CLAUDE §1`).
   *
   * Yalnız kesim bu ayrımı taşır: hazırlık · çıkış · kapanış tanımı gereği TESLİM gününün saatleri
   * (kullanıcının cümlesi: *"teslim günlerinin referansı hazırlık ve çıkış"*).
   */
  const prepTime = base.find((row) => row.key === PREP_CUTOFF_KEY)?.time;
  const rows = base.map((row) => ({
    ...row,
    isPrevDay: row.key === ORDER_CUTOFF_KEY && cutoffBelongsToPreviousDay(row.time, prepTime),
  }));

  const known = rows.flatMap((row) => (row.minutes === null ? [] : [row.minutes]));
  const axisMin = Math.min(AXIS_FLOOR, ...known.map((m) => Math.floor(m / 60) * 60));
  const axisMax = Math.max(AXIS_CEIL, ...known.map((m) => Math.ceil(m / 60) * 60));

  const cutoffRow = rows.find((row) => row.key === ORDER_CUTOFF_KEY);

  /**
   * Akış geri gidiyor mu — **kesim HARİÇ.**
   *
   * Kesim önceki güne sarkabildiği için onun "geri gitmesi" bir arıza değil, kuralın kendisi. Bir
   * dönem dördü birlikte karşılaştırılıyordu ve o hâlde her sarkan kesim yanlışlıkla bozuk sıra diye
   * uyarılıyordu. Kalan üçü tanımı gereği aynı günün saatleri, sıraları bozulursa gerçekten bozuktur.
   *
   * Ölçülemeyen saat karşılaştırmaya KATILMAZ: bilinmeyeni "sıralı" ya da "bozuk" saymak, ikisi de
   * uydurma olurdu.
   */
  const sameDayMinutes = rows
    .filter((row) => row.key !== ORDER_CUTOFF_KEY)
    .flatMap((row) => (row.minutes === null ? [] : [row.minutes]));
  const outOfOrder = sameDayMinutes.some((minutes, i) => i > 0 && minutes < (sameDayMinutes[i - 1] ?? minutes));
  const inheritedCount = rows.filter((row) => !row.isException).length;

  return (
    <FieldShell
      label="Günün saatleri"
      labelAside={inheritedCount === 0 ? 'hepsi bu rotaya özel' : `${inheritedCount}'ü genel`}
    >
      <div className="select-none rounded-ops-btn border border-ops-line bg-ops-subtle px-1.5 py-1">
        {rows.map((row) => (
          <HourTrack
            key={row.key}
            row={row}
            axisMin={axisMin}
            axisMax={axisMax}
            globalTime={global[row.key]}
            onChange={onChange}
          />
        ))}

        {/* Eksen şeritlerin ALTINDA tek kez: dördü aynı günü ölçüyor, her şeride ayrı ölçek yazmak
            onları bağımsız doğrular gibi okuturdu. */}
        <AxisScale min={axisMin} max={axisMax} />
      </div>

      {/* Uyarılarda kod adı GEÇMEZ: iç anahtar/fonksiyon adı arayüzde görünmez (`settings-catalog`
          künyesindeki kural). Operatörün ihtiyacı olan cümle sonucu anlatan cümle.

          **Bu paragraf bir AÇIK BİLDİRİMİ değil artık, kuralın kendisini anlatıyor.** Bir tur boyunca
          *"sistem bunu henüz uygulamıyor"* diyordu çünkü kural yalnız ekranda vardı; motor aynı gün
          içinde yazıldı (`upcomingDeliveryDates` + `deliveryRunWindow`), o yüzden cümle değişti.
          Kalması gerekiyor çünkü kuralın SONUCU sezgisel değil: iki saatlik bir kaydırma en yakın
          teslimi bir sonraki rota gününe atabilir. */}
      {cutoffRow?.isPrevDay ? (
        <p className="mt-1 font-ops-body text-ops-xs text-ops-red">
          Kesim hazırlıktan sonra: <strong className="font-semibold">önceki günün</strong> saati
          sayılıyor. Bu güne teslim için siparişin bir gün önce {cutoffRow.time}'a kadar gelmesi
          gerekir — bugünün seferi artık sipariş almaz.
        </p>
      ) : null}

      {outOfOrder ? (
        <p className="mt-1 font-ops-body text-ops-xs text-ops-amber-dark">
          Hazırlık, çıkış ve kapanış sırası geri gidiyor — üçü de teslim gününün saatleri, bu sırada
          olmaları gerekir.
        </p>
      ) : null}
    </FieldShell>
  );
}

/**
 * Rozetin görünümü — üç hâl, hepsi `ops-*` token'larından.
 *
 * `bg-ops-card` OPAK ve gerekli: kesikli eksen çizgisi rozetin arkasından geçiyor, saydam bir rozette
 * çizgi sayının içinden geçip okumayı bozardı.
 */
/**
 * `whitespace-nowrap` ZORUNLU: rozet eksende `absolute` duruyor, yani genişliği içeriğinden geliyor
 * ve sarma imkânı yok — sardığı an iki satıra bölünüp kapsülün dışına taşıyor (kullanıcı ekranında
 * görüldü 17.08: "önceki gün 22:00" damgası kırpılmış çıktı).
 */
const THUMB_BASE =
  'inline-flex h-6 items-center whitespace-nowrap rounded-ops-chip border px-2 font-ops-display text-ops-xs font-semibold tabular-nums';

/**
 * İki eksen çarpılıyor: **kaynak** (rotaya özel → dolu · genelden miras → çerçeveli) × **gün**
 * (teslim günü → zeytin · önceki gün → KIRMIZI, kullanıcı isteği 17.08: *"başka bir güne sarkarsa
 * kırmızıya boyayalım, görsel olarak da belli olsun"*).
 *
 * Kırmızı burada "hata" değil **"başka gün"** demek ve kullanıcının açık isteği: *"başka bir güne
 * sarkarsa kırmızıya boyayalım, görsel olarak da belli olsun."* Kural motora yazıldıktan sonra da
 * korundu — sarkan kesim artık geçerli bir hâl ama SONUCU sezgisel değil (bir günlük kayma), yani
 * en dikkat çeken işaret hâlâ doğru karşılığı.
 */
const THUMB_TONE = {
  own: 'border-ops-olive bg-ops-olive text-ops-card',
  inherited: 'border-ops-olive-line bg-ops-card text-ops-olive',
  ownPrev: 'border-ops-red bg-ops-red text-ops-card',
  inheritedPrev: 'border-ops-red-line bg-ops-red-bg text-ops-red',
  broken: 'border-ops-red-line bg-ops-red-bg text-ops-red',
} as const;

function thumbTone(row: HourRow): string {
  if (row.minutes === null) return THUMB_TONE.broken;
  if (row.isPrevDay) return row.isException ? THUMB_TONE.ownPrev : THUMB_TONE.inheritedPrev;
  return row.isException ? THUMB_TONE.own : THUMB_TONE.inherited;
}

interface HourRow {
  key: DayHourKey;
  short: string;
  label: string;
  time: string;
  minutes: number | null;
  isException: boolean;
  /** Bu saat TESLİM gününe değil, bir önceki güne ait — bugün yalnız kesimde olabilir. */
  isPrevDay: boolean;
}

interface HourTrackProps {
  row: HourRow;
  axisMin: number;
  axisMax: number;
  globalTime: string;
  onChange: (key: DayHourKey, time: string | null) => void;
}

/** Bir eşiğin şeridi: kesikli doğru + saatinin yerinde duran, sürüklenebilir rozet. */
function HourTrack({ row, axisMin, axisMax, globalTime, onChange }: HourTrackProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const span = axisMax - axisMin;
  const ratio = row.minutes === null ? 0 : (row.minutes - axisMin) / span;
  // Bozuk değerde sürükleme bir yerden başlamak zorunda: genel değer en az kötü başlangıç.
  const current = row.minutes ?? toMinutes(globalTime) ?? axisMin;

  const clamp = (minutes: number): number => Math.max(axisMin, Math.min(axisMax, minutes));
  const snap = (minutes: number): number => Math.round(minutes / STEP_MINUTES) * STEP_MINUTES;

  /** İmlecin yatay yeri → saat. Kullanılabilir aralık iki uçtaki `EDGE_PX` kadar içeride. */
  const timeAt = (clientX: number): string => {
    const rail = railRef.current;
    if (!rail) return row.time;
    const box = rail.getBoundingClientRect();
    const usable = box.width - EDGE_PX * 2;
    if (usable <= 0) return row.time;
    return toTime(clamp(snap(axisMin + ((clientX - box.left - EDGE_PX) / usable) * span)));
  };

  const nudge = (delta: number) => onChange(row.key, toTime(clamp(current + delta)));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // İmleç rozetten çıksa bile olaylar bu öğeye gelir — yakalama olmadan hızlı sürükleme kopar.
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    // Rozete basılı tutmak şart değil: rayın herhangi bir yerine basmak değeri oraya taşır.
    onChange(row.key, timeAt(event.clientX));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    onChange(row.key, timeAt(event.clientX));
  };

  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? COARSE_MINUTES : STEP_MINUTES;
    const moves: Record<string, number | 'min' | 'max'> = {
      ArrowLeft: -step,
      ArrowDown: -step,
      ArrowRight: step,
      ArrowUp: step,
      Home: 'min',
      End: 'max',
    };
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    if (move === 'min') onChange(row.key, toTime(axisMin));
    else if (move === 'max') onChange(row.key, toTime(axisMax));
    else nudge(move);
  };

  return (
    <div className="flex items-center gap-1">
      <span className="w-11 shrink-0 font-ops-body text-ops-xs text-ops-muted">{row.short}</span>

      {/* Ray SÜRÜKLEME yüzeyi ve `role="slider"` taşıyan öğe; rozet onun göstergesi. Rolün rayda
          durması işlevsel — rayın boş bir yerine basmak da değeri oraya taşıyor. `touch-none`
          olmadan tarayıcı sürüklemeyi kaydırma sanar. */}
      <div
        ref={railRef}
        role="slider"
        tabIndex={0}
        aria-label={row.label}
        aria-valuemin={axisMin}
        aria-valuemax={axisMax}
        aria-valuenow={current}
        aria-valuetext={`${row.time}${row.isPrevDay ? ' — önceki gün' : ''}${
          row.isException ? ' — bu rotaya özel' : ' — genel değer'
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onKeyDown={onKeyDown}
        className={`relative h-7 flex-1 touch-none rounded-ops-btn outline-none focus-visible:ring-2 focus-visible:ring-ops-olive-line ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {/* Çizgi rozetin dolaştığı aralıkla AYNI: uçlara kadar uzasaydı rozet çizginin bittiği yere
            hiç gelemez, eksen kullanılmayan bir kuyruk taşırdı. */}
        <div
          className="absolute top-1/2 border-t border-dashed border-ops-line"
          style={{ left: EDGE_PX, right: EDGE_PX }}
        />

        <div
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform ${
            dragging ? 'scale-105' : ''
          }`}
          style={{ left: `calc(${EDGE_PX}px + ${ratio} * (100% - ${EDGE_PX * 2}px))` }}
        >
          {/* Renk sözlüğü `thumbTone`da (kaynak × gün). Bozuk değerde konum bir varsayım (`ratio` 0)
              ama rozet kendini ilan ediyor.

              **"önceki gün" ROZETİN İÇİNDE DEĞİL, TOOLTIP'TE** (kullanıcı kararı 17.08). Bir tur
              içinde yazılıydı ve kullanıcı ekranında kırıldı: rozet eksende `absolute` durduğu için
              genişliği içeriğinden geliyor ve iki sözcük eklemek kapsülü taşırdı — 22:00'deki bir
              kesim rozeti hem sarıp ikiye bölündü hem `↩` kolonuna girdi. Görsel işaret KIRMIZI
              renk, sözcük ise `title`da. Bir de dil düzeltmesi var: "dün" DEĞİL "önceki gün" — "dün"
              bugüne göreli, oysa bu saat TESLİM gününe göre bir gün öncedir (teslim yarınsa kesim
              bugündür). */}
          <span
            title={
              row.isPrevDay
                ? `${row.label}: önceki günün ${row.time}'ı — hazırlık kapanışından sonra olduğu için bir gün geriye ait`
                : `${row.label}: ${row.time}${row.isException ? ' (bu rotaya özel)' : ' (genel değer)'}`
            }
            className={`${THUMB_BASE} ${thumbTone(row)}`}
          >
            {row.time || '—'}
          </span>
        </div>
      </div>

      {/* Geri alma SABİT kolonda: istisna doğup öldüğünde eksenin genişliği oynamasın, rozetler yer
          değiştirmesin. Yalnız istisna varken çizilir — genel değeri okuyan eşikte "genele dön"
          hiçbir şey yapmaz ve olmayan bir farkı varmış gibi gösterirdi. */}
      <div className="w-4 shrink-0 text-center">
        {row.isException ? (
          <button
            type="button"
            onClick={() => onChange(row.key, null)}
            title={`Genele dön (${globalTime})`}
            aria-label={`${row.label}: genele dön, ${globalTime}`}
            className="cursor-pointer rounded-ops-btn font-ops-body text-ops-xs text-ops-olive transition-colors hover:bg-ops-olive-bg"
          >
            ↩
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Eksenin saat işaretleri — üç saatlik adımlarla, rozetlerle AYNI aralıkta (yoksa hizasız okunur). */
function AxisScale({ min, max }: { min: number; max: number }) {
  const ticks: number[] = [];
  for (let m = min; m <= max; m += 3 * 60) ticks.push(m);

  return (
    <div className="flex items-center gap-1">
      <span className="w-11 shrink-0" />
      <div className="relative h-3.5 flex-1">
        {ticks.map((tick) => (
          <span
            key={tick}
            className="absolute top-0 -translate-x-1/2 font-ops-mono text-ops-xs tabular-nums text-ops-faint"
            style={{ left: `calc(${EDGE_PX}px + ${(tick - min) / (max - min)} * (100% - ${EDGE_PX * 2}px))` }}
          >
            {String(Math.floor(tick / 60)).padStart(2, '0')}
          </span>
        ))}
      </div>
      <span className="w-4 shrink-0" />
    </div>
  );
}
