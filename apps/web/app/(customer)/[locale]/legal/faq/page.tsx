import type { Locale } from '@lezzet/i18n';
import { LegalPage } from '@/components/customer/legal/legal-page';
import content from './content.json';

/**
 * SSS (08.8) — statik sayfaların **soru-cevap** dokusu.
 *
 * `sections` BOŞ ve bu bilinçli: SSS'nin gövdesi bölüm değil soru listesidir, o yüzden "Bu sayfada"
 * gezinmesi de çizilmez (şablon `sections.length > 1` şartına bakıyor). Bu sayfanın gezinmesi arama
 * kutusudur; ikisini birden koymak aynı işi iki kez sunmak olurdu.
 *
 * Çıkış bandı YOK, çünkü SSS'nin kendi çıkış kutusu var (kesikli çerçeveli "Cevabını bulamadınız
 * mı?") ve tasarımda ikisi ayrı ayrı çizili değil — aynı cümleyi iki kutuda tekrarlamak olurdu.
 */
interface FaqPageProps {
  params: Promise<{ locale: string }>;
}

export default async function FaqPage({ params }: FaqPageProps) {
  const { locale } = await params;
  const copy = content[locale as Locale] ?? content.fr;

  return (
    <LegalPage
      locale={locale}
      document={{
        texture: 'faq',
        title: copy.title,
        updatedAt: '2026-07-01',
        sections: [],
        questions: copy.questions,
      }}
    />
  );
}
