import type { Metadata } from 'next';
import { legalDocument } from '@/components/customer/legal/legal-copy';
import { LegalPage, legalMetadata } from '@/components/customer/legal/legal-page';
import { recordPageView } from '@/lib/analytics/page-view';

interface SalesPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: SalesPageProps): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata('/legal/sales', locale, legalDocument(locale, 'sales').title);
}

export default async function SalesPage({ params }: SalesPageProps) {
  const { locale } = await params;
  void recordPageView('/legal/sales');

  return <LegalPage locale={locale} document={legalDocument(locale, 'sales')} />;
}
