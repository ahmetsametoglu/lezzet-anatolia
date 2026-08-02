'use client';

import type { Locale } from '@lezzet/i18n';
import { iconHitClass } from '@/components/customer/ui/button';
import messages from './cart-messages.json';

/**
 * Silme sonrası geri alma şeridi — tasarım sözleşmesi: "0'a inen kalem silinir (onay istenmez,
 * 'geri al' snackbar'ı 5 sn görünür)".
 *
 * Onay kutusu yerine geri alma seçildi çünkü ikisi aynı korumayı vermez ama maliyetleri farklıdır:
 * onay HER silmeyi yavaşlatır, geri alma yalnız YANLIŞ silmeyi düzeltir. Sepetten kalem çıkarmak
 * sık ve zararsız bir iştir; her seferinde "emin misiniz?" sormak asıl işi cezalandırır.
 *
 * METİNLERİNİ KENDİ TAŞIR (`cart-messages.json`): şerit kökte durur, hangi sayfada açılacağı
 * belli değildir — sayfa `messages.json`'undan beslenemez.
 */
interface CartUndoProps {
  locale: Locale;
  /** Silinen kalemin adı; bilinmiyorsa genel cümleye düşülür. */
  name: string;
  open: boolean;
  onUndo: () => void;
  onClose: () => void;
}

export function CartUndo({ locale, name, open, onUndo, onClose }: CartUndoProps) {
  const t = messages[locale];
  if (!open) return null;

  return (
    // ÜSTTE durur, altta değil: ekranın altı iki sabit çubuğa ayrılmış (sepette toplam çubuğu,
    // ürün detayda satın alma çubuğu). Alta konsa geri alma düğmesi tam onların üstüne düşerdi.
    <div role="status" aria-live="polite" className="fixed inset-x-0 top-4 z-30 flex justify-center px-4">
      <div className="flex max-w-[430px] items-center gap-4 rounded-card bg-ink px-4 py-3 shadow-lg">
        <span className="font-sans text-body-sm text-cream">
          {name ? t.removed.replace('{name}', name) : t.removedFallback}
        </span>
        <button
          type="button"
          onClick={onUndo}
          className="cursor-pointer font-sans text-body-sm font-bold text-olive-light transition-colors hover:text-cream"
        >
          {t.undo}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.dismiss}
          title={t.dismiss}
          className={`${iconHitClass} -my-2 font-sans text-body-sm text-closed-line hover:text-cream`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
