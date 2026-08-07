import type { LocalizedCopy } from '@lezzet/i18n';

import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { deviceLocale } from '@/lib/i18n/locale';
import messages from './messages.json';

// Vitrin (anasayfa) — kendi dilimini bekliyor; kabuk dörtlü kurulduğu için sekme bugünden duruyor.
export default function HomeScreen() {
  const t: LocalizedCopy<typeof messages> = messages[deviceLocale()];
  return <ScreenPlaceholder title={t.tabs.index} />;
}
