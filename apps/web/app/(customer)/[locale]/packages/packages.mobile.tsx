'use client';

import packagesMessages from '@lezzet/i18n/customer/packages';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { PlaceNoticeBand } from '@/components/customer/phone-kit/place-notice-band';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { PhonePackageCard } from './components/phone-package-card';
import type { PackagesViewProps } from './packages-types';

/**
 * Paketler — telefon görünümü: sekme kökü, başlık sayfanın içinde; altında bölge dışı bandı, sonra tam genişlikte kartlar.
 * Liste sunucuda okunur; native'in iskelet, hata kutusu ve aşağı çekerek yenileme hâllerinin burada karşılığı yok.
 */
export function PackagesMobile({ locale, packages }: PackagesViewProps) {
  const copy = packagesMessages[locale];
  const { place } = useDeliveryPlace();
  // Bant kataloğunkiyle aynı koşulda (yer biliniyor ve rota dışı): bu sekmeye alt çubuktan doğrudan gelinir.
  const noticePlace = place !== null && !place.inRoute ? place : null;

  return (
    <div className="flex flex-col gap-3 px-4.5 pb-5">
      <header className="flex flex-col gap-1 pt-4">
        <span className="font-sans text-eyebrow-xs text-terracotta uppercase">{copy.eyebrow}</span>
        <h1 className="font-serif text-page-title-sm leading-[1.15] text-ink">{copy.title}</h1>
        <p className="font-sans text-note leading-[1.6] text-muted">{copy.body}</p>
      </header>

      {noticePlace !== null && <PlaceNoticeBand locale={locale} postalCode={noticePlace.postalCode} placeName={noticePlace.placeName} />}

      {packages.length === 0 ? (
        // Boş hâl kesikli çerçeveli kutunun içinde: sayfanın gövdesi değil, listenin yeri.
        <div className="rounded-card border-[1.5px] border-dashed border-sand-400">
          <EmptyState
            title={copy.empty.title}
            description={copy.empty.body}
            action={<PrimaryButton label={copy.empty.cta} href="/catalog" />}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {packages.map((pack) => (
            <PhonePackageCard key={pack.id} pack={pack} copy={copy} locale={locale} place={place} />
          ))}
        </div>
      )}
    </div>
  );
}
