import { copyForSurface, type Locale, type LocalizedCopy } from '@lezzet/i18n';
import legal from '@lezzet/i18n/customer/legal';
import type { LegalDocument, LegalNotice } from './legal-types';

/** Bilgi sayfalarının metni native ile ortak sözlükten; iki yüzeyde farklı doğru olan cümlelerin web hâli seçilir. */
const WEB_LEGAL = copyForSurface(legal, 'web');

export type LegalCopy = LocalizedCopy<typeof WEB_LEGAL>;
type LegalPageKey = keyof LegalCopy['pages'];
type NoticeHref = LegalNotice['links'][number]['href'];

/** Sözlük çıkış hedefini ad olarak taşır, çünkü yol biçimi yüzeyin bilgisidir. */
const NOTICE_HREF: Record<string, NoticeHref> = {
  faq: '/legal/faq',
  support: '/support/new',
  account: '/account',
  terms: '/legal/terms',
  sales: '/legal/sales',
  privacy: '/legal/privacy',
  delivery: '/legal/delivery',
};

export function legalCopy(locale: string): LegalCopy {
  return WEB_LEGAL[locale as Locale] ?? WEB_LEGAL.fr;
}

/** Bir sayfanın belgesi; teslimat ve SSS kendi bölümlerini bunun üstüne yazar. */
export function legalDocument(locale: string, page: LegalPageKey): LegalDocument {
  const copy = legalCopy(locale).pages[page];
  const links = copy.notice.links.flatMap((link) => {
    const href = NOTICE_HREF[link.target];
    return href === undefined ? [] : [{ label: link.label, href }];
  });
  return {
    texture: 'prose',
    title: copy.title,
    updatedLine: copy.updatedAt,
    sections: copy.sections,
    notice: copy.notice.text === '' ? undefined : { text: copy.notice.text, links },
  };
}
