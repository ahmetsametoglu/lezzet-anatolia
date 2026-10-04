import { getLocale } from 'next-intl/server';
import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import { detectDevice } from '@/lib/device';
import { buttonClass } from '@/components/customer/ui/button';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { MessageScreen } from '@/components/customer/ui/message-screen';
import errorMessages from './error-messages.json';

/**
 * Müşterinin "bulunamadı" sayfası: segment içindeki `notFound()` ve eşleşmeyen yollar buraya düşer, çerçeve korunur ve ileri bir yol
 * her zaman sunulur. Yükleniyor karesi olan detay sayfalarında akış önce başladığı için durum kodu 200 kalır ve sayfa `noindex`le
 * yumuşak 404 olur; iskelet hızlı geçiş için bilerek korunur.
 */
// BEKLEYEN(K.65): tasarımdaki "çok sevilenler" ızgarası ve kategori çipleri.
export default async function CustomerNotFound() {
  const locale = (await getLocale()) as Locale;
  const device = await detectDevice();
  const t = errorMessages[locale];

  return (
    <SiteFrame device={device} locale={locale}>
      <MessageScreen
        device={device}
        icon="serving"
        eyebrow={t.notFound.eyebrow}
        title={t.notFound.title}
        description={t.notFound.description}
        actions={
          <>
            {/* Yol `/catalog` yazılır, URL'e dile göre çevrilerek çıkar (`PATHNAMES`: `/catalogue`
                · `/katalog`) — `Link` bunu kendisi yapar. */}
            <Link href="/catalog" className={buttonClass({ variant: 'primary' })}>
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
