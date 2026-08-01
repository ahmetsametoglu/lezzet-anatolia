'use client';

import { ControlBar } from './components/control-bar';
import { ErrorPanel } from './components/error-panel';
import { AppPanel, ProcessPanel, ServerPanel, ServicesPanel } from './components/health-panels';
import { TrendPanel } from './components/trend-panel';
import { VerdictBanner } from './components/verdict-banner';
import { WINDOW_LABEL } from './system-url';
import type { SystemViewProps } from './system-types';

/**
 * Sistem — masaüstü (18.5). **Masaüstü öncelikli ve bu bilinçli bir sapma:** operasyonun geri kalanı
 * telefon önceliklidir, bu ekran değil. Buraya bir sorun ARAŞTIRILIRKEN bakılır; stack okumak ve
 * trend karşılaştırmak geniş ekran işidir (`admin-sistem.md §7`).
 *
 * Sıra hükümden ayrıntıya iner: hüküm → sunucu/süreç → servis/uygulama → trend → hatalar. Kötü
 * durumun panelin GİRİŞİNDE olması zorunlu — alarmın yerini tutan bir ekranda haberin listenin
 * içinde saklanması, haberin olmaması demektir.
 */
export function SystemDesktop(props: SystemViewProps) {
  const { data, urlState, search, onSearch, onTab, onWindow, onPage, navPending, live, ageMinutes } = props;
  const { selectedId, onSelect, onOpen, onResolve, resolving, resolveError } = props;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <ControlBar live={live} stale={data.health?.stale ?? false} hasSnapshot={data.health !== null} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-[22px] px-6 py-[22px]">
          {data.health ? (
            <>
              <VerdictBanner health={data.health} ageMinutes={ageMinutes ?? data.health.ageMinutes} />

              <div className="grid grid-cols-[repeat(auto-fit,minmax(330px,1fr))] gap-[18px]">
                <ServerPanel rows={data.health.serverRows} />
                <ProcessPanel processes={data.health.processes} />
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(330px,1fr))] gap-[18px]">
                <ServicesPanel services={data.health.services} />
                <AppPanel counters={data.health.appCounters} />
              </div>
            </>
          ) : (
            <NoSnapshot />
          )}

          <TrendPanel
            charts={data.charts}
            empty={data.trendEmpty}
            win={urlState.win}
            onWindow={onWindow}
            emptyBody={`${WINDOW_LABEL[urlState.win]} penceresini dolduracak kadar görüntü yok. Toplama iki dakikada bir yazar; daha dar bir pencere çizilebilir.`}
          />

          <ErrorPanel
            data={data}
            tab={urlState.tab}
            onTab={onTab}
            search={search}
            onSearch={onSearch}
            page={urlState.page}
            onPage={onPage}
            busy={navPending}
            selectedId={selectedId}
            onSelect={onSelect}
            onOpen={onOpen}
            onResolve={onResolve}
            resolving={resolving}
            resolveError={resolveError}
          />

          <div className="flex items-start gap-2.5 rounded-[9px] border border-ops-gray-300 bg-ops-gray-100 px-3.5 py-3">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className="mt-px flex-none text-ops-body" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8h.01M12 11v5" />
            </svg>
            <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-body">
              Silme yok: “çözüldü” yalnız odaktan çıkarır, kayıt saklama süresi bitene kadar durur. Bağlamda kimlik var, içerik
              yok — sipariş numarası görünür; e-posta, telefon, adres görünmez. Ham log akışı buraya taşınmaz, süreç
              yöneticisinde durur.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Hiç görüntü alınmamış. **"Sağlıklı" DEĞİL, "ölçüm yok".** Boş bir sağlık paneli çizmek ya da
 * sıfırlar göstermek, izlemenin hiç başlamadığı bir sistemi sorunsuz gibi okutur — bu ekranın
 * yapabileceği en tehlikeli şey. O yüzden kutu hükmün DURDUĞU yerde ve onun sesiyle duruyor.
 */
export function NoSnapshot() {
  return (
    <div className="flex flex-col gap-2 rounded-[12px] border-[1.5px] border-ops-amber-line bg-ops-amber-bg px-[22px] py-5">
      <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.16em] text-ops-amber">Ölçüm yok</span>
      <span className="font-ops-display text-[28px] font-bold leading-[1.05] tracking-[-0.02em] text-ops-amber-dark">
        Henüz hiç sağlık görüntüsü alınmamış
      </span>
      <span className="max-w-[620px] font-ops-body text-ops-base leading-[1.6] text-ops-amber-dark">
        Bu, “sistem sağlıklı” demek değil: ölçüm hiç yazılmamış. Görüntüyü backend süreci iki dakikada bir alır —
        çalışmıyorsa gösterilecek bir şey yok. Sessizliği sağlık sanmamak için burada bir hüküm yazılmıyor.
      </span>
    </div>
  );
}
