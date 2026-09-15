import { notificationSentence, notificationVisual } from '@lezzet/i18n';
import { Icon } from '@/components/customer/ui/icons';
import { LoadMore } from '@/components/customer/ui/load-more';
import { Link } from '@/i18n/navigation';
import { notificationTarget } from './notification-target';
import { TONE_BG, TONE_TEXT } from './notification-tone';
import type { NotificationsViewProps } from './notifications-types';

export function NotificationsDesktop({ t, locale, rows, unread, hasMore, loadingMore, onLoadMore, onRead, onReadAll, onDismiss }: NotificationsViewProps) {
  const dateOf = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
      {unread > 0 && (
        <button
          type="button"
          onClick={onReadAll}
          className="self-end cursor-pointer font-sans text-body-sm font-semibold text-olive transition-colors hover:text-olive-dark"
        >
          {t.markAll}
        </button>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col gap-1 rounded-card border border-sand-200 bg-card px-4 py-6">
          <span className="font-sans text-body-sm font-semibold text-ink">{t.empty.title}</span>
          <span className="font-sans text-body-sm text-muted">{t.empty.body}</span>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-sand-100 rounded-card border border-sand-200 bg-card px-4">
          {rows.map((row) => {
            const target = notificationTarget(row);
            const sentence = notificationSentence(row, locale);
            const visual = notificationVisual(row);
            const inner = (
              <>
                {/* İkon dairesi türün yüzü; renk ailesi durum haplarıyla aynı anlamda. */}
                <span
                  aria-hidden
                  className={['flex h-9 w-9 flex-none items-center justify-center rounded-full', TONE_BG[visual.tone], TONE_TEXT[visual.tone]].join(' ')}
                >
                  <Icon name={visual.symbol} size={17} />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className={['font-sans text-micro font-bold uppercase tracking-[0.05em]', TONE_TEXT[visual.tone]].join(' ')}>
                      {visual.label(locale)}
                    </span>
                    <span className="font-sans text-micro text-muted">{dateOf.format(new Date(row.createdAt))}</span>
                    {/* Okunmamış nokta: okununca söner, satır kalır. */}
                    {row.readAt === null && <span aria-hidden className="h-1.5 w-1.5 flex-none rounded-full bg-olive" />}
                  </span>
                  <span className={['font-sans text-body-sm text-ink', row.readAt === null ? 'font-semibold' : ''].join(' ')}>
                    {sentence}
                  </span>
                </span>
              </>
            );
            return (
              <div key={row.id} className="flex items-start gap-2 py-3">
                {target ? (
                  <Link
                    href={target}
                    onClick={() => onRead(row.id)}
                    className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 transition-opacity hover:opacity-80"
                  >
                    {inner}
                  </Link>
                ) : (
                  /* Hedefsiz satır: tık yalnız okundu işaretler — ölü görünen satır olmasın. */
                  <button
                    type="button"
                    onClick={() => onRead(row.id)}
                    className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 text-left transition-opacity hover:opacity-80"
                  >
                    {inner}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDismiss(row.id)}
                  aria-label={t.dismiss}
                  title={t.dismiss}
                  className="flex-none cursor-pointer px-1 font-sans text-body-sm text-muted transition-colors hover:text-terracotta"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      <LoadMore hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} label={t.loadMore} loadingLabel={t.loading} />
    </div>
  );
}
