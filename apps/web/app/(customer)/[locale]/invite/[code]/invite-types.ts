import type { InviteWelcome } from '@lezzet/application';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type inviteCopy from '@lezzet/i18n/customer/invite';
import type messages from './messages.json';

/** Ekranın native'le ortak metni. */
export type InviteCopy = LocalizedCopy<typeof inviteCopy>;
/** Yalnız web'in metni: sayfa künyesi. */
export type Messages = LocalizedCopy<typeof messages>;

/**
 * Ziyaretçinin daveti kabul ettiğinde gideceği yer. **Serbest bir yol DEĞİL, iki seçenek** ve bu
 * bir güvenlik kararı: hedef server action'a istemciden geliyor: açık uçlu olsaydı davet sayfası
 * dilediğiniz adrese yönlendiren bir açık yönlendirme (open redirect) kapısı olurdu.
 */
export type InviteTarget = 'catalog' | 'login';

export interface InviteViewProps {
  locale: Locale;
  code: string;
  welcome: InviteWelcome;
  copy: InviteCopy;
}
