import type { LocalizedCopy } from '@lezzet/i18n';
// `typeof messages` için değer bağı gerek (tip JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './legal-messages.json';
import type { LegalDocument } from './legal-types';

/** Şablonun kendi metinleri — sayfaya değil ŞABLONA ait ("Bu sayfada", arama kutusu, çıkış kutusu). */
export type LegalMessages = LocalizedCopy<typeof messages>;

/**
 * İki dizilişin ortak props'u.
 *
 * `updatedLine` hazır CÜMLE olarak geliyor, ham tarih olarak değil: biçimleme sunucuda yapılıyor
 * (sayfanın dili orada belli) ve iki dalın aynı tarihi iki türlü biçimlemesi imkânsız hâle geliyor.
 * `document` adı DOM'un global `document`'ını gölgeler; iki dosyada da `doc` olarak açılıyor.
 */
export interface LegalViewProps {
  document: LegalDocument;
  t: LegalMessages;
  updatedLine: string;
}
