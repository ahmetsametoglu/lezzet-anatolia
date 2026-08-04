import { getLocale } from 'next-intl/server';
import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import { detectDevice } from '@/lib/device';
import { buttonClass } from '@/components/customer/ui/button';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { MessageScreen } from '@/components/customer/ui/message-screen';
import errorMessages from './error-messages.json';

/**
 * Müşteri 404 — segment içindeki `notFound()` ve eşleşmeyen `/[locale]/…` yolları buraya düşer.
 * Sayfa hangi dildeyse hata da o dilde (getLocale). Çerçeve korunur; müşteriye ileri bir yol
 * (kataloğa/ana sayfaya dönüş) her zaman sunulur. Durum kodu 404 (Next varsayılanı) korunur.
 *
 * Kapsam: tasarımdaki "çok sevilenler" ızgarası ve kategori çipleri hâlâ yok — ama artık **engel
 * yok, sıra var.** Popülerlik ölçütü 04.08'de indi (`readShowcase` günlük ürün sinyalinden okuyor)
 * ve seçkiyi çizen parçalar da hazır (`ProductCard` · `SectionHeading`); kalan iş bu sayfanın
 * kendi yerleşimi. Künyenin iki kez eskimesinin dersi burada: **engel geçtiğinde işaret de
 * geçmeli**, yoksa okuyan ajan olmayan bir duvara çarpar (bir süre "katalog inince eklenir"
 * diyordu, katalog inmişti; sonra "ölçüt yok" dedi, ölçüt indi — denetim M-Y3).
 */
export default async function CustomerNotFound() {
  const locale = (await getLocale()) as Locale;
  const device = await detectDevice();
  const t = errorMessages[locale];

  return (
    <SiteFrame device={device} locale={locale}>
      <MessageScreen
        device={device}
        emoji="🍽"
        eyebrow={t.notFound.eyebrow}
        title={t.notFound.title}
        description={t.notFound.description}
        actions={
          <>
            {/* Katalog rotası (/catalog) inince birincil buton oraya yönlendirilir. */}
            <Link href="/" className={buttonClass({ variant: 'primary' })}>
              {t.notFound.primaryCta}
            </Link>
            <Link href="/" className={buttonClass({ variant: 'secondary' })}>
              {t.home}
            </Link>
          </>
        }
      />
    </SiteFrame>
  );
}
