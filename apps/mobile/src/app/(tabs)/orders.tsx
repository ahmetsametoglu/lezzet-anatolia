import type { LocalizedCopy } from '@lezzet/i18n';

import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { deviceLocale } from '@/lib/i18n/locale';
import messages from './messages.json';

// Siparişler — kendi dilimini bekliyor (oturum + sipariş uçları).
export default function OrdersScreen() {
  const t: LocalizedCopy<typeof messages> = messages[deviceLocale()];
  return <ScreenPlaceholder title={t.tabs.orders} />;
}
