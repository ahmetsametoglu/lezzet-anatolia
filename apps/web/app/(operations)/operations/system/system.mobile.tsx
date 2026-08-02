'use client';

import { HEALTH_COLLECT_INTERVAL_MIN } from '@lezzet/domain-core';
import { Button } from '@/components/operation/ui/button';
import { PageHeader } from '@/components/operation/ui/page-header';
import { agoLabel, num, shortDate, shortDateTime } from '@/components/operation/ui/format';
import { ERROR_PAGE_SIZE, WINDOW_LABEL } from './system-url';
import type { ErrorRowView, MetricTone, SystemViewProps } from './system-types';
import { ErrorMetaGrid, LevelBadge, LevelDot, RegressionChip, RegressionNote, ResolvedChip, contextText } from './components/error-meta';
import { CopyButton, StackBlock } from './components/stack-block';
import { VerdictBanner } from './components/verdict-banner';
import { NoSnapshot } from './system.desktop';

/**
 * Sistem — telefon (18.5). **Sıra DEĞİŞİR, ekran kısalmaz:** hüküm → hatalar → sunucu → trend.
 *
 * Gerekçe tasarımda yazılı: yolda “bir şey mi oldu” diye bakan kişi hükmü ve son hataları görmeli;
 * grafik aşağıda kalabilir. Masaüstündeki geniş inceleme yüzeyi (O25) burada YOK — telefonda iki
 * kolon okunmaz; onun yerine kart → detay yolu var ve stack o detayda **kopyalanabilir**, çünkü
 * telefonda okunan bir stack'in gideceği yer neredeyse her zaman başka bir pencere.
 *
 * Liste kırpılmaz: sayfadaki her satır kart olur ve sayfalama altta durur. Üç satır gösterip gerisini
 * yutmak, telefondan bakan kişiye “hepsi bu” demek olurdu.
 */

const VALUE_TONE: Record<MetricTone, string> = { ok: 'text-ops-ink', warn: 'text-ops-amber-dark', crit: 'text-ops-red-dark' };

