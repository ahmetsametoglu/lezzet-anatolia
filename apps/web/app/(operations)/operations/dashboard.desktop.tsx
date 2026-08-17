import Link from 'next/link';
import { Card } from '@/components/operation/ui/card';
import type { OpsTone } from '@/components/operation/ui/tone';
import { num } from '@/components/operation/ui/format';
import type {
  AlertBandView,
  DashboardData,
  DeliveryRouteView,
  FlowStepView,
  KpiCardView,
  QueueGroupView,
  RoutePulseView,
} from './dashboard-types';

// Panel (09.3) sunumu — operasyon web'i masaüstü-yalnız (`CLAUDE §2`); mobil deneyim native
// uygulamada. Renk YOK, ton var: her blok `OpsTone`u kendi sınıflarına çeviriyor (`tone.ts` kuralı).
//
// Ekranın sözleşmesi: **karar tetikler, iş bitirmez.** Bu yüzden burada tek etkileşim KÖPRÜ'dür —
// form, düğme aksiyonu, satır seçimi yok. Durum da yok, o yüzden istemci katmanı hiç kurulmadı.

const TEXT_TONE: Record<OpsTone, string> = {
  neutral: 'text-ops-muted',
  olive: 'text-ops-olive-dark',
  amber: 'text-ops-amber-dark',
  red: 'text-ops-red-dark',
  blue: 'text-ops-blue-dark',
  slate: 'text-ops-slate-dark',
  violet: 'text-ops-violet',
};

const EDGE_TONE: Record<OpsTone, string> = {
  neutral: 'border-l-ops-line-strong bg-ops-card',
  olive: 'border-l-ops-olive bg-ops-olive-bg',
  amber: 'border-l-ops-amber bg-ops-amber-bg',
  red: 'border-l-ops-red bg-ops-red-bg',
  blue: 'border-l-ops-blue bg-ops-blue-bg',
  slate: 'border-l-ops-slate bg-ops-slate-bg',
  violet: 'border-l-ops-violet bg-ops-violet-bg',
};

const DOT_TONE: Record<OpsTone, string> = {
  neutral: 'bg-ops-line-strong',
  olive: 'bg-ops-olive',
  amber: 'bg-ops-amber',
  red: 'bg-ops-red',
  blue: 'bg-ops-blue',
  slate: 'bg-ops-slate',
  violet: 'bg-ops-violet',
};

interface DashboardDesktopProps {
  data: DashboardData;
}

export function DashboardDesktop({ data }: DashboardDesktopProps) {
  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline gap-3">
          <h1 className="font-ops-display text-ops-title font-semibold text-ops-ink">Bugün · {data.now.label}</h1>
          <span className="font-ops-body text-ops-base text-ops-muted">{data.now.time}</span>
        </div>
        <p className="font-ops-body text-ops-sm text-ops-muted">
          {data.scopeLabel} · karar tetikler, analiz etmez · derin analiz Raporlar &amp; Analitik&apos;te
        </p>
      </header>

      <AlertBand band={data.band} />

      {data.kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {data.kpis.map((kpi) => (
            <KpiCard key={kpi.key} kpi={kpi} />
          ))}
        </div>
      )}

      {data.flow.length > 0 && <FlowStrip steps={data.flow} />}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <QueueColumn data={data} />
        <div className="flex flex-col gap-5">
          <DeliveriesPanel routes={data.routes} />
          <PulsePanel pulse={data.pulse} />
        </div>
      </div>
    </div>
  );
}

