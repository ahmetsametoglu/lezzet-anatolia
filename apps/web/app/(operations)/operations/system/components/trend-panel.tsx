'use client';

import { Card } from '@/components/operation/ui/card';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { TREND_WINDOWS, WINDOW_LABEL, type TrendWindow } from '../system-url';
import type { TrendChartView } from '../system-types';

/**
 * O22 · Trend paneli — anlık değer değil YÖN (18.5).
 *
 * %84 dolu bir disk, bir haftadır %84'te duruyorsa haber değil; üç günde %60'tan geldiyse haberdir.
 * Panelin bütün varlık sebebi bu ayrım.
 *
 * **Yüzdeler TAM ÖLÇEKTE çizilir — tavan 100, taban 0.** Otomatik ölçek, sabit bir değeri dramatik
 * dalgalanma gibi gösterir: %53'te duran bir disk, ekseni kendine göre daraltan bir grafikte panik
 * yaratır. Yük tavanı aşabilir ve eğri orada kırpılır; **başlıktaki sayı gerçeği söyler** — çizim
 * sınırı ölçünün sınırı değildir.
 *
 * **Boşluk çizgiyle kapatılmaz.** Ölçüm alınamamış aralıkta eğri kırılır: aradan düz bir çizgi
 * geçirmek, olmayan bir ölçümü varmış gibi göstermek olurdu (`system-read.yol`).
 *
 * Üç grafikten fazlası kurulmaz — bu bir APM panosu değil; her eklenen kutu asıl haberi seyreltir.
 */

const VB_W = 300;
const VB_H = 72;

interface TrendPanelProps {
  charts: TrendChartView[];
  empty: boolean;
  win: TrendWindow;
  onWindow: (win: TrendWindow) => void;
  /** Kayıt bu pencereyi doldurmuyor — boş grafik "sıfır" demek değil, "henüz veri yok" demek. */
  emptyBody: string;
}

export function TrendPanel({ charts, empty, win, onWindow, emptyBody }: TrendPanelProps) {
  return (
    <Card className="flex flex-col gap-4 px-[22px] py-[18px]">
      <div className="flex flex-wrap items-center gap-3.5">
        <div className="mr-auto flex flex-col gap-0.5">
          <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Trend — anlık değer değil, yön</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            Yüzde metrikleri tam ölçekte: tavan %100, taban 0. Otomatik ölçek yok.
          </span>
        </div>
        <WindowPicker win={win} onWindow={onWindow} />
      </div>

      {empty ? (
        <div className="flex flex-col items-center gap-1.5 rounded-[9px] border border-dashed border-ops-gray-500 p-[26px] text-center">
          <span className="font-ops-display text-ops-sm font-semibold text-ops-body">Bu pencere için henüz veri yok</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">{emptyBody}</span>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-[18px]">
          {charts.map((c) => (
            <TrendChart key={c.key} chart={c} />
          ))}
        </div>
      )}
    </Card>
  );
}

/**
 * Pencere seçici — tek kontrol, dört değer. Grafik başına ayrı pencere, karşılaştırmayı bozardı:
 * üç eğrinin aynı anda okunabilmesi, üçünün aynı zaman aralığına bakmasına bağlı.
 */
function WindowPicker({ win, onWindow }: { win: TrendWindow; onWindow: (w: TrendWindow) => void }) {
  return (
    <MultiToggle
      label="Trend penceresi"
      value={win}
      onChange={onWindow}
      size="sm"
      options={TREND_WINDOWS.map((w) => ({ key: w, label: WINDOW_LABEL[w] }))}
    />
  );
}

function TrendChart({ chart }: { chart: TrendChartView }) {
  const bos = chart.line === '';
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2.5">
        <span className="mr-auto font-ops-body text-ops-sm font-medium text-ops-body">{chart.title}</span>
        <span className={`font-ops-mono text-ops-lead font-medium ${chart.hot ? 'text-ops-red-dark' : bos ? 'text-ops-amber-dark' : 'text-ops-ink'}`}>
          {chart.now}
        </span>
      </div>
      <div className="relative rounded-[6px] border border-ops-line-soft bg-ops-card py-1">
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" className="block h-[78px] w-full" aria-hidden="true">
          {chart.thresholdY !== null ? (
            <line
              x1="0"
              y1={chart.thresholdY}
              x2={VB_W}
              y2={chart.thresholdY}
              className="stroke-ops-red-line"
              strokeWidth="1"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {/* Dolgu ve çizgi AYRI yol: dolgu tabana iner, çizgi inmez. Tek yolla çizilseydi boşlukta
              dolgu kapanmaz ve grafik kendi üstüne katlanırdı. */}
          <path d={chart.area} className={chart.hot ? 'fill-ops-red/10' : 'fill-ops-olive/10'} />
          <path
            d={chart.line}
            fill="none"
            className={chart.hot ? 'stroke-ops-red' : 'stroke-ops-olive'}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute right-1.5 top-0.5 font-ops-mono text-ops-micro text-ops-gray-700">100</span>
        <span className="absolute bottom-0.5 right-1.5 font-ops-mono text-ops-micro text-ops-gray-700">0</span>
        {chart.thresholdLabel ? (
          <span
            className="absolute left-1.5 font-ops-mono text-ops-micro text-ops-red-dot"
            style={{ top: chart.thresholdY !== null ? `${(chart.thresholdY / VB_H) * 78 + 8}px` : undefined }}
          >
            {chart.thresholdLabel}
          </span>
        ) : null}
      </div>
      <span className={`font-ops-body text-ops-xs font-medium leading-[1.5] ${chart.hot ? 'text-ops-red-dark' : 'text-ops-body'}`}>
        {chart.caption}
      </span>
    </div>
  );
}
