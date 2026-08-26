import type { LocalizedCopy } from '@lezzet/i18n';
// `typeof messages` için DEĞER bağı gerek (tip JSON'dan türetilir) — puan sayfasının aynı deseni.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

/**
 * Sayfaya-özel tip, kendi dosyasında: `page.tsx`ten dışa açılsaydı istemci ondan tip çekerdi ve
 * `page → client → page` döngüsü doğardı (`boundaries` yakaladı).
 */
export type Messages = LocalizedCopy<typeof messages>;
