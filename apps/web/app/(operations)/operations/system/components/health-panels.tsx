import type { ReactNode } from 'react';
import { Card } from '@/components/operation/ui/card';
import type { AppCounterView, MetricRowView, MetricTone, ProcessRowView, ServiceCardView } from '../system-types';

/**
 * Sağlık panelleri (18.5): Sunucu (O21) · Süreçler · Servisler · Uygulama.
 *
 * Dördü ayrı kart çünkü dördü AYRI SORU yanıtlıyor: makine rahat mı · süreçler ayakta mı · dışarıdan
 * erişilebilir mi · uygulama sağlam mı. Tek kartta toplansalardı "makine rahat ama uygulama bozuk"
 * hâli okunamaz olurdu — panelin bütün değeri bu ayrımda.
 */

const BAR: Record<MetricTone, string> = { ok: 'bg-ops-olive-light', warn: 'bg-ops-amber-dot', crit: 'bg-ops-red' };
const VALUE: Record<MetricTone, string> = { ok: 'text-ops-ink', warn: 'text-ops-amber-dark', crit: 'text-ops-red-dark' };

function PanelCard({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3.5 px-[22px] py-[18px]">
      <div className="flex items-baseline justify-between gap-2.5">
        <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">{title}</span>
        {note ? <span className="font-ops-body text-ops-micro text-ops-faint">{note}</span> : null}
      </div>
      {children}
    </Card>
  );
}

