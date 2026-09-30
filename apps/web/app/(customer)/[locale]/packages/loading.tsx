import packagesMessages from '@lezzet/i18n/customer/packages';
import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { PhoneSkeleton } from '@/components/customer/phone-kit/phone-skeleton';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { Skeleton, SkeletonBlock, SkeletonRegion } from '@/components/customer/ui/skeleton';
import { detectDevice } from '@/lib/device';
import { PACKAGE_CARD_SHELL } from './components/phone-package-card';
import messages from './messages.json';

/**
 * Paket listesi sunucuda okunduğu için bu kare olmadan ekran veri gelene kadar önceki sayfada kalır. Başlık metni veriden
 * bağımsız olduğu için gerçek çizilir; kart sayısı ve fotoğraf boyu native iskeletininki.
 */
export default async function PackagesLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);

  return (
    <SiteFrame device={device} locale={locale} activeNav="packages">
      <SkeletonRegion>{device === 'mobile' ? <PhonePackagesSkeleton locale={locale} /> : <DesktopPackagesSkeleton locale={locale} />}</SkeletonRegion>
    </SiteFrame>
  );
}

function PhonePackagesSkeleton({ locale }: { locale: Locale }) {
  const copy = packagesMessages[locale];
  return (
    <div className="flex flex-col gap-3 px-4.5 pb-5">
      <div className="flex flex-col gap-1 pt-4">
        <span className="font-sans text-eyebrow-xs text-terracotta uppercase">{copy.eyebrow}</span>
        <p className="font-serif text-page-title-sm leading-[1.15] text-ink">{copy.title}</p>
        <p className="font-sans text-note leading-[1.6] text-muted">{copy.body}</p>
      </div>
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((slot) => (
          <div key={slot} className={PACKAGE_CARD_SHELL}>
            <PhoneSkeleton radius="none" className="h-49.5" />
            <div className="flex flex-col gap-2.75 px-4 pt-3.5 pb-4">
              <PhoneSkeleton className="h-3.5 w-full" />
              <PhoneSkeleton className="h-3.5 w-3/5" />
              <div className="flex justify-end border-t-[1.5px] border-dashed border-sand-200 pt-2.75">
                <PhoneSkeleton className="h-4 w-[42%]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DesktopPackagesSkeleton({ locale }: { locale: Locale }) {
  const t = messages[locale];
  return (
    <div className="flex flex-col">
      <section className="grid grid-cols-2 items-center gap-10 px-12 pt-9 pb-8">
        <div className="flex flex-col gap-3.5">
          <span className="font-sans text-eyebrow text-olive uppercase">{t.title}</span>
          <p className="font-serif text-page-title text-ink">{t.heroTitle}</p>
          <p className="max-w-[520px] font-sans text-lead text-body">{t.heroBody}</p>
          <Skeleton className="h-11 w-[400px] !rounded-soft" />
        </div>
        <SkeletonBlock className="aspect-[3/2] !rounded-card" />
      </section>
      <section className="flex flex-col gap-4 px-12 pb-11">
        <div className="flex items-baseline gap-3">
          <p className="font-serif text-h1-sm text-ink">{t.listTitle}</p>
          <span className="font-sans text-body-sm text-muted">{t.listNote}</span>
        </div>
        <div className="grid grid-cols-3 gap-5.5">
          {[0, 1, 2].map((slot) => (
            <div key={slot} className="flex flex-col gap-3">
              <SkeletonBlock className="aspect-[3/2] !rounded-card" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-4/5" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