/** Üst şerit — günün tek en yakın eşiği. Sakin günde kutlar, uyarmaz (ton `olive`). */
function AlertBand({ band }: { band: AlertBandView }) {
  return (
    <section className="flex items-start justify-between gap-6 rounded-ops-card bg-ops-alarm p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${band.tone === 'olive' ? 'bg-ops-olive-light' : 'bg-ops-alarm-dot'}`} />
          <span className="font-ops-body text-ops-micro font-semibold tracking-wide text-ops-alarm-muted">
            {band.eyebrow}
          </span>
        </div>
        <h2 className="max-w-2xl font-ops-display text-ops-lead font-semibold text-ops-alarm-ink">{band.headline}</h2>
        {band.detail && <p className="max-w-2xl font-ops-body text-ops-sm text-ops-alarm-muted">{band.detail}</p>}
      </div>
      {(band.primary ?? band.secondary) && (
        <div className="flex shrink-0 items-center gap-3">
          {band.primary && (
            <Link
              href={band.primary.href}
              className="cursor-pointer rounded-ops-btn bg-ops-olive px-4 py-2 font-ops-body text-ops-sm font-semibold text-ops-white transition-colors hover:bg-ops-olive-dark"
            >
              {band.primary.label}
            </Link>
          )}
          {band.secondary && (
            <Link
              href={band.secondary.href}
              className="cursor-pointer rounded-ops-btn border border-ops-alarm-inset-line bg-ops-alarm-inset px-4 py-2 font-ops-body text-ops-sm font-semibold text-ops-alarm-ink transition-colors hover:border-ops-alarm-muted"
            >
              {band.secondary.label}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

/** Gösterge kartı. Seri BOŞSA çubuklar hiç çizilmez — ölçülmeyen sıfır değildir (`CLAUDE §1`). */
function KpiCard({ kpi }: { kpi: KpiCardView }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <span className="font-ops-body text-ops-micro font-semibold tracking-wide text-ops-muted uppercase">
        {kpi.label}
      </span>
      <div className="flex items-end justify-between gap-3">
        <span className="font-ops-display text-ops-display font-semibold text-ops-ink">{kpi.value}</span>
        {kpi.series.length > 0 && <Sparkline series={kpi.series} tone={kpi.deltaTone} />}
      </div>
      <div className="flex flex-col gap-1">
        {kpi.delta && <span className={`font-ops-body text-ops-xs ${TEXT_TONE[kpi.deltaTone]}`}>{kpi.delta}</span>}
        {kpi.split && <span className="font-ops-body text-ops-xs text-ops-muted">{kpi.split}</span>}
      </div>
      <Link
        href={kpi.link.href}
        className="cursor-pointer font-ops-body text-ops-xs font-semibold text-ops-olive-dark transition-colors hover:text-ops-ink"
      >
        {kpi.link.label}
      </Link>
    </Card>
  );
}

/** Yedi günlük seyir — son çubuk bugündür ve tonu taşır; öncekiler soluk kalır. */
function Sparkline({ series, tone }: { series: number[]; tone: OpsTone }) {
  const max = Math.max(...series, 1);
  return (
    <div className="flex h-6 items-end gap-0.5" aria-hidden>
      {series.map((value, i) => (
        <span
          key={i}
          className={`w-1.5 rounded-sm ${i === series.length - 1 ? DOT_TONE[tone] : 'bg-ops-olive-light'}`}
          style={{ height: `${Math.max(2, Math.round((value / max) * 24))}px` }}
        />
      ))}
    </div>
  );
}

/**
 * Gün akışı — dört eşik. Geçmiş adım sonucuyla durur, "şimdi" vurgulanır, sıradakiler bekler.
 * Eşik saatleri ayardan gelir; okunamayan eşik hiç çizilmez (uydurma saat, yanlış yönlendirmedir).
 */
function FlowStrip({ steps }: { steps: FlowStepView[] }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-ops-display text-ops-section font-semibold text-ops-ink">Gün akışı</h2>
        <span className="font-ops-body text-ops-xs text-ops-muted">eşik saatleri ayardan okunur</span>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {steps.map((step) => (
          <Card
            key={step.key}
            className={`flex flex-col gap-2 border-l-2 p-4 ${step.state === 'now' ? EDGE_TONE[step.tone] : 'border-l-ops-line-strong'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${step.state === 'later' ? 'bg-ops-line-strong' : DOT_TONE[step.tone]}`} />
                <span className="font-ops-body text-ops-sm font-semibold text-ops-ink">{step.time}</span>
              </span>
              <span className={`font-ops-body text-ops-micro ${step.state === 'now' ? TEXT_TONE[step.tone] : 'text-ops-muted'}`}>
                {step.state === 'done' ? 'tamam' : (step.countdown ?? 'sırada')}
              </span>
            </div>
            <span className="font-ops-body text-ops-sm text-ops-body">{step.title}</span>
            <span className="font-ops-body text-ops-xs text-ops-muted">{step.note}</span>
            {/* Saat rotaya bağlı; rotalar ayrışıyorsa kutu EN ERKEN olanı gösterir ve kimin olduğunu
                söyler — yoksa operatör hangi araca koşacağını bilemez (kullanıcı kararı 17.08). */}
            {step.routeLabel && (
              <span className="font-ops-body text-ops-micro text-ops-muted">en erken: {step.routeLabel}</span>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}

/** Bekleyen işler — üç aciliyet kümesi + asistan önerileri. Boş kuyruk "temiz masa"dır. */
function QueueColumn({ data }: { data: DashboardData }) {
  const total = data.queue.reduce((sum, g) => sum + g.items.reduce((s, i) => s + i.count, 0), 0);

  return (
    <section id="bekleyen-isler" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-ops-display text-ops-section font-semibold text-ops-ink">Bekleyen işler</h2>
        {total > 0 && <span className="font-ops-body text-ops-xs text-ops-muted">{num(total)} kalem</span>}
      </div>

      {data.queue.length === 0 ? (
        <Card className="flex flex-col gap-1 border-l-2 border-l-ops-olive bg-ops-olive-bg p-5">
          <span className="font-ops-body text-ops-base font-semibold text-ops-ink">Bekleyen iş yok — masa temiz</span>
          <span className="font-ops-body text-ops-sm text-ops-muted">
            Onay, talep, gecikmiş vade ve tarihli parti kuyruğu boş. Bugün karar bekleyen bir şey yok.
          </span>
        </Card>
      ) : (
        data.queue.map((group) => <QueueGroup key={group.key} group={group} />)
      )}

      {data.proposals && (
        <Card className="flex items-start justify-between gap-4 border-l-2 border-l-ops-violet bg-ops-violet-bg p-4">
          <div className="flex flex-col gap-1">
            <span className="font-ops-body text-ops-sm font-semibold text-ops-ink">
              {num(data.proposals.count)} asistan önerisi bekliyor
            </span>
            <span className="font-ops-body text-ops-xs text-ops-muted">{data.proposals.detail}</span>
          </div>
          <Link
            href={data.proposals.href}
            className="shrink-0 cursor-pointer font-ops-body text-ops-xs font-semibold text-ops-violet transition-colors hover:text-ops-ink"
          >
            Kuyruğa git →
          </Link>
        </Card>
      )}
    </section>
  );
}

function QueueGroup({ group }: { group: QueueGroupView }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="font-ops-body text-ops-micro font-semibold tracking-wide text-ops-muted uppercase">
          {group.title}
        </span>
        <span className="font-ops-body text-ops-micro text-ops-muted">{group.summary}</span>
      </div>
      {group.items.map((item) => (
        <Card key={item.key} className={`flex items-start gap-4 border-l-2 p-4 ${EDGE_TONE[item.tone]}`}>
          <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">{num(item.count)}</span>
          <div className="flex flex-1 flex-col gap-1">
            <span className="flex items-baseline gap-2">
              <span className="font-ops-body text-ops-sm font-semibold text-ops-ink">{item.title}</span>
              {item.stamp && (
                <span className={`font-ops-body text-ops-micro ${TEXT_TONE[item.tone]}`}>{item.stamp}</span>
              )}
            </span>
            <span className="font-ops-body text-ops-xs text-ops-muted">{item.detail}</span>
          </div>
          <Link
            href={item.link.href}
            className="shrink-0 cursor-pointer font-ops-body text-ops-xs font-semibold text-ops-olive-dark transition-colors hover:text-ops-ink"
          >
            {item.link.label}
          </Link>
        </Card>
      ))}
    </div>
  );
}

/**
 * Bugünün teslimatları — duraklar DURUMA göre gruplanmış sırada gelir; numara verilmez ve
 * gelecek durak için saat gösterilmez (`design/KARARLAR.md` › Panel 17.08).
 */
function DeliveriesPanel({ routes }: { routes: DeliveryRouteView[] }) {
  const stopCount = routes.reduce((sum, r) => sum + r.totalCount, 0);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-ops-display text-ops-section font-semibold text-ops-ink">Bugünün teslimatları</h2>
        <span className="font-ops-body text-ops-xs text-ops-muted">
          {routes.length > 0 ? `${num(stopCount)} durak · ${num(routes.length)} rota` : 'rota siparişi yok'}
        </span>
      </div>

      {routes.length === 0 ? (
        <Card className="p-5">
          <span className="font-ops-body text-ops-sm text-ops-muted">
            Bugüne rota siparişi yazılmadı — yalnız kargo ve bekleyen işler var.
          </span>
        </Card>
      ) : (
        routes.map((route) => (
          <Card key={route.key} className="flex flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-ops-line px-4 py-3">
              <span className="flex items-baseline gap-2">
                <span className="font-ops-body text-ops-sm font-semibold text-ops-ink">{route.courierName}</span>
                {route.warehouseCode && (
                  <span className="rounded-ops-chip bg-ops-slate-bg px-2 py-0.5 font-ops-body text-ops-micro font-semibold text-ops-slate-dark">
                    {route.warehouseCode}
                  </span>
                )}
              </span>
              <span className="font-ops-body text-ops-xs text-ops-muted">
                {num(route.deliveredCount)} / {num(route.totalCount)} teslim
              </span>
            </div>
            <ul className="flex flex-col">
              {route.stops.map((stop) => (
                <li
                  key={stop.orderId}
                  className="flex items-center gap-3 border-b border-ops-line-soft px-4 py-2.5 last:border-b-0"
                >
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="font-ops-body text-ops-sm text-ops-ink">{stop.customerName}</span>
                    <span className="font-ops-body text-ops-micro text-ops-muted">
                      {stop.itemsLabel} · {stop.channelLabel}
                      {stop.dueLabel ? ` · ${stop.dueLabel}` : ''}
                    </span>
                  </div>
                  {/* Saat YALNIZ olmuş durakta: gelecek durak için tahmin yok ve olmayacak. */}
                  {stop.time && <span className="font-ops-body text-ops-xs text-ops-muted">{stop.time}</span>}
                  <span
                    className={`rounded-ops-chip px-2 py-0.5 font-ops-body text-ops-micro font-semibold ${EDGE_TONE[stop.tone]} ${TEXT_TONE[stop.tone]} border-l-0`}
                  >
                    {stop.statusLabel}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </section>
  );
}

/**
 * Rota nabzı — YALNIZ hazırlık ilerlemesi; çalışan/verim ölçmez (tezgâh sözleşmesi).
 *
 * Satır **rota**, çünkü kesim rotaya bağlı (kullanıcı kararı 17.08). Depo kodu çip olarak durur:
 * "hangi tesisten çıkıyor" bilgisi kaybolmaz, ama ölçü rotanın kendi kesimidir.
 */
function PulsePanel({ pulse }: { pulse: RoutePulseView[] }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-ops-display text-ops-section font-semibold text-ops-ink">Rota nabzı</h2>
        <span className="font-ops-body text-ops-xs text-ops-muted">her rota kendi kesimine göre</span>
      </div>

      {pulse.length === 0 ? (
        <Card className="p-5">
          <span className="font-ops-body text-ops-sm text-ops-muted">Bugüne hiçbir rotaya sipariş yazılmadı.</span>
        </Card>
      ) : (
        pulse.map((row) => {
          const ratio = row.totalCount === 0 ? 0 : Math.round((row.readyCount / row.totalCount) * 100);
          return (
            <Card key={row.zoneId} className={`flex flex-col gap-2 border-l-2 p-4 ${EDGE_TONE[row.tone]}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-baseline gap-2">
                  {row.warehouseCode && (
                    <span className="rounded-ops-chip bg-ops-slate-bg px-2 py-0.5 font-ops-body text-ops-micro font-semibold text-ops-slate-dark">
                      {row.warehouseCode}
                    </span>
                  )}
                  <span className="font-ops-body text-ops-sm font-semibold text-ops-ink">{row.zoneName}</span>
                </span>
                <span className="font-ops-body text-ops-xs text-ops-muted">
                  {num(row.readyCount)}/{num(row.totalCount)} hazır
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-ops-line-soft">
                <span className={`block h-full rounded-full ${DOT_TONE[row.tone]}`} style={{ width: `${ratio}%` }} />
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-ops-body text-ops-xs text-ops-muted">{row.note}</span>
                <span className={`font-ops-body text-ops-micro font-semibold ${TEXT_TONE[row.tone]}`}>
                  {row.statusLabel}
                </span>
              </div>
            </Card>
          );
        })
      )}
    </section>
  );
}
