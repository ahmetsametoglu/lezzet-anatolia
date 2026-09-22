import type { Metadata } from 'next';
import { legalDocument } from '@/components/customer/legal/legal-copy';
import { LegalPage, legalMetadata } from '@/components/customer/legal/legal-page';
import { recordPageView } from '@/lib/analytics/page-view';

interface PrivacyPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PrivacyPageProps): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata('/legal/privacy', locale, legalDocument(locale, 'privacy').title);
}

export default async function PrivacyPage({ params }: PrivacyPageProps) {
  const { locale } = await params;
  void recordPageView('/legal/privacy');

  return <LegalPage locale={locale} document={legalDocument(locale, 'privacy')} />;
}
