import type { EmailSubscriptionState } from '@lezzet/application';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type messages from './messages.json';

export type Messages = LocalizedCopy<typeof messages>;

export interface UnsubscribeViewProps {
  locale: Locale;
  token: string;
  state: EmailSubscriptionState;
  t: Messages;
}
