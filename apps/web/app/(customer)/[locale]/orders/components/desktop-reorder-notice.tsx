'use client';

import { Link } from '@/i18n/navigation';
import { buttonClass } from '@/components/customer/ui/button';
import type { Messages, ReorderNotice as Notice } from '../orders-types';

/**
 * Eklenen ve eklenemeyen kalemler ayrı kutuda, çünkü tek satırda birleşince göz kötü haberi atlar. Hiçbir kalem eklenemediyse
 * "Sepete git" çizilmez, çünkü boş sepete götüren düğme müşteriyi kandırır.
 */
interface DesktopReorderNoticeProps {
  t: Messages;
  notice: Notice;
  onDismiss: () => void;
}

export function DesktopReorderNotice({ t, notice, onDismiss }: DesktopReorderNoticeProps) {
  const nothing = notice.added === 0;

  return (
    <div className="flex flex-col gap-2 rounded-[12px] border border-sand-200 bg-cream p-4">
      {nothing ? (
        <span className="font-sans text-note font-semibold leading-relaxed text-honey">{t.reorderResult.none}</span>
      ) : (
        <span className="rounded-[12px] bg-olive-bg px-3.5 py-3 font-sans text-note font-semibold leading-relaxed text-olive">
          {t.reorderResult.added.replace('{count}', String(notice.added))}
        </span>
      )}

      {notice.skipped.length > 0 && (
        <span className="rounded-[12px] border border-honey-line bg-honey-bg px-3.5 py-3 font-sans text-note font-semibold leading-relaxed text-honey">
          {t.reorderResult.skipped.replace('{count}', String(notice.skipped.length)).replace('{names}', notice.skipped.join(', '))}
        </span>
      )}

      <div className="flex items-center gap-2">
        {!nothing && (
          <Link href="/cart" className={buttonClass({ size: 'sm' })}>
            {t.reorderResult.goToCart}
          </Link>
        )}
        <button type="button" onClick={onDismiss} className="cursor-pointer font-sans text-note font-bold text-muted hover:text-ink">
          {t.reorderResult.dismiss}
        </button>
      </div>

      {!nothing && <span className="font-sans text-micro leading-relaxed text-muted">{t.reorderResult.note}</span>}
    </div>
  );
}
