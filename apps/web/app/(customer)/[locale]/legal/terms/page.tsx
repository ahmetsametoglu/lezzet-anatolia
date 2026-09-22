import type { Metadata } from 'next';
import { legalDocument } from '@/components/customer/legal/legal-copy';
import { LegalPage, legalMetadata } from '@/components/customer/legal/legal-page';
import { recordPageView } from '@/lib/analytics/page-view';

interface TermsPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: TermsPageProps): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata('/legal/terms', locale, legalDocument(locale, 'terms').title);
}

export default async function TermsPage({ params }: TermsPageProps) {
  const { locale } = await params;
  void recordPageView('/legal/terms');

  return <LegalPage locale={locale} document={legalDocument(locale, 'terms')} />;
}
