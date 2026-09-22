import { fillBrandFacts } from '@lezzet/brand';
import { copyForSurface, type LocalizedCopy } from '@lezzet/i18n';
import messages from '@lezzet/i18n/customer/legal';

/*
  Bilgi sayfalarının tip modülü. Metin web ile ortak sözlükte; iki yüzeyde farklı doğru olan cümleler orada hâl nesnesi
  taşır ve burada uygulamanın hâli seçilir. Şirket künyesi `{siret}` gibi yer tutucudur, modül yüklenirken bir kez dolar.
*/

export const LEGAL_MESSAGES = fillBrandFacts(copyForSurface(messages, 'app'));

export type Messages = LocalizedCopy<typeof LEGAL_MESSAGES>;

/** Rotanın tanıdığı sayfa anahtarları; sözlükten türer, ikinci bir liste yok. */
type LegalPageKey = keyof Messages['pages'];

/** Serbest rota parametresini sayfa anahtarına daraltır; tanınmayan anahtar "bu sayfa yok" bloğuna düşer ki kırık bağlantı görünsün. */
export function isLegalPageKey(value: string): value is LegalPageKey {
  return value in messages.fr.pages;
}

/**
 * Bir metin bölümü. Diziler `readonly`, çünkü sözlükteki boş liste `never[]` okunur ve `string[]` yazılsaydı beş sayfanın bölümleri
 * birleşim tipine düşüp `bullets.map` derlenmezdi.
 */
export interface LegalSectionCopy {
  heading: string;
  paragraphs: readonly string[];
  bullets: readonly string[];
}

/** Soru-cevap çifti — SSS dokusunun birimi. */
export interface LegalQuestionCopy {
  question: string;
  answer: string;
}

/** Sayfa altındaki çıkış bandı; `target` yol değil ad taşır, çünkü yol biçimi yüzeyin bilgisidir. */
export interface LegalNoticeCopy {
  text: string;
  links: readonly { label: string; target: string }[];
}
