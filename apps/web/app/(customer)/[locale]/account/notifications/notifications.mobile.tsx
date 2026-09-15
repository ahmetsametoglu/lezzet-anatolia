import type { Locale } from '@lezzet/i18n';
import { notificationSentence, notificationTitle, notificationVisual } from '@lezzet/i18n';
import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { Icon } from '@/components/customer/ui/icons';
import { LoadMore } from '@/components/customer/ui/load-more';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { Link } from '@/i18n/navigation';
import { notificationTarget } from './notification-target';
import { TONE_BG, TONE_TEXT } from './notification-tone';
import type { NotificationsViewProps } from './notifications-types';

/** "3 dk önce" · "2 sa önce" · "dün"; bir haftadan eskisi takvim günüyle ("12 Temmuz"). */
function relativeTime(iso: string, locale: Locale, now: number): string {
  const at = new Date(iso);
  const minutes = Math.round((now - at.getTime()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  if (minutes < 60) return rtf.format(-Math.max(1, minutes), 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 7) return rtf.format(-days, 'day');
  const sameYear = at.getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(locale, sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' }).format(at);
}

export function NotificationsMobile({ t, locale, rows, hasMore, loadingMore, onLoadMore, onRead, onDismiss }: NotificationsViewProps) {
  const now = Date.now();

  return (
    <div className="flex flex-col gap-2.5 px-4.5 py-3.5">
      {rows.length === 0 ? (
        <EmptyState icon={<MobileIcon name="bell" size={40} className="text-sand-600" />} title={t.empty.title} description={t.empty.body} />
      ) : (
        rows.map((row) => {
          const target = notificationTarget(row);
          const visual = notificationVisual(row);
          const body = (
            <>
              <span aria-hidden className={['flex size-10 flex-none items-center justify-center rounded-full', TONE_BG[visual.tone], TONE_TEXT[visual.tone]].join(' ')}>
                <Icon name={visual.symbol} size={19} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="font-sans text-helper font-bold text-ink">{notificationTitle(row, locale)}</span>
                <span className="font-sans text-micro leading-[1.4] text-muted">{notificationSentence(row, locale)}</span>
                {/* Göreli zaman sunucu ile tarayıcı arasında dakika sınırında ayrışabilir. */}
                <span suppressHydrationWarning className="mt-0.5 font-sans text-[10.5px] font-semibold text-sand-600">
                  {relativeTime(row.createdAt, locale, now)}
                </span>
              </span>
              {row.readAt === null && <span aria-hidden className="size-2.25 flex-none rounded-full bg-terracotta" />}
            </>
          );
          const rowClass = 'flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left transition-transform active:scale-[0.98]';
          return (
            <div key={row.id} className="flex items-start gap-1 rounded-card bg-sand-250 py-3.25 pr-1.5 pl-3.75">
              {target ? (
                <Link href={target} onClick={() => onRead(row.id)} className={rowClass}>
                  {body}
                </Link>
              ) : (
                // Hedefsiz satır: tık yalnız okundu işaretler — ölü görünen satır olmasın.
                <button type="button" onClick={() => onRead(row.id)} className={rowClass}>
                  {body}
                </button>
              )}
              <button
                type="button"
                onClick={() => onDismiss(row.id)}
                aria-label={t.dismiss}
                title={t.dismiss}
                className="flex-none cursor-pointer px-1.5 font-sans text-body-sm text-sand-600 transition-colors hover:text-terracotta"
              >
                ×
              </button>
            </div>
          );
        })
      )}

      <LoadMore hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} label={t.loadMore} loadingLabel={t.loading} />

      {rows.length > 0 && <p className="px-3 py-1.5 text-center font-sans text-micro leading-normal text-muted">{t.prefsNote}</p>}
    </div>
  );
}
