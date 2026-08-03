'use client';

import type { Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import { ConfirmationDesktop } from './confirmation.desktop';
import { ConfirmationMobile } from './confirmation.mobile';
import type { ConfirmationView, Messages } from './confirmation-types';

/**
 * Sipariş alındı sayfasının cihaz çatalı (Sapma 3 · `orders/[reference]` ile aynı desen).
 *
 * **Durum yok:** sayfa okuduğunu gösteriyor. Ödeme beklerken sayfayı canlı tutan dinleyici
 * (`OrderWatch`) burada değil, `page.tsx`te: o bir sunucu turu tetikliyor, bir yerleşim kararı
 * vermiyor — cihazı bilmesi gerekmiyor.
 *
 * Cihaz İSTEMCİDE doğrulanır: sunucunun UA tahmini bir başlangıç değeri, son söz değil. Bu sayfa
 * ödeme dönüşünün indiği ekran ve müşteri buraya bazen ekranı döndürerek geliyor (banka
 * doğrulaması); tahmine mahkûm bırakmak yüzeydeki tek istisnayı burada bırakırdı.
 */
interface ConfirmationClientProps {
  t: Messages;
  locale: Locale;
  view: ConfirmationView;
  device: Device;
}

export function ConfirmationClient({ t, locale, view, device }: ConfirmationClientProps) {
  const compact = useDevice(device) === 'mobile';
  const props = { t, locale, view, compact };
  return compact ? <ConfirmationMobile {...props} /> : <ConfirmationDesktop {...props} />;
}
