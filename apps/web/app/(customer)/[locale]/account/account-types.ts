import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { AccountView } from '@/lib/account/read';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Hesap sayfası tip/sözleşme modülü (view DEĞİL — gerçek view'lar account.desktop/account.mobile).

export type Messages = LocalizedCopy<typeof messages>;

export interface AccountViewProps {
  t: Messages;
  locale: Locale;
  account: AccountView;
}
