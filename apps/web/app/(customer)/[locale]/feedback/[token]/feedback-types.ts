import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type feedbackCopy from '@lezzet/i18n/customer/feedback';
import type { FeedbackInviteView } from '@/lib/feedback/invite';
import type messages from './messages.json';

/** Ekranın native'le ortak metni. */
export type FeedbackCopy = LocalizedCopy<typeof feedbackCopy>;
/** Yalnız web'in metni: masaüstü akışının karşılama, yıldızlı yorum ve sonuç cümleleri. */
export type Messages = LocalizedCopy<typeof messages>;

/** Masaüstü akışının adımı: karşılama, kartlar ve sonuç birbirini dışlar, bu yüzden iki bayrak değil tek durum. */
export type FeedbackStep = 'welcome' | 'cards' | 'done';

export interface FeedbackViewProps {
  locale: Locale;
  token: string;
  invite: FeedbackInviteView;
  copy: FeedbackCopy;
  t: Messages;
}
