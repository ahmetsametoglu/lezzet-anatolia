import type { Locale } from '@lezzet/i18n';
import { LegalPage } from '@/components/customer/legal/legal-page';
import content from './content.json';

/**
 * Yasal bilgiler / mentions légales (08.8) — Fransa'da ticari bir sitenin taşımak ZORUNDA olduğu
 * künye sayfası (LCEN md. 6).
 *
 * Künye uydurulmadı, `docs/architecture/BUSINESS_CATALOG.md`'den geldi (unvan, SIRET, KDV numarası,
 * merkez, iletişim). İki alan bilerek genel yazıldı çünkü belgede karşılığı yok ve doğrusu yerine
 * yakınını yazmak, yanlış yazmakla aynı şeydir: **tam sokak adresi** ve **barındırıcının künyesi**.
 * BEKLEYEN(08.8): tam sokak adresi ve barındırıcının künyesi — LCEN md. 6 ikisini de istiyor,
 * belgede karşılığı yok ve yerine yakınını yazmak yanlış yazmakla aynı şey. İşletme verdiğinde
 * `content.json`daki künye listesine iki satır olarak eklenir.
 *
 * Not: marka adı logolarda "Lezzet Anatolia", domain/Instagram'da "Lezzet Anatolie" olarak geçiyor
 * ve tek yazıma karar verilmedi. Bu sayfa TİCARİ UNVANI yazıyor, marka adını değil — yasal künyede
 * tartışmalı olan ad kullanılmaz, unvan zaten tek ve resmîdir.
 */
interface TermsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function TermsPage({ params }: TermsPageProps) {
  const { locale } = await params;
  const copy = content[locale as Locale] ?? content.fr;

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
            { label: copy.notice.sales, href: '/legal/sales' },
            { label: copy.notice.privacy, href: '/legal/privacy' },
          ],
        },
      }}
    />
  );
}