/** O21 · ölçüm satırı — etiket + mono değer + tam ölçekli çubuk + sabit eşik + oran notu. */
function MetricRow({ row }: { row: MetricRowView }) {
  return (
    <div className={`flex flex-col gap-[5px] rounded-[8px] ${row.highlight ? 'bg-ops-white px-2.5 py-2 ring-1 ring-ops-line' : ''}`}>
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="flex-none basis-[104px] font-ops-body text-ops-sm font-medium text-ops-body">{row.label}</span>
        <span className={`min-w-0 flex-1 basis-[120px] font-ops-mono text-ops-base font-medium ${VALUE[row.tone]}`}>{row.value}</span>
        {row.tag ? (
          <span className="flex-none rounded-[5px] border border-ops-amber-line bg-ops-amber-bg px-1.5 py-[3px] font-ops-display text-ops-micro font-semibold uppercase tracking-[0.06em] text-ops-amber">
            {row.tag}
          </span>
        ) : null}
      </div>

      {row.unknown ? (
        <div className="flex items-center gap-2.5">
          <span className="flex-none basis-[104px]" />
          {/* KESİKLİ BOŞ çubuk — dolgu yok. Sıfır dolgusu "disk boş" diye okunur ve bozuk bir ölçümü
              sağlıklı bir sistem gibi gösterir (CLAUDE.md §1). Boşluk, sıfırdan başka bir şeydir. */}
          <span className="block h-2 min-w-[60px] flex-1 rounded-[2px] border border-dashed border-ops-gray-500" />
          <span className="flex-none basis-[106px] text-right font-ops-body text-ops-micro text-ops-amber">sıfır değil</span>
        </div>
      ) : row.barPct !== null ? (
        <div className="flex items-center gap-2.5">
          <span className="flex-none basis-[104px]" />
          <span className="relative block h-2 min-w-[60px] flex-1 overflow-hidden rounded-[2px] bg-ops-gray-100">
            <span className={`block h-full ${BAR[row.tone]}`} style={{ width: `${Math.max(0, Math.min(100, row.barPct))}%` }} />
          </span>
          <span className="flex-none basis-[106px] text-right font-ops-body text-ops-micro text-ops-faint">{row.threshold}</span>
        </div>
      ) : null}

      {row.note ? (
        <div className="flex gap-2.5">
          <span className="flex-none basis-[104px]" />
          <span className={`min-w-0 flex-1 font-ops-body text-ops-xs font-medium leading-[1.5] ${row.highlight ? 'text-ops-amber-dark' : 'text-ops-muted'}`}>
            {row.note}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function ServerPanel({ rows }: { rows: MetricRowView[] }) {
  return (
    <PanelCard title="Sunucu" note="eşikler sabit ve kodda testli">
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <MetricRow key={r.key} row={r} />
        ))}
      </div>
    </PanelCard>
  );
}

export function ProcessPanel({ processes }: { processes: ProcessRowView[] | null }) {
  const dusen = processes?.some((p) => p.down) ?? false;
  const cokBaslayan = processes?.find((p) => p.restartsNotable && !p.down) ?? null;

  return (
    <PanelCard title="Süreçler" note="yeniden başlama = sessiz arıza">
      {processes === null ? (
        // **"Okunamadı" ile "hiç süreç yok" AYNI ŞEY DEĞİL.** Boş liste çizilseydi hüküm sağlıklı
        // görünür, oysa süreç yöneticisine ulaşılamıyorsa hiçbir şey bilinmiyordur.
        <div className="flex flex-col gap-1.5 rounded-[9px] border border-ops-amber-line bg-ops-amber-bg px-4 py-3.5">
          <span className="font-ops-display text-ops-sm font-semibold text-ops-amber-dark">PM2 okunamadı — süreçler bilinmiyor</span>
          <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-amber-dark">
            Bu, “hiç süreç yok” demek değil: ölçüm alınamadı. Göremediğimiz için sistem hükmü uyarıya çekildi.
          </span>
        </div>
      ) : processes.length === 0 ? (
        <div className="rounded-[9px] border border-dashed border-ops-gray-500 px-4 py-3.5 font-ops-body text-ops-sm text-ops-muted">
          Süreç yöneticisi çalışıyor ama kayıtlı süreç yok — uygulama PM2 altında başlatılmamış olabilir.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[8px] border border-ops-line">
          <div className="flex items-center gap-2.5 border-b border-ops-line bg-ops-subtle px-3 py-2 font-ops-display text-ops-micro font-semibold uppercase tracking-[0.09em] text-ops-muted">
            <span className="flex-1">Süreç</span>
            <span className="w-[74px] text-right">Yeniden</span>
            <span className="w-[62px] text-right">Bellek</span>
            <span className="w-[46px] text-right">CPU</span>
          </div>
          {processes.map((p) => (
            <div key={p.name} className="flex items-center gap-2.5 border-b border-ops-line-soft px-3 py-2.5 last:border-b-0">
              <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <span className="truncate font-ops-body text-ops-sm font-medium text-ops-ink">{p.name}</span>
                <span className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${p.down ? 'bg-ops-red' : 'bg-ops-olive-light'}`} aria-hidden="true" />
                  <span className={`font-ops-mono text-ops-micro font-medium ${p.down ? 'text-ops-red-dark' : 'text-ops-body'}`}>{p.status}</span>
                </span>
              </span>
              <span
                className={`w-[74px] text-right font-ops-mono text-ops-sm font-semibold ${
                  p.restarts === 0 ? 'text-ops-faint' : p.restartsNotable ? 'text-ops-red-dark' : 'text-ops-amber-dark'
                }`}
              >
                {p.restarts}
              </span>
              <span className="w-[62px] text-right font-ops-mono text-ops-xs text-ops-body">{p.memory}</span>
              <span className="w-[46px] text-right font-ops-mono text-ops-xs text-ops-body">{p.cpu}</span>
            </div>
          ))}
          {dusen || cokBaslayan ? (
            <div className={`px-3 py-2.5 ${dusen ? 'bg-ops-red-bg' : 'bg-ops-amber-bg'}`}>
              <span className={`font-ops-body text-ops-xs font-medium leading-[1.5] ${dusen ? 'text-ops-red-dark' : 'text-ops-amber-dark'}`}>
                {dusen
                  ? '“online” olmayan süreç, sitenin bir kısmının çalışmadığı anlamına gelir.'
                  : `Yeniden başlama sayısı sessiz arızanın en iyi göstergesi: süreç “online” görünür ama ${cokBaslayan?.restarts} kez düşüp kalkmış.`}
              </span>
            </div>
          ) : null}
        </div>
      )}
    </PanelCard>
  );
}

const SERVICE_TONE: Record<ServiceCardView['tone'], string> = {
  ok: 'border-ops-olive-line bg-ops-olive-bg text-ops-olive-dark',
  warn: 'border-ops-amber-line bg-ops-amber-bg text-ops-amber-dark',
  crit: 'border-ops-red-line bg-ops-red-bg text-ops-red-dark',
  neutral: 'border-ops-line bg-ops-card text-ops-ink',
};

export function ServicesPanel({ services }: { services: ServiceCardView[] }) {
  return (
    <PanelCard title="Servisler">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
        {services.map((s) => (
          <div key={s.key} className={`flex flex-col gap-1.5 rounded-[9px] border px-3 py-3 ${SERVICE_TONE[s.tone]}`}>
            <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.08em] opacity-80">{s.label}</span>
            <span className="font-ops-display text-ops-lead font-semibold">{s.value}</span>
            <span className="font-ops-body text-ops-micro leading-[1.5] opacity-90">{s.sub}</span>
          </div>
        ))}
      </div>
    </PanelCard>
  );
}

export function AppPanel({ counters }: { counters: AppCounterView[] }) {
  return (
    <PanelCard title="Uygulama" note="son 1 saat">
      <div className="flex overflow-hidden rounded-[9px] border border-ops-line">
        {counters.map((c) => (
          <div
            key={c.key}
            className={`flex flex-1 flex-col gap-1.5 border-r border-ops-line px-4 py-3.5 last:border-r-0 ${c.tone === 'crit' ? 'bg-ops-red-bg' : ''}`}
          >
            <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.08em] text-ops-body">{c.label}</span>
            <span className={`font-ops-mono text-ops-display font-medium tracking-[-0.02em] ${VALUE[c.tone]}`}>{c.value}</span>
          </div>
        ))}
      </div>
      <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-body">
        Bu iki sayı sunucu metriklerinden başka bir şey söyler: makine rahatken uygulama bozuk olabilir.
      </span>
    </PanelCard>
  );
}
