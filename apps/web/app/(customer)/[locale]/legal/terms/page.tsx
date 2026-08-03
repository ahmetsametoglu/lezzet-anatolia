import type { Metadata } from 'next';
import type { Locale } from '@lezzet/i18n';
import { LegalPage, legalMetadata } from '@/components/customer/legal/legal-page';
import content from './content.json';

/**
 * Yasal bilgiler / mentions légales (08.8) — Fransa'da ticari bir sitenin taşımak ZORUNDA olduğu
 * künye sayfası (LCEN md. 6).
 *
 * Künye **resmî kayıt belgesinden** geliyor (INPI / Registre national des entreprises, 03.08.2026)
 * ve o belge `BUSINESS_CATALOG.md`'yi üç yerinden düzeltti — bu sayfa bir ara o yanlışları
 * taşıyordu:
 *
 *  · **SIRET `…00018` değil `…00026`.** `00018` numaralı işletme 01.09.2025'te KAPANDI; aynı gün
 *    yeni adreste `00026` açıldı. Kapanmış bir işletme numarasıyla künye vermek yanlış beyandır.
 *  · **Unvan `QUALITE`**, "YİGİT Bilgin QUALITE S.A.S." değil — "Yigit Bilgin" şirketin adı değil
 *    BAŞKANININ adı ve doğru yeri "yayın sorumlusu" satırı.
 *  · **Merkez Lingolsheim (67380)**, Strasbourg değil. Teslimat anlatımında "Strasbourg ve çevresi"
 *    doğru kalır (Lingolsheim büyükşehir alanında), ama künyede şehir yaklaşık olamaz.
 *
 * Marka adı ile unvan AYRI satırlarda: yasal künye ticari unvanı yazmak zorunda, ama ziyaretçinin
 * tanıdığı ad marka adıdır — ikisinden birini gizlemek okuyanı "yanlış siteye mi geldim" diye
 * düşündürürdü.
 *
 * **Barındırıcı künyesi 03.08'de yazıldı** (Hetzner Online GmbH — unvan, adres, telefon): LCEN
 * md. 6 üçünü de zorunlu kılıyor ve sayfa bir süre "talep üzerine iletilir" diyerek geçici bir
 * dürüstlükle duruyordu. Künyenin kaynağı `BUSINESS_CATALOG.md` — sağlayıcı değişirse tek yerden.
 *
 * Sayfa sunucuların AB içinde olduğunu söylüyor. Hetzner'ın Almanya ve Finlandiya lokasyonları
 * öyledir, ABD ve Singapur değildir; lokasyon değişirse bu cümle de gizlilik politikası da
 * değişmek zorunda (kayıt `BUSINESS_CATALOG.md`'de).
 */
interface TermsPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: TermsPageProps): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata('/legal/terms', locale, (content[locale as Locale] ?? content.fr).title);
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
