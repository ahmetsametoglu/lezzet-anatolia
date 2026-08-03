'use client';

import { iconHitClass } from '@/components/customer/ui/button';

/**
 * Sepetin haber şeridi — koyu hap, ekranın üstünde, tek cümle + isteğe bağlı tek eylem.
 *
 * Kabuk BURADA çünkü sepetin iki farklı haberi aynı biçimi paylaşıyor: silme sonrası "geri al"
 * (`CartUndo`) ve yazma düşünce "tekrar dene" (`CartWriteFailed`). İkincisi yazılırken kutu ikinci
 * kez kopyalanacaktı; kopyaların biri bir gün ötekinden farklı bir yere ya da farklı bir gölgeye
 * kayardı ve müşteri aynı ekranda iki ayrı haber dili görürdü.
 *
 * **Sepetin hata dili şerittir, satır içi kırmızı metin değil** (tasarım kararı, `design/BACKLOG`):
 * ekranda blok düzeyinde zaten bir arıza anlatımı var (`CartUnreachable`), üçüncü bir biçim eklemek
 * aynı şeyi üç ayrı sesle söylemek olurdu.
 *
 * ÜSTTE durur, altta değil: ekranın altı iki sabit çubuğa ayrılmış (sepette toplam çubuğu, ürün
 * detayda satın alma çubuğu). Alta konsa eylem düğmesi tam onların üstüne düşerdi.
 */
interface CartStripProps {
  /** Tek cümle — şerit bir metin bloğu değil, bir haberdir. */
  message: string;
  /** İsteğe bağlı tek eylem (geri al · tekrar dene). Yoksa yalnız kapatma çizilir. */
  action?: { label: string; onClick: () => void };
  onClose: () => void;
  dismissLabel: string;
  /**
   * `polite` haber verir, `assertive` sözü keser. Arıza `assertive` olmalı: ekran okuyucu kullanan
   * müşteri, yaptığı değişikliğin GERİ ALINDIĞINI sırası gelince değil, o anda öğrenmeli.
   */
  live?: 'polite' | 'assertive';
}

export function CartStrip({ message, action, onClose, dismissLabel, live = 'polite' }: CartStripProps) {
  return (
    <div role="status" aria-live={live} className="fixed inset-x-0 top-4 z-30 flex justify-center px-4">
      <div className="flex max-w-[430px] items-center gap-4 rounded-card bg-ink px-4 py-3 shadow-lg">
        <span className="font-sans text-body-sm text-cream">{message}</span>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="flex-none cursor-pointer font-sans text-body-sm font-bold text-olive-light transition-colors hover:text-cream"
          >
            {action.label}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={dismissLabel}
          title={dismissLabel}
          className={`${iconHitClass} -my-2 font-sans text-body-sm text-closed-line hover:text-cream`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
