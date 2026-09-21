import type { Metadata } from 'next';
import type { Locale } from '@lezzet/i18n';
import { LegalPage, legalMetadata } from '@/components/customer/legal/legal-page';
import { recordPageView } from '@/lib/analytics/page-view';
import content from './content.json';

/**
 * Metin genel bir şablon değil, sistemin gerçek davranışını anlatır: her beyanın kodda karşılığı
 * olmalı. Veri alan bir servis eklenince alıcı listesine de eklenir; eksik beyan fazla beyandan ağırdır.
 */
interface PrivacyPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PrivacyPageProps): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata('/legal/privacy', locale, (content[locale as Locale] ?? content.fr).title);
}

export default async function PrivacyPage({ params }: PrivacyPageProps) {
  const { locale } = await params;
  const copy = content[locale as Locale] ?? content.fr;
  void recordPageView('/legal/privacy');

  return (
    <LegalPage
      locale={locale}
      document={{
        texture: 'prose',
        title: copy.title,
        updatedAt: '2026-07-01',
        sections: copy.sections,
        notice: {
          text: copy.notice.text,
          links: [
            { label: copy.notice.account, href: '/account' },
            { label: copy.notice.support, href: '/support/new' },
          ],
        },
      }}
    />
  );
}