export function SystemMobile(props: SystemViewProps) {
  const { data, urlState, onTab, onPage, live, ageMinutes, openId, onOpen, onResolve, resolving, resolveError } = props;
  const detay = openId ? (data.errors.find((r) => r.id === openId) ?? null) : null;

  if (detay) return <MobileDetail row={detay} onBack={() => onOpen(null)} onResolve={onResolve} resolving={resolving === detay.id} />;

  const stale = data.health?.stale ?? false;
  const sayfaAdedi = Math.max(1, Math.ceil(data.errorTotal / ERROR_PAGE_SIZE));

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Sistem" compact>
        <span
          className={[
            'flex items-center gap-1.5 rounded-[14px] border px-2.5 py-1.5',
            !data.health
              ? 'border-ops-gray-300 bg-ops-gray-100'
              : stale
                ? 'border-ops-red-line bg-ops-red-bg'
                : 'border-ops-olive-line bg-ops-olive-bg',
          ].join(' ')}
        >
          <span
            className={[
              'h-1.5 w-1.5 rounded-full',
              !data.health ? 'bg-ops-gray-700' : stale ? 'animate-pulse bg-ops-red' : 'animate-pulse bg-ops-olive-light',
            ].join(' ')}
            aria-hidden="true"
          />
          <span className={`font-ops-mono text-[10.5px] font-medium ${stale ? 'text-ops-red-dark' : 'text-ops-body'}`}>
            {data.health ? agoLabel(ageMinutes ?? data.health.ageMinutes) : 'ölçüm yok'}
          </span>
        </span>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3.5 px-4 py-3.5">
          {data.health ? <VerdictBanner health={data.health} ageMinutes={ageMinutes ?? data.health.ageMinutes} compact /> : <NoSnapshot />}

          {/* ── Hatalar: telefonun ikinci sorusu ── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <span className="mr-auto font-ops-display text-ops-sm font-semibold text-ops-ink">
                {urlState.tab === 'acik' ? 'Açık hatalar' : 'Çözülmüş hatalar'}
              </span>
              <button
                type="button"
                onClick={() => onTab(urlState.tab === 'acik' ? 'cozulmus' : 'acik')}
                className="cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-olive"
              >
                {urlState.tab === 'acik' ? `Çözülmüş (${data.counts.resolved})` : `Açık (${data.counts.open})`}
              </button>
            </div>

            {resolveError ? (
              <span className="rounded-[9px] border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-xs text-ops-red-dark">
                {resolveError}
              </span>
            ) : null}

            {data.errors.length === 0 ? (
              <div className="flex flex-col gap-1 rounded-[11px] border border-dashed border-ops-gray-500 p-4">
                <span className="font-ops-display text-ops-sm font-semibold text-ops-strong">
                  {urlState.tab === 'acik' ? 'Açık hata yok' : 'Çözüldü işaretlenmiş kayıt yok'}
                </span>
                <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
                  {data.loggingSince === null
                    ? 'Hata kaydı henüz hiç yazılmadı — sessizlik burada bilgi taşımaz.'
                    : `kayıt başlangıcı: ${shortDate(data.loggingSince)}`}
                </span>
              </div>
            ) : (
              data.errors.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onOpen(r.id)}
                  className="flex cursor-pointer flex-col gap-1.5 rounded-[11px] border border-ops-line bg-ops-white px-3 py-2.5 text-left"
                >
                  <span className="flex items-center gap-[7px]">
                    <LevelDot level={r.level} />
                    <span className="font-ops-display text-[9.5px] font-semibold uppercase tracking-[0.07em] text-ops-body">{r.level}</span>
                    {r.regression ? <RegressionChip /> : null}
                    <span className="ml-auto font-ops-mono text-[10.5px] font-medium text-ops-muted">
                      {num(r.count)}× · {shortDateTime(r.lastSeenAt)}
                    </span>
                  </span>
                  <span className="font-ops-body text-ops-sm font-medium leading-[1.45] text-ops-ink">{r.message}</span>
                  <span className="truncate font-ops-mono text-[10.5px] text-ops-muted">
                    {r.source}
                    {r.path ? ` · ${r.path}` : ''}
                  </span>
                </button>
              ))
            )}

            {data.errorTotal > ERROR_PAGE_SIZE ? (
              <div className="flex items-center gap-2 pt-1">
                <span className="mr-auto font-ops-mono text-ops-micro text-ops-muted">
                  sayfa {urlState.page + 1}/{sayfaAdedi} · {data.errorTotal} kayıt
                </span>
                <Button size="sm" variant="secondary" disabled={urlState.page === 0} onClick={() => onPage(urlState.page - 1)}>
                  ←
                </Button>
                <Button size="sm" variant="secondary" disabled={urlState.page >= sayfaAdedi - 1} onClick={() => onPage(urlState.page + 1)}>
                  →
                </Button>
              </div>
            ) : null}
          </div>

          {/* ── Sunucu özeti: dört satır, çubuk yok ── */}
          {data.health ? (
            <div className="flex flex-col gap-2">
              <span className="font-ops-display text-ops-sm font-semibold text-ops-ink">Sunucu</span>
              <div className="overflow-hidden rounded-[11px] border border-ops-line">
                {data.health.mobileRows.map((m) => (
                  <div key={m.key} className="flex items-center gap-2.5 border-b border-ops-line-soft px-3 py-2.5 last:border-b-0">
                    <span className="flex-1 font-ops-body text-ops-xs text-ops-body">{m.label}</span>
                    <span className={`font-ops-mono text-ops-sm font-medium ${VALUE_TONE[m.tone]}`}>{m.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* ── Trend: TEK grafik (disk) — telefonda üç eğri karşılaştırılmaz ── */}
          <div className="flex flex-col gap-1.5 pb-2">
            <div className="flex items-baseline gap-2">
              <span className="mr-auto font-ops-display text-ops-sm font-semibold text-ops-ink">Trend · disk</span>
              <span className="font-ops-mono text-[10.5px] font-medium text-ops-muted">{WINDOW_LABEL[urlState.win]} · tam ölçek</span>
            </div>
            <MobileDiskTrend {...props} />
          </div>

          <span className="pb-2 text-center font-ops-body text-[10.5px] leading-[1.5] text-ops-muted">
            Ölçüm {HEALTH_COLLECT_INTERVAL_MIN} dakikada bir yazılır. Silme yok — “çözüldü” yalnız odaktan çıkarır.
            {live.active ? '' : ' Otomatik tazeleme kapalı.'}
          </span>
        </div>
      </div>
    </div>
  );
}

function MobileDiskTrend({ data, urlState }: SystemViewProps) {
  const disk = data.charts.find((c) => c.key === 'disk');
  if (data.trendEmpty || !disk || disk.line === '') {
    return (
      <span className="rounded-[9px] border border-dashed border-ops-gray-500 p-3 font-ops-body text-ops-micro leading-[1.5] text-ops-muted">
        {WINDOW_LABEL[urlState.win]} penceresi için çizilecek değer yok. Boş grafik “sıfır” demek değil.
      </span>
    );
  }
  return (
    <>
      <div className="rounded-[9px] border border-ops-line-soft bg-ops-card py-1">
        <svg viewBox="0 0 300 72" preserveAspectRatio="none" className="block h-14 w-full" aria-hidden="true">
          {disk.thresholdY !== null ? (
            <line x1="0" y1={disk.thresholdY} x2="300" y2={disk.thresholdY} className="stroke-ops-red-line" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          ) : null}
          <path d={disk.area} className={disk.hot ? 'fill-ops-red/10' : 'fill-ops-olive/10'} />
          <path d={disk.line} fill="none" className={disk.hot ? 'stroke-ops-red' : 'stroke-ops-olive'} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
      </div>
      <span className={`font-ops-body text-ops-micro font-medium leading-[1.45] ${disk.hot ? 'text-ops-red-dark' : 'text-ops-body'}`}>
        {disk.caption}
      </span>
    </>
  );
}

/**
 * Telefon hata detayı — listenin yerine geçen ikinci yüzey (ayrı rota DEĞİL).
 *
 * Rota açılsaydı geri tuşu sayfayı yeniden okutur, sekme ve sayfa durumu URL'den yeniden kurulurdu;
 * oysa buradaki geri hareketi bir gezinme değil, aynı ekranda bir görünüm değişimi.
 */
function MobileDetail({
  row,
  onBack,
  onResolve,
  resolving,
}: {
  row: ErrorRowView;
  onBack: () => void;
  onResolve: (id: string) => void;
  resolving: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <div className="flex items-center gap-2.5 border-b border-ops-line px-4 py-3.5">
        <button type="button" onClick={onBack} aria-label="Listeye dön" className="cursor-pointer font-ops-display text-[15px] font-medium text-ops-body">
          ←
        </button>
        <span className="mr-auto font-ops-display text-[15px] font-semibold text-ops-ink">Hata detayı</span>
        <span className="font-ops-mono text-[10.5px] font-medium text-ops-muted">{num(row.count)}×</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3.5 px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-[7px]">
            <LevelBadge level={row.level} />
            <span className="font-ops-mono text-[10.5px] text-ops-body">{row.source}</span>
            {row.resolvedAt ? <ResolvedChip at={row.resolvedAt} by={row.resolvedByName} /> : null}
          </div>
          <span className="font-ops-body text-ops-sm font-medium leading-[1.5] text-ops-ink">{row.message}</span>

          <RegressionNote row={row} />
          <ErrorMetaGrid row={row} columns="list" />

          <div className="flex flex-col gap-2">
            <span className="font-ops-display text-ops-xs font-semibold text-ops-ink">Stack</span>
            <StackBlock stack={row.stack} size="mobile" />
            <div className="flex gap-2">
              {/* İki ayrı kopyalama, çünkü iki ayrı ihtiyaç: stack geliştiriciye, bağlam bir mesaja. */}
              <span className="flex-1">
                <CopyButton text={row.stack ?? ''} label="Stack’i kopyala" fullWidth />
              </span>
              <span className="flex-1">
                <CopyButton text={contextText(row)} label="Bağlamı kopyala" fullWidth />
              </span>
            </div>
          </div>

          {!row.resolvedAt ? (
            <Button variant="primary" fullWidth disabled={resolving} onClick={() => onResolve(row.id)}>
              {resolving ? 'İşaretleniyor…' : 'Çözüldü'}
            </Button>
          ) : null}
          <span className="pb-2 text-center font-ops-body text-[10.5px] leading-[1.5] text-ops-muted">
            Silme yok — kayıt kalır, yalnız odaktan çıkar.
          </span>
        </div>
      </div>
    </div>
  );
}
