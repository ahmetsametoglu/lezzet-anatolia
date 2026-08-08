import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { StorefrontRecipe } from '@/lib/storefront/storefront-types';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Tarifler tip/sözleşme modülü (view DEĞİL — gerçek view'lar recipes.desktop/recipes.mobile).

export type Messages = LocalizedCopy<typeof messages>;

export interface RecipesViewProps {
  t: Messages;
  locale: Locale;
  recipes: StorefrontRecipe[];
}
