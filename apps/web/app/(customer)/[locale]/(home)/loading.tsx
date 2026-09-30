import type { Locale } from '@lezzet/i18n';
import { getLocale } from 'next-intl/server';
import { PhoneSkeleton } from '@/components/customer/phone-kit/phone-skeleton';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { Band, SectionHeading } from '@/components/customer/ui/section';
import { Skeleton, SkeletonBlock, SkeletonRegion } from '@/components/customer/ui/skeleton';
import { detectDevice } from '@/lib/device';
import type { Messages } from './home-types';
import messages from './messages.json';

/**
 * Vitrin sunucuda okunduğu için bu kare olmadan ekran veri gelene kadar önceki sayfada kalır. Sayfa `(home)` grubunda, çünkü
 * kökteki bir yükleme karesi kendi karesi olmayan bütün alt sayfalarda da görünürdü.
 */
export default async function HomeLoading() {
  const [device, locale] = await Promise.all([detectDevice(), getLocale() as Promise<Locale>]);

  return (
    <SiteFrame device={device} locale={locale} activeNav="home">
      <SkeletonRegion>{device === 'mobile' ? <PhoneHomeSkeleton /> : <DesktopHomeSkeleton t={messages[locale]} />}</SkeletonRegion>
    </SiteFrame>
  );
}

/** Bantlar sayfada üç renk arasında döner; tek tonda çizilince bitişik bantlar tek bir gri lekeye dönüşür. */
const BAND_TONES = ['soft', 'default', 'deep'] as const;

/** Ekranı koleksiyon bantları doldurur; fırsat rayı yere bağlı, yeri olmayan müşteride çizilseydi veri gelince yok olup ekranı zıplatırdı. */
function PhoneHomeSkeleton() {
  return (
    <div className="flex flex-col gap-4.5 pt-4.5 pb-5.5">
      <div className="overflow-x-clip">
        <div className="px-5.5 pb-2">
          <PhoneSkeleton className="h-3 w-[34%]" />
        </div>
        {[0, 1, 2, 3, 4, 5].map((slot) => {
          const tone = BAND_TONES[slot % BAND_TONES.length] ?? 'default';
          const mirrored = slot % 2 === 1;
          return (
            <div key={slot} className="relative h-[132px]">
              <PhoneSkeleton tone={tone} radius="none" className="absolute inset-0" />
              {/* Daire altındaki bantla aynı tonda olursa kaybolur. */}
              <span
                style={{ rotate: mirrored ? '-6deg' : '5deg' }}
                className={['absolute -top-2 z-10 block', mirrored ? '-left-7.5' : '-right-7.5'].join(' ')}
              >
                <PhoneSkeleton tone={tone === 'deep' ? 'soft' : 'deep'} className="size-[148px]" />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DesktopHomeSkeleton({ t }: { t: Messages }) {
  return (
    <div className="flex flex-col">
      <section className="grid grid-cols-[1.05fr_1fr] items-center gap-12 px-12 pt-14 pb-10">
        <div className="flex flex-col gap-5">
          <span className="font-sans text-eyebrow text-olive uppercase">{t.hero.eyebrow}</span>
          <p className="font-serif text-h1 text-ink">
            {t.hero.titleLead}
            <br />
            <em className="text-olive not-italic">{t.hero.titleAccent}</em>
          </p>
          <p className="font-sans text-lead text-body">{t.hero.body}</p>
          <div className="flex gap-3.5">
            <Skeleton className="h-12 w-48 !rounded-pill" />
            <Skeleton className="h-12 w-40 !rounded-pill" />
          </div>
        </div>
        <SkeletonBlock className="aspect-video !rounded-[24px]" />
      </section>
      <Band surface="border-t border-sand-275" className="flex flex-col gap-5.5 px-12 pt-10 pb-12">
        <SectionHeading title={t.categories.title} />
        <div className="grid grid-cols-6 gap-[18px]">
          {[0, 1, 2, 3, 4, 5].map((slot) => (
            <SkeletonBlock key={slot} className="aspect-[4/5] !rounded-card" />
          ))}
        </div>
      </Band>
    </div>
  );
}
