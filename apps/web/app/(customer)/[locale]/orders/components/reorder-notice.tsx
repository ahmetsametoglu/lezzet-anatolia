'use client';

import { Link } from '@/i18n/navigation';
import { buttonClass } from '@/components/customer/ui/button';
import type { Messages, ReorderNotice as Notice } from '../orders-types';

/**
 * Tekrar sipariş sonucu — tasarımın "bazı kalemler eklenemedi" kartı, ilgili SATIRIN altında açılır.
 *
 * İki ayrı kutu (yeşil "eklendi" / bal rengi "eklenemedi") tasarımın kararı: müşteri iyi haberi de
 * kötü haberi de ayrı ayrı görmeli. Tek satırda birleştirilseydi ("10 eklendi, 2 eklenemedi") göz
 * ikincisini atlardı.
 *
 * **Fiyat farkı için ayrı uyarı YOK** (tasarım açıkça söylüyor): fark zaten sepette görünüyor,
 * burada tekrarlamak müşteriyi iki kez düşündürürdü. Alt satır yalnız "güncel fiyatlarla" der.
 *
 * Hiçbir kalem eklenemediyse "Sepete git" ÇİZİLMEZ — boş bir vaade götüren düğme, tıklandığında
 * müşteriyi kandırmış olur.
 */
interface ReorderNoticeProps {
  t: Messages;
  notice: Notice;
  onDismiss: () => void;
  compact?: boolean;
}

export function ReorderNotice({ t, notice, onDismiss, compact = false }: ReorderNoticeProps) {
  const nothing = notice.added === 0;

  return (
    <div className={['flex flex-col gap-2 rounded-[12px] border border-sand-200 bg-cream p-3', compact ? '' : 'p-4'].join(' ')}>
      {nothing ? (
        <span className="font-sans text-note font-semibold leading-relaxed text-honey">{t.reorderResult.none}</span>
      ) : (
        <span className="rounded-[12px] bg-olive-bg px-3.5 py-3 font-sans text-note font-semibold leading-relaxed text-olive">
          {t.reorderResult.added.replace('{count}', String(notice.added))}
        </span>
      )}

      {notice.skipped.length > 0 && (
        <span className="rounded-[12px] border border-honey-line bg-honey-bg px-3.5 py-3 font-sans text-note font-semibold leading-relaxed text-honey">
          {t.reorderResult.skipped
            .replace('{count}', String(notice.skipped.length))
            .replace('{names}', notice.skipped.join(', '))}
        </span>
      )}

      <div className="flex items-center gap-2">
        {!nothing && (
          <Link href="/cart" className={buttonClass({ size: 'sm' })}>
            {t.reorderResult.goToCart}
          </Link>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="cursor-pointer font-sans text-note font-bold text-muted hover:text-ink"
        >
          {t.reorderResult.dismiss}
        </button>
      </div>

      {!nothing && <span className="font-sans text-micro leading-relaxed text-muted">{t.reorderResult.note}</span>}
    </div>
  );
}
