import type { Locale, LocalizedCopy } from '@lezzet/i18n';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Sepet tip/sözleşme modülü (view DEĞİL — gerçek view'lar cart.desktop/cart.mobile).

export type Messages = LocalizedCopy<typeof messages>;

export interface CartViewProps {
  t: Messages;
  locale: Locale;
}
