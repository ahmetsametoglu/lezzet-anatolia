import type { LocalizedCopy } from '@lezzet/i18n';
// `typeof messages` için değer bağı gerek (tip JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './legal-messages.json';
import type { LegalCopy } from './legal-copy';
import type { LegalDocument } from './legal-types';

/** Şablonun metinleri: arama ve geri dönüş native ile ortak sözlükten, "Bu sayfada" yalnız masaüstünde olduğu için web'in kendi dosyasından. */
export type LegalMessages = Pick<LegalCopy, 'back' | 'searchPlaceholder' | 'noMatch' | 'notFoundTitle' | 'notFoundCta'> &
  LocalizedCopy<typeof messages>;

/** İki dizilişin ortak props'u; `document` global `document`ı gölgelediği için iki dosyada da `doc` olarak açılır. */
export interface LegalViewProps {
  document: LegalDocument;
  t: LegalMessages;
}
