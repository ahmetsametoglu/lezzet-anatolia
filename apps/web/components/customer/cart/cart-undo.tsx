'use client';

import type { Locale } from '@lezzet/i18n';
import { NewsStrip } from '@/components/customer/ui/toast';
import { useDevice } from '@/lib/use-device.hook';
import messages from './cart-messages.json';

/*
  Silme sonrası geri alma şeridi: onay her silmeyi yavaşlatır, geri alma yalnız yanlış silmeyi düzeltir. Metinlerini kendi
  taşır, çünkü şerit kökte durur ve hangi sayfada açılacağı belli değildir; telefon görünümünde silme sessizdir.
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
  // Şerit bir silmeden sonra açılır; o ana kadar cihaz pencere ölçüsünden çözülmüş olur.
  const device = useDevice('desktop');
  if (!open || device === 'mobile') return null;

  return (
    <NewsStrip
      message={name ? t.removed.replace('{name}', name) : t.removedFallback}
      action={{ label: t.undo, onClick: onUndo }}
      dismiss={{ label: t.dismiss, onClick: onClose }}
      placement="top"
    />
  );
}
