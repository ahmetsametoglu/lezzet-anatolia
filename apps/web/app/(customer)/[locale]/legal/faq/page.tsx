import type { Metadata } from 'next';
import { legalCopy, legalDocument } from '@/components/customer/legal/legal-copy';
import { LegalPage, legalMetadata } from '@/components/customer/legal/legal-page';
import { recordPageView } from '@/lib/analytics/page-view';

interface FaqPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: FaqPageProps): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata('/legal/faq', locale, legalDocument(locale, 'faq').title);
}

export default async function FaqPage({ params }: FaqPageProps) {
  const { locale } = await params;
  void recordPageView('/legal/faq');

  // SSS'nin çıkışı kendi "Cevabını bulamadınız mı?" kutusu; çıkış bandı çizilmez.
  const doc = { ...legalDocument(locale, 'faq'), texture: 'faq' as const, notice: undefined, questions: legalCopy(locale).pages.faq.questions };
  return <LegalPage locale={locale} document={doc} />;
}
