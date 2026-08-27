'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BELL_EVENT } from '@lezzet/types';
import { createClient } from '@/lib/supabase/client';
import { staffNotificationsFeedAction, staffMarkAllNotificationsReadAction } from '@/lib/notifications/actions';
import { AnchoredMenu } from './anchored-menu';
import { CONTROL_SQUARE } from './control';
import { BellIcon } from './icons';
import { agoShort } from './format';
import { Skeleton } from './skeleton';
import { toOpsNotificationRow, type OpsNotificationRow } from './notification-rows';

/*
  OPERASYON ZİLİ (14.15) — başlık barının kabuk bloğunda durur; `document_undeliverable` gibi
  personel satırlarının web'de GÖRÜNDÜĞÜ ilk yer. Mobil kabuğun bildirim ekranıyla aynı kararlar:

  · ROZET = OKUNMAMIŞ, sayı SUNUCUDAN (`listNotifications` — tanım tek yerde). İlk okuma bitmeden
    rozet çizilmez: 0 göstermek "iş yok" derdi, oysa henüz ölçülmedi (ölçülemeyen değer ≠ sıfır).
  · PANELİN AÇILIŞI "GÖRDÜM" BEYANIDIR: akış okundu sayılır, rozet söner; satırlar listede kalır
    (akış ≠ gelen kutusu). İyimser — düşerse bir sonraki tazeleme gerçeği geri getirir.
  · CANLILIK kabuk kanalından: adı sunucu sırrından türer ve layout'tan iner (`ops-shell` künyesi);
    yük daima boş — duyunca liste SUNUCUDAN yeniden istenir. Gizli sekme tur atmaz (LiveRefresh
    kuralı), dönüşte bir kez sorar.

  Satır şekli/başlığı `notification-rows`tan (paylaşılan personel sözlüğü) — burada yalnız çizim.
*/

interface NotificationBellProps {
  /** Personel bildirim kanalının adı — sunucuda türetildi, kabuk context'inden geldi. */
  channel: string;
}

export function NotificationBell({ channel }: NotificationBellProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // `null` = HENÜZ ÖLÇÜLMEDİ — boş liste değil: ilk yük gelmeden "bildirim yok" yazmak,
  // yüklemeyi yokluk gibi okutmaktı (kullanıcı bildirimi 26.08); o aralıkta iskelet çizilir.
  const [rows, setRows] = useState<OpsNotificationRow[] | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(() => {
    void staffNotificationsFeedAction().then((res) => {
      if (res.data === null) {
        // Personel iç mesajı görebilir (funnel ayrımı) — ama rozet uydurulmaz: bilinmiyor, sıfır değil.
        setError(res.error);
        return;
      }
      setError(null);
      setRows(res.data.rows.map(toOpsNotificationRow));
      setUnread(res.data.unread);
    });
  }, []);

  useEffect(() => {
    fetchFeed();

    let missedWhileHidden = false;
    const onBell = () => {
      if (document.visibilityState === 'hidden') {
        missedWhileHidden = true;
        return;
      }
      fetchFeed();
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !missedWhileHidden) return;
      missedWhileHidden = false;
      fetchFeed();
    };

    const supabase = createClient();
    const live = supabase.channel(channel).on('broadcast', { event: BELL_EVENT }, onBell).subscribe();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(live);
    };
  }, [channel, fetchFeed]);

  const toggle = () => {
    const acilis = !open;
    setOpen(acilis);
    if (!acilis) return;
    // Açılış = "gördüm": rozet söner, satırlar kalır. İyimser; düşerse sonraki tazeleme düzeltir.
    if (unread !== null && unread > 0) {
      setUnread(0);
      void staffMarkAllNotificationsReadAction();
    }
  };

  const now = Date.now();

  return (
    <>
      <div ref={anchorRef} className="flex">
        <button
          type="button"
          onClick={toggle}
          aria-label="Bildirimler"
          aria-haspopup="menu"
          aria-expanded={open}
          className={`relative flex ${CONTROL_SQUARE.md} cursor-pointer items-center justify-center rounded-ops-btn border border-ops-gray-300 bg-ops-line text-ops-faint transition-colors hover:border-ops-olive hover:text-ops-olive`}
        >
          <BellIcon />
          {unread !== null && unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ops-red px-1 font-ops-mono text-ops-micro font-semibold text-ops-card">
              {/* Tavan gizleme değil sığdırma: "99+" yine "çok" der, gerçek sayı panel/liste tarafında. */}
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </div>

      <AnchoredMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={340} className="p-1.5">
        <div className="px-2.5 py-1.5 font-ops-display text-ops-sm font-semibold text-ops-ink">Bildirimler</div>
        {error !== null ? (
          <div className="px-2.5 py-2 font-ops-body text-ops-sm text-ops-muted">{error}</div>
        ) : rows === null ? (
          /* İlk yük — iskelet: gelen satırın anatomisiyle aynı yer (etiket + başlık çubuğu). */
          <div className="flex flex-col gap-3 px-2.5 py-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className={i === 1 ? 'h-3 w-3/5' : 'h-3 w-4/5'} />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-2.5 py-2 font-ops-body text-ops-sm text-ops-muted">Şimdilik bildirim yok — kuyruklar sakin.</div>
        ) : (
          <ul className="flex max-h-80 flex-col overflow-y-auto">
            {rows.map((row) => {
              const inner = (
                <>
                  <span
                    aria-hidden
                    className={[
                      'mt-1.5 h-1.5 w-1.5 flex-none rounded-full',
                      row.tone === 'alert' ? 'bg-ops-red' : row.tone === 'attention' ? 'bg-ops-amber-dot' : 'bg-ops-line-strong',
                    ].join(' ')}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    {/* Tür şapkası (26.08): operatör bir bakışta türü ayırt eder — etiket + yaş üstte. */}
                    <span className="flex items-center gap-1.5">
                      <span
                        className={[
                          'rounded-md px-1.5 py-px font-ops-display text-ops-micro font-semibold uppercase tracking-[0.05em]',
                          row.tone === 'alert'
                            ? 'bg-ops-red-bg text-ops-red'
                            : row.tone === 'attention'
                              ? 'bg-ops-amber-bg text-ops-amber'
                              : 'bg-ops-line text-ops-muted',
                        ].join(' ')}
                      >
                        {row.label}
                      </span>
                      <span className="font-ops-mono text-ops-micro text-ops-faint">
                        {agoShort((now - new Date(row.createdAt).getTime()) / 60_000)}
                      </span>
                    </span>
                    <span className="font-ops-body text-ops-sm text-ops-ink">{row.title}</span>
                  </span>
                </>
              );
              return (
                <li key={row.id}>
                  {row.href ? (
                    <Link
                      href={row.href}
                      onClick={() => setOpen(false)}
                      className="flex cursor-pointer items-start gap-2 rounded-ops-btn px-2.5 py-2 transition-colors hover:bg-ops-line"
                    >
                      {inner}
                    </Link>
                  ) : (
                    /* Hedefsiz satır yalnız haber verir — tıklanır görünen ölü satır çizilmez. */
                    <div className="flex items-start gap-2 px-2.5 py-2">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </AnchoredMenu>
    </>
  );
}
