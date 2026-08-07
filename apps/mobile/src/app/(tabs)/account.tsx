import type { LocalizedCopy } from '@lezzet/i18n';

import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { deviceLocale } from '@/lib/i18n/locale';
import messages from './messages.json';

// Hesap — kendi dilimini bekliyor (oturum kapısı, profil, puan).
export default function AccountScreen() {
  const t: LocalizedCopy<typeof messages> = messages[deviceLocale()];
  return <ScreenPlaceholder title={t.tabs.account} />;
}
