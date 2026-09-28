import type { NotificationPreferencesView } from '@lezzet/application';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
// `typeof messages` için DEĞER bağı gerek (tip JSON'dan türetilir) — puan sayfasının aynı deseni.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

/**
 * Sayfaya-özel tip, kendi dosyasında: `page.tsx`ten dışa açılsaydı istemci ondan tip çekerdi ve
 * `page → client → page` döngüsü doğardı (`boundaries` yakaladı).
 */
export type Messages = LocalizedCopy<typeof messages>;

/** İki görünümün ortak sözleşmesi; yazma ve iptal durumu çatalda tutulur ki cihaz değişince kaybolmasın. */
export interface PreferencesViewProps {
  t: Messages;
  locale: Locale;
  /** `null` = jeton çözülemedi (eski bağ, silinmiş kimlik ya da hiç var olmamış dize). */
  view: NotificationPreferencesView | null;
  token: string | null;
  /** İptal edilenler sunucu tazelenene kadar yerelde düşülmüş liste. */
  zoneNotices: NotificationPreferencesView['zoneNotices'];
  zoneBusy: boolean;
  failed: boolean;
  onCancelZone: () => void;
}
