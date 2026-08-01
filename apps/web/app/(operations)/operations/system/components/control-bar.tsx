'use client';

import { HEALTH_COLLECT_INTERVAL_MIN } from '@lezzet/domain-core';
import { Button } from '@/components/operation/ui/button';
import { PageHeader } from '@/components/operation/ui/page-header';
import type { SystemViewProps } from '../system-types';

/**
 * Kontrol barı — canlı göstergesi + duraklat + şimdi yenile (18.5).
 *
 * **"Şimdi yenile" ÖLÇÜM ALDIRMAZ, son görüntüyü yeniden okur.** Görüntüyü backend cron'u yazıyor ve
 * web'in backend'e çağrı kanalı yok; düğmenin dürüst karşılığı `router.refresh()`'tir. Bunun görünür
 * olması şart: "yeniledim, hâlâ aynı" diyen operatör, ölçümün iki dakikada bir geldiğini bilmiyorsa
 * ekranın bozuk olduğunu sanır. Geri sayım bu yüzden "sonraki ÖLÇÜM" der.
 *
 * **Sahte tazelik yok.** Bayat ölçümde gösterge yeşil yanıp sönmez — kırmızıya döner ve "akış
 * kesildi" der. Ekran, elindeki verinin yaşını saklamaz (`admin-sistem.md §6`).
 */

function geriSayim(saniye: number): string {
  const dk = Math.floor(saniye / 60);
  const sn = saniye % 60;
  return dk > 0 ? `${dk} dk ${String(sn).padStart(2, '0')} sn` : `${sn} sn`;
}

interface ControlBarProps {
  live: SystemViewProps['live'];
  stale: boolean;
  /** Hiç görüntü yoksa gösterge "ölçüm bekleniyor" der — canlı da bayat da değildir. */
  hasSnapshot: boolean;
}

export function ControlBar({ live, stale, hasSnapshot }: ControlBarProps) {
  const durum = !hasSnapshot
    ? { label: 'Ölçüm yok', sub: 'ilk görüntü bekleniyor', box: 'border-ops-gray-300 bg-ops-gray-100', text: 'text-ops-body', dot: 'bg-ops-gray-700', pulse: false }
    : stale
      ? { label: 'Bayat', sub: 'akış kesildi', box: 'border-ops-red-line bg-ops-red-bg', text: 'text-ops-red-dark', dot: 'bg-ops-red', pulse: true }
      : live.active
        ? {
            label: 'Canlı',
            sub: `sonraki ölçüm ${geriSayim(live.secondsLeft)}`,
            box: 'border-ops-olive-line bg-ops-olive-bg',
            text: 'text-ops-olive-dark',
            dot: 'bg-ops-olive-light',
            pulse: true,
          }
        : {
            label: 'Duraklatıldı',
            sub: 'otomatik tazeleme kapalı',
            box: 'border-ops-gray-300 bg-ops-gray-100',
            text: 'text-ops-body',
            dot: 'bg-ops-gray-700',
            pulse: false,
          };

  return (
    <PageHeader
      title="Sistem"
      subtitle={`Sağlık görüntüsü ${HEALTH_COLLECT_INTERVAL_MIN} dakikada bir yazılır · 14 gün saklanır`}
    >
      <div className={`flex items-center gap-2 rounded-[7px] border px-3 py-[7px] ${durum.box}`}>
        <span className={`h-[7px] w-[7px] rounded-full ${durum.dot} ${durum.pulse ? 'animate-pulse' : ''}`} aria-hidden="true" />
        <span className={`font-ops-display text-ops-xs font-semibold ${durum.text}`}>{durum.label}</span>
        <span className="h-[13px] w-px bg-ops-line-strong" aria-hidden="true" />
        <span className="font-ops-mono text-ops-xs font-medium text-ops-muted">{durum.sub}</span>
      </div>
      <Button size="sm" variant="secondary" onClick={live.onToggle}>
        {live.active ? 'Duraklat' : 'Otomatik tazelemeyi aç'}
      </Button>
      <Button
        size="sm"
        variant="dark"
        onClick={live.onRefreshNow}
        title="Son görüntüyü yeniden okur — yeni bir ölçüm aldırmaz, onu backend iki dakikada bir yazar."
      >
        Şimdi yenile
      </Button>
    </PageHeader>
  );
}
