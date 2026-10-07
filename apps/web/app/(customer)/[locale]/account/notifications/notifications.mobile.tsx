import { notificationSentence, notificationTime, notificationTitle, notificationVisual } from '@lezzet/i18n';
import notificationsMessages from '@lezzet/i18n/customer/notifications';
import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { LoadMore } from '@/components/customer/ui/load-more';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { Link } from '@/i18n/navigation';
import { notificationTarget } from './notification-target';
import { TONE_BG, TONE_TEXT } from './notification-tone';
import type { NotificationsViewProps } from './notifications-types';

export function NotificationsMobile({ t, locale, rows, hasMore, loadingMore, onLoadMore, onRead, onDismiss }: NotificationsViewProps) {
  const now = Date.now();
  const shared = notificationsMessages[locale];

  return (
    <div className="flex flex-col gap-2.5 px-4.5 py-3.5">
      {rows.length === 0 ? (
        <EmptyState icon={<MobileIcon name="bell" size={40} className="text-sand-600" />} title={shared.empty.title} description={shared.empty.body} />
      ) : (
        rows.map((row) => {
          const target = notificationTarget(row);
          const visual = notificationVisual(row);
          const body = (
            <>
              <span aria-hidden className={['flex size-10 flex-none items-center justify-center rounded-full', TONE_BG[visual.tone], TONE_TEXT[visual.tone]].join(' ')}>
                <MobileIcon name={visual.symbol} size={19} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="font-sans text-helper font-bold text-ink">{notificationTitle(row, locale)}</span>
                <span className="font-sans text-micro leading-[1.4] text-body">{notificationSentence(row, locale)}</span>
                {/* Göreli zaman sunucu ile tarayıcı arasında dakika sınırında ayrışabilir. */}
                <span suppressHydrationWarning className="mt-0.5 font-sans text-[10.5px] font-semibold text-body">
                  {notificationTime(row.createdAt, locale, now)}
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
                aria-label={shared.dismiss}
                title={shared.dismiss}
                className="flex-none cursor-pointer px-1.5 font-sans text-body-sm text-sand-600 transition-colors hover:text-terracotta"
              >
                ×
              </button>
            </div>
          );
        })
      )}

      <LoadMore hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} label={shared.loadMore} loadingLabel={t.loading} />

      {rows.length > 0 && <p className="px-3 py-1.5 text-center font-sans text-micro leading-normal text-body">{shared.prefsNote}</p>}
    </div>
  );
}
