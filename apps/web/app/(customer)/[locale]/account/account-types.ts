import type { Locale, LocalizedCopy } from '@lezzet/i18n';
// Ortak hesap sözlüğü — native hesap ekranıyla AYNI metin (CLAUDE §2 istisnası, 14.09).
import type accountMessages from '@lezzet/i18n/customer/account';
import type { LEGAL_LINKS } from '@/components/customer/ui/site-frame';
import type { AccountView } from '@/lib/account/read';
import type { ChatLinkNotice } from '@/lib/identity/cart-link-landing';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Hesap sayfası tip/sözleşme modülü (view DEĞİL — gerçek view'lar account.desktop/account.mobile).

export type Messages = LocalizedCopy<typeof messages>;

/** Telefon görünümünün metni — `@lezzet/i18n/customer/account` (web'e özgü cümleler `Messages`ta kalır). */
export type AccountCopy = LocalizedCopy<typeof accountMessages>;

/**
 * Telefon görünümünün "bilgi ve koşullar" kartı — sunucuda ortak bilgi sözlüğünden kurulur (`page.tsx`); istemciye
 * yalnız başlık ve beş sayfa adı gider. Sıra ve hedefler `LEGAL_LINKS`in.
 */
export interface LegalDirectoryView {
  title: string;
  links: { href: (typeof LEGAL_LINKS)[number]['href']; label: string }[];
}

export interface AccountViewProps {
  t: Messages;
  locale: Locale;
  account: AccountView;
  /**
   * Sohbet bağlantısının az önceki sonucu (15.16) — girişten hemen sonra bir kez gösterilen cümle;
   * `null` = söylenecek bir şey yok. Kaynağı kısa ömürlü çerez (`invite-cookie`), sayfa okur.
   */
  chatNotice: ChatLinkNotice | null;
  legal: LegalDirectoryView;
}
