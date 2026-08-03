'use client';

import type { Locale } from '@lezzet/i18n';
import { CartStrip } from './cart-strip';
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
 * belli değildir — sayfa `messages.json`'undan beslenemez. Kutunun kendisi `CartStrip`'te.
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
    <CartStrip
      message={name ? t.removed.replace('{name}', name) : t.removedFallback}
      action={{ label: t.undo, onClick: onUndo }}
      onClose={onClose}
      dismissLabel={t.dismiss}
    />
  );
}
