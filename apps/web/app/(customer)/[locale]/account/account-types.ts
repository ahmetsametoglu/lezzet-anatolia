import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { AccountView } from '@/lib/account/read';
import type { ChatLinkNotice } from '@/lib/identity/cart-link-landing';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Hesap sayfası tip/sözleşme modülü (view DEĞİL — gerçek view'lar account.desktop/account.mobile).

export type Messages = LocalizedCopy<typeof messages>;

export interface AccountViewProps {
  t: Messages;
  locale: Locale;
  account: AccountView;
  /**
   * Sohbet bağlantısının az önceki sonucu (15.16) — girişten hemen sonra bir kez gösterilen cümle;
   * `null` = söylenecek bir şey yok. Kaynağı kısa ömürlü çerez (`invite-cookie`), sayfa okur.
   */
  chatNotice: ChatLinkNotice | null;
}
